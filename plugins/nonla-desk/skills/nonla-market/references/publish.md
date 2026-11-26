# Publishing and sharing mini apps

Two ways: a **zip** for sending an app once, a **marketplace** (a git repo) for apps that get updates. The app itself is built with the nonla-desk skill; this is about getting it to other people.

## Id and version

Every app has a unique **id** (lowercase letters, digits, single hyphens, e.g. `color-picker`), made from its name on `create` or set with `--id`. It never changes; the name can. `version` must look like `1.2.3`; raise it whenever the code changes (`nonladesk update <app> --version 1.1.0`), because it is how a newer copy is recognised.

## Before you publish

- The app works: `nonladesk check <app>`, `nonladesk logs <app>`, and you opened it.
- `id`, `version`, `description`, `category` and an `icon.svg` are set.
- **No secrets** in the code, `config` defaults or storage seeds: no API keys, tokens, passwords, personal paths or emails.
- Say in the description what the app touches (files, network) so a reviewer is not surprised. Others will read every file before installing, so keep the code readable: no minifying, no obfuscation.
- Pin library versions in `import` (`antd@5.12.0`, not `antd`), because an unpinned import can change after someone reviewed it.

## Zip

An exported zip (and a directory you import) holds only these files, optionally inside one top folder:

```
manifest.json         {"id","name","version","description","icon","category","config"?}
frontend/index.jsx    backend/index.js    panel/index.jsx    icon.svg
```

- `version` is required. `id` is derived from the name when an older zip has none.
- Limits: zip 10 MB, each file 2 MB. Any other file in the zip is rejected.
- `import` creates the app **disabled**. An app with the same id is never overwritten unless you pass `--force`.

```bash
nonladesk export color-picker              # writes color-picker.zip (or -o path)
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

`name` must equal the app's manifest `id`; `source` is a path inside the repo. App folders hold plain files only (symlinks are refused). The version shown to users comes from each app's `manifest.json`. An app is addressed as `<id>@<market>`. The Nonla Desk repo itself is a marketplace: `nonladesk market add devnonla/nonla-desk`.

| Do | Command |
|---|---|
| Add / list / remove | `nonladesk market add <user/repo>`, `market list`, `market remove <market>` |
| Fetch the latest | `nonladesk market update [market]` |
| Browse, with install and update state | `nonladesk market apps [market]` |
| Show an app's files | `nonladesk market show <id>@<market>` |
| Install or update | `nonladesk market install <id>@<market>` (installed **disabled**; review first, see the review guide) |
| Publish your own app | `nonladesk market publish <app> --to <market\|dir>` |

### Publish your app to a marketplace

1. Your own marketplace repo: create a git repo (or use an added marketplace's folder, `~/.nonla-desk/markets/<name>`), then `nonladesk market publish <app> --to <dir>`. It writes `apps/<id>/…` and adds or updates the entry in `marketplace.json`.
2. Look at what was written (`git status`, `git diff`) and check there are no secrets.
3. Commit and push that repo. Nothing is pushed for you.
4. Others add it with `nonladesk market add <user/repo>`. To release an update, raise `version`, run `market publish` again, commit and push; their `market apps` then shows `update available`.

`market update` skips a marketplace folder that has uncommitted changes (published apps): commit and push them first.
