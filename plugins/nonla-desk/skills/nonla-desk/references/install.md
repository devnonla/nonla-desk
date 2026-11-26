# Installing Nonla Desk

Do this yourself when the user asked you to install Nonla Desk, or when `nonladesk status` fails. It needs macOS 12 or later.

1. **Is it already there?** Run `nonladesk status`. If the command is not found, look for `/Applications/Nonla Desk.app` and `~/.local/bin/nonladesk`. When the app exists, use `"/Applications/Nonla Desk.app/Contents/MacOS/nonla-desk"` in place of `nonladesk` (same arguments) and skip the installer.
2. **Run the installer.** It downloads the latest release into `/Applications`, clears the quarantine flag, installs Bun if missing (mini app backends run on it) and links `~/.local/bin/nonladesk`:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/devnonla/nonla-desk/main/scripts/install.sh | bash
   ```
3. **PATH.** If `~/.local/bin` is not on the `PATH`, call `~/.local/bin/nonladesk` by its full path, or add `export PATH="$HOME/.local/bin:$PATH"` to `~/.zshrc` and tell the user.
4. **Check it.** `nonladesk status` opens the app (it lives in the menu bar) and prints the version and the JavaScript runtime. If it says there is no runtime, run `curl -fsSL https://bun.sh/install | bash` and check again.

Everything is local: no server URL, no login, no API key. The CLI talks to the running app over a Unix socket (`~/.nonla-desk/nonladesk.sock`) and opens the app if it is closed.

## Updating and removing

- The app checks for updates by itself and offers them in the menu bar. To update by hand, run the installer again.
- Remove: quit Nonla Desk, delete `/Applications/Nonla Desk.app` and `~/.local/bin/nonladesk`. The user's apps and data stay in `~/.nonla-desk/`; delete that folder only if the user wants them gone (ask first).
