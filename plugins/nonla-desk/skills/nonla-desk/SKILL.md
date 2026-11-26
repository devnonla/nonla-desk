---
name: nonla-desk
description: Build, change and debug Nonla Desk mini apps with the local `nonladesk` CLI. A mini app is a small tool on the user's Nonla Desk (macOS) with a React/JSX frontend, an optional Bun backend and an optional menu bar panel. Use when the user asks to install Nonla Desk, for a mini app or a demo app, for a desktop tool or widget "in Nonla Desk", or mentions nonladesk, ~/.nonla-desk, or an existing mini app by name.
---

# Nonla Desk

Nonla Desk is a macOS app that hosts **mini apps**. You create and change them with the `nonladesk` CLI. Everything is local.

## What do you need?

| The user wants… | Read |
|---|---|
| Nonla Desk installed, or `nonladesk` is not found | [references/install.md](references/install.md) |
| To build or change a mini app (code, CLI workflow, `ctx` API) | [references/develop.md](references/develop.md) (`nonladesk guide`) |
| An icon for an app | [references/icon.md](references/icon.md) (`nonladesk guide icon`) |
| To publish or share an app, or install one made by someone else | the **nonla-market** skill (it reviews the code before installing) |

`nonladesk status` must work before anything else. Read the develop guide before writing code; read the icon guide when you create an app.

## Commands

`<app>` is an id (`color-picker`) or a name, case-insensitive. Put `--json` before the command for JSON output.

| Do | Command |
|---|---|
| See what exists | `nonladesk list`, `nonladesk get <app>` |
| Where the files are | `nonladesk path <app> [frontend\|backend\|panel\|icon]` |
| New app (created disabled) | `nonladesk create "Name" [--id my-id] --frontend f.jsx [--backend b.js] [--panel p.jsx] --icon-file icon.svg [--category "Dev Tools"] [--description "…"] [--enable]` |
| Replace one file | `nonladesk write <app> frontend\|backend\|panel <file>` (or `-` for stdin). Reloads the app. |
| Metadata, icon, version | `nonladesk update <app> --name/--description/--icon-file/--category/--version` |
| Syntax check | `nonladesk check <app>`, or `nonladesk check --frontend f.jsx` before creating |
| Apply edits made in place | `nonladesk reload <app>` |
| On / off | `nonladesk enable <app>`, `nonladesk disable <app>` |
| Backend output, crashes | `nonladesk logs <app> [-n 200]` |
| Show the user | `nonladesk open <app>` |
| Standalone macOS app | `nonladesk install <app> [--open]`, `nonladesk uninstall <app>` |
| Remove | `nonladesk delete <app> --yes` (ask the user first) |

Exit codes: 0 ok, 1 error (message on stderr), 2 `check` found problems.

## How to work

- `nonladesk list` first. App names and ids are unique: never create "Todo 2" or a copy to iterate. Edit the existing app.
- Edit an existing app's files in place (paths from `nonladesk path`), then `nonladesk check <app>` and `nonladesk reload <app>`.
- New app: write the files in a temp folder, `nonladesk check --frontend … --icon-file …`, then `nonladesk create … --enable`.
- Every app gets an SVG icon that says what it does (icon guide).
- The UI is yours to choose: any library via `import` (antd, Mantine, shadcn-style…), or plain React and CSS. Nonla Desk has no UI kit of its own.
- After a change: `nonladesk logs <app>` to confirm the backend started (`Backend ready`) and had no errors, then `nonladesk open <app>` so the user sees it.
- A backend that exits with an error disables its app. Fix the code, then `nonladesk enable <app>`.
- This skill is for apps on this machine. Apps from other people (zip, marketplace) go through the nonla-market skill: never import or enable them without its review.
- Errors say what is wrong and how to fix the call. Read them before retrying.
- When done, say in one line which app you made or changed and what it does.

## Demo app

When the user asks for a demo, or has no mini apps yet, make one small app that shows what Nonla Desk does:

1. `nonladesk list` first. If a suitable app already exists, open it with `nonladesk open <app>` instead of making a copy.
2. Pick something that needs no setup, such as a notes pad that keeps its text with `ctx.storage` (a frontend and a short backend), or a clock. Give it a plain name and a one-line description.
3. Write `frontend.jsx` (and `backend.js` if it needs one) and an `icon.svg` in a temp folder, following the guides.
4. `nonladesk check --frontend … --icon-file …`, then `nonladesk create "Name" --frontend … [--backend …] --icon-file … --enable`.
5. `nonladesk logs <app>` to confirm `Backend ready`, then `nonladesk open <app>`. Tell the user in one line what you made, that it is on their Nonla Desk, and that closing the window keeps Nonla Desk in the menu bar.
