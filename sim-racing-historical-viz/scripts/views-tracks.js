"use strict";

// Tracks view: pick a circuit, then see every driver's record there — a ranking
// table, record-holder strip, points chart, finish-position spread, and an
// optional per-driver race-by-race drill.
function renderTracksView(dataset) {
  const aggregates = state.trackAggregateCache || buildTrackAggregates(dataset);
  const trackList = getTrackList(aggregates);

  if (!trackList.length) {
    refs["tracks-filters"].innerHTML = "";
    refs["tracks-content"].innerHTML = renderEmptyStateMarkup("No track results are available yet.");
    return;
  }

  const area = refs["tracks-content"];

  // Default to the busiest track so the table lands populated.
  const available = trackList.map((t) => t.track);
  if (!available.includes(state.tracks.selectedTrack)) {
    state.tracks.selectedTrack = trackList.slice().sort((a, b) => b.starts - a.starts)[0].track;
    state.tracks.drillDriver = "";
    syncHistory({ replace: true });
  }

  const selected = state.tracks.selectedTrack;
  const meta = trackList.find((t) => t.track === selected);
  const rows = getTrackLeaderboard(aggregates, selected);

  // Drill only makes sense for a driver who actually raced here.
  const drillEntry = state.tracks.drillDriver
    ? rows.find((r) => r.driver === state.tracks.drillDriver)
    : null;
  if (state.tracks.drillDriver && !drillEntry) state.tracks.drillDriver = "";

  refs["tracks-filters"].innerHTML = `
    <label class="inline-control" for="track-select">
      <span>Track</span>
      <select class="select" id="track-select">
        ${trackList.map((t) => `
          <option value="${escapeHtml(t.track)}"${t.track === selected ? " selected" : ""}>${escapeHtml(t.track)} (${t.seasonCount})</option>
        `).join("")}
      </select>
    </label>
  `;

  area.innerHTML = `
    ${renderTrackSummary(meta, rows)}
    <div id="track-drill">${drillEntry ? renderDriverDrill(dataset, selected, drillEntry) : ""}</div>
    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Driver Performance &mdash; ${escapeHtml(selected)}</h3>
        <span class="badge">${rows.length} drivers</span>
      </div>
      <div class="card__body">
        <p class="card__subtitle mb-half">Career record at this track across all seasons. Click a driver for their race-by-race history, or a column to re-sort.</p>
        <div id="track-leaderboard-table"></div>
      </div>
    </div>
    ${renderFinishDistribution(dataset, selected, rows)}
    ${renderTrackPointsChart(selected, rows)}
  `;

  renderSortableTable("track-leaderboard-table", buildTrackColumns(), rows);

  document.getElementById("track-select")?.addEventListener("change", (e) => {
    state.tracks.selectedTrack = e.target.value;
    state.tracks.drillDriver = "";
    syncHistory();
    renderTracksView(dataset);
  });

  // Clicking a driver name opens the track-scoped drill (not the full profile).
  // Bound to the table container, which is rebuilt fresh each render.
  document.getElementById("track-leaderboard-table")?.addEventListener("click", (e) => {
    const link = e.target.closest("[data-driver]");
    if (!link) return;
    e.preventDefault();
    state.tracks.drillDriver = link.dataset.driver === state.tracks.drillDriver ? "" : link.dataset.driver;
    syncHistory();
    renderTracksView(dataset);
  });

  bindDrillEvents(dataset);
}

function bindDrillEvents(dataset) {
  const drill = document.getElementById("track-drill");
  if (!drill) return;
  drill.addEventListener("click", (e) => {
    const close = e.target.closest("[data-drill-close]");
    if (close) {
      state.tracks.drillDriver = "";
      syncHistory();
      renderTracksView(dataset);
      return;
    }
    const profile = e.target.closest("[data-drill-profile]");
    if (profile) {
      e.preventDefault();
      state.activeTab = "drivers";
      state.filters.profileDriver = profile.dataset.drillProfile;
      syncHistory();
      render();
    }
  });
}

// Track-scoped driver drill: this driver's record and race-by-race history at
// the selected circuit, with a finish sparkline. Opened from the leaderboard.
function renderDriverDrill(dataset, trackName, entry) {
  const races = getDriverTrackRaces(dataset, entry.driver, trackName);
  const finishes = races.filter((r) => r.didStart).map((r) => r.position);
  const bestFinish = finishes.length ? Math.min(...finishes) : null;
  const nonStarts = races.length - finishes.length;

  const raceColumns = [
    { key: "seasonId", label: "Season", strong: true },
    { key: "venueNumber", label: "Round", className: "num-col", render: (r) => formatInteger(r.venueNumber) },
    { key: "raceNumber", label: "Race", className: "num-col", render: (r) => `R${formatInteger(r.raceNumber)}` },
    { key: "rawPosition", label: "Finish", render: (r) => r.rawPosition ? escapeHtml(r.rawPosition) : "&mdash;", rawHtml: true },
    { key: "points", label: "Pts", className: "num-col", render: (r) => formatInteger(r.points) },
  ];

  return `
    <div class="card mb-1 drill-card">
      <div class="card__header">
        <div>
          <h3 class="card__title">${escapeHtml(entry.driver)} <span class="drill-card__at">at ${escapeHtml(trackName)}</span></h3>
          <div class="card__subtitle">${formatInteger(races.length)} race${races.length === 1 ? "" : "s"} across ${(entry.seasonIds || []).length} season${(entry.seasonIds || []).length === 1 ? "" : "s"}</div>
        </div>
        <div class="drill-card__actions">
          <a class="drill-link" href="#" data-drill-profile="${escapeHtml(entry.driver)}">Full profile &rarr;</a>
          <button class="drill-close" type="button" data-drill-close aria-label="Close">&times;</button>
        </div>
      </div>
      <div class="card__body">
        <div class="stat-grid mb-half">
          ${buildStatItem(formatInteger(entry.starts), "Starts")}
          ${buildStatItem(formatInteger(entry.wins), "Wins")}
          ${buildStatItem(formatInteger(entry.podiums), "Podiums")}
          ${buildStatItem(formatInteger(entry.poles), "Poles")}
          ${buildStatItem(formatInteger(entry.fastestLaps), "Fastest Laps")}
          ${buildStatItem(bestFinish == null ? "n/a" : `P${bestFinish}`, "Best Finish")}
          ${buildStatItem(entry.avgFinish == null ? "n/a" : formatDecimal(entry.avgFinish, 2), "Avg Finish")}
          ${buildStatItem(formatInteger(entry.totalPoints), "Points")}
        </div>
        ${renderDrillSparkline(races)}
        <div class="mt-half">${renderDataTable(raceColumns, races)}</div>
        ${nonStarts ? `<p class="card__subtitle mt-half">${formatInteger(nonStarts)} DNS/DNF not counted in averages.</p>` : ""}
      </div>
    </div>
  `;
}

// Small chronological sparkline of finishing positions (P1 at the top). DNS/DNF
// show as hollow markers pinned to the baseline.
function renderDrillSparkline(races) {
  if (races.length < 2) return "";
  const width = 640, height = 84, padX = 26, padTop = 12, padBottom = 20;
  const iw = width - padX * 2;
  const ih = height - padTop - padBottom;
  const finishes = races.filter((r) => r.didStart).map((r) => r.position);
  const maxPos = Math.max(3, ...finishes);
  const sx = (i) => races.length === 1 ? padX + iw / 2 : padX + (i / (races.length - 1)) * iw;
  const sy = (pos) => padTop + ((pos - 1) / (maxPos - 1)) * ih;

  const gridlines = [1, Math.round((maxPos + 1) / 2), maxPos].map((p) =>
    `<line x1="${padX}" y1="${sy(p)}" x2="${width - padX}" y2="${sy(p)}" stroke="rgba(0,0,0,0.06)"/>` +
    `<text x="${padX - 6}" y="${sy(p) + 3}" text-anchor="end" font-size="9" fill="var(--text-muted)">P${p}</text>`
  ).join("");

  const linePts = races.map((r, i) => r.didStart ? `${sx(i)},${sy(r.position)}` : null).filter(Boolean).join(" ");
  const line = linePts ? `<polyline points="${linePts}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>` : "";

  const dots = races.map((r, i) => {
    if (!r.didStart) {
      return `<circle cx="${sx(i)}" cy="${height - padBottom + 6}" r="3" fill="none" stroke="var(--danger,#dc3545)" stroke-width="1.5"><title>${escapeHtml(r.seasonId)} R${r.raceNumber}: ${escapeHtml(r.rawPosition || "DNS")}</title></circle>`;
    }
    return `<circle cx="${sx(i)}" cy="${sy(r.position)}" r="3.5" fill="var(--accent)" stroke="#fff" stroke-width="1"><title>${escapeHtml(r.seasonId)} R${r.raceNumber}: P${r.position} (${formatInteger(r.points)} pts)</title></circle>`;
  }).join("");

  return `
    <div class="drill-spark">
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Finishing positions over time" preserveAspectRatio="xMidYMid meet">
        ${gridlines}${line}${dots}
      </svg>
    </div>
  `;
}

function buildTrackColumns() {
  return [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col",
      render: (r) => `<span class="driver-link" data-driver="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>`, rawHtml: true },
    { key: "starts", label: "Starts", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "podiums", label: "Podiums", className: "num-col" },
    { key: "top5s", label: "Top 5", className: "num-col" },
    { key: "poles", label: "Poles", className: "num-col" },
    { key: "fastestLaps", label: "FL", className: "num-col" },
    { key: "avgFinish", label: "Avg Finish", className: "num-col",
      render: (r) => r.avgFinish == null ? "n/a" : formatDecimal(r.avgFinish, 2),
      sortValue: (r) => r.avgFinish == null ? Infinity : r.avgFinish },
    { key: "totalPoints", label: "Points", className: "num-col" },
  ];
}

// Compact record-holder strip above the table. Avg-finish leader needs a start
// floor so a single lucky drive can't claim it.
function renderTrackSummary(meta, rows) {
  if (!rows.length) return "";

  const leaderBy = (getter, order) => {
    const pool = rows.filter((r) => getter(r) != null);
    if (!pool.length) return null;
    return pool.slice().sort((a, b) => order === "asc" ? getter(a) - getter(b) : getter(b) - getter(a))[0];
  };

  const mostWins = leaderBy((r) => r.wins, "desc");
  const mostPoles = leaderBy((r) => r.poles, "desc");
  const mostPoints = leaderBy((r) => r.totalPoints, "desc");
  const eligibleAvg = rows.filter((r) => r.starts >= 2);
  const bestAvg = (eligibleAvg.length ? eligibleAvg : rows)
    .slice()
    .sort((a, b) => (a.avgFinish ?? Infinity) - (b.avgFinish ?? Infinity))[0];

  const holder = (entry, value) =>
    entry && entry.wins != null ? `${escapeHtml(entry.driver)} <span class="track-holder__value">${value}</span>` : "&mdash;";

  return `
    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">${escapeHtml(meta.track)}</h3>
        <span class="badge">${meta.seasonCount} season${meta.seasonCount === 1 ? "" : "s"}</span>
      </div>
      <div class="card__body">
        <div class="stat-grid mb-half">
          ${buildStatItem(formatInteger(meta.seasonCount), "Times Raced")}
          ${buildStatItem(formatInteger(rows.length), "Drivers")}
          ${buildStatItem(formatInteger(meta.starts), "Total Starts")}
          ${buildStatItem(formatInteger(rows.reduce((s, r) => s + r.wins, 0)), "Races Won")}
        </div>
        <div class="track-holders">
          <div class="track-holder"><span class="track-holder__label">Most wins</span><span class="track-holder__name">${holder(mostWins, mostWins ? mostWins.wins : "")}</span></div>
          <div class="track-holder"><span class="track-holder__label">Most poles</span><span class="track-holder__name">${holder(mostPoles, mostPoles ? mostPoles.poles : "")}</span></div>
          <div class="track-holder"><span class="track-holder__label">Best avg finish</span><span class="track-holder__name">${bestAvg && bestAvg.avgFinish != null ? `${escapeHtml(bestAvg.driver)} <span class="track-holder__value">${formatDecimal(bestAvg.avgFinish, 2)}</span>` : "&mdash;"}</span></div>
          <div class="track-holder"><span class="track-holder__label">Most points</span><span class="track-holder__name">${holder(mostPoints, mostPoints ? mostPoints.totalPoints : "")}</span></div>
        </div>
      </div>
    </div>
  `;
}

// Horizontal bar chart of total points at the track — visualizes the table's
// headline column so the top scorers read at a glance.
function renderTrackPointsChart(trackName, rows) {
  const ranked = rows.filter((r) => r.totalPoints > 0)
    .slice()
    .sort((a, b) => b.totalPoints - a.totalPoints)
    .slice(0, 12);
  if (ranked.length < 2) return "";

  const max = ranked[0].totalPoints || 1;
  const bars = ranked.map((r, i) => {
    const pct = Math.max(2, (r.totalPoints / max) * 100);
    const color = seriesColor(i, ranked.length);
    return `
      <div class="bar-row">
        <div class="bar-row__label"><span>${escapeHtml(r.driver)}</span><span>${formatInteger(r.totalPoints)}</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:linear-gradient(90deg,${color},${hexToAlpha(color.startsWith("#") ? color : "#0b756f", 0.45)})"></div></div>
      </div>
    `;
  }).join("");

  return `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Points Scored &mdash; ${escapeHtml(trackName)}</h3>
        <span class="badge">Top ${ranked.length}</span>
      </div>
      <div class="card__body">${bars}</div>
    </div>
  `;
}

// Finish-position distribution: one strip per driver, each race a dot along a
// shared position axis. A tight cluster = metronomic; a wide spread = volatile.
// The vertical tick marks the driver's average. Regulars only (>= 3 starts).
function renderFinishDistribution(dataset, trackName, rows) {
  const selected = rows
    .filter((r) => r.starts >= 3 && r.avgFinish != null)
    .slice()
    .sort((a, b) => a.avgFinish - b.avgFinish)
    .slice(0, 10);
  if (selected.length < 2) return "";

  const raceResults = getTrackRaceResults(dataset, trackName);
  const finishesByDriver = {};
  raceResults.forEach((r) => {
    if (!r.didStart) return;
    (finishesByDriver[r.driver] = finishesByDriver[r.driver] || []).push(r);
  });

  const maxPos = Math.min(24, Math.max(5, ...selected.flatMap((d) =>
    (finishesByDriver[d.driver] || []).map((r) => r.position))));

  const rowH = 34, padTop = 10, axisH = 26, nameCol = 104, rightPad = 52, width = 840;
  const plotLeft = nameCol, plotRight = width - rightPad;
  const plotW = plotRight - plotLeft;
  const height = padTop + selected.length * rowH + axisH;
  const sx = (pos) => maxPos === 1 ? plotLeft + plotW / 2 : plotLeft + ((pos - 1) / (maxPos - 1)) * plotW;

  const ticks = [];
  for (let p = 1; p <= maxPos; p += (maxPos > 12 ? 5 : maxPos > 6 ? 2 : 1)) ticks.push(p);
  if (ticks[ticks.length - 1] !== maxPos) ticks.push(maxPos);

  const gridlines = ticks.map((p) =>
    `<line x1="${sx(p)}" y1="${padTop}" x2="${sx(p)}" y2="${padTop + selected.length * rowH}" stroke="rgba(0,0,0,0.05)"/>` +
    `<text x="${sx(p)}" y="${height - 8}" text-anchor="middle" font-size="10" fill="var(--text-muted)">P${p}</text>`
  ).join("");

  const bands = selected.map((driver, i) => {
    const yTop = padTop + i * rowH;
    const yCenter = yTop + rowH / 2;
    const color = seriesColor(i, selected.length);
    const bg = i % 2 ? `<rect x="${plotLeft}" y="${yTop}" width="${plotW}" height="${rowH}" fill="rgba(0,0,0,0.02)"/>` : "";

    // Spread same-position dots vertically so ties stay countable.
    const byPos = {};
    (finishesByDriver[driver.driver] || []).forEach((r) => {
      (byPos[r.position] = byPos[r.position] || []).push(r);
    });
    const maxStack = Math.max(1, ...Object.values(byPos).map((a) => a.length));
    const spacing = Math.min(6, (rowH - 12) / maxStack);
    const dots = Object.entries(byPos).flatMap(([pos, list]) =>
      list.map((r, j) => {
        const offset = (j - (list.length - 1) / 2) * spacing;
        return `<circle cx="${sx(Number(pos))}" cy="${yCenter + offset}" r="3" fill="${color}" fill-opacity="0.78"><title>${escapeHtml(driver.driver)} — ${escapeHtml(r.seasonId)} R${r.raceNumber}: P${r.position}</title></circle>`;
      })
    ).join("");

    const meanX = sx(Math.min(maxPos, driver.avgFinish));
    const meanTick = `<line x1="${meanX}" y1="${yCenter - 12}" x2="${meanX}" y2="${yCenter + 12}" stroke="${color}" stroke-width="2"/>`;

    return `
      ${bg}
      <text x="${nameCol - 10}" y="${yCenter + 4}" text-anchor="end" font-size="12" font-weight="600" fill="var(--text)">${escapeHtml(truncateLabel(driver.driver, 12))}</text>
      ${dots}${meanTick}
      <text x="${plotRight + 8}" y="${yCenter + 4}" font-size="11" fill="var(--text-secondary)" font-variant-numeric="tabular-nums">${formatDecimal(driver.avgFinish, 1)}</text>
    `;
  }).join("");

  return `
    <div class="card mb-1">
      <div class="card__header">
        <div>
          <h3 class="card__title">Finish-Position Spread &mdash; ${escapeHtml(trackName)}</h3>
          <div class="card__subtitle">Each dot is one race finish &middot; vertical tick = average &middot; tighter = more consistent &middot; regulars (3+ starts)</div>
        </div>
      </div>
      <div class="card__body">
        <div class="dist-scroll">
          <svg class="dist-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="Finish position distribution by driver" preserveAspectRatio="xMidYMid meet">
            ${gridlines}${bands}
          </svg>
        </div>
      </div>
    </div>
  `;
}
