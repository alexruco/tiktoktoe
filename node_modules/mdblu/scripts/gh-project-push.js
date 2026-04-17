#!/usr/bin/env node

/**
 * gh-project-push.js
 *
 * Reads a filled GH-PROJECT.md file and creates the GitHub Project,
 * custom fields, and items using the `gh` CLI.
 *
 * Usage:
 *   node scripts/gh-project-push.js <path-to-filled-GH-PROJECT.md>
 *
 * Requirements:
 *   - gh CLI installed and authenticated (gh auth login)
 *   - Node >= 18
 */

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// CLI entry
// ---------------------------------------------------------------------------

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node gh-project-push.js <path-to-GH-PROJECT.md>');
  process.exit(1);
}

const markdown = fs.readFileSync(path.resolve(filePath), 'utf8');
const { project, fields, items } = parse(markdown);

validate(project, fields, items);
run(project, fields, items);

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Extracts the first markdown table found after `## <heading>` in the source.
 * Returns an array of row objects keyed by column header.
 */
function parseSection(md, heading) {
  const headingRe = new RegExp(`^##\\s+${escapeRegExp(heading)}\\s*$`, 'm');
  const start = md.search(headingRe);
  if (start === -1) return null;

  const after = md.slice(start);
  const tableMatch = after.match(/(\|.+\|\r?\n)((?:\|[-: ]+\|\r?\n))((?:\|.+\|\r?\n?)*)/);
  if (!tableMatch) return null;

  const headerRow = tableMatch[1];
  const dataRows = tableMatch[3];

  const headers = parseRow(headerRow);
  const rows = dataRows
    .split('\n')
    .filter((l) => l.trim().startsWith('|'))
    .map((l) => {
      const cells = parseRow(l);
      const obj = {};
      headers.forEach((h, i) => (obj[h] = (cells[i] || '').trim()));
      return obj;
    });

  return rows;
}

function parseRow(line) {
  return line
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim());
}

/** Parse the Project key-value table into a plain object. */
function parseKeyValue(rows) {
  const obj = {};
  for (const row of rows) {
    const key = (row['Field'] || row['field'] || '').toLowerCase();
    const val = row['Value'] || row['value'] || '';
    if (key) obj[key] = val;
  }
  return obj;
}

function parse(md) {
  const projectRows = parseSection(md, 'Project');
  const fieldRows = parseSection(md, 'Fields');
  const itemRows = parseSection(md, 'Items');

  return {
    project: parseKeyValue(projectRows || []),
    fields: (fieldRows || []).filter((r) => r.name),
    items: (itemRows || []).filter((r) => r.type),
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validate(project, fields, items) {
  const errors = [];

  if (!project.title) errors.push('Project table is missing "title".');
  if (!project.owner) errors.push('Project table is missing "owner".');
  if (!project.visibility) errors.push('Project table is missing "visibility".');
  if (!['public', 'private'].includes((project.visibility || '').toLowerCase())) {
    errors.push('Project "visibility" must be "public" or "private".');
  }

  const validTypes = ['TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'ITERATION'];
  for (const f of fields) {
    if (!f.name) errors.push('A field row is missing a name.');
    if (!validTypes.includes((f.type || '').toUpperCase())) {
      errors.push(`Field "${f.name}" has unknown type "${f.type}". Valid: ${validTypes.join(', ')}.`);
    }
    if ((f.type || '').toUpperCase() === 'SINGLE_SELECT' && !f.options) {
      errors.push(`SINGLE_SELECT field "${f.name}" must have options.`);
    }
  }

  const validItemTypes = ['DRAFT', 'ISSUE', 'PR'];
  for (const item of items) {
    if (!validItemTypes.includes((item.type || '').toUpperCase())) {
      errors.push(`Item has unknown type "${item.type}". Valid: ${validItemTypes.join(', ')}.`);
    }
    if (item.type === 'DRAFT' && !item.title) {
      errors.push('A DRAFT item is missing a title.');
    }
    if (['ISSUE', 'PR'].includes((item.type || '').toUpperCase())) {
      if (!item.repo) errors.push(`An ${item.type} item is missing "repo".`);
      if (!item.number) errors.push(`An ${item.type} item is missing "number".`);
    }
  }

  if (errors.length) {
    console.error('Validation errors:\n' + errors.map((e) => '  • ' + e).join('\n'));
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

function gh(...args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.error) {
    throw new Error(`Failed to run gh: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`gh ${args.slice(0, 3).join(' ')} failed:\n${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

function ghJson(...args) {
  return JSON.parse(gh(...args, '--format', 'json'));
}

async function run(project, fields, items) {
  const { title, owner, visibility, description } = project;
  const isPublic = visibility.toLowerCase() === 'public';

  // 1. Create the project
  log(`Creating project "${title}" under "${owner}"...`);
  const createArgs = ['project', 'create', '--owner', owner, '--title', title];
  if (isPublic) createArgs.push('--public');
  const created = ghJson(...createArgs);
  const projectNumber = created.number;
  const projectUrl = created.url;
  log(`  Created: ${projectUrl} (number: ${projectNumber})`);

  // 2. Update description via GraphQL (gh project create has no --description flag)
  if (description) {
    try {
      log(`  Setting description...`);
      const projectId = getProjectId(owner, projectNumber);
      gh(
        'api', 'graphql',
        '-f', `query=mutation($id:ID!,$desc:String!){updateProjectV2(input:{projectId:$id,shortDescription:$desc}){projectV2{id}}}`,
        '-f', `id=${projectId}`,
        '-f', `desc=${description}`,
      );
    } catch (e) {
      warn(`  Could not set description: ${e.message}`);
    }
  }

  // 3. Create custom fields
  log('\nCreating fields...');
  const createdFields = {};
  for (const field of fields) {
    const type = field.type.toUpperCase();
    log(`  Field "${field.name}" (${type})...`);
    const args = [
      'project', 'field-create', String(projectNumber),
      '--owner', owner,
      '--name', field.name,
      '--data-type', type,
    ];
    if (type === 'SINGLE_SELECT' && field.options) {
      args.push('--single-select-options', field.options);
    }
    try {
      const result = ghJson(...args);
      createdFields[field.name] = result;
      log(`    id: ${result.id}`);
    } catch (e) {
      warn(`  Failed to create field "${field.name}": ${e.message}`);
    }
  }

  // 4. Fetch project node ID + field metadata (needed for setting values on items)
  let projectId = null;
  let fieldMeta = {};
  try {
    projectId = getProjectId(owner, projectNumber);
    fieldMeta = getFieldMeta(projectId);
  } catch (e) {
    warn(`Could not fetch field metadata for value assignment: ${e.message}`);
  }

  // 5. Create / add items
  log('\nAdding items...');
  for (const item of items) {
    const type = item.type.toUpperCase();
    let itemId = null;

    try {
      if (type === 'DRAFT') {
        log(`  DRAFT "${item.title}"...`);
        const args = [
          'project', 'item-create', String(projectNumber),
          '--owner', owner,
          '--title', item.title,
        ];
        if (item.body) args.push('--body', item.body);
        const result = ghJson(...args);
        itemId = result.id;
        log(`    id: ${itemId}`);
      } else {
        const urlType = type === 'PR' ? 'pull' : 'issues';
        const url = `https://github.com/${item.repo}/${urlType}/${item.number}`;
        log(`  ${type} ${url}...`);
        const result = ghJson('project', 'item-add', String(projectNumber), '--owner', owner, '--url', url);
        itemId = result.id;
        log(`    id: ${itemId}`);
      }
    } catch (e) {
      warn(`  Failed to add item "${item.title || item.number}": ${e.message}`);
      continue;
    }

    // 6. Set field values on the item (status, assignee not supported via gh project — status only)
    if (itemId && projectId && item.status) {
      try {
        setFieldValue(projectId, itemId, fieldMeta, 'Status', item.status);
      } catch (e) {
        warn(`  Could not set Status on item: ${e.message}`);
      }
    }
  }

  log(`\nDone. Project: ${projectUrl}`);
}

// ---------------------------------------------------------------------------
// GraphQL helpers
// ---------------------------------------------------------------------------

function getProjectId(owner, projectNumber) {
  // Determine if owner is a user or org
  const query = `
    query($login:String!,$num:Int!) {
      user(login:$login) { projectV2(number:$num) { id } }
      organization(login:$login) { projectV2(number:$num) { id } }
    }
  `;
  const out = JSON.parse(
    gh('api', 'graphql', '-f', `query=${query}`, '-f', `login=${owner}`, '-F', `num=${projectNumber}`)
  );
  const id =
    out.data?.user?.projectV2?.id ||
    out.data?.organization?.projectV2?.id;
  if (!id) throw new Error(`Could not resolve project ID for ${owner}/${projectNumber}`);
  return id;
}

function getFieldMeta(projectId) {
  const query = `
    query($id:ID!) {
      node(id:$id) {
        ... on ProjectV2 {
          fields(first:50) {
            nodes {
              ... on ProjectV2Field { id name }
              ... on ProjectV2SingleSelectField { id name options { id name } }
              ... on ProjectV2IterationField { id name }
            }
          }
        }
      }
    }
  `;
  const out = JSON.parse(gh('api', 'graphql', '-f', `query=${query}`, '-f', `id=${projectId}`));
  const nodes = out.data?.node?.fields?.nodes || [];
  const meta = {};
  for (const node of nodes) {
    if (node.name) meta[node.name] = node;
  }
  return meta;
}

function setFieldValue(projectId, itemId, fieldMeta, fieldName, value) {
  const field = fieldMeta[fieldName];
  if (!field) return;

  // SINGLE_SELECT: find matching option ID
  if (field.options) {
    const option = field.options.find(
      (o) => o.name.toLowerCase() === value.toLowerCase()
    );
    if (!option) {
      warn(`    Status option "${value}" not found in field "${fieldName}"`);
      return;
    }
    const mutation = `
      mutation($project:ID!,$item:ID!,$field:ID!,$option:String!) {
        updateProjectV2ItemFieldValue(input:{
          projectId:$project, itemId:$item, fieldId:$field,
          value:{ singleSelectOptionId:$option }
        }) { projectV2Item { id } }
      }
    `;
    gh(
      'api', 'graphql',
      '-f', `query=${mutation}`,
      '-f', `project=${projectId}`,
      '-f', `item=${itemId}`,
      '-f', `field=${field.id}`,
      '-f', `option=${option.id}`,
    );
    log(`    Status set to "${value}"`);
  }
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function log(msg) {
  console.log(msg);
}

function warn(msg) {
  console.warn('[warn]', msg);
}
