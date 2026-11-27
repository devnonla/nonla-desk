# Sharing mini apps

Nonla Desk only installs. Two sources: a **zip** someone sends once, or a **marketplace**, someone's git repo that gets updates. Whatever the source, review before installing (review guide).

## Id and version

Every app has a unique **id** (lowercase letters, digits, single hyphens, e.g. `color-picker`), made from its name on `create` or set with `--id`. It never changes; the name can. `version` must look like `1.2.3`; raise it when the code changes (`nonladesk update <app> --version 1.1.0`), since a higher version is how an update is recognised.

## Zip

An exported zip (and a directory you import) holds only these files, optionally inside one top folder:

```
manifest.json         {"id","name","version","description","icon","category","config"?}
frontend/index.jsx    backend/index.js    panel/index.jsx    icon.svg
```

- `version` is required. Limits: zip 10 MB, each file 2 MB. Any other file is rejected.
- `import` creates the app **disabled**. An app with the same id is never overwritten unless you pass `--force`.

```bash
nonladesk export color-picker              # writes color-picker.zip (or -o path)
nonladesk import color-picker.zip          # after the review; installs disabled
```

A zip has no source, so there are no updates. Before sending one: no secrets (keys, tokens, personal paths) in the code or config defaults, and pinned `import` versions (`antd@5.12.0`).

## Marketplace

Someone else's git repo, added with `nonladesk market add <user/repo>`. Nonla Desk keeps a read-only clone and never writes to it. Layout, for whoever makes one by hand:

```
marketplace.json
apps/<id>/{manifest.json, frontend/index.jsx, backend/index.js, panel/index.jsx, icon.svg}
```

```json
{ "name": "my-market", "owner": { "name": "me" }, "description": "…",
  "apps": [ { "name": "color-picker", "source": "./apps/color-picker", "version": "1.0.0", "description": "…", "category": "Dev Tools" } ] }
```

Each entry's `name` equals the app's manifest `id`, and `source` is a folder inside the repo with plain files (no symlinks). The version shown comes from the app's `manifest.json`. An app is addressed as `<id>@<market>`. The official one: `devnonla/nonladesk-apps`.

| Do | Command |
|---|---|
| Add / list / remove | `nonladesk market add <user/repo>`, `market list`, `market remove <market>` |
| Refresh the app list (installed apps do not change) | `nonladesk market update [market]` |
| Browse, with install and update state | `nonladesk market apps [market]` |
| Which installed apps have a newer version | `nonladesk market outdated` |
| What changed in one app | `nonladesk market diff <id>@<market>` |
| Show an app's files | `nonladesk market show <id>@<market>` |
| Install, or update one app | `nonladesk market install <id>@<market>` (after the review; new apps land **disabled**) |

An installed app is a normal mini app that remembers its marketplace, so `outdated` and `diff` can find it. Importing a zip over it with `--force` makes it local again.
