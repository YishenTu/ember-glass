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
//   control         -> inputs, selected rows, hovered small buttons (surface2)
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
// Extra space above the top bar (sidebar, workspace header, right panel tabs).
// The macOS window buttons move down by the same amount.
const TOP_GAP = 6;
// Fade under a trailing hover button (tab x, sidebar "..."): clear for the first px, solid from the second.
const TRAILING_FADE = [22, 38];
// Tab close (x) buttons: "workspace-agent-close-<id>", "workspace-pull_request-close", ...
const TAB_CLOSE = `button:is([data-testid^="workspace-"][data-testid*="-close-"], [data-testid^="workspace-"][data-testid$="-close"])`;
const ON_ACCENT = "#1a1614"; // icons/text on copper buttons (Paseo derives it from the clear background)
// Stop button while an agent runs: hollow ring + square, same color as the composer controls (model, effort, mode).
const STOP_COLOR = colors.mutedForeground;
const SELECTED_ROW = `${colors.foreground}14`; // selected sidebar row (8% text color)

// One tint for the whole window (Ghostty uses 0.7 opacity). The popup frost
// mask threshold is derived from GLASS_ALPHA, so change it here only.
const GLASS_ALPHA = 0.55;
const GLASS_TINT = `rgba(8, 7, 6, ${GLASS_ALPHA})`;

// Popups (menus, tooltips, pickers, Cmd+P, modals, hover cards) are frosted
// glass: see-through like the panels, with whatever app content is behind
// them heavily blurred.
//
// A plain CSS blur() doesn't work here: the page itself is see-through, so
// Chromium's blurred copy is also see-through and the sharp text behind still
// shows. POPUP_FILTER is an SVG filter that instead:
//   1. builds a mask of where there is content behind the popup (pixels more
//      opaque than the window tint), widened by POPUP_MASK_GROW px,
//   2. paints an opaque, blurred copy only inside that mask, mixed toward
//      POPUP_PATCH_TONE (about what the see-through glass looks like) so the
//      patches blend in instead of reading as dark smudges,
//   3. feathers the mask edges (POPUP_MASK_FEATHER) so patches fade out.
// Empty areas stay clear (desktop shows through); text becomes a soft blur.
const POPUP_BG = "rgba(42, 35, 32, 0.25)"; // tint on top; colors.control = solid
const POPUP_BLUR = 16; // blur radius in px (SVG stdDeviation; ~2x that in CSS blur())
const POPUP_MASK_GROW = 16; // keep >= 2x feather, or sharp text leaks at patch edges
const POPUP_MASK_FEATHER = 8;
const POPUP_PATCH_TONE = "#2e2621";
const POPUP_PATCH_MIX = 0.35; // share of the blurred content in a patch (rest is tone)
const FILTER_ID = "ember-frost";
const POPUP_FILTER = `url(#${FILTER_ID})`;
const FROST_ID = "ember-glass-frost"; // the div holding the SVG
// Mask threshold: empty glass has alpha GLASS_ALPHA; content pushes it toward 1.
// Alpha GLASS_ALPHA + 0.02 -> 0, GLASS_ALPHA + 0.06 and up -> 1.
const MASK_SLOPE = 25;
const MASK_INTERCEPT = -Math.round(MASK_SLOPE * (GLASS_ALPHA + 0.02) * 100) / 100;
const FROST_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute">
  <filter id="${FILTER_ID}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feComponentTransfer in="SourceGraphic" result="hasContent"><feFuncA type="linear" slope="${MASK_SLOPE}" intercept="${MASK_INTERCEPT}"/></feComponentTransfer>
    <feMorphology in="hasContent" operator="dilate" radius="${POPUP_MASK_GROW}" result="grown"/>
    <feGaussianBlur in="grown" stdDeviation="${POPUP_MASK_FEATHER}" result="mask"/>
    <feGaussianBlur in="SourceGraphic" stdDeviation="${POPUP_BLUR}" edgeMode="duplicate" result="blur"/>
    <feComponentTransfer in="blur" result="opaqueBlur"><feFuncA type="linear" slope="0" intercept="1"/></feComponentTransfer>
    <feFlood flood-color="${POPUP_PATCH_TONE}" result="tone"/>
    <feComposite in="opaqueBlur" in2="tone" operator="arithmetic" k1="0" k2="${POPUP_PATCH_MIX}" k3="${1 - POPUP_PATCH_MIX}" k4="0" result="patch"/>
    <feComposite in="patch" in2="mask" operator="in"/>
  </filter>
</svg>`;

// Extra text weight. 0 = Paseo default; 0.3px is about as far as it looks clean.
const TEXT_STROKE = "0.15px";

// Every rule is scoped to this, so the styles only apply while a plugin dark
// theme (this one) is selected. Paseo puts `pluginDark` on <html> for that.
const S = "html.pluginDark.ember-glass";
// Tags set by frostPopups(). Attributes, not classes: React rewrites an
// element's class whenever its style changes (hover, repositioning), dropping ours.
const FROSTED = "data-ember-frosted";
const SCRIM = "data-ember-scrim";
const ROW = "data-ember-row";
const ROW_INSET = 4; // gap between a highlighted popup row and the popup edge (Paseo's menus use 4)
const ROW_RADIUS = 6;
// Popups live in body-level layers outside the app root: #overlay-root holds
// menus, pickers and tooltips; every other layer is a modal (Cmd+P, host, help).
const MODAL_LAYER = "body > div:not(#root):not(#overlay-root)";

const GLASS_CSS = `
/* Main and right panes use the same clear background as the left sidebar. */
${S} {
  --colors-surface-workspace: transparent;
  /* Selected sidebar row: translucent instead of the solid control color. */
  --colors-surface-sidebar-selected: ${SELECTED_ROW};
  /* Paseo uses \`background\` (fully clear here) for text/icons on accent buttons. */
  --colors-accent-foreground: ${ON_ACCENT};
  --colors-primary-foreground: ${ON_ACCENT};
  background-color: ${GLASS_TINT} !important;
}
/* Icons on accent buttons get that color as a resolved value (stroke="#1a161400"), not a variable. */
${S} [stroke="${colors.background}"] { stroke: ${ON_ACCENT} !important; }
${S} :is(button, [role="button"]) [fill="${colors.background}"] { fill: ${ON_ACCENT} !important; }
/* Composer stop button (shown while an agent runs): hollow ring with a hollow
   square inside, instead of Paseo's filled bright-red circle with a white square. */
${S} [role="button"]:is([aria-label="Stop agent"], [aria-label="Canceling agent"], :has(> svg.lucide-square[fill="white"])) {
  background-color: transparent !important;
  box-shadow: inset 0 0 0 1.5px ${STOP_COLOR};
  transform: scale(0.8); /* 20% smaller, layout unchanged */
}
${S} [role="button"] > svg.lucide-square[fill="white"], ${S} [role="button"] > svg.lucide-square[fill="white"] * { stroke: ${STOP_COLOR} !important; fill: none !important; }
/* React Navigation paints an opaque light card behind every screen. */
${S} [style*="background-color: rgb(242, 242, 242)"] { background-color: transparent !important; }
/* Message input box: no extra layer, but keep its border (only elements that already have a border width show it). */
${S} [data-testid="message-input-root"] div:has(textarea) { background-color: transparent !important; border-color: ${EDGE} !important; }
/* User prompt bubble: Paseo paints it with the border color, which is hidden. */
${S} [data-testid="user-message"] > div > div:not([data-testid]):first-child { background-color: ${EDGE} !important; }
/* ---- Popups ----
   Frosted popups. Those in popup layers (menus, tooltips, modals) are found
   and tagged by frostPopups() below. Ones that render inside the app tree are
   listed by hand: the workspace hover card, the context window hover panel,
   the / and @ menu above the message input (its card is two levels down), and
   the diff stat and subagents pills above the input. */
${S} :is(
  [${FROSTED}],
  [data-testid="workspace-hover-card"],
  [data-testid="context-window-details"],
  [data-testid="composer-autocomplete-popover"] > div > div,
  [data-testid="composer-diff-stat-pill"],
  [data-testid="subagents-track-header"]
) {
  background-color: ${POPUP_BG} !important;
  backdrop-filter: ${POPUP_FILTER} !important;
  /* Highlighted items inside use surface2, and selected segments (e.g. Used /
     Remaining) use surface3, which is the hidden border color. Lift both. */
  --colors-surface2: ${HIGHLIGHT};
  --colors-surface3: ${HIGHLIGHT};
}
/* Highlighted rows. Paseo's dropdown menus inset them as rounded HIGHLIGHT pills;
   pickers (model, thinking, mode, host) and Cmd+P paint full-width surface1
   bars instead. frostPopups() tags those full-width rows so they match. */
/* Same EDGE border as the pills. An inset outline: it follows the corner radius,
   sits on top of any border the popup already has (often transparent), and
   never changes the popup's size or position. The pills already have the border. */
${S} :is(
  [${FROSTED}],
  [data-testid="workspace-hover-card"],
  [data-testid="context-window-details"],
  [data-testid="composer-autocomplete-popover"] > div > div
) {
  outline: 1px solid ${EDGE} !important;
  outline-offset: -1px !important;
}
${S} [${ROW}] {
  /* Clip instead of margins: tagging can land after the popup is drawn, and
     margins would then shift the row's content sideways. */
  clip-path: inset(0 ${ROW_INSET}px round ${ROW_RADIUS}px);
  --colors-surface1: ${HIGHLIGHT};
}
${S} :is([data-testid="composer-diff-stat-pill"], [data-testid="subagents-track-header"]):hover { background-color: ${HIGHLIGHT} !important; }
/* Modals dim the whole window with a 50% black layer. The
   frost mask reads it as content and turns the popup solid as it fades in, so
   frostPopups() tags it and it's cleared. */
${S} [${SCRIM}] { background-color: transparent !important; }
/* Modals fade in from opacity 0. While their layer is translucent the browser
   can't sample the window behind it, so the frost only kicks in after the fade
   and the panel visibly changes look. Show them instantly instead. Menus and
   tooltips (#overlay-root) keep theirs: they wait for the fade-out to finish
   before unmounting, so without it old tooltips never go away. */
${S} ${MODAL_LAYER} > div { animation: none !important; }
/* ---- end popups ---- */
/* Buttons (and split-button groups like Merge PR) keep their borders by re-scoping Paseo's border color variables. */
${S} :is(
  [role="button"],
  button,
  div:has(> button[data-testid$="-caret"]),
  div:has(> [data-testid="workspace-scripts-button"])
) { --colors-border: ${EDGE}; --colors-border-accent: ${EDGE}; }
/* Expanded tool calls: thinking (and JSON/diff) details sit in a solid surface2
   box while shell output uses the clear surface1; give them all surface1. */
${S} [data-testid="tool-call-badge"] { --colors-surface2: ${colors.raised}; }
/* Their scroll box is rounded on all sides; square it so it meets the header's
   bottom border. The detail wrapper's own rounded, clipped bottom stays. */
${S} [data-testid="tool-call-badge"] > button + div [style*="max-height"] { border-radius: 0 !important; }
/* The expanded area's side/bottom border uses the hidden border color; match the header's. */
${S} [data-testid="tool-call-badge"] > button + div { border-color: ${EDGE} !important; }
/* Switch (toggle) track when off: Paseo paints it with the clear border color,
   leaving only the white knob. */
${S} [role="switch"][aria-checked="false"] > div > div { background-color: ${EDGE} !important; }
/* Context window meter in the composer: its ring track (first circle) uses the hidden border color. */
${S} [data-testid="context-window-meter"] svg circle:first-of-type { stroke: ${EDGE} !important; }
/* Slightly heavier text: macOS default smoothing (Paseo forces the thinner
   "antialiased") plus a hairline stroke. Keeps the normal/medium/bold hierarchy. */
${S}, ${S} * {
  -webkit-font-smoothing: auto !important;
  -webkit-text-stroke: ${TEXT_STROKE} currentColor;
}
/* Hover fades behind the sidebar "..." and tab close buttons assume opaque
   panels; on glass they show as a dark smudge, so drop them. */
${S} div:has(> svg linearGradient[id^="trailing-action-scrim-"]) { display: none !important; }
/* Tab close (x) button: styled like the sidebar "..." button (clear, control
   color on hover). It sits over the end of the tab title, so while it shows
   (on hover) the title fades out underneath it instead. */
${S} ${TAB_CLOSE} {
  background-color: transparent !important;
  border-radius: 6px !important;
}
${S} ${TAB_CLOSE}:hover { background-color: ${colors.control} !important; }
${S} div:has(> div > ${TAB_CLOSE}):hover > button [dir="auto"] {
  mask-image: linear-gradient(to left, transparent 0 ${TRAILING_FADE[0]}px, #000 ${TRAILING_FADE[1]}px);
}
/* Sidebar workspace row: the hover "..." sits over the diff stat (+N -N).
   Paseo hides it behind a gradient scrim (dropped above), so fade the stat out
   under the button instead. The scrim element only exists while the button shows. */
${S} div:has(> [data-testid="sidebar-workspace-trailing-scrim"]) > div:first-child {
  mask-image: linear-gradient(to left, transparent 0 ${TRAILING_FADE[0]}px, #000 ${TRAILING_FADE[1]}px);
}
/* Hide vertical scrollbars (scrolling still works; horizontal bars stay).
   Paseo's "* { scrollbar-width: thin }" would override ::-webkit-scrollbar, so reset it. */
${S} * { scrollbar-width: auto !important; scrollbar-color: auto !important; }
${S} ::-webkit-scrollbar { width: 0 !important; }
${S} [data-testid="workspace-overlay-scrollbar"],
${S} .xterm .xterm-scrollbar.vertical { display: none !important; }
/* Top bar breathing room: every pane has its own fixed 36px header, so instead
   of padding each one, the whole app starts TOP_GAP lower. The glass behind the
   gap looks the same as the headers. The gap stays a window drag area. */
${S} #root { box-sizing: border-box; padding-top: ${TOP_GAP}px; }
${S} body::before {
  content: ""; position: fixed; top: 0; left: 0; right: 0; height: ${TOP_GAP}px;
  -webkit-app-region: drag;
}
/* Active workspace tab: copper underline instead of a filled background. */
${S} [data-testid^="workspace-tab-"][aria-selected="true"] {
  background-color: transparent !important;
  border-radius: 0 !important;
  box-shadow: 0 2px 0 ${colors.accent}; /* 2px line just below the tab, 2px clear of the label */
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
 * dim backdrops, tagged SCRIM and cleared). That box gets the FROSTED tag.
 * Inside it, buttons spanning the full width are list rows; they get ROW so
 * their highlight is inset like Paseo's dropdown menu items.
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
    if (r.width > 0 && r.height > 0) {
      const cs = win.getComputedStyle(el);
      const fullWindow = r.width >= win.innerWidth - 2 && r.height >= win.innerHeight - 2;
      if (fullWindow) {
        // A modal's dim backdrop (see SCRIM in GLASS_CSS).
        if (cs.backgroundColor !== "rgba(0, 0, 0, 0)") el.setAttribute(SCRIM, "");
      } else if (cs.borderTopLeftRadius !== "0px" || cs.boxShadow !== "none") {
        el.setAttribute(FROSTED, "");
        for (const row of el.querySelectorAll(`[role="button"]:not([${ROW}])`)) {
          // Layout widths: the popup may still be mid scale-in animation.
          if (row.offsetWidth >= el.clientWidth - 2) row.setAttribute(ROW, "");
        }
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
  const watched = new WeakSet<any>(); // weak: closed modal layers must not stay in memory
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
    for (const tag of [FROSTED, SCRIM, ROW]) {
      for (const el of doc.querySelectorAll(`[${tag}]`)) el.removeAttribute(tag);
    }
  };
}

/**
 * Move the macOS window buttons down by TOP_GAP while a plugin dark theme is
 * active, through the same window API Paseo uses (it sets an offset of -4
 * whenever the theme's surface color changes, so re-apply after theme switches).
 */
function liftWindowButtons(): () => void {
  const PASEO_OFFSET = -4;
  // Center the buttons on the 36px header row: Electron places their top at
  // 14 + offset and they're ~13.5px tall, so center = 20.75 + offset; the
  // header center is 18 + TOP_GAP.
  const OUR_OFFSET = Math.round(TOP_GAP - 2.75);
  const chrome = win.paseoDesktop?.window?.getCurrentWindow?.();
  if (typeof chrome?.updateChrome !== "function") return () => {};
  const html = doc.documentElement;
  let applied: number | null = null;
  const set = (offset: number) => {
    if (offset === applied) return;
    applied = offset;
    chrome.updateChrome({ trafficLightOffsetY: offset }).catch(() => {});
  };
  const sync = () => {
    applied = null; // Paseo may have reset it
    set(html.classList.contains("pluginDark") ? OUR_OFFSET : PASEO_OFFSET);
  };
  // Run after Paseo's own update for the same theme change.
  let timer: any;
  const later = () => {
    win.clearTimeout(timer);
    timer = win.setTimeout(sync, 300);
  };
  const observer = new win.MutationObserver(later);
  observer.observe(html, { attributes: true, attributeFilter: ["class"] });
  sync();
  later();
  return () => {
    observer.disconnect();
    win.clearTimeout(timer);
    set(PASEO_OFFSET);
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
  const stopLift = liftWindowButtons();
  return () => {
    stopPopups();
    stopLift();
    style.remove();
    frost.remove();
    doc.documentElement.classList.remove("ember-glass");
  };
}
