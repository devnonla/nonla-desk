# Nonla Desk — Sharing mini apps (zip)

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

A zip has no source, so a newer copy is not announced: whoever imports it again must pass `--force`.

## Review before you enable

Backends run on the user's machine with their full rights (files, commands, network). Frontends can load code from the network. Treat any app you did not write like a script from the internet:

1. Read every file (`nonladesk path <app>`). Look for shell commands, network calls, file access outside the app, `import` from URLs, anything unexpected.
2. `nonladesk check <app>`.
3. Enable it (`nonladesk enable <app>`) only if the review is clean and the user agrees, or let the user enable it.
4. Review again before importing a newer copy over an app you already enabled (`--force` replaces its code).
