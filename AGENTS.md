# AGENTS.md

Guide for coding agents working on this repo. User-facing docs are in `README.md`; `OVERVIEW.md` is the blurb Paseo shows for the plugin.

## What this is

A Paseo (Electron desktop app, macOS) theme plugin plus an app patch:

- `paseo-plugin.json` — plugin manifest (id `ember-glass`).
- `index.client.ts` — the whole plugin. Registers the theme with `client.addTheme`, injects one `<style>` (`GLASS_CSS`), an SVG blur filter (`FROST_SVG`), and runs `frostPopups()`. Returns a cleanup that undoes all of it.
- `scripts/transparent-window.py` — patches `/Applications/Paseo.app` so the window is transparent with macOS vibrancy. `apply | restore | status`.
- `scripts/cdp-eval.mjs` — evaluate JS in the running app (see Debugging).

## Commands

```sh
PASEO=/Applications/Paseo.app/Contents/Resources/bin/paseo
npm run typecheck                 # must pass before reloading
$PASEO plugin reload ember-glass  # apply changes live, no restart
$PASEO plugin ls                  # status and load errors
npm run patch:status              # patched | original | unknown
```

Patch changes (`apply`/`restore`) need a Paseo restart (Cmd+Q, reopen). Ask the user before restarting Paseo — they may be running agents in it.

## How the theme works

- **Theme colors** map onto Paseo's surfaces: `background`→surface0/sidebar, `raised`→surface1/workspace, `control`→surface2/inputs/selected rows, `border`→surface3/borders, `ring`→surface4/focus ring/extra-muted text. `#RRGGBBAA` is allowed.
- **Single glass layer.** Paseo nests ~10 panels that each paint `background`; any alpha there stacks into a solid color. So `background` is fully clear and one tint (`GLASS_TINT`) is painted on `<html>`. Don't add alpha to nested surfaces.
- **CSS variables.** Unistyles emits theme variables on `:root.pluginDark` (`--colors-surface-workspace`, `--colors-border`, `--colors-surface2`, …). Override them by re-scoping the variable on a more specific selector rather than overriding `background-color` everywhere.
- **Scope.** Every rule starts with `${S}` (`html.pluginDark.ember-glass`), so styles only apply while this theme is selected. Keep that for new rules.
- **Popups** are frosted (`POPUP_BG` + `backdrop-filter: url(#ember-frost)`):
  - `frostPopups()` watches only body-level layers outside `#root` (`#overlay-root` for menus/tooltips, separate divs for modals) and tags the outermost rounded-or-shadowed, non-full-window box with `.ember-frosted`.
  - Popups that render inside `#root` must be listed by hand in the frosted `:is(...)` rule (hover card, `/` `@` autocomplete, diff stat pill).
- **Selectors** prefer `data-testid`. To find testIDs: `grep -rhoE 'testID:"[^"]*"' /Applications/Paseo.app/Contents/Resources/app-dist | sort -u`.

## Gotchas (learned the hard way)

- **`backdrop-filter: blur()` doesn't hide content here.** In the transparent window the blurred copy is itself translucent and the sharp original shows through. That's why popups use the SVG filter that composites the blur over a solid `POPUP_BASE`.
- React Navigation paints an inline opaque `rgb(242, 242, 242)` card behind screens; the CSS overrides it.
- Paseo sets `* { scrollbar-width: thin }`, which wins over `::-webkit-scrollbar`; reset it first.
- Hover "scrims" (SVG gradients behind sidebar `⋯` / tab `×`) assume opaque panels and look like smudges on glass; they're hidden.
- The DevTools screenshot (`Page.captureScreenshot`) matches the real screen for blur checks; `screencapture -R` works too but only if Paseo is frontmost.
- Your own test elements appended to `<body>` get tagged by `frostPopups()` if they're rounded — set inline `!important` styles to bypass.

## App patch

`transparent-window.py` does same-length in-place edits of `app.asar` (asar integrity validation is disabled in Paseo's fuses), so the archive layout doesn't change:

1. `main.js`: main `BrowserWindow` gets `transparent:true, vibrancy:"hud", visualEffectState:"active", backgroundColor:"#00000000"`.
2. `window-manager.js`: renderer can't reset the window background to opaque.
3. `app-dist/index.html`: page default background → transparent.

Originals are kept as `*.orig`; `apply` always starts from them. If a Paseo update changes those strings, `apply` exits with "files don't match" — update the `*_OLD` constants after inspecting the new sources (extract with `npx @electron/asar extract`). Blur strength isn't adjustable through Electron; only the `VIBRANCY` material.

## Debugging

```sh
open -a Paseo --args --remote-debugging-port=9333   # Paseo must be fully quit first
node scripts/cdp-eval.mjs 'document.querySelectorAll(".ember-frosted").length'
```

Check a change by evaluating `getComputedStyle(...)` on the target, or capture a screenshot via CDP `Page.captureScreenshot`. Always verify visually for anything involving transparency or blur — computed styles alone have misled before.

## Conventions

- DOM access is untyped (`globalThis as any`): the plugin's tsconfig has no DOM lib.
- Keep tunables as named constants at the top of `index.client.ts`; don't hard-code colors in `GLASS_CSS`.
- Comments explain *why* a rule exists (what Paseo does that it counters).
- Update `README.md` (settings table) and `OVERVIEW.md` when user-visible behavior changes.
