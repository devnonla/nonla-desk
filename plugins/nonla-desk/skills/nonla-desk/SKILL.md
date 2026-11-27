---
name: nonla-desk
description: Build, change and debug Nonla Desk mini apps (React frontend, optional Bun backend, optional menu bar panel) with the local `nonladesk` CLI. Use when the user asks to install Nonla Desk, for a mini app, demo app or desktop widget "in Nonla Desk", or mentions nonladesk, ~/.nonla-desk or an existing mini app.
---

# Nonla Desk

macOS app that hosts **mini apps**, created and changed with the `nonladesk` CLI. All local.

- Not installed, or `nonladesk status` fails: [references/install.md](references/install.md)
- Before writing code: [references/develop.md](references/develop.md) (`nonladesk guide`)
- Icon for every app: [references/icon.md](references/icon.md) (`nonladesk guide icon`)
- Install an app from someone else (marketplace, zip) or send one as a zip: the **nonla-market** skill

## Commands

`<app>` is an id (`color-picker`) or a name. `--json` before the command gives JSON. Exit codes: 0 ok, 1 error, 2 `check` found problems.

| Do | Command |
|---|---|
| List, details, file paths | `nonladesk list`, `get <app>`, `path <app> [frontend\|backend\|panel\|icon]` |
| New app (disabled) | `nonladesk create "Name" [--id x] --frontend f.jsx [--backend b.js] [--panel p.jsx] --icon-file icon.svg [--category …] [--description …] [--enable]` |
| Replace a file, edit metadata | `write <app> frontend\|backend\|panel <file>`, `update <app> --name/--description/--icon-file/--category/--version` |
| Check, apply edits | `check <app>` (or `check --frontend f.jsx` before creating), `reload <app>` |
| On / off | `enable <app>`, `disable <app>` |
| Logs, show the user | `logs <app> [-n 200]`, `open <app>` |
| Own Dock icon | `install <app> [--open]`, `uninstall <app>` |
| Remove | `delete <app> --yes` (ask first) |

## How to work

- `nonladesk list` first. Names and ids are unique: edit the existing app, never make "Todo 2".
- Edit files in place (`nonladesk path`), then `check` and `reload`. New app: write files in a temp folder, `check`, then `create … --enable`.
- UI is your choice: any library via `import`, or plain React. No built-in UI kit.
- After a change: `logs <app>` shows `Backend ready` and no errors, then `open <app>`. A backend that crashes disables its app; fix it and `enable`.
- Apps from other people (zip, marketplace) go through the nonla-market skill, never straight to `import` or `enable`.
- Demo request or no apps yet: make one small no-setup app (a notes pad with `ctx.storage`, or a clock).
- Finish with one line: which app, what it does.
