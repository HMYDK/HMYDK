#!/usr/bin/env node
/**
 * render.mjs — compile the profile.
 *
 *   data/profile.json  ──►  assets/*.svg  +  README.md
 *
 * Deterministic output: same data in, same bytes out. The only time-dependent
 * value is the build date, which is why the git bot gets a commit per day.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as S from "./svg.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = "https://raw.githubusercontent.com/HMYDK/HMYDK/main/assets";
const data = JSON.parse(readFileSync(resolve(ROOT, "data/profile.json"), "utf8"));
const BUILD = data.updatedAt || new Date().toISOString().slice(0, 10);

const T = S.THEMES;
const fmt = S.nf;

/* ============================================================
 *  card 1 · telemetry  (the only place the aggregates live)
 * ============================================================ */
function telemetry(t) {
  const W = 1000;
  const H = 472;
  const f = S.frame(W, H, t, {
    title: "hmydk@github: ~", subtitle: "", badge: "LIVE", bg: t.panel,
    label: "HMYDK · contribution telemetry",
  });
  const L = 26;
  const R = W - 26;
  const CW = R - L;
  const c = data.calendar;
  const tot = data.totals;
  let out = S.dotGrid(W, H, t, 24);

  /* ---- five numbers, each shown once on the whole page ---- */
  const stats = [
    ["CONTRIBUTIONS / 365D", fmt(c.totalYear), `${(c.totalYear / 365).toFixed(2)}/day`, t.green],
    ["COMMITS", fmt(tot.commits), `since ${tot.joinedYear}`, t.cyan],
    ["ACTIVE DAYS", fmt(c.activeDays), `${((c.activeDays / 365) * 100).toFixed(1)}% of year`, t.blue],
    ["LONGEST STREAK", `${c.longestStreak}d`, `current ${c.currentStreak}d`, t.amber],
    ["BEST DAY", fmt(c.maxDay.count), c.maxDay.date.slice(5), t.purple],
  ];
  const cellW = CW / stats.length;
  stats.forEach(([label, value, sub, color], i) => {
    const x = L + i * cellW;
    if (i) out += S.line(x - 14, 58, x - 14, 132, { stroke: t.borderSoft, sw: 1 });
    out += S.text(x, 74, label, { size: 10, fill: t.muted, spacing: 0.8 });
    out += S.text(x, 110, value, { size: 28, fill: color, weight: 600 });
    out += S.text(x, 130, sub, { size: 11, fill: t.dim });
  });
  out += S.line(L, 146, R, 146, { stroke: t.borderSoft, sw: 1 });

  /* ---- contribution calendar, using the full width ---- */
  out += S.spans(L, 168, [["# ", t.dim], ["contribution calendar", t.fgStrong]], { size: 13 });
  const lx = R - 5 * 15 - 3;
  out += S.text(lx - 8, 168, "LESS", { size: 9.5, fill: t.dim, anchor: "end" });
  for (let i = 0; i < 5; i++) out += S.rect(lx + i * 15, 159, 11, 11, { fill: t.level[i], rx: 2 });
  out += S.text(R, 168, "MORE", { size: 9.5, fill: t.dim, anchor: "end" });

  const cell = 12.8;
  const gap = 4.5;
  const step = cell + gap;
  const gx = L + 30;
  const gy = 196;
  const weeks = [];
  for (const d of c.days) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  const maxCount = Math.max(1, c.maxDay.count);
  const lev = (n) => (n === 0 ? 0 : n < maxCount * 0.15 ? 1 : n < maxCount * 0.4 ? 2 : n < maxCount * 0.72 ? 3 : 4);
  const dayLabels = { 1: "Mon", 3: "Wed", 5: "Fri" };
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  let lastMonth = -1;
  weeks.forEach((week, w) => {
    const x = gx + w * step;
    week.forEach((d) => {
      const y = gy + d.weekday * step;
      out += S.rect(x, y, cell, cell, { fill: t.level[lev(d.count)], rx: 2 });
      if (d.date === BUILD) {
        out += S.rect(x - 0.6, y - 0.6, cell + 1.2, cell + 1.2, {
          fill: "none", stroke: t.fg, sw: 0.9, rx: 2.5, dash: "2 1.6",
        });
      }
      if (d.count > 0 && d.count === maxCount) {
        out += S.rect(x - 0.5, y - 0.5, cell + 1, cell + 1, { fill: "none", stroke: t.fg, sw: 0.8, rx: 2.5, opacity: 0.5 });
      }
    });
    const first = week[0];
    if (first) {
      const m = new Date(first.date + "T00:00:00Z").getUTCMonth();
      const dom = new Date(first.date + "T00:00:00Z").getUTCDate();
      if ((w === 0 || m !== lastMonth) && (w === 0 || dom <= 7)) {
        out += S.text(x + 1, gy - 12, monthNames[m], { size: 10, fill: t.dim });
        lastMonth = m;
      }
    }
  });
  Object.entries(dayLabels).forEach(([row, label]) => {
    out += S.text(gx - 7, gy + Number(row) * step + cell - 1, label, { size: 10, fill: t.dim, anchor: "end" });
  });
  out += S.line(L, 326, R, 326, { stroke: t.borderSoft, sw: 1 });

  /* ---- contributions per year ---- */
  const baseY = 326;
  out += S.spans(L, baseY + 22, [["# ", t.dim], ["contributions / year", t.fgStrong]], { size: 12.5 });
  const chartY = baseY + 36;
  const chartH = 78;
  const n = data.yearly.length;
  const gapX = 7;
  const barW = (CW * 0.62 - gapX * (n - 1)) / n;
  const maxY = Math.max(1, ...data.yearly.map((y) => y.contributions));
  data.yearly.forEach((y, i) => {
    const h = Math.max(2, (y.contributions / maxY) * chartH);
    const x = L + i * (barW + gapX);
    const isNow = y.year === Number(BUILD.slice(0, 4));
    out += S.text(x + barW / 2, chartY + chartH - h - 6, fmt(y.contributions), {
      size: 9, fill: isNow ? t.green : t.dim, anchor: "middle",
    });
    out += S.rect(x, chartY + chartH - h, barW, h, {
      fill: isNow ? t.green : t.blue,
      opacity: isNow ? 0.95 : y.contributions < 60 ? 0.28 : 0.45,
      rx: 1.5,
    });
    out += S.text(x + barW / 2, chartY + chartH + 15, String(y.year), {
      size: 10, fill: isNow ? t.fg : t.dim, anchor: "middle",
    });
  });

  /* ---- weekday fingerprint ---- */
  const wx = L + CW * 0.66;
  const ww = R - wx;
  out += S.spans(wx, baseY + 22, [["# ", t.dim], ["weekday", t.fgStrong]], { size: 12.5 });
  out += S.text(R, baseY + 22, "when contributions happen", { size: 9.5, fill: t.dim, anchor: "end" });
  const maxW = Math.max(1, ...data.weekday.map((d) => d.count));
  data.weekday.forEach((d, i) => {
    const y = chartY + i * 14;
    const peak = d.count === maxW;
    out += S.text(wx, y + 9, d.day, { size: 10, fill: peak ? t.fg : t.muted });
    out += S.bar(wx + 30, y + 2, ww - 66, 8, d.count / maxW, peak ? t.green : t.cyan, t);
    out += S.text(R, y + 9, String(d.count), { size: 9.5, fill: peak ? t.fg : t.dim, anchor: "end" });
  });

  return f.open + out + f.close;
}

/* ============================================================
 *  card 2 · languages  (cloc --by-language)
 * ============================================================ */
function languages(t) {
  const W = 1000;
  const H = 348;
  const f = S.frame(W, H, t, {
    title: "hmydk@github: ~", subtitle: "", badge: "CLOC", bg: t.panel,
    label: "HMYDK · language fingerprint",
  });
  const L = 26;
  const R = W - 26;
  const CW = R - L;
  const langs = data.languages.slice(0, 8);
  let out = S.dotGrid(W, H, t, 24);

  out += S.text(L, 64, "LANGUAGE FINGERPRINT", { size: 10, fill: t.muted, spacing: 1.2 });
  out += S.text(R, 64, `${S.bytes(data.languageTotalBytes)} across ${data.totals.publicRepos} non-fork repos`, {
    size: 11, fill: t.dim, anchor: "end",
  });

  /* segmented composition bar */
  const barY = 80;
  const barH = 18;
  out += `<defs><clipPath id="lbar"><rect x="${L}" y="${barY}" width="${CW}" height="${barH}" rx="5"/></clipPath></defs>`;
  out += S.rect(L, barY, CW, barH, { fill: t.id === "light" ? "#E4E9EE" : "#161D26", rx: 5 });
  let cx = L;
  out += `<g clip-path="url(#lbar)">`;
  for (const l of langs) {
    const w = Math.max(2, (l.percent / 100) * CW);
    out += S.rect(cx, barY, w, barH, { fill: l.color });
    cx += w;
  }
  out += `</g>`;

  /* rows */
  const rowY = 128;
  const rowH = 24;
  const nameW = 110;
  const barX = L + nameW;
  const barW = CW * 0.62;
  const pctX = barX + barW + 90;
  langs.forEach((l, i) => {
    const y = rowY + i * rowH;
    out += S.rect(L, y - 11, 5, 11, { fill: l.color, rx: 1.5 });
    out += S.text(L + 13, y, l.name, { size: 12.5, fill: t.fgStrong });
    out += S.bar(barX, y - 8, barW, 8, l.percent / Math.max(1, langs[0].percent), l.color, t);
    out += S.text(pctX, y, `${l.percent.toFixed(1)}%`, { size: 11, fill: t.muted, anchor: "end" });
    out += S.text(R, y, S.bytes(l.bytes), { size: 11, fill: t.dim, anchor: "end" });
  });

  out += S.line(L, 308, R, 308, { stroke: t.borderSoft, sw: 1 });
  out += S.spans(L, 326, [["// ", t.dim], ["bytes, not vibes — HTML is just landing pages and generated docs", t.muted]], { size: 10 });
  return f.open + out + f.close;
}

/* ============================================================
 *  card 3 · hero (terminal boot banner)
 * ============================================================ */

/* 5x7 pixel font — because box-drawing characters get font-fallback'd
 * into unrecognizable garbage inside <img>-embedded SVG. rects never lie. */
const PIXEL_FONT = {
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
};

function pixelWord(word, x, y, cell, t, opts = {}) {
  const { gap = Math.round(cell * 1.15), fill = t.green } = opts;
  let out = "";
  let cx = x;
  for (const ch of word) {
    const glyph = PIXEL_FONT[ch] || [];
    glyph.forEach((row, ry) => {
      [...row].forEach((bit, rx) => {
        if (bit === "1") {
          out += S.rect(cx + rx * cell, y + ry * cell, cell - 1.2, cell - 1.2, {
            fill,
            rx: Math.max(0.6, cell * 0.08),
          });
        }
      });
    });
    cx += 5 * cell + gap;
  }
  return { svg: out, width: cx - gap - x };
}

function hero(t) {
  const W = 1000;
  const H = 252;
  const f = S.frame(W, H, t, {
    title: "hmydk@github: ~ — -zsh — 100x36", subtitle: "", badge: "TTY1", bg: t.panel,
    label: "HMYDK · terminal",
  });
  const L = 28;
  const R = W - 30;
  let out = S.dotGrid(W, H, t, 24);
  const tot = data.totals;
  const joined = new Date(data.createdAt);
  const loginDate = `${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][joined.getUTCDay()]} ` +
    `${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][joined.getUTCMonth()]} ` +
    `${joined.getUTCDate()} ${joined.getUTCFullYear()}`;

  let y = 72;
  out += S.text(R, y, `Last login: ${loginDate} on ttys001`, { size: 11, fill: t.dim, anchor: "end" });
  out += S.spans(L, y, [["hmydk@github", t.cyan], [":", t.dim], ["~", t.blue], ["$ ", t.green], ["whoami", t.fgStrong]], { size: 14.5 });
  y += 26;
  out += S.spans(L, y, [
    ["HMYDK", t.fgStrong],
    ["  //  ", t.dim],
    ["software engineer", t.fg],
    [" · ", t.dim],
    ["toolmaker", t.fg],
    [" · ", t.dim],
    ["agent wrangler", t.fg],
  ], { size: 14.5 });
  y += 26;
  out += S.spans(L, y, [["hmydk@github", t.cyan], [":", t.dim], ["~", t.blue], ["$ ", t.green], ["fastfetch", t.fgStrong]], { size: 14.5 });
  y += 26;

  const rows = [
    ["OS", "macOS · linux (server-side)"],
    ["Host", "Hangzhou, CN · GMT+8"],
    ["Shell", "zsh + way too many aliases"],
    ["Uptime", `${tot.tenureYears} years on GitHub`],
  ];
  rows.forEach(([k, v], i) => {
    out += S.text(L + 6, y + i * 22, k, { size: 12.5, fill: t.muted });
    out += S.text(L + 82, y + i * 22, "·", { size: 12.5, fill: t.dim });
    out += S.text(L + 100, y + i * 22, v, { size: 12.5, fill: t.fg });
  });

  /* pixel wordmark */
  const cell = 13;
  const word = pixelWord("HMYDK", 0, 0, cell, t, { gap: 16 });
  const artX = R - word.width;
  const artY = 94;
  if (t.id === "dark") {
    out += `<defs><filter id="neon" x="-30%" y="-30%" width="160%" height="160%">` +
      `<feGaussianBlur stdDeviation="2.6"/></filter></defs>`;
    out += `<g opacity="0.4" filter="url(#neon)" transform="translate(${artX},${artY})">${word.svg}</g>`;
  }
  out += pixelWord("HMYDK", artX, artY, cell, t, { gap: 15 }).svg;
  out += S.cursor(artX + word.width + 6, artY + 7 * cell - 2, cell * 1.35, t.green, cell - 1, cell * 1.1);
  out += S.text(artX + 2, artY + 7 * cell + 27, "// build tools. break assumptions. repeat.", { size: 11.5, fill: t.dim });
  return f.open + out + f.close;
}

/* ============================================================
 *  README
 * ============================================================ */
const CURATED = [
  ["AIGitCommit", "JetBrains plugin that writes your commit messages from the diff. The one people actually use."],
  ["ai-native-sdlc-dsh", "AI-native SDLC as a DeepSeek Harness plugin: task state machine, artifact chain, independent verification"],
  ["mcp-manager", "SwiftUI control panel for MCP servers"],
  ["AICodeToolSet", "A toolbox of AI code utilities for JetBrains IDEs"],
  ["switch-your-fucking-language-version", "Native SwiftUI app to switch Java / Node / Python / Go versions on macOS"],
  ["code-on-phone", "Coding from a phone, because laptops are heavy"],
];

function projectTable() {
  const byName = new Map(data.topRepos.map((r) => [r.name, r]));
  const rows = CURATED.map(([name, desc]) => {
    const r = byName.get(name);
    if (!r) return null;
    const meta = `${r.language} · pushed ${r.pushedAt.slice(0, 7)}`;
    const proof = r.stars ? `**${r.stars}★** · ${r.forks} forks — ` : "";
    return `| [\`${name}\`](${r.url}) <br> <sub>${meta}</sub> | ${proof}${desc} |`;
  }).filter(Boolean);
  if (!rows.length) return "_no public repos yet_";
  return ["| repo | what it is |", "|:--|:--|", ...rows].join("\n");
}

function timeline() {
  const seen = new Set();
  const evs = [...data.events]
    .filter((e) => {
      const k = e.message + e.link;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 6);
  if (!evs.length) return "```console\n$ no recent public activity\n```";
  const rows = evs.map((e) => {
    const at = e.at.slice(0, 16).replace("T", " ");
    return `${at}  <a href="${e.link}">${S.esc(e.message)}</a>`;
  });
  return "<pre>\n# recent public activity · UTC\n" + rows.join("\n") + "\n</pre>";
}

function readme(V) {

  const pic = (name, alt) =>
    `<a href="${RAW}/${name}-light.svg?v=${V}" title="open the full-size card">\n` +
    `<picture>\n  <source media="(prefers-color-scheme: dark)" srcset="${RAW}/${name}-dark.svg?v=${V}">\n` +
    `  <source media="(prefers-color-scheme: light)" srcset="${RAW}/${name}-light.svg?v=${V}">\n` +
    `  <img src="${RAW}/${name}-light.svg?v=${V}" alt="${alt}" width="100%">\n</picture>\n</a>`;

  return `<!--
  this README is a compiled artifact — edit scripts/render.mjs, not this file.
  data: data/profile.json · build: .github/workflows/profile.yml (daily)
-->

<p align="center">
${pic("hero", "HMYDK — terminal boot banner")}
</p>

### \`$ cat ~/.now\`

> Currently building agent infrastructure on [DeepSeek Harness](https://github.com/HMYDK/ai-native-sdlc-dsh) —
> making the agent-native software loop boring and verifiable.
> Previously: JetBrains plugins, macOS tooling, backend platforms.
> Optimizing for: ship small, own the stack, read the source.

### \`$ ls ~/projects\`

<!-- AUTOGEN:projects -->
${projectTable()}
<!-- /AUTOGEN:projects -->

### \`$ fastfetch --live\`

<p align="center">
${pic("telemetry", "HMYDK contribution telemetry")}
</p>

### \`$ cloc .\`

<p align="center">
${pic("languages", "HMYDK language fingerprint")}
</p>

### \`$ tail -f ~/.git/activity.log\`

<!-- AUTOGEN:timeline -->
${timeline()}
<!-- /AUTOGEN:timeline -->

<details>
<summary><code>$ cat .github/workflows/profile.yml</code> — how this page is built</summary>

Every stat above comes from GitHub's GraphQL API and public Atom feed, is archived in
[\`data/profile.json\`](https://github.com/HMYDK/HMYDK/blob/main/data/profile.json), and is compiled
into hand-written SVG by [\`scripts/render.mjs\`](https://github.com/HMYDK/HMYDK/blob/main/scripts/render.mjs).
No third-party stat cards, no trackers — rebuilt daily by GitHub Actions.

</details>

---

<p align="center">
  <sub>
    compiled ${BUILD} ·
    <a href="https://github.com/HMYDK/HMYDK">source</a> ·
    open an issue on any repo if you want to talk
  </sub>
</p>
`;
}

/* ============================================================
 *  build
 * ============================================================ */
mkdirSync(resolve(ROOT, "assets"), { recursive: true });
const assets = {
  "hero-dark.svg": hero(T.dark),
  "hero-light.svg": hero(T.light),
  "telemetry-dark.svg": telemetry(T.dark),
  "telemetry-light.svg": telemetry(T.light),
  "languages-dark.svg": languages(T.dark),
  "languages-light.svg": languages(T.light),
};
for (const [name, svg] of Object.entries(assets)) {
  writeFileSync(resolve(ROOT, "assets", name), svg + "\n");
}
/* content-addressed cache-buster: new bytes, new URL; no bytes, no churn */
const V = createHash("sha256")
  .update(Object.entries(assets).map(([k, v]) => k + v).join("\n"))
  .digest("hex")
  .slice(0, 10);
writeFileSync(resolve(ROOT, "README.md"), readme(V));
console.log(`[render] assets: ${Object.keys(assets).length} svg · README.md · build ${BUILD} · v=${V}`);
