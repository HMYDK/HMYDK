/**
 * svg.mjs — hand-rolled SVG helpers. No deps, no build step, no excuses.
 * Everything is a string. Monospace everywhere, because proportional fonts
 * in terminals are a crime.
 */

export const THEMES = {
  dark: {
    id: "dark",
    bg: "#0B0E14",
    panel: "#0F141B",
    panel2: "#131A22",
    inset: "#0A0E15",
    border: "#222B36",
    borderSoft: "#1A222C",
    fg: "#D5DDE8",
    fgStrong: "#F0F4F8",
    muted: "#7C8899",
    dim: "#6E7A88",
    green: "#56D364",
    greenDeep: "#1B4721",
    cyan: "#39C5CF",
    blue: "#58A6FF",
    amber: "#E3B341",
    orange: "#F0883E",
    red: "#F85149",
    purple: "#BC8CFF",
    pink: "#F778BA",
    grid: "#1A222C",
    level: ["#151C25", "#0E4429", "#006D32", "#26A641", "#39D353"],
    shadow: "#000000",
  },
  light: {
    id: "light",
    bg: "#FFFFFF",
    panel: "#F6F8FA",
    panel2: "#EDF1F5",
    inset: "#FFFFFF",
    border: "#D0D7DE",
    borderSoft: "#E1E6EB",
    fg: "#1F2328",
    fgStrong: "#0B0F14",
    muted: "#59636E",
    dim: "#6E7781",
    green: "#1A7F37",
    greenDeep: "#B9E6C6",
    cyan: "#0E7490",
    blue: "#0969DA",
    amber: "#9A6700",
    orange: "#BC4C00",
    red: "#CF222E",
    purple: "#8250DF",
    pink: "#BF3989",
    grid: "#E7EBEF",
    level: ["#EBEDF0", "#9BE9A8", "#40C463", "#30A14E", "#216E39"],
    shadow: "#D0D7DE",
  },
};

export const FONT =
  "ui-monospace, 'SFMono-Regular', 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

/* ---------- tiny primitives ---------- */

export const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

/** monospace advance width, good enough for layout without measuring */
export const mw = (size, text = "M") => text.length * size * 0.6018;

export const nf = (n) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : String(n);

export function text(x, y, str, o = {}) {
  const {
    size = 13,
    fill = THEMES.dark.fg,
    weight = 400,
    anchor = "start",
    opacity = 1,
    spacing = 0,
    family = FONT,
    style,
  } = o;
  const ls = spacing ? ` letter-spacing="${spacing}"` : "";
  const st = style ? ` ${style}` : "";
  return (
    `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" fill="${fill}"` +
    ` font-weight="${weight}" text-anchor="${anchor}"${ls}${opacity !== 1 ? ` opacity="${opacity}"` : ""}${st}>` +
    `${esc(str)}</text>`
  );
}

/** text made of spans so individual chars can be tinted; parts = [[str, color], ...] */
export function spans(x, y, parts, o = {}) {
  const { size = 13, anchor = "start", weight = 400 } = o;
  const inner = parts
    .map(([s, fill]) => `<tspan fill="${fill}">${esc(s)}</tspan>`)
    .join("");
  return `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}">${inner}</text>`;
}

export function rect(x, y, w, h, o = {}) {
  const { fill = "none", stroke = "none", sw = 1, rx = 0, opacity = 1, dash } = o;
  return (
    `<rect x="${x}" y="${y}" width="${Math.max(0, w)}" height="${Math.max(0, h)}" rx="${rx}"` +
    ` fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}` +
    `${dash ? ` stroke-dasharray="${dash}"` : ""}${opacity !== 1 ? ` opacity="${opacity}"` : ""}/>`
  );
}

export function line(x1, y1, x2, y2, o = {}) {
  const { stroke = "#333", sw = 1, dash, opacity = 1 } = o;
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${sw}"${opacity !== 1 ? ` opacity="${opacity}"` : ""}${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
}

export function circle(cx, cy, r, o = {}) {
  const { fill = "none", stroke = "none", sw = 1, opacity = 1 } = o;
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}${opacity !== 1 ? ` opacity="${opacity}"` : ""}/>`;
}

export function path(d, o = {}) {
  const { fill = "none", stroke = "none", sw = 1, opacity = 1, cap = "round", join = "round" } = o;
  return `<path d="${d}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}" stroke-linecap="${cap}" stroke-linejoin="${join}"` : ""}${opacity !== 1 ? ` opacity="${opacity}"` : ""}/>`;
}

/** blinking block cursor — CSS class so prefers-reduced-motion can turn it off */
export function cursor(x, y, size, color, w = null, h = null) {
  const cw = w ?? size * 0.62;
  const ch = h ?? size * 1.08;
  return (
    `<rect class="hm-cursor" x="${x}" y="${y - ch + size * 0.22}" width="${cw}" height="${ch}" fill="${color}"/>`
  );
}

/* ---------- the terminal chrome ---------- */

/**
 * Frame with traffic lights + a title. Returns { open, close } so callers can
 * pour content in the middle. `w`,`h` are the outer size.
 */
export function frame(w, h, t, o = {}) {
  const { title = "", subtitle = "", badge = "", bg = t.panel, pad = 0 } = o;
  const head = 38;
  const lights = [
    ["#FF5F56", "#E0443E"],
    ["#FFBD2E", "#DEA123"],
    ["#27C93F", "#1AAB29"],
  ]
    .map(
      ([c], i) =>
        `<circle cx="${24 + i * 19}" cy="${head / 2}" r="5.5" fill="${c}" opacity="${t.id === "light" ? 0.9 : 0.85}"/>`
    )
    .join("");

  const titleText = title
    ? spans(w / 2, head / 2 + 4.5, [[title, t.muted]], { size: 12.5, anchor: "middle" })
    : "";
  const sub = subtitle
    ? spans(24, head / 2 + 4.5, [["› ", t.dim], [subtitle, t.muted]], { size: 12 })
    : "";
  const badgeText = badge
    ? `<g>` +
      `<circle class="hm-pulse" cx="${w - 24 - mw(11.5, badge) - 14}" cy="${head / 2}" r="3.2" fill="${t.green}"/>` +
      `${spans(w - 24 - mw(11.5, badge) + 1, head / 2 + 4, [[badge, t.muted]], { size: 11.5 })}</g>`
    : "";

  const label = o.label || title || "HMYDK profile card";
  return {
    open:
      `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">` +
      `<title>${esc(label)}</title>` +
      `<defs>` +
      `<filter id="soft" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-color="${t.shadow}" flood-opacity="${t.id === "light" ? 0.10 : 0.55}"/></filter>` +
      `</defs>` +
      `<style>` +
      `@keyframes hm-blink{0%,49%{opacity:1}50%,100%{opacity:.04}}` +
      `@keyframes hm-pulse{0%,100%{opacity:1}50%{opacity:.2}}` +
      `.hm-cursor{animation:hm-blink 1.2s steps(1,end) infinite}` +
      `.hm-pulse{animation:hm-pulse 2.4s ease-in-out infinite}` +
      `@media (prefers-reduced-motion: reduce){.hm-cursor,.hm-pulse{animation:none}}` +
      `</style>` +
      `<g filter="url(#soft)">${rect(1, 1, w - 2, h - 2, { fill: bg, stroke: t.border, sw: 1, rx: 10 })}</g>` +
      rect(1.5, 1.5, w - 3, head, { fill: t.panel2, rx: 10 }) +
      rect(1.5, head - 10, w - 3, 10, { fill: t.panel2 }) +
      line(1.5, head + 1.5, w - 1.5, head + 1.5, { stroke: t.border, sw: 1 }) +
      lights +
      titleText +
      sub +
      badgeText,
    inner: "",
    close: `</svg>`,
    head,
    pad,
  };
}

/** dim dotted grid, barely there — CRT ghost / blueprint paper depending on theme */
export function dotGrid(w, h, t, step = 24, opacity = 1) {
  const r = t.id === "light" ? 0.9 : 1;
  const color = t.id === "light" ? "#C9D1D9" : "#1B2430";
  return (
    `<defs><pattern id="dotgrid" width="${step}" height="${step}" patternUnits="userSpaceOnUse">` +
    `<circle cx="${step}" cy="${step}" r="${r}" fill="${color}"/></pattern></defs>` +
    `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#dotgrid)" opacity="${t.id === "light" ? 0.5 : 0.55}"/>`
  );
}

/** horizontal progress bar with rounded ends */
export function bar(x, y, w, h, pct, color, t, o = {}) {
  const { track = t.id === "light" ? "#E4E9EE" : "#161D26" } = o;
  const filled = Math.max(h, w * Math.max(0.008, Math.min(1, pct)));
  return (
    rect(x, y, w, h, { fill: track, rx: h / 2 }) +
    rect(x, y, filled, h, { fill: color, rx: h / 2 })
  );
}

/** ASCII-ish sparkline: returns path of vertical bars */
export function sparkbars(x, y, w, h, values, color, t, gap = 2) {
  const n = values.length;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(1, ...values);
  let out = "";
  for (let i = 0; i < n; i++) {
    const bh = Math.max(1.5, (values[i] / max) * h);
    out += rect(x + i * (bw + gap), y + h - bh, bw, bh, {
      fill: color,
      rx: Math.min(2, bw / 2),
      opacity: values[i] === 0 ? 0.28 : 0.95,
    });
  }
  return out;
}

/** frame every rendered card with a consistent outer padding */
export function svgWrap(open, close, title, w, h, t, content) {
  return open + dotGrid(w, h, t, 24) + content + close;
}

/* ---------- number formatting ---------- */

export function compact(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 1e4 ? 1 : 0).replace(/\.0$/, "") + "k";
  return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
}

export function bytes(n) {
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v >= 100 ? 0 : 1)}${u[i]}`;
}

export function clamp(v, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

/** stable pseudo-random for deterministic decorative noise */
export function rnd(seed) {
  let x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x));
}
