# Nonla Desk — Drawing a mini app icon

Every app needs an icon that says what it does. It is shown on the desktop (48px), in the top bar, the ⌘K palette and the menu bar panel (16px). Draw it as one inline SVG and pass it with `--icon-file icon.svg` on `create` or `update`. It is stored as `icon.svg` in the app folder: edit it in place, then `nonladesk reload <app>`. `nonladesk check <app>` checks it too. Without a valid SVG the desktop falls back to a generic emoji.

How it is shown:
- As-is, no tint and no tile behind it. You design everything: shape, colors, background.
- Draw for 16–32px: a few bold shapes, no thin hairlines, no text.
- `currentColor` is the ink color (#1d1d1d). Use it for a neutral line icon; set explicit `fill`/`stroke` colors for a colored one. Keep related apps in one style.

Rules (`create`/`update` fail with the reason otherwise):
- Starts with `<svg`, ends with `</svg>`, has a square `viewBox` (`0 0 24 24` or `0 0 48 48`), under 8000 characters.
- Elements: `path`, `rect`, `circle`, `ellipse`, `line`, `polyline`, `polygon`, `g`, `defs`, `linearGradient`, `radialGradient`, `stop`, `clipPath`, `mask`, `title`, `desc`.
- Not allowed: `<script>`, `<style>` (use attributes), `<image>`, `<foreignObject>`, `<use>`, `on…=` handlers, `javascript:`, and `href` to anything but an `#id` inside the icon. `id`s are fine; they never clash between icons.

Line icon:
```svg
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
```

House style (use this for every app so the desktop looks like one set): a 42px rounded square with a vertical gradient, a top highlight, and one bold white glyph. Desktop icons are shown at 48px with no tile behind them. Pick a color that is not already used by another app (`nonladesk list` and look at the desktop): amber, yellow, violet, slate, blue, green, teal, rose…

```svg
<svg viewBox="0 0 48 48"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#62b0f7"/><stop offset="1" stop-color="#2b6fd6"/></linearGradient><linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".28"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient></defs><rect x="3" y="3" width="42" height="42" rx="11" fill="url(#bg)"/><rect x="3" y="3" width="42" height="42" rx="11" fill="url(#hl)"/><path d="M12.5 17l2.6 2.6 4.6-4.6M12.5 25l2.6 2.6 4.6-4.6" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 17.5h12M24 25.5h12" stroke="#fff" stroke-width="2.8" stroke-linecap="round"/></svg>
```

Keep the glyph inside x/y 10–38, strokes 2.5–3.5 wide, one or two accent colors at most.
