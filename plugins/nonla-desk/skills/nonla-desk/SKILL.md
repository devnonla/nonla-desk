---
name: nonla-desk
description: Build, change and debug Nonla Desk mini apps with the local `nonla` CLI. A mini app is a small tool on the user's Nonla Desk (macOS) with a React/JSX frontend, an optional Bun backend and an optional menu bar panel. Use when the user asks for a mini app, a desktop tool or widget "in Nonla Desk", or mentions nonla, ~/.nonla-desk, or an existing mini app by name.
---

# Nonla Desk

Nonla Desk is a macOS app that hosts **mini apps**. You create and change them with the `nonla` CLI. Everything is local: no server URL, no login, no API key. The CLI talks to the running app over a Unix socket (`~/.nonla-desk/nonla.sock`) and opens the app if it is closed.

## Before the first command

1. Check the CLI: `nonla status`. If `nonla` is not found, use `"/Applications/Nonla Desk.app/Contents/MacOS/nonla-desk"` with the same arguments, or ask the user to install Nonla Desk:
   `curl -fsSL https://raw.githubusercontent.com/devnonla/nonla-desk/main/scripts/install.sh | bash`
2. `status` shows the JavaScript runtime. Backends need Bun (or Node.js). If it says none, tell the user to run `curl -fsSL https://bun.sh/install | bash`.
3. Read [references/guide.md](references/guide.md) before writing code. It has the frontend, backend and panel formats, `ctx`, the UI kit and the styling rules. `nonla guide` prints the same text.

## Commands

`<app>` is an id or a name (case-insensitive). Put `--json` before the command for JSON output.

| Do | Command |
|---|---|
| See what exists | `nonla list`, `nonla get <app>` |
| Where the files are | `nonla path <app> [frontend\|backend\|panel\|icon]` |
| New app (created disabled) | `nonla create "Name" --frontend f.jsx [--backend b.js] [--panel p.jsx] --icon-file icon.svg [--category "Dev Tools"] [--description "…"] [--enable]` |
| Replace one file | `nonla write <app> frontend\|backend\|panel <file>` (or `-` for stdin). Reloads the app. |
| Metadata, icon | `nonla update <app> --name/--description/--icon-file/--category/--version` |
| Syntax check | `nonla check <app>`, or `nonla check --frontend f.jsx` before creating |
| Apply edits made in place | `nonla reload <app>` |
| On / off | `nonla enable <app>`, `nonla disable <app>` |
| Backend output, crashes | `nonla logs <app> [-n 200]` |
| Show the user | `nonla open <app>` |
| Share | `nonla export <app> -o x.zip`, `nonla import <zip\|dir>` |
| Standalone app | `nonla install <app> [--open]`, `nonla uninstall <app>` |
| Remove | `nonla delete <app> --yes` (ask the user first) |

Exit codes: 0 ok, 1 error (message on stderr), 2 `check` found problems.

## How to work

- `nonla list` first. App names are unique: never create "Todo 2" or a copy to iterate. Edit the existing app.
- Edit an existing app's files in place (paths from `nonla path`), then `nonla check <app>` and `nonla reload <app>`.
- New app: write the files in a temp folder, `nonla check --frontend … --icon-file …`, then `nonla create … --enable`.
- UI: an app may `import` any library (antd, dayjs…; see "Libraries" in the guide). The built-in `ctx.ui` (devnonla-ui) is optional and only kept for existing apps. There is no icon pack; `ctx.icons` fails.
- Every app gets an SVG icon (`--icon-file icon.svg`) that says what it does. Read the Icon section of the guide for the rules; the call fails with the reason if the SVG is not allowed.
- After a change: `nonla logs <app>` to confirm the backend started (`Backend ready`) and had no errors, then `nonla open <app>` so the user sees it.
- A backend that exits with an error disables its app. Fix the code, then `nonla enable <app>`.
- Errors say what is wrong and how to fix the call. Read them before retrying.
- When done, say in one line which app you made or changed and what it does.
