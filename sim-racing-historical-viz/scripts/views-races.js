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

const RACE_VIEWS = [
  { id: "battle", label: "Position Battle", scope: "race" },
  { id: "laptimes", label: "Lap Times", scope: "race" },
  { id: "fastlap", label: "Fastest Laps", scope: "race" },
  { id: "pace", label: "Pace & Consistency", scope: "race" },
  { id: "overtakes", label: "Overtakes", scope: "race" },
  { id: "qualifying", label: "Qualifying Gaps", scope: "event" },
  { id: "h2h", label: "Head-to-Head", scope: "season" },
];

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
  const events = [...(seasonData.events || [])].sort((a, b) => (a.venueOrder || 0) - (b.venueOrder || 0));
  for (const ev of events) {
    const raceIds = Object.keys(ev.races || {}).sort((a, b) => Number(a) - Number(b));
    for (const rid of raceIds) {
      out.push({ eventId: ev.eventId, venue: ev.venue, venueOrder: ev.venueOrder, date: ev.date, raceId: rid, race: ev.races[rid], event: ev });
    }
  }
  return out;
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
          // Re-render filters now that event/race defaults are settled.
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

  // Immediate feedback while the (possibly remote) fetch is in flight.
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

  let eventSelect = "";
  let raceSelect = "";
  if (seasonData) {
    const races = collectSeasonRaces(seasonData);
    const eventsSeen = [];
    const eventOpts = [];
    for (const r of races) {
      if (eventsSeen.includes(r.eventId)) continue;
      eventsSeen.push(r.eventId);
      eventOpts.push(`<option value="${escapeHtml(r.eventId)}" ${r.eventId === state.races.eventId ? "selected" : ""}>${r.venueOrder}. ${escapeHtml(r.venue)}</option>`);
    }
    eventSelect = `<label class="inline-control"><span>Event</span><select class="select" id="race-event-select">${eventOpts.join("")}</select></label>`;

    const view = RACE_VIEWS.find((v) => v.id === state.races.view) || RACE_VIEWS[0];
    if (view.scope === "race") {
      const inEvent = races.filter((r) => r.eventId === state.races.eventId);
      const raceOpts = inEvent
        .map((r) => `<option value="${escapeHtml(r.raceId)}" ${r.raceId === state.races.raceId ? "selected" : ""}>Race ${escapeHtml(r.raceId)}</option>`)
        .join("");
      raceSelect = `<label class="inline-control"><span>Race</span><select class="select" id="race-race-select">${raceOpts}</select></label>`;
    }
  }

  filters.innerHTML = `
    <label class="inline-control"><span>Season</span><select class="select" id="race-season-select">${seasonOpts}</select></label>
    ${eventSelect}
    ${raceSelect}
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
  filters.querySelector("#race-race-select")?.addEventListener("change", (e) => {
    state.races.raceId = e.target.value;
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
    body = renderH2HView(seasonData);
  } else if (view.scope === "event") {
    body = renderQualifyingView(seasonData);
  } else {
    const race = currentRace(seasonData);
    body = race ? renderRaceScopedView(view.id, seasonData, race) : renderEmptyStateMarkup("No race selected.");
  }

  content.innerHTML = `<div class="subtab-nav">${subtabs}</div>${body}`;

  content.querySelector(".subtab-nav")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-race-view]");
    if (!btn) return;
    state.races.view = btn.dataset.raceView;
    renderRacesView();
  });
  bindRaceContentControls(seasonData);
}

function renderRaceScopedView(viewId, seasonData, race) {
  switch (viewId) {
    case "battle": return renderBattleView(seasonData, race);
    case "laptimes": return renderLapTimesView(seasonData, race);
    case "fastlap": return renderFastLapView(seasonData, race);
    case "pace": return renderPaceView(seasonData, race);
    case "overtakes": return renderOvertakesView(seasonData, race);
    default: return renderEmptyStateMarkup("Unknown view.");
  }
}

function raceHeaderBadges(race) {
  const conf = race.gridConfidence || "unknown";
  const cls = conf === "high" ? "" : conf === "medium" ? "badge--muted" : "badge--danger";
  return `<span class="badge ${cls}">grid: ${escapeHtml(conf)}</span>`;
}

// ---------------------------------------------------------------------------
// 1. Position Battle
// ---------------------------------------------------------------------------

function renderBattleView(seasonData, race) {
  const battle = buildBattleSeries(race);
  if (!battle.series.length) return renderEmptyStateMarkup("No lap-by-lap position data for this race.");
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Position Battle</h3>
        ${raceHeaderBadges(race)}
      </div>
      <div class="card__body">
        ${buildBattleChartHtml(battle)}
        <p class="subtle-text mt-1">Lap 0 is the starting grid${race.gridConfidence !== "high" ? " (inferred — treat the opening lap with caution)" : ""}. Lower is better.</p>
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
  const height = Math.max(320, pad.top + pad.bottom + n * rowH);
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
// 2. Lap Times (+ sectors)
// ---------------------------------------------------------------------------

function renderLapTimesView(seasonData, race) {
  const order = (race.result || []).map((r) => r.driver).filter(Boolean);
  if (!order.length) return renderEmptyStateMarkup("No lap data for this race.");
  if (!order.includes(state.races.lapDriver)) state.races.lapDriver = order[0];

  const traces = buildLapTraces(race, order);
  const driverOpts = order
    .map((d) => `<option value="${escapeHtml(d)}" ${d === state.races.lapDriver ? "selected" : ""}>${escapeHtml(d)}</option>`)
    .join("");

  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Lap Times</h3>
        <span class="badge">${order.length} drivers</span>
      </div>
      <div class="card__body">
        ${buildLapTraceChartHtml(traces)}
        <p class="subtle-text mt-1">Lap 1 (standing start) and pit/off-track outliers are clipped to the top of the band so the racing pace stays readable.</p>
      </div>
    </div>
    <div class="card mt-1">
      <div class="card__header">
        <h3 class="card__title">Sector Breakdown</h3>
        <label class="inline-control"><span>Driver</span><select class="select" id="race-lap-driver">${driverOpts}</select></label>
      </div>
      <div class="card__body">
        ${buildSectorTableHtml(race, state.races.lapDriver)}
      </div>
    </div>`;
}

function buildLapTraces(race, order) {
  const laps = race.laps || {};
  const total = order.length;
  const all = [];
  const series = order.map((driver, i) => {
    const arr = (laps[driver] || []).map((ms, idx) => ({ lap: idx + 1, ms }));
    for (const p of arr) if (isValidLap(p.ms) && p.lap > 1) all.push(p.ms);
    return { driver, color: seriesColor(i, total), laps: arr };
  });
  let maxLaps = 0;
  for (const s of series) maxLaps = Math.max(maxLaps, s.laps.length);
  const domain = lapTimeDomain(all);
  return { series, maxLaps, domain };
}

function buildLapTraceChartHtml(traces) {
  const width = 980;
  const pad = { top: 20, right: 132, bottom: 44, left: 68 };
  const height = 420;
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;
  const xDen = Math.max(traces.maxLaps - 1, 1);
  const { lo, hi } = traces.domain;
  const span = Math.max(hi - lo, 1);
  const scaleX = (lap) => pad.left + ((lap - 1) / xDen) * iw;
  const scaleY = (ms) => {
    const clamped = Math.max(lo, Math.min(hi, ms));
    return pad.top + ((clamped - lo) / span) * ih;
  };

  const yTicks = 4;
  const yGrid = Array.from({ length: yTicks + 1 }, (_, i) => {
    const ms = lo + (span * i) / yTicks;
    const y = pad.top + (ih * i) / yTicks;
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(0,0,0,0.06)"/><text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" font-size="10" fill="#888">${fmtLap(ms)}</text>`;
  }).join("");

  const xTicks = laneTicks(traces.maxLaps).filter((l) => l >= 1);
  const xLabels = xTicks.map((lap) => `<text x="${scaleX(lap)}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#888">L${lap}</text>`).join("");

  const endpoints = [];
  const seriesSvg = traces.series.map((s) => {
    const pts = s.laps.filter((p) => isValidLap(p.ms)).map((p) => ({ x: scaleX(p.lap), y: scaleY(p.ms), p }));
    if (!pts.length) return "";
    const last = pts[pts.length - 1];
    endpoints.push({ driver: s.driver, color: s.color, x: last.x, y: last.y });
    return `<polyline fill="none" stroke="${s.color}" stroke-width="1.75" opacity="0.85" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}"/>` +
      pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="2" fill="${s.color}"><title>${escapeHtml(s.driver)} | Lap ${p.p.lap} | ${fmtLap(p.p.ms)}</title></circle>`).join("");
  }).join("");

  const labels = buildEndpointLabels(endpoints, width, height, pad);

  return `
    <div class="chart-container">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Lap time traces">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fafafa"/>
        ${yGrid}
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
        ${seriesSvg}${labels}${xLabels}
      </svg>
    </div>`;
}

function buildSectorTableHtml(race, driver) {
  const laps = (race.laps || {})[driver] || [];
  const sectors = (race.sectors || {})[driver] || [];
  if (!laps.length) return renderEmptyStateMarkup("No sector data for this driver.");

  // Column-best highlighting: fastest S1/S2/S3 and lap across valid laps.
  const bestS = [Infinity, Infinity, Infinity];
  let bestLap = Infinity;
  laps.forEach((ms, i) => {
    if (isValidLap(ms)) bestLap = Math.min(bestLap, ms);
    (sectors[i] || []).forEach((sms, si) => { if (sms > 0) bestS[si] = Math.min(bestS[si], sms); });
  });

  const rows = laps.map((ms, i) => {
    const sec = sectors[i] || [];
    const markBest = (val, best) => (val === best && val > 0 ? `<strong style="color:var(--accent)">${fmtLap(val)}</strong>` : fmtLap(val));
    return {
      lap: i + 1,
      s1: markBest(sec[0], bestS[0]),
      s2: markBest(sec[1], bestS[1]),
      s3: markBest(sec[2], bestS[2]),
      total: markBest(ms, bestLap),
    };
  });

  const columns = [
    { key: "lap", label: "Lap", strong: true, widthRem: 4 },
    { key: "s1", label: "Sector 1", rawHtml: true },
    { key: "s2", label: "Sector 2", rawHtml: true },
    { key: "s3", label: "Sector 3", rawHtml: true },
    { key: "total", label: "Lap", rawHtml: true },
  ];
  return renderDataTable(columns, rows, { compact: true });
}

// ---------------------------------------------------------------------------
// 3. Fastest Laps
// ---------------------------------------------------------------------------

function renderFastLapView(seasonData, race) {
  const rows = computeFastestLaps(race);
  if (!rows.length) return renderEmptyStateMarkup("No lap data for this race.");
  const bars = buildGapBarsHtml(rows, {
    labelFn: (r) => r.driver,
    valueFn: (r) => r.bestMs,
    barFn: (r) => r.gapMs,
    valueText: (r) => fmtLap(r.bestMs),
    gapText: (r) => (r.gapMs === 0 ? "fastest" : `+${(r.gapMs / 1000).toFixed(3)}`),
  });
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Fastest Lap Comparison</h3>
        <span class="badge">${rows.length} drivers</span>
      </div>
      <div class="card__body">${bars}</div>
    </div>`;
}

function computeFastestLaps(race) {
  const result = race.result || [];
  const laps = race.laps || {};
  const rows = [];
  for (const r of result) {
    if (!r.driver) continue;
    let best = r.bestLapMs;
    if (!isValidLap(best)) {
      best = Math.min(...(laps[r.driver] || []).filter(isValidLap));
    }
    if (isValidLap(best)) rows.push({ driver: r.driver, bestMs: best });
  }
  rows.sort((a, b) => a.bestMs - b.bestMs);
  const pole = rows.length ? rows[0].bestMs : 0;
  for (const r of rows) r.gapMs = r.bestMs - pole;
  return rows;
}

// ---------------------------------------------------------------------------
// 4. Pace & Consistency
// ---------------------------------------------------------------------------

function renderPaceView(seasonData, race) {
  const rows = computePaceRows(race);
  if (!rows.length) return renderEmptyStateMarkup("No pace data for this race.");

  const columns = [
    { key: "rank", label: "#", widthRem: 3 },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 9 },
    { key: "avgText", label: "Avg pace", render: (r) => fmtLap(r.avgMs) },
    { key: "bestText", label: "Best", render: (r) => fmtLap(r.bestMs) },
    { key: "worstText", label: "Slowest", render: (r) => fmtLap(r.worstMs) },
    { key: "spreadText", label: "Best→Slowest", render: (r) => `${(r.spreadMs / 1000).toFixed(3)}s` },
    { key: "gapText", label: "Gap to best avg", render: (r) => (r.gapMs === 0 ? "—" : `+${(r.gapMs / 1000).toFixed(3)}s`) },
    { key: "lapsUsed", label: "Laps", widthRem: 4 },
  ];
  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Pace &amp; Consistency</h3>
        <span class="badge">${rows.length} drivers</span>
      </div>
      <div class="card__body">
        ${buildConsistencyBarsHtml(rows)}
        <div class="mt-1">${renderDataTable(columns, rows, { compact: true })}</div>
        <p class="subtle-text mt-1">Ranked by average clean-lap pace. "Best→Slowest" is the spread across a driver's valid laps — smaller is more consistent.</p>
      </div>
    </div>`;
}

function computePaceRows(race) {
  const pace = race.pace || {};
  const laps = race.laps || {};
  const result = race.result || [];
  const rows = [];
  for (const r of result) {
    const d = r.driver;
    if (!d) continue;
    const valid = (laps[d] || []).filter(isValidLap);
    const p = pace[d] || {};
    const avg = p.avgMs != null ? p.avgMs : (valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null);
    const best = p.bestMs != null ? p.bestMs : (valid.length ? Math.min(...valid) : null);
    if (avg == null || best == null) continue;
    const worst = valid.length ? Math.max(...valid) : best;
    rows.push({ driver: d, avgMs: Math.round(avg), bestMs: best, worstMs: worst, spreadMs: worst - best, lapsUsed: p.lapsUsed != null ? p.lapsUsed : valid.length });
  }
  rows.sort((a, b) => a.avgMs - b.avgMs);
  const lead = rows.length ? rows[0].avgMs : 0;
  rows.forEach((r, i) => { r.rank = i + 1; r.gapMs = r.avgMs - lead; });
  return rows;
}

function buildConsistencyBarsHtml(rows) {
  const maxSpread = Math.max(...rows.map((r) => r.spreadMs), 1);
  const bars = rows.map((r) => {
    const pct = Math.round((r.spreadMs / maxSpread) * 100);
    return `
      <div class="hbar-row">
        <span class="hbar-label" title="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${pct}%;background:${seriesColor(r.rank - 1, rows.length)}"></span></span>
        <span class="hbar-value">${(r.spreadMs / 1000).toFixed(3)}s</span>
      </div>`;
  }).join("");
  return `<div class="hbar-chart"><div class="subtle-text" style="margin-bottom:0.4rem">Lap-time spread (consistency) — shorter is steadier</div>${bars}</div>`;
}

// ---------------------------------------------------------------------------
// 5. Overtakes
// ---------------------------------------------------------------------------

function renderOvertakesView(seasonData, race) {
  const rows = computeOvertakeTallies(race);
  if (!rows.length) return renderEmptyStateMarkup("No overtake data for this race.");
  const maxVal = Math.max(...rows.map((r) => Math.max(r.made, r.suffered)), 1);
  const bars = rows.map((r, i) => `
    <div class="ot-row">
      <span class="hbar-label" title="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>
      <span class="ot-bars">
        <span class="ot-side ot-side--made"><span class="ot-fill" style="width:${(r.made / maxVal) * 100}%"></span><span class="ot-num">${r.made}</span></span>
        <span class="ot-side ot-side--suffered"><span class="ot-fill" style="width:${(r.suffered / maxVal) * 100}%"></span><span class="ot-num">${r.suffered}</span></span>
      </span>
    </div>`).join("");

  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Overtakes</h3>
        <span class="badge">${(race.overtakes || []).length} total passes</span>
      </div>
      <div class="card__body">
        <div class="ot-legend"><span><span class="ot-key ot-key--made"></span>Passes made</span><span><span class="ot-key ot-key--suffered"></span>Passes suffered</span></div>
        <div class="ot-chart">${bars}</div>
        <p class="subtle-text mt-1">A "pass" is any on-track position swap, so lapped traffic is included — read these as activity, not clean overtakes.</p>
      </div>
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
// 6. Qualifying gaps
// ---------------------------------------------------------------------------

function renderQualifyingView(seasonData) {
  const ev = findEvent(seasonData, state.races.eventId);
  if (!ev) return renderEmptyStateMarkup("No event selected.");
  const qualIds = Object.keys(ev.qualifying || {});
  if (!qualIds.length) return renderEmptyStateMarkup("No qualifying sessions recorded for this event.");
  if (!qualIds.includes(state.races.qualId)) state.races.qualId = qualIds[0];

  const rows = computeQualGaps(ev.qualifying[state.races.qualId]);
  const sessionButtons = qualIds
    .map((q) => `<button class="subtab-button ${q === state.races.qualId ? "is-active" : ""}" type="button" data-qual-id="${escapeHtml(q)}">${escapeHtml(q.toUpperCase())}</button>`)
    .join("");

  const bars = rows.length ? buildGapBarsHtml(rows, {
    labelFn: (r) => r.driver,
    valueFn: (r) => r.bestMs,
    barFn: (r) => r.gapMs,
    valueText: (r) => fmtLap(r.bestMs),
    gapText: (r) => (r.gapMs === 0 ? "POLE" : `+${(r.gapMs / 1000).toFixed(3)}`),
  }) : renderEmptyStateMarkup("No timed laps in this session.");

  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Qualifying Gaps — ${escapeHtml(ev.venue)}</h3>
        <span class="badge">${rows.length} drivers</span>
      </div>
      <div class="card__body">
        ${qualIds.length > 1 ? `<div class="subtab-nav" id="qual-session-nav">${sessionButtons}</div>` : ""}
        ${bars}
        <p class="subtle-text mt-1">Gap to pole on each driver's best qualifying lap.</p>
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
    const opts = drivers
      .map((d) => `<option value="${escapeHtml(d)}" ${d === state.races.h2h[slot] ? "selected" : ""}>${escapeHtml(d)}</option>`)
      .join("");
    return `<label class="inline-control"><span>Driver ${slot === 0 ? "A" : "B"}</span><select class="select" data-h2h-slot="${slot}">${opts}</select></label>`;
  }).join("");

  const h2h = computeHeadToHead(seasonData, a, b);
  const colorA = seriesColor(0, 2), colorB = seriesColor(1, 2);

  const summaryCard = (label, va, vb, better) => {
    const aWin = better === "low" ? va < vb : va > vb;
    const bWin = better === "low" ? vb < va : vb > va;
    return `
      <div class="h2h-metric">
        <div class="h2h-metric__label">${escapeHtml(label)}</div>
        <div class="h2h-metric__vals">
          <span class="${aWin ? "is-better" : ""}" style="color:${colorA}">${va}</span>
          <span class="h2h-metric__vs">vs</span>
          <span class="${bWin ? "is-better" : ""}" style="color:${colorB}">${vb}</span>
        </div>
      </div>`;
  };

  const rows = h2h.races.map((r) => ({
    round: `${r.venueOrder}. ${r.venue} R${r.raceId}`,
    a: r.aPos != null ? `P${r.aPos}` : "—",
    b: r.bPos != null ? `P${r.bPos}` : "—",
    ahead: r.aPos != null && r.bPos != null ? (r.aPos < r.bPos ? a : b) : "—",
  }));
  const columns = [
    { key: "round", label: "Race", strong: true, sticky: true, stickyWidthRem: 14, className: "wrap-col" },
    { key: "a", label: escapeHtml(a) },
    { key: "b", label: escapeHtml(b) },
    { key: "ahead", label: "Ahead" },
  ];

  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Head-to-Head</h3>
        <div class="view-filters">${pickers}</div>
      </div>
      <div class="card__body">
        <div class="h2h-grid">
          ${summaryCard("Races together", h2h.together, h2h.together, "eq")}
          ${summaryCard("Finished ahead", h2h.aAhead, h2h.bAhead, "high")}
          ${summaryCard("Avg finish", h2h.aAvgFinish ?? "—", h2h.bAvgFinish ?? "—", "low")}
          ${summaryCard("Wins", h2h.aWins, h2h.bWins, "high")}
          ${summaryCard("Best lap", fmtLap(h2h.aBestLap), fmtLap(h2h.bBestLap), "low")}
          ${summaryCard("Avg race pace", fmtLap(h2h.aAvgPace), fmtLap(h2h.bAvgPace), "low")}
        </div>
        <div class="mt-1">${rows.length ? renderDataTable(columns, rows, { compact: true }) : renderEmptyStateMarkup("These two never raced together this season.")}</div>
      </div>
    </div>`;
}

function computeHeadToHead(seasonData, a, b) {
  const races = collectSeasonRaces(seasonData);
  const out = { races: [], together: 0, aAhead: 0, bAhead: 0, aWins: 0, bWins: 0 };
  const aFin = [], bFin = [], aPace = [], bPace = [];
  let aBest = Infinity, bBest = Infinity;
  for (const rc of races) {
    const posOf = (d) => {
      const row = (rc.race.result || []).find((r) => r.driver === d);
      return row ? row.position : null;
    };
    const aPos = posOf(a), bPos = posOf(b);
    if (aPos == null && bPos == null) continue;
    out.races.push({ venue: rc.venue, venueOrder: rc.venueOrder, raceId: rc.raceId, aPos, bPos });
    if (aPos != null) { aFin.push(aPos); if (aPos === 1) out.aWins += 1; const bl = bestLapOf(rc.race, a); if (isValidLap(bl)) aBest = Math.min(aBest, bl); const ap = avgPaceOf(rc.race, a); if (ap) aPace.push(ap); }
    if (bPos != null) { bFin.push(bPos); if (bPos === 1) out.bWins += 1; const bl = bestLapOf(rc.race, b); if (isValidLap(bl)) bBest = Math.min(bBest, bl); const bp = avgPaceOf(rc.race, b); if (bp) bPace.push(bp); }
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
  return out;
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

// ---------------------------------------------------------------------------
// Shared bar chart + content control binding
// ---------------------------------------------------------------------------

// Horizontal "gap to leader" bar list used by fastest-lap and qualifying views.
function buildGapBarsHtml(rows, opts) {
  const maxGap = Math.max(...rows.map((r) => opts.barFn(r)), 1);
  const bars = rows.map((r, i) => {
    const gap = opts.barFn(r);
    const pct = 8 + (gap / maxGap) * 88; // leader still shows a stub
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

function bindRaceContentControls(seasonData) {
  const content = refs["races-content"];
  if (!content) return;
  content.querySelector("#race-lap-driver")?.addEventListener("change", (e) => {
    state.races.lapDriver = e.target.value;
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

// Format milliseconds as a lap time: "1:34.001" or "58.204".
function fmtLap(ms) {
  if (!isValidLap(ms)) return "—";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec - min * 60;
  if (min > 0) return `${min}:${sec.toFixed(3).padStart(6, "0")}`;
  return sec.toFixed(3);
}

// Robust y-domain for a lap-time chart: clip standing-start and off-track
// outliers so the racing pace fills the band. Uses percentiles of the pool.
function lapTimeDomain(values) {
  const clean = values.filter(isValidLap).slice().sort((a, b) => a - b);
  if (!clean.length) return { lo: 0, hi: 1 };
  const q = (p) => clean[Math.min(clean.length - 1, Math.max(0, Math.floor(p * (clean.length - 1))))];
  const lo = q(0.0);
  const hi = q(0.92);
  const pad = Math.max((hi - lo) * 0.08, 250);
  return { lo: Math.max(0, lo - pad), hi: hi + pad };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    isValidLap, fmtLap, lapTimeDomain,
    raceSeasonKey, sortedRaceSeasonIds, collectSeasonRaces, seasonDriverList,
    buildBattleSeries, laneTicks,
    computeFastestLaps, computePaceRows, computeOvertakeTallies, computeQualGaps,
    computeHeadToHead,
  };
}
