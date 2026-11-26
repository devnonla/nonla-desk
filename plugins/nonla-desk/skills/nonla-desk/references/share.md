# Nonla Desk — Sharing mini apps

Two ways: a **zip** for sending an app once, a **marketplace** (a git repo) for apps that get updates.

## Id and version

Every app has a unique **id** (lowercase letters, digits, single hyphens, e.g. `color-picker`), made from its name on `create` or set with `--id`. It never changes; the name can. `nonladesk <cmd> <app>` accepts the id, the name or the internal folder id.

## Zip

An exported zip (and a directory you import) holds only these files, optionally inside one top folder:

```
manifest.json         {"id","name","version","description","icon","category","config"?}
frontend/index.jsx    backend/index.js    panel/index.jsx    icon.svg
```

- `version` is required and must look like `1.2.3`; raise it whenever the code changes, because it is how a newer copy is recognised. `id` is derived from the name when an older zip has none.
- Limits: zip 10 MB, each file 2 MB. Any other file in the zip is rejected.
- `import` creates the app **disabled**. An app with the same id is never overwritten unless you pass `--force`.
- Imported code runs on this machine with full user rights (a backend can run commands and read files). Before enabling someone else's app: read every file (`nonladesk path <app>`), `nonladesk check <app>`, then `nonladesk enable <app>`.

```bash
nonladesk export color-picker -o color-picker.zip
nonladesk import color-picker.zip          # on the other machine; installs disabled
```

A zip has no source, so a newer copy is not announced: whoever imports it again must pass `--force`. For apps that should get updates, use a marketplace.

## Marketplace

A marketplace is a git repo (usually GitHub) with `marketplace.json` at the root and each app as a folder in the same layout as the zip:

```
marketplace.json
apps/<id>/{manifest.json, frontend/index.jsx, backend/index.js, panel/index.jsx, icon.svg}
```

```json
{ "name": "my-market", "owner": { "name": "me" }, "description": "…",
  "apps": [ { "name": "color-picker", "source": "./apps/color-picker", "version": "1.0.0", "description": "…", "category": "Dev Tools" } ] }
```

`name` is the app id; `source` is a path inside the repo. An app is addressed as `<id>@<market>`. The Nonla Desk repo itself is a marketplace: `nonladesk market add devnonla/nonla-desk`.

| Do | Command |
|---|---|
| Add / list / remove | `nonladesk market add <user/repo>`, `market list`, `market remove <market>` |
| Fetch the latest | `nonladesk market update [market]` |
| Browse, with install and update state | `nonladesk market apps [market]` |
| Review before installing | `nonladesk market show <id>@<market>` |
| Install or update | `nonladesk market install <id>@<market>` (installed **disabled**) |
| Share your own app | `nonladesk market publish <app> --to <market\|dir>`, then commit and push that repo |

## Review before you install or enable

Backends run on the user's machine with their full rights (files, commands, network). Frontends can load code from the network. Treat any app you did not write like a script from the internet. The `nonla-market` skill has the full procedure: read every file, report the risks to the user, install only after they agree. In short:

1. Read every file (`nonladesk market show …` or `nonladesk path <app>`). Look for shell commands, network calls, file access outside the app, `import` from URLs, anything unexpected.
2. `nonladesk check <app>`.
3. Enable it (`nonladesk enable <app>`) only if the review is clean and the user agrees, or let the user enable it.
4. After `market update`, review again before `market install` replaces the code of an app you already enabled.
