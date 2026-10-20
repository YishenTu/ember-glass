import type { PluginClientContext } from "@getpaseo/plugin/client";

// Palette from ~/.config/ghostty/themes/my-ghostty-theme. Colors are #RRGGBBAA.
//
// Paseo nests ~10 panels that all paint `background`, so any alpha there
// stacks into a solid color. Instead `background` is fully clear and a single
// glass tint is painted once on the page root (GLASS_TINT below). The desktop
// only shows through when Paseo.app is patched (scripts/transparent-window.py).
//
// How Paseo maps these:
//   background      -> app root, sidebar, terminal (surface0)
//   raised          -> workspace pane, hover rows (surface1)
//   control         -> inputs, selected rows, tab close chip (surface2)
//   border          -> borders and pressed states (surface3)
//   ring            -> focus ring and extra-muted text, so keep it opaque
const colors = {
  background: "#1a161400",
  raised: "#0000001f",
  control: "#2a2320",
  border: "#00000000", // borders hidden, except on buttons and inputs (EDGE)
  ring: "#8a7560",
  foreground: "#f3e4cc",
  mutedForeground: "#c8b79e",
  accent: "#c4956a",
};

// Extra shades used by the CSS below.
const EDGE = "#4a3a2acc"; // button/input borders and the user prompt bubble
const HIGHLIGHT = "#3d322b"; // highlighted item in a popup, hovered diff pill
const CLOSE_HOVER = "#4a3a2a"; // hovered tab close (x)
const SELECTED_ROW = `${colors.foreground}14`; // selected sidebar row (8% text color)

// One tint for the whole window (Ghostty uses 0.7 opacity).
const GLASS_TINT = "rgba(8, 7, 6, 0.55)";

// Popups (menus, tooltips, pickers, Cmd+P, modals, hover cards) are frosted
// glass: a heavily blurred copy of the app behind them plus a light tint.
//
// A plain CSS blur() doesn't work here: the page itself is see-through, so
// Chromium's blurred copy is also see-through and the sharp text behind still
// shows. POPUP_FILTER is an SVG filter that blurs, then lays the result on a
// solid dark base (POPUP_BASE), which hides the sharp copy.
// For fully solid popups, set POPUP_BG to colors.control.
const POPUP_BG = "rgba(42, 35, 32, 0.45)";
const POPUP_BLUR = 16; // blur radius in px (SVG stdDeviation; ~2x that in CSS blur())
const POPUP_BASE = "#16130f";
const POPUP_FILTER = "url(#ember-frost)";
const FROST_ID = "ember-glass-frost";
const FROST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">
  <filter id="ember-frost" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceGraphic" stdDeviation="${POPUP_BLUR}" edgeMode="duplicate" result="blur"/>
    <feFlood flood-color="${POPUP_BASE}" result="base"/>
    <feComposite in="blur" in2="base" operator="over"/>
  </filter>
</svg>`;

// Extra text weight. 0 = Paseo default; 0.3px is about as far as it looks clean.
const TEXT_STROKE = "0.15px";

// Every rule is scoped to this, so the styles only apply while a plugin dark
// theme (this one) is selected. Paseo puts `pluginDark` on <html> for that.
const S = "html.pluginDark.ember-glass";
const FROSTED = "ember-frosted";

const GLASS_CSS = `
/* Main and right panes use the same clear background as the left sidebar. */
${S} {
  --colors-surface-workspace: transparent;
  /* Selected sidebar row: translucent instead of the solid control color. */
  --colors-surface-sidebar-selected: ${SELECTED_ROW};
  background-color: ${GLASS_TINT} !important;
}
/* React Navigation paints an opaque light card behind every screen. */
${S} [style*="background-color: rgb(242, 242, 242)"] { background-color: transparent !important; }
/* Message input box: no extra layer, but keep its border (only elements that already have a border width show it). */
${S} [data-testid="message-input-root"] div:has(textarea) { background-color: transparent !important; border-color: ${EDGE} !important; }
/* User prompt bubble: Paseo paints it with the border color, which is hidden. */
${S} [data-testid="user-message"] > div > div:not([data-testid]):first-child { background-color: ${EDGE} !important; }
/* Frosted popups. Most are found and tagged by frostPopups() below. Ones that
   render inside the app tree are listed by hand: the workspace hover card, the
   / and @ menu above the message input (its card is two levels down), and the
   diff stat pill above the input. */
${S} :is(
  .${FROSTED},
  [data-testid="workspace-hover-card"],
  [data-testid="composer-autocomplete-popover"] > div > div,
  [data-testid="composer-diff-stat-pill"]
) {
  background-color: ${POPUP_BG} !important;
  backdrop-filter: ${POPUP_FILTER} !important;
  /* Highlighted items inside use surface2; lift it so it differs from the panel. */
  --colors-surface2: ${HIGHLIGHT};
}
${S} [data-testid="composer-diff-stat-pill"]:hover { background-color: ${HIGHLIGHT} !important; }
/* Buttons (and split-button groups like Merge PR) keep their borders by re-scoping Paseo's border color variables. */
${S} :is(
  [role="button"],
  button,
  div:has(> button[data-testid$="-caret"]),
  div:has(> [data-testid="workspace-scripts-button"])
) { --colors-border: ${EDGE}; --colors-border-accent: ${EDGE}; }
/* Slightly heavier text: macOS default smoothing (Paseo forces the thinner
   "antialiased") plus a hairline stroke. Keeps the normal/medium/bold hierarchy. */
${S}, ${S} * {
  -webkit-font-smoothing: auto !important;
  -webkit-text-stroke: ${TEXT_STROKE} currentColor;
}
/* Hover fades behind the sidebar "..." and tab close buttons assume opaque
   panels; on glass they show as a dark smudge, so drop them. */
${S} div:has(> svg linearGradient[id^="trailing-action-scrim-"]) { display: none !important; }
/* Tab close (x) button: solid chip with a padding ring so text under it can't show through. */
${S} button[data-testid^="workspace-"][data-testid*="-close-"] {
  background-color: ${colors.control} !important;
  box-shadow: 0 0 0 3px ${colors.control};
  border-radius: 4px !important;
}
${S} button[data-testid^="workspace-"][data-testid*="-close-"]:hover { background-color: ${CLOSE_HOVER} !important; }
/* Hide vertical scrollbars (scrolling still works; horizontal bars stay).
   Paseo's "* { scrollbar-width: thin }" would override ::-webkit-scrollbar, so reset it. */
${S} * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
${S} ::-webkit-scrollbar { width: 0 !important; }
${S} [data-testid="workspace-overlay-scrollbar"],
${S} .xterm .xterm-scrollbar.vertical { display: none !important; }
/* Active workspace tab: copper underline instead of a filled background. */
${S} [data-testid^="workspace-tab-"][aria-selected="true"] {
  background-color: transparent !important;
  border-radius: 0 !important;
  box-shadow: inset 0 -2px 0 ${colors.accent};
}
`;

// The plugin typechecks without the DOM lib, so DOM access is untyped here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const win = globalThis as any;
const doc = win.document;

/**
 * Frost every popup without listing them one by one.
 *
 * Popups render outside the app root: menus, pickers, tooltips and hover cards
 * go into #overlay-root, modals (Cmd+P, usage, add project) into their own
 * body-level layer. In each, the popup itself is the outermost box with
 * rounded corners or a shadow that isn't full-window (full-window boxes are
 * dim backdrops). That box gets the FROSTED class; inner rows are left alone
 * so their hover/selection shading still works.
 *
 * Only those popup layers are watched, so the busy main app (e.g. a streaming
 * chat) never triggers this code.
 */
function frostPopups(): () => void {
  const isPopupLayer = (el: any) =>
    el.tagName === "DIV" && el.id !== "root" && el.id !== FROST_ID;

  const mark = (el: any, depth: number) => {
    if (depth > 12) return;
    const r = el.getBoundingClientRect();
    const fullWindow = r.width >= win.innerWidth - 2 && r.height >= win.innerHeight - 2;
    if (r.width > 0 && r.height > 0 && !fullWindow) {
      const cs = win.getComputedStyle(el);
      if (cs.borderTopLeftRadius !== "0px" || cs.boxShadow !== "none") {
        el.classList.add(FROSTED);
        return;
      }
    }
    for (const child of el.children) mark(child, depth + 1);
  };

  const layers = () => [...doc.body.children].filter(isPopupLayer);
  const scan = () => layers().forEach((layer) => mark(layer, 0));

  // Popups lay out a frame after they mount, so scan on the next frame too.
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    win.requestAnimationFrame(() => {
      queued = false;
      scan();
      win.setTimeout(scan, 120);
    });
  };

  // One observer for the popup layers' contents, one for layers being added.
  const watched = new Set<any>();
  const layerObserver = new win.MutationObserver(schedule);
  const watchLayers = () => {
    for (const layer of layers()) {
      if (watched.has(layer)) continue;
      watched.add(layer);
      layerObserver.observe(layer, { childList: true, subtree: true });
    }
  };
  const bodyObserver = new win.MutationObserver(() => {
    watchLayers();
    schedule();
  });
  bodyObserver.observe(doc.body, { childList: true });
  watchLayers();
  scan();

  return () => {
    bodyObserver.disconnect();
    layerObserver.disconnect();
    for (const el of doc.querySelectorAll(`.${FROSTED}`)) el.classList.remove(FROSTED);
  };
}

export default function contribute(client: PluginClientContext) {
  client.addTheme({
    id: "ember-glass",
    name: "Ember Glass",
    appearance: "dark",
    colors,
  });

  if (!doc) return () => {};
  const frost = doc.createElement("div");
  frost.id = FROST_ID;
  frost.innerHTML = FROST_SVG;
  doc.body.appendChild(frost);
  const style = doc.createElement("style");
  style.id = "ember-glass-css";
  style.textContent = GLASS_CSS;
  doc.head.appendChild(style);
  doc.documentElement.classList.add("ember-glass");
  const stopPopups = frostPopups();
  return () => {
    stopPopups();
    style.remove();
    frost.remove();
    doc.documentElement.classList.remove("ember-glass");
  };
}
