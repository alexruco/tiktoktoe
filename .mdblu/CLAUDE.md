# Claude Agent Context: mdblu

This repo is a collection of markdown templates for AI-assisted software development workflows. Each template is filled by the AI from a prompt and output as a structured document.

The repo also ships as an npm package (`mdblu`) with a CLI that lets users scaffold a `.mdblu/` directory containing downloaded templates and a `CLAUDE.md` stub.

---

## CLI

The CLI lives in `bin/mdblu.js` and is declared as the `mdblu` bin in `package.json`. It has zero runtime dependencies (Node built-ins only: `https`, `fs`, `readline`). Requires Node >=18.

### Commands

- `mdblu list` — fetches the template list from the GitHub Contents API and prints all available `.template` files with readable names.
- `mdblu get <name>... [--all] [--output <dir>]` — downloads the specified templates (or all with `--all`) into `<dir>/templates/` and writes `CLAUDE.md` to `<dir>/CLAUDE.md`. Defaults to `.mdblu/` when `--output` is omitted.
- `mdblu update [<name>...]` — re-downloads and refreshes already-scaffolded templates in `.mdblu/templates/`. With no arguments, updates all present templates; with names, updates only those. Does not update `CLAUDE.md`. Exits with code 1 if any template fails.
- `mdblu [--output <dir>]` (no args) — interactive mode: displays a numbered checklist, accepts comma-separated indices or `all`, then scaffolds. Defaults to `.mdblu/` when `--output` is omitted.

### Scaffold output

```
<output-dir>/          ← defaults to .mdblu/
  templates/           ← downloaded .template files
  CLAUDE.md            ← always written
```

### Publishing

The package has not yet been published to npm. Run `npm publish` (requires npm credentials) to publish.

---

## When to Use Each Template

### Planning & Scoping

**SPEC.md** — Use when the user describes a feature, system, or change that needs to be fully thought through before implementation. Output is a detailed specification including data model, API surface, error handling, and open questions.

**MISSION.md** — Use when the user assigns a concrete task to an AI agent. Smaller scope than a SPEC — one coherent unit of work. Output defines goals, constraints, success criteria, and deliverables for that mission.

**BOOTSTRAP.md** — Use when the user has a SPEC and needs it decomposed into an ordered sequence of implementable tasks. Output is a dependency-ordered task list tagged [BOT] or [HUMAN].

**OPEN-QUESTIONS.md** — Use when the AI cannot proceed without answers from the developer. Generate only the categories and questions that are genuinely unresolved. Dev fills it and passes it back as the next prompt.

---

### During Implementation

**CODING-NOTES.md** — Use at the start of a new project to establish identity, conventions, error handling, testing strategy, and the order in which files should be written. Acts as a contract for the implementation session.

**CLAUDE.md** (the template, not this file) — Use when setting up agent context for a specific project repo. Gives any AI agent working in that repo the minimal context it needs: key files, conventions, commands, constraints, and gotchas.

---

### After Implementation

**HANDOFF.md** — Use after the AI builds v1 of a project or feature. Documents what was built, how to run it, shortcuts and assumptions made, known issues, and prioritized next steps. Audience is the developer who will take the project forward.

**MISSION-REPORT.md** — Use after a MISSION is completed. Documents outcome, what was and wasn't accomplished, key decisions made, issues encountered, lessons learned, and follow-up actions.

---

### Documentation & Reference

**README.md** — Use to generate a project README from a description. Covers overview, features, installation, usage, configuration, and project structure.

**DEV.md** — Use to generate a developer guide for an existing or planned project. Covers prerequisites, setup, workflow, architecture overview, environment variables, and CI/CD.

**ARCHITECTURE.md** — Use when the user wants to document the high-level architecture of a system: components, data flow, deployment, and key design decisions.

**STRUCTURE.md** — Use when the user wants to document the internal layout of a codebase: directory tree, public API surface, key types, and dependencies. More granular than ARCHITECTURE.md.

**ADR.md** — Use when the user needs to document a specific architectural or technical decision: context, the decision made, rationale, alternatives considered, and consequences.

**PLAYBOOK.md** — Use when the user wants to document a repeatable operational procedure: deployment, incident response, database migration, etc. Output is a step-by-step runbook with rollback and escalation.

**SKILL.md** — Use when the user wants to document a reusable AI agent capability: trigger conditions, inputs, outputs, behavior, and examples.

**TODO.md** — Use when the user needs a simple, standalone task list not tied to a mission or bootstrap sequence.

**GH-PROJECT.md** — Use when the user wants to define a GitHub Project (fields, items, owners) as a markdown file that can be pushed to GitHub via `scripts/gh-project-push.js`. The AI fills in the project metadata, custom fields, and initial items from the prompt.

---

## Choosing Between Similar Templates

| If you need... | Use |
|---|---|
| To plan a feature end-to-end | SPEC.md |
| To scope a single agent task | MISSION.md |
| To sequence tasks from a SPEC | BOOTSTRAP.md |
| To unblock with dev input | OPEN-QUESTIONS.md |
| To hand off v1 to a developer | HANDOFF.md |
| To close out a completed mission | MISSION-REPORT.md |
| High-level system documentation | ARCHITECTURE.md |
| File-level codebase reference | STRUCTURE.md |
| A single technical decision | ADR.md |
| A repeatable ops procedure | PLAYBOOK.md |
| Create a GitHub Project with fields + items | GH-PROJECT.md |

## Scripts

**scripts/gh-project-push.js** — Reads a filled `GH-PROJECT.md` and creates the GitHub Project, custom fields, and items via the `gh` CLI.

```
node scripts/gh-project-push.js <path-to-GH-PROJECT.md>
```

Requires: `gh` CLI installed and authenticated (`gh auth login`), Node >=18.

---

## General Rules

- Fill every section from the prompt. Do not leave placeholders.
- Omit sections only when the template explicitly allows it (e.g. OPEN-QUESTIONS categories).
- Remove all HTML comments (`<!-- ... -->`) from the final output.
- Do not add, remove, or reorder sections unless a template says otherwise.
- Tag tasks and actions [BOT] or [HUMAN] wherever the template calls for it.
- Every template includes YAML frontmatter with `title`, `type`, and `tags` fields. Do not remove or modify these fields when filling a template. Refer to `TAGS.md` at the repo root for the full tag taxonomy and definitions.