"use strict";

// Race Deep Dive view.
//
// Reads the granular per-race dataset produced by the race-processor
// (index.json + seasons/S*.json), NOT the Markdown championship archive the
// rest of the app uses. Season files are large (~1MB each) so they are fetched
// lazily and cached the first time a season is opened.

const RACE_DATA_BASE = "data/races";
// Remote fallback used only when the local fetch fails (e.g. opened over
// file://). Points at main, so it resolves once this feature is merged; until
// then, serve the folder over HTTP so the local fetch succeeds.
const RACE_DATA_REMOTE =
  "https://raw.githubusercontent.com/haisojoko/cup-racing-test-portal/refs/heads/main/sim-racing-historical-viz/data/races";

// Four tabs, each answering one question about the selected weekend, plus a
// season-wide tab. Everything except "season" is scoped to the event, so the
// filter bar keeps the same shape as you move between tabs — the race within
// the weekend is chosen by an inline switcher, not by a dropdown that appears
// on some tabs and not others.
const RACE_VIEWS = [
  { id: "weekend", label: "Weekend", scope: "event" },
  { id: "pace", label: "Pace", scope: "event" },
  { id: "racecraft", label: "Racecraft", scope: "event" },
  { id: "season", label: "Season", scope: "season" },
];

const RACE_DISCLAIMER =
  "Some data may be missing, as it is reconstructed from server logs.";

// In-flight fetch promises, keyed so a season is never loaded twice.
const _raceFetches = {};

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

function fetchRaceJson(relPath) {
  const local = `${RACE_DATA_BASE}/${relPath}`;
  const remote = `${RACE_DATA_REMOTE}/${relPath}`;
  const tryUrl = (url) =>
    fetch(url).then((res) => {
      if (!res.ok) throw new Error(`Fetch ${url} returned HTTP ${res.status}`);
      return res.json();
    });
  return tryUrl(local).catch((err) => {
    console.warn("Local race fetch failed:", err.message, "— trying remote…");
    return tryUrl(remote);
  });
}

function ensureRaceIndex() {
  if (state.races.index) return Promise.resolve(state.races.index);
  if (_raceFetches.index) return _raceFetches.index;
  _raceFetches.index = fetchRaceJson("index.json").then((idx) => {
    state.races.index = idx;
    return idx;
  });
  return _raceFetches.index;
}

function ensureRaceSeason(seasonId) {
  if (!seasonId) return Promise.reject(new Error("no season"));
  if (state.races.seasonData[seasonId]) return Promise.resolve(state.races.seasonData[seasonId]);
  const key = `season:${seasonId}`;
  if (_raceFetches[key]) return _raceFetches[key];
  _raceFetches[key] = fetchRaceJson(`seasons/${seasonId}.json`).then((data) => {
    state.races.seasonData[seasonId] = data;
    return data;
  });
  return _raceFetches[key];
}

// ---------------------------------------------------------------------------
// Selection helpers
// ---------------------------------------------------------------------------

function raceSeasonKey(id) {
  const m = /^S?(\d+)([a-z]?)$/i.exec(String(id || ""));
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [9999, String(id)];
}

function sortedRaceSeasonIds(index) {
  return Object.keys(index.seasons || {}).sort((a, b) => {
    const ka = raceSeasonKey(a), kb = raceSeasonKey(b);
    return ka[0] - kb[0] || ka[1].localeCompare(kb[1]);
  });
}

// Flatten a season's events into an ordered list of race descriptors.
function collectSeasonRaces(seasonData) {
  const out = [];
  for (const ev of sortedEvents(seasonData)) {
    for (const rid of sortedRaceIds(ev)) {
      out.push({ eventId: ev.eventId, venue: ev.venue, venueOrder: ev.venueOrder, date: ev.date, raceId: rid, race: ev.races[rid], event: ev });
    }
  }
  return out;
}

function sortedEvents(seasonData) {
  return [...(seasonData.events || [])].sort((a, b) => (a.venueOrder || 0) - (b.venueOrder || 0));
}

function sortedRaceIds(ev) {
  return Object.keys(ev.races || {}).sort((a, b) => Number(a) - Number(b));
}

function findEvent(seasonData, eventId) {
  return (seasonData.events || []).find((e) => e.eventId === eventId) || null;
}

// Every driver who appears in any race result across the season.
function seasonDriverList(seasonData) {
  const set = new Set();
  for (const ev of seasonData.events || []) {
    for (const r of Object.values(ev.races || {})) {
      for (const row of r.result || []) if (row.driver) set.add(row.driver);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

// Pick sensible defaults after data loads or when a selection goes stale.
function normalizeRaceSelection(seasonData) {
  const races = collectSeasonRaces(seasonData);
  if (!races.length) return;
  const hasEvent = races.some((r) => r.eventId === state.races.eventId);
  if (!hasEvent) {
    state.races.eventId = races[0].eventId;
    state.races.raceId = races[0].raceId;
  } else {
    const inEvent = races.filter((r) => r.eventId === state.races.eventId);
    if (!inEvent.some((r) => r.raceId === state.races.raceId)) {
      state.races.raceId = inEvent[0].raceId;
    }
  }
  const ev = findEvent(seasonData, state.races.eventId);
  const qualIds = ev ? Object.keys(ev.qualifying || {}) : [];
  if (!qualIds.includes(state.races.qualId)) state.races.qualId = qualIds[0] || null;

  const drivers = seasonDriverList(seasonData);
  state.races.h2h = (state.races.h2h || []).filter((d) => drivers.includes(d));
  if (state.races.h2h.length < 2) state.races.h2h = drivers.slice(0, 2);
}

function currentRace(seasonData) {
  const ev = findEvent(seasonData, state.races.eventId);
  return ev && ev.races ? ev.races[state.races.raceId] || null : null;
}

// ---------------------------------------------------------------------------
// View entry
// ---------------------------------------------------------------------------

function renderRacesView() {
  const content = refs["races-content"];
  const filters = refs["races-filters"];
  if (!content) return;

  ensureRaceIndex()
    .then((index) => {
      const seasonIds = sortedRaceSeasonIds(index);
      if (!seasonIds.length) {
        content.innerHTML = renderEmptyStateMarkup("No race dataset found.");
        return;
      }
      if (!seasonIds.includes(state.races.seasonId)) {
        state.races.seasonId = seasonIds[seasonIds.length - 1];
      }
      renderRaceFilters(index, seasonIds);
      if (!state.races.seasonData[state.races.seasonId]) {
        content.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading ${escapeHtml(state.races.seasonId)}…</p></div>`;
      }
      return ensureRaceSeason(state.races.seasonId)
        .then((seasonData) => {
          normalizeRaceSelection(seasonData);
          renderRaceFilters(index, seasonIds, seasonData);
          renderRaceContent(seasonData);
        })
        .catch((err) => {
          content.innerHTML = renderEmptyStateMarkup(`Failed to load ${state.races.seasonId}: ${err.message}`);
        });
    })
    .catch((err) => {
      if (filters) filters.innerHTML = "";
      const hint = location.protocol === "file:"
        ? " — the race dataset can't be read from a file:// page; serve this folder over HTTP (e.g. `python3 -m http.server`) and open it via http://localhost."
        : "";
      content.innerHTML = renderEmptyStateMarkup(`Failed to load race data: ${err.message}${hint}`);
    });

  if (!state.races.index) {
    content.innerHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Loading race data…</p></div>`;
  }
}

function renderRaceFilters(index, seasonIds, seasonData) {
  const filters = refs["races-filters"];
  if (!filters) return;

  const seasonOpts = seasonIds
    .map((id) => `<option value="${escapeHtml(id)}" ${id === state.races.seasonId ? "selected" : ""}>${escapeHtml(id)}</option>`)
    .join("");

  const view = RACE_VIEWS.find((v) => v.id === state.races.view) || RACE_VIEWS[0];
  let eventSelect = "";
  if (seasonData && view.scope !== "season") {
    const races = collectSeasonRaces(seasonData);
    const eventsSeen = [];
    const eventOpts = [];
    for (const r of races) {
      if (eventsSeen.includes(r.eventId)) continue;
      eventsSeen.push(r.eventId);
      eventOpts.push(`<option value="${escapeHtml(r.eventId)}" ${r.eventId === state.races.eventId ? "selected" : ""}>${r.venueOrder}. ${escapeHtml(r.venue)}</option>`);
    }
    eventSelect = `<label class="inline-control"><span>Event</span><select class="select" id="race-event-select">${eventOpts.join("")}</select></label>`;
  }

  filters.innerHTML = `
    <label class="inline-control"><span>Season</span><select class="select" id="race-season-select">${seasonOpts}</select></label>
    ${eventSelect}
  `;

  filters.querySelector("#race-season-select")?.addEventListener("change", (e) => {
    state.races.seasonId = e.target.value;
    state.races.eventId = null;
    state.races.raceId = null;
    renderRacesView();
  });
  filters.querySelector("#race-event-select")?.addEventListener("change", (e) => {
    state.races.eventId = e.target.value;
    state.races.raceId = null;
    state.races.qualId = null;
    renderRacesView();
  });
}

function renderRaceContent(seasonData) {
  const content = refs["races-content"];
  const subtabs = RACE_VIEWS
    .map((v) => `<button class="subtab-button ${state.races.view === v.id ? "is-active" : ""}" type="button" data-race-view="${v.id}">${escapeHtml(v.label)}</button>`)
    .join("");

  const view = RACE_VIEWS.find((v) => v.id === state.races.view) || RACE_VIEWS[0];
  let body = "";
  if (view.scope === "season") {
    body = renderSeasonTabView(seasonData);
  } else {
    const ev = findEvent(seasonData, state.races.eventId);
    body = ev ? renderEventTabView(view.id, seasonData, ev) : renderEmptyStateMarkup("No event selected.");
  }

  content.innerHTML = `
    <div class="subtab-nav">${subtabs}</div>
    <p class="race-disclaimer" role="note"><span class="race-disclaimer__tag">Data caveat</span>${escapeHtml(RACE_DISCLAIMER)}</p>
    ${body}`;

  content.querySelector(".subtab-nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-race-view]");
    if (!btn) return;
    state.races.view = btn.dataset.raceView;
    renderRacesView();
  });
  bindRaceContentControls(seasonData);
  hydrateRaceTables(seasonData);
}

// Event-scoped tabs. Each shows the weekend, with per-race detail driven by
// the inline race switcher rather than a separate dropdown.
function renderEventTabView(viewId, seasonData, ev) {
  const raceIds = sortedRaceIds(ev);
  if (!raceIds.length) return renderEmptyStateMarkup("No races in this event.");
  if (!raceIds.includes(state.races.raceId)) state.races.raceId = raceIds[0];
  const race = ev.races[state.races.raceId];

  switch (viewId) {
    case "weekend": return renderWeekendTabView(ev, race);
    case "pace": return renderPaceTabView(ev, race);
    case "racecraft": return renderRacecraftTabView(ev, race);
    default: return renderEmptyStateMarkup("Unknown view.");
  }
}

// Segmented Race 1 | Race 2 | Race 3 control. Hidden when the weekend only had
// one race, so it never occupies space it does not earn.
function buildRaceSwitcher(ev) {
  const ids = sortedRaceIds(ev);
  if (ids.length <= 1) return "";
  const btns = ids
    .map((id) => `<button class="subtab-button ${id === state.races.raceId ? "is-active" : ""}" type="button" data-race-id="${escapeHtml(id)}">Race ${escapeHtml(id)}</button>`)
    .join("");
  return `<div class="subtab-nav subtab-nav--inline" id="race-switcher">${btns}</div>`;
}

// ---------------------------------------------------------------------------
// Tab 1 — Weekend: how the weekend was won. Qualifying, then the result with
// grid movement folded in, then the lap-by-lap battle.
// ---------------------------------------------------------------------------

function renderWeekendTabView(ev, race) {
  if (!race) return renderEmptyStateMarkup("No race selected.");
  return `
    ${buildQualifyingCard(ev)}
    ${buildRaceSwitcher(ev)}
    ${buildResultCard(race, state.races.raceId)}
    ${buildBattleSection(race, state.races.raceId)}`;
}

function buildResultCard(race, raceId) {
  const rows = computeResultRows(race);
  const gained = rows.reduce((sum, r) => sum + Math.max(r.moved || 0, 0), 0);
  const anyReversed = rows.some((r) => r.qualPos != null && r.startPos != null && r.qualPos !== r.startPos);
  const note = anyReversed
    ? `<p class="subtle-text mt-1">This race did not start in qualifying order, so "Qual" and "Start" differ. "Moved" counts places taken from the actual starting slot — a driver reversed to the back can gain a lot without beating anyone they had not already beaten in qualifying.</p>`
    : `<p class="subtle-text mt-1">"Moved" is places gained or lost between the starting slot and the flag. Click a column to sort.</p>`;
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Race ${escapeHtml(raceId)} — Result</h3>
        <span class="badge">${gained} places gained</span>
        ${raceHeaderBadges(race)}
      </div>
      <div class="card__body">
        <div id="race-result-table"></div>
        ${note}
      </div>
    </div>`;
}

// The finishing order, with starting slot, places moved and best lap folded in
// — the three things that previously each cost their own tab.
function computeResultRows(race) {
  const movement = new Map(computeGridToFlagRows(race).map((r) => [r.driver, r]));
  const laps = race.laps || {};
  const rows = (race.result || []).map((r) => {
    const m = movement.get(r.driver) || {};
    let best = r.bestLapMs;
    if (!isValidLap(best)) {
      const valid = (laps[r.driver] || []).filter(isValidLap);
      best = valid.length ? Math.min(...valid) : null;
    }
    return {
      position: r.position,
      driver: r.driver,
      startPos: m.startPos != null ? m.startPos : null,
      moved: m.moved != null ? m.moved : null,
      qualPos: m.qualPos != null ? m.qualPos : null,
      bestMs: isValidLap(best) ? best : null,
      lapsDone: (laps[r.driver] || []).length,
    };
  });
  rows.sort((a, b) => (a.position == null ? 999 : a.position) - (b.position == null ? 999 : b.position));
  return rows;
}

function resultColumns() {
  const movedCell = (r) => {
    if (r.moved == null) return "—";
    if (r.moved === 0) return `<span class="move-flat">0</span>`;
    const cls = r.moved > 0 ? "move-gain" : "move-loss";
    return `<span class="${cls}">${r.moved > 0 ? "+" : ""}${r.moved}</span>`;
  };
  return [
    { key: "position", label: "Pos", strong: true, widthRem: 3.5 },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 9 },
    { key: "startPos", label: "Start", widthRem: 4, render: (r) => (r.startPos == null ? "—" : `P${r.startPos}`) },
    { key: "moved", label: "Moved", widthRem: 4.5, rawHtml: true, render: movedCell },
    { key: "qualPos", label: "Qual", widthRem: 4, render: (r) => (r.qualPos == null ? "—" : `P${r.qualPos}`) },
    { key: "bestMs", label: "Best lap", render: (r) => fmtLap(r.bestMs) },
    { key: "lapsDone", label: "Laps", widthRem: 4 },
  ];
}

// ---------------------------------------------------------------------------
// Tab 2 — Pace: how quick and how repeatable, plus sector detail on demand.
// ---------------------------------------------------------------------------

function renderPaceTabView(ev, race) {
  if (!race) return renderEmptyStateMarkup("No race selected.");
  const rows = computePaceRows(race);
  const order = (race.result || []).map((r) => r.driver).filter(Boolean);
  if (order.length && !order.includes(state.races.lapDriver)) state.races.lapDriver = order[0];
  const driverOpts = order
    .map((d) => `<option value="${escapeHtml(d)}" ${d === state.races.lapDriver ? "selected" : ""}>${escapeHtml(d)}</option>`)
    .join("");

  const paceBody = rows.length
    ? `<div id="race-pace-table"></div>
       <p class="subtle-text mt-1">Ranked by average clean-lap pace. Lap 1 and laps slower than 120% of a driver's median are excluded from the average, deviation and spread. "Best lap" is the driver's outright quickest, including those excluded laps. "Deviation" is how far a typical lap sits from that driver's own average — the steadier read on consistency than best-to-slowest, which one scrappy lap can dominate. <strong class="pace-best">Highlighted</strong> values lead their column; the deviation crown needs at least ${MIN_LAPS_FOR_DEVIATION_CROWN} counted laps. Click a column to sort.</p>`
    : renderEmptyStateMarkup("No pace data for this race.");

  return `
    ${buildRaceSwitcher(ev)}
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Race ${escapeHtml(state.races.raceId)} — Pace &amp; Consistency</h3>
        <span class="badge">${rows.length} drivers</span>
      </div>
      <div class="card__body">${paceBody}</div>
    </div>
    <div class="card mt-1">
      <div class="card__header">
        <h3 class="card__title">Sector Breakdown</h3>
        <label class="inline-control"><span>Driver</span><select class="select" id="race-lap-driver">${driverOpts}</select></label>
      </div>
      <div class="card__body">
        <div id="race-sector-table"></div>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Tab 3 — Racecraft: passes made and taken, and the contact log behind them.
// ---------------------------------------------------------------------------

function renderRacecraftTabView(ev, race) {
  if (!race) return renderEmptyStateMarkup("No race selected.");
  const contacts = computeContactRows(race);
  return `
    ${buildRaceSwitcher(ev)}
    ${buildOvertakesSection(race, state.races.raceId)}
    <div class="card mt-1">
      <div class="card__header">
        <h3 class="card__title">Race ${escapeHtml(state.races.raceId)} — Contacts</h3>
        <span class="badge">${contacts.length} logged</span>
      </div>
      <div class="card__body">
        ${contacts.length
          ? `<div id="race-contacts-table"></div>
             <p class="subtle-text mt-1">Every logged car-to-car contact, hardest first. Impact speed is the closing speed the server recorded, so it separates a light nudge from a heavy hit. Both cars are listed without implying fault. The server logs no time or lap for a collision, so contacts cannot be placed within the race.</p>`
          : renderEmptyStateMarkup("No contacts logged for this race.")}
      </div>
    </div>`;
}

function computeContactRows(race) {
  const rows = (race.contacts || []).map((c) => ({
    lap: c.lap != null ? c.lap : null,
    lapConfidence: c.lapConfidence || "unknown",
    driver1: c.driver1 || "—",
    driver2: c.driver2 || "—",
    impactSpeed: typeof c.impactSpeed === "number" ? c.impactSpeed : null,
  }));
  rows.sort((a, b) => (b.impactSpeed || 0) - (a.impactSpeed || 0));
  return rows;
}

// No Lap column: AC's collision events carry no timestamp in this dataset, so
// `lap` is null on every contact and the column could only ever show a dash.
// computeContactRows still carries the field, so the column is one line to
// restore if a future re-process ever populates it.
function contactColumns() {
  return [
    { key: "impactSpeed", label: "Impact", widthRem: 6, render: (r) => (r.impactSpeed == null ? "—" : `${r.impactSpeed.toFixed(1)} km/h`) },
    { key: "driver1", label: "Driver", strong: true, sticky: true, stickyWidthRem: 9 },
    { key: "driver2", label: "Other car", strong: true },
  ];
}

// ---------------------------------------------------------------------------
// Tab 4 — Season: the two views that span the whole season.
// ---------------------------------------------------------------------------

function renderSeasonTabView(seasonData) {
  return `${renderH2HView(seasonData)}<div class="mt-1">${renderCrashesView(seasonData)}</div>`;
}

function raceHeaderBadges(race) {
  const conf = race.gridConfidence || "unknown";
  const cls = conf === "high" ? "" : conf === "medium" ? "badge--muted" : "badge--danger";
  return `<span class="badge ${cls}">grid: ${escapeHtml(conf)}</span>`;
}

// ---------------------------------------------------------------------------
// 1. Position Battle (per event)
// ---------------------------------------------------------------------------

function buildBattleSection(race, raceId) {
  const battle = buildBattleSeries(race);
  const chart = battle.series.length
    ? buildBattleChartHtml(battle)
    : renderEmptyStateMarkup("No lap-by-lap position data for this race.");
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Race ${escapeHtml(raceId)} — Position Battle</h3>
        ${raceHeaderBadges(race)}
      </div>
      <div class="card__body">
        ${chart}
        ${battle.series.length ? `<p class="subtle-text mt-1">Lap 0 is the starting grid${race.gridConfidence !== "high" ? " (inferred)" : ""}. Lower is better.</p>` : ""}
      </div>
    </div>`;
}

function buildBattleSeries(race) {
  const order = (race.result || []).map((r) => r.driver).filter(Boolean);
  const positions = race.positions || {};
  const grid = race.grid || [];
  let maxLaps = 0;
  for (const d of order) maxLaps = Math.max(maxLaps, (positions[d] || []).length);
  const total = order.length;
  const series = order.map((driver, i) => {
    const gridPos = grid.indexOf(driver);
    const laps = positions[driver] || [];
    const pts = [];
    if (gridPos >= 0) pts.push({ lap: 0, position: gridPos + 1 });
    laps.forEach((p, idx) => { if (p != null) pts.push({ lap: idx + 1, position: p }); });
    return { driver, color: seriesColor(i, total), points: pts };
  }).filter((s) => s.points.length);
  return { series, maxLaps, driverCount: total };
}

function buildBattleChartHtml(battle) {
  const width = 980;
  const pad = { top: 20, right: 132, bottom: 44, left: 44 };
  const rowH = 20;
  const n = battle.driverCount;
  const height = Math.max(300, pad.top + pad.bottom + n * rowH);
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;
  const xDen = Math.max(battle.maxLaps, 1);
  const scaleX = (lap) => pad.left + (lap / xDen) * iw;
  const scaleY = (pos) => n <= 1 ? pad.top + ih / 2 : pad.top + ((pos - 1) / (n - 1)) * ih;

  const yTicks = n <= 8 ? Array.from({ length: n }, (_, i) => i + 1) : uniqueList([1, Math.ceil(n / 2), n]);
  const yGrid = yTicks.map((r) => {
    const y = scaleY(r);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(0,0,0,0.06)" stroke-dasharray="4 6"/><text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">P${r}</text>`;
  }).join("");

  const xTicks = laneTicks(battle.maxLaps);
  const xLabels = xTicks.map((lap) => `<text x="${scaleX(lap)}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#888">${lap === 0 ? "Grid" : `L${lap}`}</text>`).join("");

  const endpoints = [];
  const seriesSvg = battle.series.map((s) => {
    const pts = s.points.map((p) => ({ x: scaleX(p.lap), y: scaleY(p.position), p }));
    const last = pts[pts.length - 1];
    endpoints.push({ driver: s.driver, color: s.color, x: last.x, y: last.y });
    return `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}"/>` +
      pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${s.color}" stroke="#fff" stroke-width="1"><title>${escapeHtml(s.driver)} | ${p.p.lap === 0 ? "Grid" : `Lap ${p.p.lap}`} | P${p.p.position}</title></circle>`).join("");
  }).join("");

  const labels = buildEndpointLabels(endpoints, width, height, pad);

  return `
    <div class="chart-container">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Position battle chart">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fafafa"/>
        ${yGrid}
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
        ${seriesSvg}${labels}${xLabels}
      </svg>
    </div>`;
}

// Pick a small set of lap ticks (always include grid and final lap).
function laneTicks(maxLaps) {
  if (maxLaps <= 1) return [0, maxLaps];
  const step = Math.max(1, Math.round(maxLaps / 8));
  const ticks = [0];
  for (let l = step; l < maxLaps; l += step) ticks.push(l);
  ticks.push(maxLaps);
  return uniqueList(ticks);
}

// ---------------------------------------------------------------------------
// Sector detail (used by the Pace tab)
// ---------------------------------------------------------------------------

function sectorTableModel(race, driver) {
  const laps = (race.laps || {})[driver] || [];
  const sectors = (race.sectors || {})[driver] || [];
  const bestS = [Infinity, Infinity, Infinity];
  let bestLap = Infinity;
  laps.forEach((ms, i) => {
    if (isValidLap(ms)) bestLap = Math.min(bestLap, ms);
    (sectors[i] || []).forEach((sms, si) => { if (sms > 0) bestS[si] = Math.min(bestS[si], sms); });
  });
  const rows = laps.map((ms, i) => {
    const sec = sectors[i] || [];
    return {
      lap: i + 1,
      s1: sec[0] || null, s2: sec[1] || null, s3: sec[2] || null, total: ms,
      _bestS1: sec[0] === bestS[0], _bestS2: sec[1] === bestS[1], _bestS3: sec[2] === bestS[2], _bestLap: ms === bestLap,
    };
  });
  return rows;
}

function buildSectorColumns() {
  const cell = (key, bestKey) => (r) => {
    const v = r[key];
    const text = fmtLap(v);
    return r[bestKey] && isValidLap(v) ? `<strong style="color:var(--accent)">${text}</strong>` : escapeHtml(text);
  };
  return [
    { key: "lap", label: "Lap", strong: true, widthRem: 4 },
    { key: "s1", label: "Sector 1", rawHtml: true, render: cell("s1", "_bestS1") },
    { key: "s2", label: "Sector 2", rawHtml: true, render: cell("s2", "_bestS2") },
    { key: "s3", label: "Sector 3", rawHtml: true, render: cell("s3", "_bestS3") },
    { key: "total", label: "Lap time", rawHtml: true, render: cell("total", "_bestLap") },
  ];
}

// ---------------------------------------------------------------------------
// 4. Pace & Consistency — single race
// ---------------------------------------------------------------------------

function computePaceRows(race) {
  const pace = race.pace || {};
  const laps = race.laps || {};
  const result = race.result || [];
  const rows = [];
  for (const r of result) {
    const d = r.driver;
    if (!d) continue;
    const raw = (laps[d] || []).filter(isValidLap);
    const pool = cleanLapPool(laps[d]);
    const p = pace[d] || {};

    // Outright quickest lap, counting laps the pace pool excludes. This is the
    // fastest-lap figure that used to live in its own tab, and it is why a
    // driver with a single lap still earns a row here even though no average
    // can be computed for them.
    const cleanBest = p.bestMs != null ? p.bestMs : (pool.length ? Math.min(...pool) : null);
    let bestMs = isValidLap(r.bestLapMs) ? r.bestLapMs : (raw.length ? Math.min(...raw) : null);
    if (bestMs == null) bestMs = cleanBest;

    const avg = p.avgMs != null ? p.avgMs : (pool.length ? pool.reduce((a, b) => a + b, 0) / pool.length : null);
    if (bestMs == null && avg == null) continue;

    // Slowest is taken from the same cleaned pool as the average. Reading it
    // off the raw lap list instead paired a clean best with a lap-1 or
    // off-track worst, which made the spread a measure of a driver's single
    // worst lap rather than of their consistency.
    const worst = pool.length ? Math.max(...pool) : null;
    const dev = lapDeviation(pool);
    rows.push({
      driver: d,
      bestMs,
      avgMs: avg == null ? null : Math.round(avg),
      worstMs: worst,
      spreadMs: worst != null && cleanBest != null ? worst - cleanBest : null,
      stdevMs: dev.stdevMs == null ? null : Math.round(dev.stdevMs),
      cvPct: dev.cvPct,
      lapsUsed: p.lapsUsed != null ? p.lapsUsed : pool.length,
    });
  }
  // Ranked on average pace. Drivers with too few laps to average sort last but
  // keep their row, so no fastest lap disappears from the weekend.
  rows.sort((a, b) => {
    if (a.avgMs == null && b.avgMs == null) return (a.bestMs || 0) - (b.bestMs || 0);
    if (a.avgMs == null) return 1;
    if (b.avgMs == null) return -1;
    return a.avgMs - b.avgMs;
  });
  const lead = rows.length && rows[0].avgMs != null ? rows[0].avgMs : 0;
  rows.forEach((r, i) => {
    r.rank = r.avgMs == null ? null : i + 1;
    r.gapMs = r.avgMs == null ? null : r.avgMs - lead;
  });
  markPaceLeaders(rows);
  return rows;
}

// A driver whose only two counted laps happened to be close together would
// otherwise take the consistency crown from someone who held a steady pace all
// race, so the deviation flag needs a minimum sample. Two laps produce a
// deviation of exactly half the gap between them, which is not consistency.
const MIN_LAPS_FOR_DEVIATION_CROWN = 3;

// Flag the best value in each column. Ties are all flagged — with lap times to
// the millisecond that is rare, but a genuine dead heat should not pick one
// driver arbitrarily.
function markPaceLeaders(rows) {
  const bestOf = (key, eligible) => {
    const vals = rows.filter((r) => (eligible ? eligible(r) : true)).map((r) => r[key]).filter((v) => v != null);
    return vals.length ? Math.min(...vals) : null;
  };
  const fastestLap = bestOf("bestMs");
  const bestAvg = bestOf("avgMs");
  const lowestDev = bestOf("stdevMs", (r) => r.lapsUsed >= MIN_LAPS_FOR_DEVIATION_CROWN);

  for (const r of rows) {
    r.isFastestLap = fastestLap != null && r.bestMs === fastestLap;
    r.isBestAvg = bestAvg != null && r.avgMs === bestAvg;
    r.isLowestDev = lowestDev != null && r.stdevMs === lowestDev && r.lapsUsed >= MIN_LAPS_FOR_DEVIATION_CROWN;
  }
  return rows;
}

// Wraps a pace value, marking it when it leads its column.
function paceLeaderCell(text, isLeader, title) {
  return isLeader
    ? `<span class="pace-best" title="${escapeHtml(title)}">${escapeHtml(text)}</span>`
    : escapeHtml(text);
}

function paceColumns() {
  return [
    { key: "rank", label: "#", widthRem: 3, render: (r) => (r.rank == null ? "—" : String(r.rank)) },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 9 },
    { key: "bestMs", label: "Best lap", rawHtml: true, render: (r) => paceLeaderCell(fmtLap(r.bestMs), r.isFastestLap, "Fastest lap of the race") },
    { key: "avgMs", label: "Avg pace", rawHtml: true, render: (r) => paceLeaderCell(fmtLap(r.avgMs), r.isBestAvg, "Best average pace of the race") },
    { key: "stdevMs", label: "Deviation", rawHtml: true, render: (r) => paceLeaderCell(fmtDeviation(r.stdevMs), r.isLowestDev, "Steadiest laps of the race") },
    { key: "worstMs", label: "Slowest", render: (r) => fmtLap(r.worstMs) },
    { key: "spreadMs", label: "Best→Slowest", render: (r) => (r.spreadMs == null ? "—" : `${(r.spreadMs / 1000).toFixed(3)}s`) },
    { key: "gapMs", label: "Gap to best avg", render: (r) => (r.gapMs == null || r.gapMs === 0 ? "—" : `+${(r.gapMs / 1000).toFixed(3)}s`) },
    { key: "lapsUsed", label: "Laps", widthRem: 4 },
  ];
}

// ---------------------------------------------------------------------------
// 5. Overtakes (per event)
// ---------------------------------------------------------------------------

function buildOvertakesSection(race, raceId) {
  const rows = computeOvertakeTallies(race);
  const body = rows.length ? (() => {
    const maxVal = Math.max(...rows.map((r) => Math.max(r.made, r.suffered)), 1);
    const bars = rows.map((r) => `
      <div class="ot-row">
        <span class="hbar-label" title="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>
        <span class="ot-bars">
          <span class="ot-side ot-side--made"><span class="ot-fill" style="width:${(r.made / maxVal) * 100}%"></span><span class="ot-num">${r.made}</span></span>
          <span class="ot-side ot-side--suffered"><span class="ot-fill" style="width:${(r.suffered / maxVal) * 100}%"></span><span class="ot-num">${r.suffered}</span></span>
        </span>
      </div>`).join("");
    return `<div class="ot-legend"><span><span class="ot-key ot-key--made"></span>Passes made</span><span><span class="ot-key ot-key--suffered"></span>Passes suffered</span></div><div class="ot-chart">${bars}</div>`;
  })() : renderEmptyStateMarkup("No overtake data for this race.");
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Race ${escapeHtml(raceId)} — Overtakes</h3>
        <span class="badge">${(race.overtakes || []).length} passes</span>
      </div>
      <div class="card__body">${body}</div>
    </div>`;
}

function computeOvertakeTallies(race) {
  const list = race.overtakes || [];
  const order = (race.result || []).map((r) => r.driver).filter(Boolean);
  const tally = {};
  const ensure = (d) => (tally[d] || (tally[d] = { driver: d, made: 0, suffered: 0 }));
  for (const d of order) ensure(d);
  for (const ov of list) {
    if (ov.driver) ensure(ov.driver).made += 1;
    if (ov.passed) ensure(ov.passed).suffered += 1;
  }
  const rows = Object.values(tally);
  rows.forEach((r) => { r.net = r.made - r.suffered; });
  rows.sort((a, b) => b.made - a.made || a.suffered - b.suffered || a.driver.localeCompare(b.driver));
  return rows;
}

// ---------------------------------------------------------------------------
// 5b. Grid → Flag (per event)
// ---------------------------------------------------------------------------

// Movement from the actual starting slot to the flag, with the qualifying slot
// carried alongside. `qualVsRace` in the dataset is measured from qualifying
// order, which on a reverse grid is not where the driver actually started —
// so `moved` is derived from race.grid and the qual figure is kept as context.
function computeGridToFlagRows(race) {
  const gridPos = {};
  (Array.isArray(race.grid) ? race.grid : []).forEach((d, i) => {
    if (d && gridPos[d] == null) gridPos[d] = i + 1;
  });
  const qvr = race.qualVsRace || {};
  const rows = [];
  for (const r of race.result || []) {
    const d = r.driver;
    if (!d || r.position == null) continue;
    const startPos = gridPos[d] != null ? gridPos[d] : null;
    const q = qvr[d] || null;
    rows.push({
      driver: d,
      startPos,
      finishPos: r.position,
      moved: startPos != null ? startPos - r.position : null,
      qualPos: q ? q.qualPosition : null,
      qualDelta: q ? q.delta : null,
    });
  }
  rows.sort((x, y) => {
    const mx = x.moved == null ? -Infinity : x.moved;
    const my = y.moved == null ? -Infinity : y.moved;
    return my - mx || x.finishPos - y.finishPos;
  });
  return rows;
}

// ---------------------------------------------------------------------------
// 6. Qualifying gaps (per event)
// ---------------------------------------------------------------------------

// Event-level card at the top of the Weekend tab. Returns nothing at all when
// the weekend has no qualifying, rather than an empty-state that would push the
// race result down the page for no reason.
function buildQualifyingCard(ev) {
  const qualIds = Object.keys(ev.qualifying || {});
  if (!qualIds.length) return "";
  if (!qualIds.includes(state.races.qualId)) state.races.qualId = qualIds[0];

  const rows = computeQualGaps(ev.qualifying[state.races.qualId]);
  const sessionButtons = qualIds
    .map((q) => `<button class="subtab-button ${q === state.races.qualId ? "is-active" : ""}" type="button" data-qual-id="${escapeHtml(q)}">${escapeHtml(q.toUpperCase())}</button>`)
    .join("");

  const bars = rows.length ? buildGapBarsHtml(rows, {
    labelFn: (r) => r.driver,
    barFn: (r) => r.gapMs,
    valueText: (r) => fmtLap(r.bestMs),
    gapText: (r) => (r.gapMs === 0 ? "POLE" : `+${(r.gapMs / 1000).toFixed(3)}`),
  }) : renderEmptyStateMarkup("No timed laps in this session.");

  return `
    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Qualifying — ${escapeHtml(ev.venue)}</h3>
        <span class="badge">${rows.length} drivers</span>
      </div>
      <div class="card__body">
        ${qualIds.length > 1 ? `<div class="subtab-nav subtab-nav--inline" id="qual-session-nav">${sessionButtons}</div>` : ""}
        ${bars}
        <p class="subtle-text mt-1">Gap to pole on each driver's best qualifying lap. Applies to the whole weekend, not just the race selected below.</p>
      </div>
    </div>`;
}

function computeQualGaps(session) {
  const times = (session && session.times) || {};
  const rows = [];
  for (const [driver, t] of Object.entries(times)) {
    const best = t && t.bestMs;
    if (isValidLap(best)) rows.push({ driver, bestMs: best });
  }
  rows.sort((a, b) => a.bestMs - b.bestMs);
  const pole = rows.length ? rows[0].bestMs : 0;
  for (const r of rows) r.gapMs = r.bestMs - pole;
  return rows;
}

// ---------------------------------------------------------------------------
// 7. Head-to-Head (season scope)
// ---------------------------------------------------------------------------

function renderH2HView(seasonData) {
  const drivers = seasonDriverList(seasonData);
  if (drivers.length < 2) return renderEmptyStateMarkup("Not enough drivers in this season for a comparison.");
  const [a, b] = state.races.h2h;

  const pickers = [0, 1].map((slot) => {
    const color = seriesColor(slot, 2);
    const opts = drivers
      .map((d) => `<option value="${escapeHtml(d)}" ${d === state.races.h2h[slot] ? "selected" : ""}>${escapeHtml(d)}</option>`)
      .join("");
    return `<label class="inline-control"><span class="h2h-swatch" style="background:${color}"></span><select class="select" data-h2h-slot="${slot}">${opts}</select></label>`;
  }).join("");

  const h2h = computeHeadToHead(seasonData, a, b);
  const colorA = seriesColor(0, 2), colorB = seriesColor(1, 2);

  // Each card names both drivers and highlights the leader, so a value is never
  // an unlabelled "A"/"B".
  // `fmt` formats for display only — the better-side comparison always runs on
  // the raw numbers, so a formatted value never breaks the highlight.
  const metric = (label, va, vb, better, fmt) => {
    const aWin = better === "low" ? cmpLow(va, vb) : better === "high" ? cmpHigh(va, vb) : false;
    const bWin = better === "low" ? cmpLow(vb, va) : better === "high" ? cmpHigh(vb, va) : false;
    const show = (v) => (fmt && typeof v === "number" ? fmt(v) : String(v));
    const side = (name, val, win, color) => `
      <span class="h2h-side ${win ? "is-better" : ""}">
        <span class="h2h-side__name" style="color:${color}">${escapeHtml(name)}</span>
        <span class="h2h-side__val">${escapeHtml(show(val))}</span>
      </span>`;
    return `
      <div class="h2h-metric">
        <div class="h2h-metric__label">${escapeHtml(label)}</div>
        <div class="h2h-metric__vals">
          ${side(a, va, aWin, colorA)}
          <span class="h2h-metric__vs">vs</span>
          ${side(b, vb, bWin, colorB)}
        </div>
      </div>`;
  };

  const cards = [
    metric("Races together", h2h.together, h2h.together, "eq"),
    metric("Finished ahead", h2h.aAhead, h2h.bAhead, "high"),
    metric("Out-qualified", h2h.aOutqual, h2h.bOutqual, "high"),
    metric("Avg finish", h2h.aAvgFinish ?? "—", h2h.bAvgFinish ?? "—", "low"),
    metric("Wins", h2h.aWins, h2h.bWins, "high"),
    metric("Total overtakes", h2h.aTotalOt, h2h.bTotalOt, "high"),
    metric("Avg lap deviation", h2h.aAvgDevPct ?? "—", h2h.bAvgDevPct ?? "—", "low", (v) => `${v.toFixed(2)}%`),
  ].join("");

  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Head-to-Head</h3>
        <div class="view-filters">${pickers}</div>
      </div>
      <div class="card__body">
        <p class="subtle-text">Comparing <strong style="color:${colorA}">${escapeHtml(a)}</strong> vs <strong style="color:${colorB}">${escapeHtml(b)}</strong> across ${escapeHtml(seasonData.season || state.races.seasonId)}. Each card highlights the leader. "Avg lap deviation" is how far a typical lap sits from the driver's own average for that race, as a percentage of it, averaged over every race they finished — lower is steadier, and the percentage keeps short and long circuits comparable.</p>
        <div class="h2h-grid mt-1">${cards}</div>
      </div>
    </div>
    <div class="card mt-1">
      <div class="card__header"><h3 class="card__title">Qualifying — session by session</h3></div>
      <div class="card__body"><div id="h2h-qual-table"></div></div>
    </div>
    <div class="card mt-1">
      <div class="card__header"><h3 class="card__title">Race pace &amp; racecraft — race by race</h3></div>
      <div class="card__body"><div id="h2h-race-table"></div></div>
    </div>`;
}

function cmpLow(x, y) { return typeof x === "number" && typeof y === "number" && x < y; }
function cmpHigh(x, y) { return typeof x === "number" && typeof y === "number" && x > y; }

function overtakesMadeBy(race, driver) {
  return (race.overtakes || []).reduce((n, ov) => n + (ov.driver === driver ? 1 : 0), 0);
}

function computeHeadToHead(seasonData, a, b) {
  const races = collectSeasonRaces(seasonData);
  const out = { races: [], together: 0, aAhead: 0, bAhead: 0, aWins: 0, bWins: 0, aTotalOt: 0, bTotalOt: 0, aOutqual: 0, bOutqual: 0 };

  // Qualifying head-to-head: who set the faster best lap, session by session.
  for (const row of computeH2HQualRows(seasonData, a, b)) {
    if (row.deltaMs == null) continue;
    if (row.deltaMs < 0) out.aOutqual += 1; else if (row.deltaMs > 0) out.bOutqual += 1;
  }

  const aFin = [], bFin = [], aPace = [], bPace = [], aDev = [], bDev = [];
  let aBest = Infinity, bBest = Infinity;
  for (const rc of races) {
    const posOf = (d) => {
      const row = (rc.race.result || []).find((r) => r.driver === d);
      return row ? row.position : null;
    };
    const aPos = posOf(a), bPos = posOf(b);
    if (aPos == null && bPos == null) continue;
    out.races.push({ venue: rc.venue, venueOrder: rc.venueOrder, raceId: rc.raceId, aPos, bPos });
    if (aPos != null) { aFin.push(aPos); if (aPos === 1) out.aWins += 1; const bl = bestLapOf(rc.race, a); if (isValidLap(bl)) aBest = Math.min(aBest, bl); const ap = avgPaceOf(rc.race, a); if (ap) aPace.push(ap); const ad = paceDeviationOf(rc.race, a); if (ad.cvPct != null) aDev.push(ad.cvPct); out.aTotalOt += overtakesMadeBy(rc.race, a); }
    if (bPos != null) { bFin.push(bPos); if (bPos === 1) out.bWins += 1; const bl = bestLapOf(rc.race, b); if (isValidLap(bl)) bBest = Math.min(bBest, bl); const bp = avgPaceOf(rc.race, b); if (bp) bPace.push(bp); const bd = paceDeviationOf(rc.race, b); if (bd.cvPct != null) bDev.push(bd.cvPct); out.bTotalOt += overtakesMadeBy(rc.race, b); }
    if (aPos != null && bPos != null) {
      out.together += 1;
      if (aPos < bPos) out.aAhead += 1; else out.bAhead += 1;
    }
  }
  const avg = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 10) / 10 : null);
  const avgMs = (arr) => (arr.length ? Math.round(arr.reduce((x, y) => x + y, 0) / arr.length) : null);
  out.aAvgFinish = avg(aFin); out.bAvgFinish = avg(bFin);
  out.aBestLap = aBest === Infinity ? null : aBest;
  out.bBestLap = bBest === Infinity ? null : bBest;
  out.aAvgPace = avgMs(aPace); out.bAvgPace = avgMs(bPace);
  // Season-wide consistency: the mean of each race's deviation-as-a-share-of-
  // own-average, so venues with very different lap lengths weigh equally.
  const avgPct = (arr) => (arr.length ? Math.round((arr.reduce((x, y) => x + y, 0) / arr.length) * 100) / 100 : null);
  out.aAvgDevPct = avgPct(aDev); out.bAvgDevPct = avgPct(bDev);
  out.aDevRaces = aDev.length; out.bDevRaces = bDev.length;
  return out;
}

// Per-quali-session gap between the two drivers, across the whole season.
function computeH2HQualRows(seasonData, a, b) {
  const rows = [];
  for (const ev of sortedEvents(seasonData)) {
    const quals = ev.qualifying || {};
    for (const qid of Object.keys(quals).sort()) {
      const times = quals[qid].times || {};
      const aMs = times[a] && isValidLap(times[a].bestMs) ? times[a].bestMs : null;
      const bMs = times[b] && isValidLap(times[b].bestMs) ? times[b].bestMs : null;
      if (aMs == null && bMs == null) continue;
      rows.push({
        session: `${ev.venueOrder}. ${ev.venue} ${qid.toUpperCase()}`,
        venueOrder: ev.venueOrder,
        aMs, bMs,
        deltaMs: aMs != null && bMs != null ? aMs - bMs : null,
      });
    }
  }
  return rows;
}

// Per-race fastest-lap gap, pace delta, and overtakes for races both contested.
function computeH2HRaceRows(seasonData, a, b) {
  const rows = [];
  for (const rc of collectSeasonRaces(seasonData)) {
    const hasA = (rc.race.result || []).some((r) => r.driver === a);
    const hasB = (rc.race.result || []).some((r) => r.driver === b);
    if (!hasA || !hasB) continue;
    const aBest = bestLapOf(rc.race, a), bBest = bestLapOf(rc.race, b);
    const aPace = avgPaceOf(rc.race, a), bPace = avgPaceOf(rc.race, b);
    rows.push({
      race: `${rc.venueOrder}. ${rc.venue} R${rc.raceId}`,
      venueOrder: rc.venueOrder,
      raceId: Number(rc.raceId),
      aBest, bBest,
      flDeltaMs: isValidLap(aBest) && isValidLap(bBest) ? aBest - bBest : null,
      aPace, bPace,
      paceDeltaMs: aPace && bPace ? Math.round(aPace - bPace) : null,
      aOt: overtakesMadeBy(rc.race, a),
      bOt: overtakesMadeBy(rc.race, b),
    });
  }
  return rows;
}

function bestLapOf(race, driver) {
  const row = (race.result || []).find((r) => r.driver === driver);
  if (row && isValidLap(row.bestLapMs)) return row.bestLapMs;
  const valid = ((race.laps || {})[driver] || []).filter(isValidLap);
  return valid.length ? Math.min(...valid) : null;
}

function avgPaceOf(race, driver) {
  const p = (race.pace || {})[driver];
  if (p && p.avgMs != null) return p.avgMs;
  const valid = ((race.laps || {})[driver] || []).filter(isValidLap);
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

// Describe a gap by naming who is faster, e.g. { text: "Josie by 0.234s",
// side: "first" }. `first` is faster when deltaMs < 0 (first - second).
function describeDelta(deltaMs, first, second) {
  if (deltaMs == null) return { text: "—", side: null };
  if (deltaMs === 0) return { text: "even", side: null };
  const mag = (Math.abs(deltaMs) / 1000).toFixed(3);
  return deltaMs < 0
    ? { text: `${first} by ${mag}s`, side: "first" }
    : { text: `${second} by ${mag}s`, side: "second" };
}

// ---------------------------------------------------------------------------
// 8. Crashes (season scope) — contacts per driver per race, all on one page
// ---------------------------------------------------------------------------

function renderCrashesView(seasonData) {
  const model = computeCrashMatrix(seasonData);
  if (!model.rows.length) return renderEmptyStateMarkup("No contact data for this season.");
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Crashes — contacts per driver, race by race</h3>
        <span class="badge">${model.totalContacts} contacts</span>
      </div>
      <div class="card__body">
        <div id="crash-matrix-table"></div>
        <p class="subtle-text mt-1">Each cell counts how many contacts a driver was involved in that race (both cars in a collision are counted). Columns are venue.race; darker = more contacts. A high count is not necessarily fault — it just flags incident-heavy races. Click a column to sort.</p>
      </div>
    </div>`;
}

// Build a driver × race grid of contact involvement counts for the season.
function computeCrashMatrix(seasonData) {
  const races = collectSeasonRaces(seasonData);
  const cols = races.map((rc) => ({ key: `r_${rc.venueOrder}_${rc.raceId}`, label: `${rc.venueOrder}.${rc.raceId}`, venue: rc.venue }));
  const drivers = seasonDriverList(seasonData);
  const byDriver = new Map(drivers.map((d) => [d, { driver: d, total: 0 }]));

  let max = 0;
  let totalContacts = 0;
  races.forEach((rc, i) => {
    const key = cols[i].key;
    for (const d of drivers) (byDriver.get(d))[key] = 0;
    for (const c of rc.race.contacts || []) {
      totalContacts += 1;
      for (const who of [c.driver1, c.driver2]) {
        const row = byDriver.get(who);
        if (!row) continue;
        row[key] += 1;
        row.total += 1;
        max = Math.max(max, row[key]);
      }
    }
  });

  const rows = [...byDriver.values()].filter((r) => r.total > 0).sort((a, b) => b.total - a.total || a.driver.localeCompare(b.driver));
  return { cols, rows, max, totalContacts };
}

function crashColumns(model) {
  const cell = (key) => (r) => {
    const n = r[key] || 0;
    if (!n) return `<span class="crash-cell">·</span>`;
    const alpha = model.max ? 0.12 + 0.6 * (n / model.max) : 0.3;
    return `<span class="crash-cell" style="background:rgba(220,53,69,${alpha.toFixed(2)})">${n}</span>`;
  };
  return [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 9 },
    { key: "total", label: "Total", widthRem: 4.5 },
    ...model.cols.map((c) => ({ key: c.key, label: c.label, widthRem: 3, rawHtml: true, render: cell(c.key) })),
  ];
}

// ---------------------------------------------------------------------------
// Shared bar chart + table hydration + control binding
// ---------------------------------------------------------------------------

// Horizontal "gap to leader" bar list used by the qualifying card.
function buildGapBarsHtml(rows, opts) {
  const maxGap = Math.max(...rows.map((r) => opts.barFn(r)), 1);
  const bars = rows.map((r, i) => {
    const gap = opts.barFn(r);
    const pct = 8 + (gap / maxGap) * 88;
    return `
      <div class="hbar-row">
        <span class="hbar-rank">${i + 1}</span>
        <span class="hbar-label" title="${escapeHtml(opts.labelFn(r))}">${escapeHtml(opts.labelFn(r))}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%;background:${seriesColor(i, rows.length)}"></span><span class="hbar-inbar">${escapeHtml(opts.valueText(r))}</span></span>
        <span class="hbar-value">${escapeHtml(opts.gapText(r))}</span>
      </div>`;
  }).join("");
  return `<div class="hbar-chart">${bars}</div>`;
}

// Fill the sortable tables for the active view after content.innerHTML is set.
function hydrateRaceTables(seasonData) {
  const view = state.races.view;
  const race = currentRace(seasonData);
  if (view === "weekend") {
    if (race && document.getElementById("race-result-table")) {
      renderSortableTable("race-result-table", resultColumns(), computeResultRows(race), { compact: true });
    }
  } else if (view === "pace") {
    if (race && document.getElementById("race-pace-table")) {
      renderSortableTable("race-pace-table", paceColumns(), computePaceRows(race), { compact: true });
    }
    if (race && document.getElementById("race-sector-table")) {
      renderSortableTable("race-sector-table", buildSectorColumns(), sectorTableModel(race, state.races.lapDriver), { compact: true });
    }
  } else if (view === "racecraft") {
    if (race && document.getElementById("race-contacts-table")) {
      renderSortableTable("race-contacts-table", contactColumns(), computeContactRows(race), { compact: true });
    }
  } else if (view === "season") {
    const [a, b] = state.races.h2h;
    const colorA = seriesColor(0, 2), colorB = seriesColor(1, 2);
    const nameCell = (color) => (v) => `<span style="color:${color};font-weight:600">${escapeHtml(fmtLap(v))}</span>`;
    const deltaRender = (key) => (r) => {
      const d = describeDelta(r[key], a, b);
      const color = d.side === "first" ? colorA : d.side === "second" ? colorB : "";
      return color ? `<span style="color:${color};font-weight:600">${escapeHtml(d.text)}</span>` : escapeHtml(d.text);
    };
    if (document.getElementById("h2h-qual-table")) {
      const qualRows = computeH2HQualRows(seasonData, a, b);
      const qualCols = [
        { key: "session", label: "Session", strong: true, sticky: true, stickyWidthRem: 14, className: "wrap-col" },
        { key: "aMs", label: `${a} best`, rawHtml: true, render: (r) => nameCell(colorA)(r.aMs) },
        { key: "bMs", label: `${b} best`, rawHtml: true, render: (r) => nameCell(colorB)(r.bMs) },
        { key: "deltaMs", label: "Faster", rawHtml: true, render: deltaRender("deltaMs") },
      ];
      renderSortableTable("h2h-qual-table", qualCols, qualRows, { compact: true });
    }
    if (document.getElementById("h2h-race-table")) {
      const raceRows = computeH2HRaceRows(seasonData, a, b);
      const raceCols = [
        { key: "race", label: "Race", strong: true, sticky: true, stickyWidthRem: 14, className: "wrap-col" },
        { key: "aBest", label: `${a} best lap`, rawHtml: true, render: (r) => nameCell(colorA)(r.aBest) },
        { key: "bBest", label: `${b} best lap`, rawHtml: true, render: (r) => nameCell(colorB)(r.bBest) },
        { key: "flDeltaMs", label: "Faster lap", rawHtml: true, render: deltaRender("flDeltaMs") },
        { key: "aPace", label: `${a} avg lap`, rawHtml: true, render: (r) => nameCell(colorA)(r.aPace) },
        { key: "bPace", label: `${b} avg lap`, rawHtml: true, render: (r) => nameCell(colorB)(r.bPace) },
        { key: "paceDeltaMs", label: "Faster avg", rawHtml: true, render: deltaRender("paceDeltaMs") },
        { key: "aOt", label: `${a} passes`, widthRem: 6 },
        { key: "bOt", label: `${b} passes`, widthRem: 6 },
      ];
      renderSortableTable("h2h-race-table", raceCols, raceRows, { compact: true });
    }
    if (document.getElementById("crash-matrix-table")) {
      const model = computeCrashMatrix(seasonData);
      // Rows arrive pre-sorted by total (desc); headers re-sort on click.
      renderSortableTable("crash-matrix-table", crashColumns(model), model.rows, { compact: true });
    }
  }
}

function bindRaceContentControls(seasonData) {
  const content = refs["races-content"];
  if (!content) return;
  content.querySelector("#race-lap-driver")?.addEventListener("change", (e) => {
    state.races.lapDriver = e.target.value;
    renderRacesView();
  });
  content.querySelector("#race-switcher")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-race-id]");
    if (!btn) return;
    state.races.raceId = btn.dataset.raceId;
    renderRacesView();
  });
  content.querySelector("#qual-session-nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-qual-id]");
    if (!btn) return;
    state.races.qualId = btn.dataset.qualId;
    renderRacesView();
  });
  content.querySelectorAll("select[data-h2h-slot]").forEach((sel) => {
    sel.addEventListener("change", (e) => {
      const slot = Number(e.target.dataset.h2hSlot);
      const next = [...state.races.h2h];
      next[slot] = e.target.value;
      state.races.h2h = next;
      renderRacesView();
    });
  });
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function isValidLap(ms) {
  return typeof ms === "number" && isFinite(ms) && ms > 0 && ms < 600000;
}

// Median matching Python's statistics.median (mean of the two middle values on
// even-length input) so cleanLapPool below reproduces the processor exactly.
function medianOf(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Mirrors the processor's `_clean_laps`: drop lap 1 (standing/rolling start)
// and any lap slower than 120% of the median of what remains. Reproducing the
// rule here means the pool matches the `lapsUsed` the processor published, so
// avg pace and the deviation stats describe the same set of laps. The extra
// isValidLap guard is defensive — the shipped dataset has no invalid entries.
function cleanLapPool(times) {
  const list = Array.isArray(times) ? times.filter(isValidLap) : [];
  if (list.length <= 1) return [];
  const withoutLap1 = list.slice(1);
  const med = medianOf(withoutLap1);
  if (med == null) return [];
  const threshold = med * 1.2;
  return withoutLap1.filter((t) => t <= threshold);
}

// How far a driver's laps sit from their own average.
//   stdevMs  population standard deviation over the clean pool.
//   cvPct    that deviation as a share of the driver's own average lap.
// Within one race every driver runs the same track, so stdevMs compares them
// directly. Across a season it does not — a second of scatter means something
// very different at an 80s oval than at a 7-minute lap — so cvPct is the one
// that can be averaged over mixed venues.
function lapDeviation(pool) {
  if (!Array.isArray(pool) || pool.length < 2) return { stdevMs: null, cvPct: null };
  const mean = pool.reduce((sum, t) => sum + t, 0) / pool.length;
  const variance = pool.reduce((sum, t) => sum + (t - mean) * (t - mean), 0) / pool.length;
  const stdevMs = Math.sqrt(variance);
  return { stdevMs, cvPct: mean > 0 ? (stdevMs / mean) * 100 : null };
}

// Lap-time deviation for one driver in one race.
function paceDeviationOf(race, driver) {
  return lapDeviation(cleanLapPool((race.laps || {})[driver]));
}

// "±0.194s" — the deviation column/bar label.
function fmtDeviation(ms) {
  return ms == null ? "—" : `±${(ms / 1000).toFixed(3)}s`;
}

// Format milliseconds as a lap time: "1:34.001" or "58.204".
function fmtLap(ms) {
  if (!isValidLap(ms)) return "—";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  if (min > 0) return `${min}:${sec.toFixed(3).padStart(6, "0")}`;
  return sec.toFixed(3);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isValidLap, fmtLap, describeDelta,
    medianOf, cleanLapPool, lapDeviation, paceDeviationOf, fmtDeviation,
    computeGridToFlagRows,
    raceSeasonKey, sortedRaceSeasonIds, collectSeasonRaces, seasonDriverList,
    sortedEvents, sortedRaceIds,
    buildBattleSeries, laneTicks, computeResultRows, computeContactRows,
    computePaceRows, computeOvertakeTallies, computeQualGaps,
    computeHeadToHead, computeH2HQualRows, computeH2HRaceRows, overtakesMadeBy,
    computeCrashMatrix,
  };
}
