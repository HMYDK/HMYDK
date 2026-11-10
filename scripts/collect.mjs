#!/usr/bin/env node
/**
 * collect.mjs — pull the one true copy of HMYDK's public GitHub telemetry.
 *
 * No npm deps. Auth: $GITHUB_TOKEN, else the local `gh` CLI token.
 * Output: data/profile.json (committed — this file IS the archive).
 * The previous snapshot is read first so a flaky upstream can never nuke it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LOGIN = process.env.PROFILE_LOGIN || "HMYDK";
const TOKEN =
  process.env.GITHUB_TOKEN ||
  process.env.GH_TOKEN ||
  execFileSync("gh", ["auth", "token"]).toString().trim();

const NOW = new Date();
const JOIN_YEAR = 2017;
const ATOM_ATTEMPTS = 3;

function readPrevious() {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, "data/profile.json"), "utf8"));
  } catch {
    return null;
  }
}
const previous = readPrevious();

async function gql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "hymdk-profile-gen",
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`GraphQL ${res.status}: ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

/* ---------- repositories: paginated, because caps are for quitters ---------- */
const REPO_QUERY = `
query($login: String!, $after: String) {
  user(login: $login) {
    repositories(
      first: 100
      after: $after
      ownerAffiliations: OWNER
      privacy: PUBLIC
      orderBy: { field: PUSHED_AT, direction: DESC }
    ) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        name description url homepageUrl
        stargazerCount forkCount isFork isArchived
        pushedAt createdAt
        primaryLanguage { name color }
        repositoryTopics(first: 12) { nodes { topic { name } } }
        languages(first: 12, orderBy: { field: SIZE, direction: DESC }) {
          totalSize
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function collectRepos() {
  const nodes = [];
  let after = null;
  for (let page = 0; page < 5; page++) {
    const data = await gql(REPO_QUERY, { login: LOGIN, after });
    const repos = data.user.repositories;
    nodes.push(...repos.nodes);
    if (!repos.pageInfo.hasNextPage) {
      if (repos.totalCount > nodes.length) {
        console.warn(`[collect] WARN ${repos.totalCount} repos but only ${nodes.length} fetched`);
      }
      break;
    }
    after = repos.pageInfo.endCursor;
  }
  return nodes;
}

/* one request, ten whole years of contributions — alias abuse, the good kind */
const years = [];
for (let y = JOIN_YEAR; y <= NOW.getUTCFullYear(); y++) years.push(y);
const yearFields = years
  .map((y) => {
    const to = y === NOW.getUTCFullYear() ? NOW.toISOString() : `${y + 1}-01-01T00:00:00Z`;
    return `
  y${y}: contributionsCollection(from: "${y}-01-01T00:00:00Z", to: "${to}") {
    contributionCalendar { totalContributions }
    totalCommitContributions
    totalPullRequestContributions
    totalIssueContributions
    totalPullRequestReviewContributions
  }`;
  })
  .join("\n");

const PROFILE_QUERY = `
query($login: String!) {
  user(login: $login) {
    login name bio location company createdAt avatarUrl(size: 240) url websiteUrl
    followers { totalCount }
    following { totalCount }
    contributionsCollection {
      restrictedContributionsCount
      contributionCalendar {
        totalContributions
        weeks { contributionDays { contributionCount date weekday } }
      }
    }
    ${yearFields}
  }
}`;

const [profile, repoNodes] = await Promise.all([
  gql(PROFILE_QUERY, { login: LOGIN }),
  collectRepos(),
]);
const u = profile.user;
const repos = repoNodes.filter((r) => !r.isFork);
const forks = repoNodes.filter((r) => r.isFork);

/* ---------- tiny math helpers ---------- */
const sum = (a) => a.reduce((x, y) => x + y, 0);

/* ---------- language bytes across owned, non-fork public repos ---------- */
const langMap = new Map();
for (const r of repos) {
  for (const e of r.languages?.edges || []) {
    const k = e.node.name;
    const prev = langMap.get(k) || { name: k, color: e.node.color, bytes: 0 };
    prev.bytes += e.size;
    langMap.set(k, prev);
  }
}
const LANG_COLORS = {
  Java: "#b07219",
  TypeScript: "#3178c6",
  JavaScript: "#f1e05a",
  Python: "#3572A5",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  HTML: "#e34c26",
  CSS: "#563d7c",
  Shell: "#89e051",
  Elixir: "#6e4a7e",
  Rust: "#dea584",
  Go: "#00ADD8",
  Ruby: "#701516",
  "C++": "#f34b7d",
  C: "#555555",
  Dockerfile: "#384d54",
  "Jupyter Notebook": "#DA5B0B",
  Vue: "#41b883",
  SCSS: "#c6538c",
  Makefile: "#427819",
  Batchfile: "#C1F12E",
  HCL: "#844FBA",
};
const langTotal = sum([...langMap.values()].map((l) => l.bytes));
const languages = [...langMap.values()]
  .map((l) => ({
    ...l,
    color: l.color || LANG_COLORS[l.name] || "#8b949e",
    percent: langTotal ? (l.bytes / langTotal) * 100 : 0,
  }))
  .sort((a, b) => b.bytes - a.bytes);

/* ---------- focus topics across repos ---------- */
const topicMap = new Map();
for (const r of repos) {
  for (const t of r.repositoryTopics?.nodes || []) {
    topicMap.set(t.topic.name, (topicMap.get(t.topic.name) || 0) + 1);
  }
}

/* ---------- contributions: heatmap, streaks, years ---------- */
const cal = u.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) =>
  w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, weekday: d.weekday }))
);
const totalYear = sum(days.map((d) => d.count));
const maxDay = days.reduce((a, d) => (d.count > a.count ? d : a), { count: 0, date: "" });

/* current streak: today may be empty, yesterday may not */
let currentStreak = 0;
let cursorDay = days.length - 1;
if (days[cursorDay]?.count === 0) cursorDay--;
while (cursorDay >= 0 && days[cursorDay].count > 0) {
  currentStreak++;
  cursorDay--;
}
let longest = 0;
let run = 0;
for (const d of days) {
  if (d.count > 0) { run++; longest = Math.max(longest, run); }
  else run = 0;
}

const monthly = Array.from({ length: 12 }, () => 0);
for (const d of days) monthly[new Date(d.date + "T00:00:00Z").getUTCMonth()] += d.count;

const yearly = years.map((y) => ({
  year: y,
  contributions: u[`y${y}`].contributionCalendar.totalContributions,
  commits: u[`y${y}`].totalCommitContributions,
  prs: u[`y${y}`].totalPullRequestContributions,
  issues: u[`y${y}`].totalIssueContributions,
  reviews: u[`y${y}`].totalPullRequestReviewContributions,
}));

const weekday = Array.from({ length: 7 }, () => 0);
for (const d of days) weekday[d.weekday] += d.count;

/* ---------- biggest hits ---------- */
const describe = (r) => ({
  name: r.name,
  description: r.description || "",
  url: r.url,
  homepage: r.homepageUrl || "",
  stars: r.stargazerCount,
  forks: r.forkCount,
  language: r.primaryLanguage?.name || "",
  languageColor: r.primaryLanguage?.color || LANG_COLORS[r.primaryLanguage?.name] || "#8b949e",
  pushedAt: r.pushedAt,
  topics: (r.repositoryTopics?.nodes || []).map((t) => t.topic.name),
});

const topRepos = repos
  .filter((r) => !r.isArchived)
  .map(describe)
  .sort((a, b) => b.stars - a.stars || new Date(b.pushedAt) - new Date(a.pushedAt))
  .slice(0, 8);

/* ---------- recent public timeline (best effort, archive-friendly) ----------
 * the REST events API drops push commit messages, but the public Atom feed
 * still carries one human-readable line per action.
 * A flaky feed must never erase the last good timeline: on failure we keep the
 * previous snapshot's events, and we drop links GitHub itself cannot resolve
 * (null-SHA compare URLs from branch create/delete events). */
const BAD_KINDS = new Set(["created", "deleted", "removed"]);
const isUsable = (e) =>
  e &&
  typeof e.message === "string" &&
  e.message.length > 0 &&
  /^https:\/\/github\.com\//.test(e.link || "") &&
  !/\/compare\/0{10}/.test(e.link || "") &&
  !BAD_KINDS.has(e.kind);

function parseAtom(xml) {
  const decode = (s) =>
    s
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
      .replace(/&amp;/g, "&")
      .replace(/<[^>]+>/g, "")
      .trim();
  const events = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const title = decode((e.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1] || "");
    const link = (e.match(/<link[^>]*href="([^"]+)"/) || [])[1] || "";
    const rawAt = (e.match(/<updated>([^<]+)<\/updated>/) || [])[1] || "";
    const at = rawAt && !Number.isNaN(Date.parse(rawAt)) ? new Date(rawAt).toISOString() : "";
    if (!title || !at) continue;
    const message = title.replace(new RegExp(`^${LOGIN}\\s+`), "");
    const kind = message.split(" ")[0].replace(/[^a-z]/gi, "").toLowerCase();
    events.push({ kind, message, link, at });
    if (events.length >= 24) break;
  }
  return events;
}

let feedEvents = [];
let feedOk = false;
for (let attempt = 0; attempt < ATOM_ATTEMPTS && !feedOk; attempt++) {
  try {
    const res = await fetch(`https://github.com/${LOGIN}.atom`, {
      headers: { "User-Agent": "hymdk-profile-gen" },
    });
    if (!res.ok) throw new Error(`atom ${res.status}`);
    feedEvents = parseAtom(await res.text()).filter(isUsable);
    feedOk = true;
  } catch (err) {
    if (attempt < ATOM_ATTEMPTS - 1) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}
const prevEvents = (previous?.events || []).filter(isUsable);
let events = feedOk && feedEvents.length ? feedEvents : prevEvents;
if (!feedOk || !feedEvents.length) {
  console.warn(`[collect] WARN atom feed unavailable — keeping ${prevEvents.length} archived events`);
}

/* ---------- assemble the single source of truth ---------- */
const joined = new Date(u.createdAt);
const tenureYears = (NOW - joined) / (365.2425 * 24 * 3600 * 1000);
const totals = {
  stars: sum(repos.map((r) => r.stargazerCount)),
  forks: sum(repos.map((r) => r.forkCount)),
  publicRepos: repos.length,
  publicForks: forks.length,
  followers: u.followers.totalCount,
  following: u.following.totalCount,
  commits: sum(yearly.map((y) => y.commits)),
  contributions: sum(yearly.map((y) => y.contributions)),
  joinedYear: joined.getUTCFullYear(),
  tenureYears: Number(tenureYears.toFixed(2)),
  topRepoStars: Math.max(0, ...repos.map((r) => r.stargazerCount)),
  topRepo: [...repos].sort((a, b) => b.stargazerCount - a.stargazerCount)[0]?.name || "",
};

const payload = {
  schema: 1,
  login: u.login,
  name: u.name || u.login,
  bio: u.bio || "",
  location: u.location || "",
  company: u.company || "",
  website: u.websiteUrl || u.url,
  avatar: u.avatarUrl,
  createdAt: u.createdAt,
  updatedAt: NOW.toISOString().slice(0, 10),
  totals,
  calendar: {
    totalYear,
    maxDay,
    currentStreak,
    longestStreak: longest,
    activeDays: days.filter((d) => d.count > 0).length,
    days,
  },
  monthly: ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map(
    (m, i) => ({ month: m, count: monthly[i] })
  ),
  weekday: ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => ({ day: d, count: weekday[i] })),
  yearly,
  languages: languages.slice(0, 12),
  languageTotalBytes: langTotal,
  topics: [...topicMap.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 14),
  topRepos,
  events,
};

mkdirSync(resolve(ROOT, "data"), { recursive: true });
writeFileSync(resolve(ROOT, "data/profile.json"), JSON.stringify(payload, null, 2) + "\n");
console.log(
  `[collect] ${payload.login}: ${totals.publicRepos} repos · ${totals.stars}★ · ` +
  `${totalYear} contributions/yr · streak ${currentStreak} · longest ${longest} · ` +
  `${events.length} events`
);
