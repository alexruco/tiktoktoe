#!/usr/bin/env node

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const REPO_OWNER = 'ruco-ai';
const REPO_NAME = 'mdblu';
const TEMPLATES_PATH = 'templates';
const CLAUDE_MD_PATH = 'CLAUDE.md';
const SCAFFOLD_DIR = '.mdblu';

function httpsGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': 'mdblu-cli' }, ...options }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        return httpsGet(res.headers.location, options).then(resolve).catch(reject);
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
  });
}

async function fetchTemplateList() {
  const apiUrl = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${TEMPLATES_PATH}`;
  const body = await httpsGet(apiUrl);
  const items = JSON.parse(body);
  return items
    .filter((item) => item.type === 'file' && item.name.endsWith('.template'))
    .map((item) => item.name);
}

async function fetchRawFile(repoPath) {
  const url = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/master/${repoPath}`;
  return httpsGet(url);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function writeFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

async function scaffoldTemplates(templateNames, cwd, outputDir) {
  const scaffoldRoot = outputDir ? path.resolve(cwd, outputDir) : path.join(cwd, SCAFFOLD_DIR);
  const templatesDir = path.join(scaffoldRoot, 'templates');
  ensureDir(templatesDir);

  // Always include CLAUDE.md
  process.stdout.write('Downloading CLAUDE.md... ');
  const claudeContent = await fetchRawFile(CLAUDE_MD_PATH);
  writeFile(path.join(scaffoldRoot, 'CLAUDE.md'), claudeContent);
  console.log('done');

  // Download selected templates
  for (const name of templateNames) {
    process.stdout.write(`Downloading ${name}... `);
    const content = await fetchRawFile(`${TEMPLATES_PATH}/${name}`);
    writeFile(path.join(templatesDir, name), content);
    console.log('done');
  }

  console.log(`\nScaffold written to ${path.relative(cwd, scaffoldRoot) || SCAFFOLD_DIR}/`);
}

async function cmdList() {
  console.log('Fetching templates from ruco-ai/mdblu...\n');
  const templates = await fetchTemplateList();
  templates.forEach((name, i) => {
    const label = name.replace('.template', '');
    console.log(`  ${String(i + 1).padStart(2)}. ${label}`);
  });
  console.log(`\n${templates.length} templates available.`);
}

function parseOutputFlag(args) {
  const idx = args.indexOf('--output');
  if (idx !== -1 && args[idx + 1]) {
    return { outputDir: args[idx + 1], rest: args.filter((_, i) => i !== idx && i !== idx + 1) };
  }
  return { outputDir: null, rest: args };
}

async function cmdGet(args) {
  const { outputDir, rest } = parseOutputFlag(args);
  const all = rest.includes('--all') || rest.includes('-a');
  const cwd = process.cwd();

  let templates = await fetchTemplateList();

  if (all) {
    console.log(`Downloading all ${templates.length} templates...\n`);
  } else {
    // Filter by name args (strip .template suffix for matching)
    const requested = rest.filter((a) => !a.startsWith('-'));
    if (requested.length === 0) {
      console.error('Error: specify template names or use --all');
      console.error('Usage: mdblu get <name> [<name>...] [--all] [--output <dir>]');
      process.exit(1);
    }
    templates = templates.filter((t) => {
      const base = t.replace('.template', '').toLowerCase();
      return requested.some((r) => r.toLowerCase() === base || r.toLowerCase() === t.toLowerCase());
    });
    if (templates.length === 0) {
      console.error('No matching templates found. Run `mdblu list` to see available templates.');
      process.exit(1);
    }
    console.log(`Downloading ${templates.length} template(s)...\n`);
  }

  await scaffoldTemplates(templates, cwd, outputDir);
}

async function cmdUpdate(args) {
  const cwd = process.cwd();
  const templatesDir = path.join(cwd, SCAFFOLD_DIR, 'templates');

  if (!fs.existsSync(templatesDir)) {
    console.error(`Error: no scaffolded templates found at ${SCAFFOLD_DIR}/templates/`);
    console.error('Run `mdblu get --all` to scaffold templates first.');
    process.exit(1);
  }

  const requested = args.filter((a) => !a.startsWith('-'));
  let toUpdate;

  if (requested.length > 0) {
    // Selective update: use names provided
    toUpdate = requested.map((name) => {
      const normalized = name.toLowerCase().endsWith('.template') ? name : name + '.template';
      return normalized;
    });
  } else {
    // Update all present templates
    const present = fs.readdirSync(templatesDir).filter((f) => f.endsWith('.template'));
    if (present.length === 0) {
      console.error(`No templates found in ${SCAFFOLD_DIR}/templates/`);
      process.exit(1);
    }
    toUpdate = present;
    console.log(`Updating all ${toUpdate.length} present template(s)...\n`);
  }

  const upstream = await fetchTemplateList();
  const upstreamSet = new Set(upstream.map((n) => n.toLowerCase()));

  let updated = 0, skipped = 0, failed = 0;

  for (const name of toUpdate) {
    const normalized = name.toLowerCase().endsWith('.template') ? name : name + '.template';
    if (!upstreamSet.has(normalized.toLowerCase())) {
      console.log(`  ${name.replace('.template', '')}: skipped (not found upstream)`);
      skipped++;
      continue;
    }
    // Find the canonical casing from upstream
    const canonical = upstream.find((u) => u.toLowerCase() === normalized.toLowerCase());
    process.stdout.write(`  ${canonical.replace('.template', '')}: updating... `);
    try {
      const content = await fetchRawFile(`${TEMPLATES_PATH}/${canonical}`);
      writeFile(path.join(templatesDir, canonical), content);
      console.log('done');
      updated++;
    } catch (err) {
      console.log(`failed (${err.message})`);
      failed++;
    }
  }

  console.log(`\n${updated} updated, ${skipped} skipped, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

async function cmdInteractive(args) {
  const { outputDir } = parseOutputFlag(args);
  const templates = await fetchTemplateList();

  console.log('Select templates to download (space to toggle, enter to confirm):\n');
  templates.forEach((name, i) => {
    const label = name.replace('.template', '');
    console.log(`  [${i + 1}] ${label}`);
  });
  console.log('\nEnter numbers separated by commas (e.g. 1,3,5), or "all" for all templates:');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question('> ', async (answer) => {
    rl.close();
    answer = answer.trim();
    let selected;
    if (answer.toLowerCase() === 'all' || answer === '') {
      selected = templates;
    } else {
      const indices = answer.split(',').map((s) => parseInt(s.trim(), 10) - 1);
      selected = indices
        .filter((i) => i >= 0 && i < templates.length)
        .map((i) => templates[i]);
      if (selected.length === 0) {
        console.error('No valid selections. Aborting.');
        process.exit(1);
      }
    }
    console.log(`\nDownloading ${selected.length} template(s)...\n`);
    await scaffoldTemplates(selected, process.cwd(), outputDir);
  });
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  try {
    if (cmd === 'list' || cmd === 'ls') {
      await cmdList();
    } else if (cmd === 'get' || cmd === 'download') {
      await cmdGet(args.slice(1));
    } else if (cmd === 'update') {
      await cmdUpdate(args.slice(1));
    } else if (!cmd) {
      await cmdInteractive(args);
    } else {
      console.error(`Unknown command: ${cmd}`);
      console.error('Usage: mdblu [list | get <name>... | get --all | update [<name>...]] [--output <dir>]');
      process.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

main();
