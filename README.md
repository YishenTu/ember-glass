# Ember Glass

A dark, see-through glass theme for Paseo, using the palette from my Ghostty theme. The window is transparent with a macOS blur, and popups are frosted glass.

## Install

```sh
npm install
paseo plugin install .          # Paseo CLI: /Applications/Paseo.app/Contents/Resources/bin/paseo
npm run patch:apply             # make Paseo's window transparent, then restart Paseo
```

Then pick **Ember Glass** in Settings → Appearance → Theme.

Without the patch the theme still works, but the window stays opaque. Paseo updates undo the patch, so run `npm run patch:apply` again after each update (`patch:status` checks it, `patch:restore` reverts it).

## Customize

Everything lives in `index.client.ts`. The main settings:

| Setting | What it does |
|---|---|
| `colors` | Base palette (text, accent, panels) |
| `GLASS_TINT` | Darkness/opacity of the window glass |
| `POPUP_BG`, `POPUP_BLUR` | Popup tint and blur strength |
| `TEXT_STROKE` | Extra text weight |

Apply changes live with `paseo plugin reload ember-glass`.

To change the blur material (`hud` by default), edit `VIBRANCY` in `scripts/transparent-window.py` and re-run `npm run patch:apply`.
