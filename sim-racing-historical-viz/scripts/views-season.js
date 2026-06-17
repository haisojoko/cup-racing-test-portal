"use strict";

function renderSeasonsView(dataset) {
  if (state.filters.detailSeason && dataset.seasonDetails.find((d) => d.seasonId === state.filters.detailSeason)) {
    renderSeasonDetail(dataset);
  } else {
    renderSeasonGrid(dataset);
  }
}

function renderSeasonGrid(dataset) {
  const filters = buildSeasonFilters(dataset);
  refs["seasons-filters"].innerHTML = filters;
  refs["seasons-header"].querySelector(".view-title").textContent = "Seasons";

  const catalog = sortBySeason([...dataset.seasonCatalog]).reverse();
  const filtered = catalog.filter((s) => {
    if (state.filters.era !== "all" && s.eraLabel !== state.filters.era) return false;
    if (state.filters.division !== "all" && s.type !== state.filters.division) return false;
    return true;
  });

  if (!filtered.length) {
    refs["seasons-content"].innerHTML = renderEmptyStateMarkup("No seasons match the current filters.");
    return;
  }

  refs["seasons-content"].innerHTML = `
    <div class="season-grid">
      ${filtered.map((season) => {
        const wdc = season.wdcWinners.length
          ? season.wdcWinners.map((w) => w.label ? `${w.name} (${w.label})` : w.name).join(", ")
          : "TBD";
        const typeClass = season.type.toLowerCase().includes("formula") ? "formula" : "sports";
        return `
          <button class="season-card" type="button" data-season-id="${escapeHtml(season.seasonId)}">
            <div class="season-card__top">
              <span class="season-card__id">${escapeHtml(season.seasonId)}</span>
              <span class="season-card__type season-card__type--${typeClass}">${escapeHtml(season.type)}</span>
            </div>
            <div class="season-card__car">${escapeHtml(season.car)}</div>
            <div class="season-card__winners">
              <span><strong>WDC:</strong> ${escapeHtml(wdc)}</span>
              <span><strong>WCC:</strong> ${escapeHtml(season.wccTeam || "TBD")}</span>
            </div>
          </button>
        `;
      }).join("")}
    </div>
  `;

  refs["seasons-content"].addEventListener("click", handleSeasonGridClick);
  bindSeasonFilterEvents(dataset);
}

function handleSeasonGridClick(event) {
  const card = event.target.closest("button[data-season-id]");
  if (!card) return;
  state.filters.detailSeason = card.dataset.seasonId;
  syncHistory();
  renderSeasonsView(state.dataset);
}

function buildSeasonFilters(dataset) {
  const eras = uniqueList(dataset.seasonCatalog.map((s) => s.eraLabel)).filter(Boolean);
  const divisions = uniqueList(dataset.seasonCatalog.map((s) => s.type)).filter(Boolean);

  return `
    <select class="select" id="season-era-filter">
      <option value="all">All eras</option>
      ${eras.map((e) => `<option value="${escapeHtml(e)}"${state.filters.era === e ? " selected" : ""}>${escapeHtml(e)}</option>`).join("")}
    </select>
    <select class="select" id="season-division-filter">
      <option value="all">All types</option>
      ${divisions.map((d) => `<option value="${escapeHtml(d)}"${state.filters.division === d ? " selected" : ""}>${escapeHtml(d)}</option>`).join("")}
    </select>
  `;
}

function bindSeasonFilterEvents(dataset) {
  const eraSelect = document.getElementById("season-era-filter");
  const divSelect = document.getElementById("season-division-filter");
  if (eraSelect) {
    eraSelect.addEventListener("change", (e) => {
      state.filters.era = e.target.value;
      renderSeasonGrid(dataset);
    });
  }
  if (divSelect) {
    divSelect.addEventListener("change", (e) => {
      state.filters.division = e.target.value;
      renderSeasonGrid(dataset);
    });
  }
}

function renderSeasonDetail(dataset) {
  const detail = dataset.seasonDetails.find((d) => d.seasonId === state.filters.detailSeason);
  if (!detail) {
    state.filters.detailSeason = null;
    renderSeasonGrid(dataset);
    return;
  }

  refs["seasons-filters"].innerHTML = "";
  refs["seasons-header"].querySelector(".view-title").textContent = "";

  const wdcText = detail.wdcWinners?.length
    ? detail.wdcWinners.map((w) => w.label ? `${w.name} (${w.label})` : w.name).join(", ")
    : "n/a";

  refs["seasons-content"].innerHTML = `
    <div class="season-detail-header">
      <button class="back-button" type="button" id="season-back">&larr; All Seasons</button>
      <h1 class="season-detail-header__title">${escapeHtml(detail.seasonId)}</h1>
      <span class="season-card__type season-card__type--${detail.type?.toLowerCase().includes("formula") ? "formula" : "sports"}">${escapeHtml(detail.type || "")}</span>
    </div>

    <div class="season-detail-meta">
      <div class="meta-item">
        <span class="meta-item__label">Car</span>
        <span class="meta-item__value">${escapeHtml(detail.car || "n/a")}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">WDC</span>
        <span class="meta-item__value">${escapeHtml(wdcText)}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">WCC</span>
        <span class="meta-item__value">${escapeHtml(detail.wccTeam || "n/a")}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">Venues</span>
        <span class="meta-item__value">${escapeHtml((detail.venueNames || detail.venues?.map((v) => v.venueName) || []).join(", ") || "n/a")}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">Races/Venue</span>
        <span class="meta-item__value">${escapeHtml(String(detail.racesPerVenue ?? "n/a"))}</span>
      </div>
      <div class="meta-item">
        <span class="meta-item__label">Drivers</span>
        <span class="meta-item__value">${escapeHtml(String(detail.standings.length))}</span>
      </div>
    </div>

    <div id="season-progress-area"></div>
    <div id="season-standings-area" class="mt-1"></div>
    ${buildSeasonHeatmapHtml(detail)}
    <div id="season-venues-area" class="mt-1"></div>
  `;

  document.getElementById("season-back").addEventListener("click", () => {
    state.filters.detailSeason = null;
    syncHistory({ replace: true });
    renderSeasonsView(dataset);
  });

  renderProgressChart(detail);
  renderStandingsTable(detail);
  renderVenueTables(detail);
}

function renderProgressChart(detail) {
  const area = document.getElementById("season-progress-area");
  if (!area) return;

  const mode = state.filters.detailProgressMode || "week";
  if (!detail.venues.length || !detail.standings.length) {
    area.innerHTML = renderEmptyStateMarkup("No venue data available for progression chart.");
    return;
  }

  const scopes = buildSeasonProgressionScopes(detail, mode);
  if (!scopes.length) {
    area.innerHTML = renderEmptyStateMarkup("Not enough data to chart progression.");
    return;
  }

  area.innerHTML = `
    <div class="card mb-1">
      <div class="card__header">
        <div>
          <h3 class="card__title">Championship Progression</h3>
          <div class="card__subtitle">${escapeHtml(detail.seasonId)} position changes</div>
        </div>
        <div class="card__controls">
          <label class="inline-control" for="detail-progress-mode">
            <span>View</span>
            <select class="select" id="detail-progress-mode">
              <option value="week"${mode === "week" ? " selected" : ""}>By race week</option>
              <option value="race"${mode === "race" ? " selected" : ""}>By each race</option>
            </select>
          </label>
        </div>
      </div>
      <div class="card__body">
        <div class="chart-stack">
          ${scopes.map((scope) => buildProgressChartHtml(detail, scope, mode)).join("")}
        </div>
      </div>
    </div>
  `;

  document.getElementById("detail-progress-mode")?.addEventListener("change", (e) => {
    state.filters.detailProgressMode = e.target.value;
    renderProgressChart(detail);
  });
}

function buildSeasonProgressionScopes(detail, mode) {
  const classified = detail.standings.filter((r) => r.driver && ((r.races || 0) > 0 || (r.points || 0) > 0));
  const rows = classified.length ? classified : detail.standings.filter((r) => r.driver);
  if (!rows.length) return [];

  const classNames = detail.isMultiClass
    ? uniqueList(rows.map((r) => r.className).filter(Boolean))
    : [];

  if (!classNames.length) {
    return [buildProgressionScope(detail, "Championship", "", rows, mode)];
  }

  return classNames
    .map((cn) => buildProgressionScope(detail, `${cn} Championship`, cn, rows.filter((r) => r.className === cn), mode))
    .filter((s) => s.series.length && s.rounds.length);
}

function buildProgressionScope(detail, title, className, rows, mode) {
  const finalRows = [...rows].sort(compareStandingsRows);
  if (!finalRows.length) return { title, series: [], rounds: [], champion: "", driverCount: 0 };

  const finalLookup = createLookup(finalRows, "driver");
  const checkpoints = buildCheckpoints(detail, finalLookup, mode);
  const cumulative = {};
  finalRows.forEach((r) => { cumulative[r.driver] = 0; });

  const seriesByDriver = {};
  finalRows.forEach((r, i) => {
    // color by final-standing rank so the field is internally consistent and
    // collision-free regardless of how many drivers a season had.
    seriesByDriver[r.driver] = { driver: r.driver, color: seriesColor(i, finalRows.length), rounds: [] };
  });

  checkpoints.forEach((cp) => {
    finalRows.forEach((r) => {
      cumulative[r.driver] = (cumulative[r.driver] || 0) + (cp.deltaByDriver[r.driver] || 0);
    });
    const ranked = [...finalRows].sort((a, b) => {
      const gap = (cumulative[b.driver] || 0) - (cumulative[a.driver] || 0);
      return gap !== 0 ? gap : compareStandingsRows(a, b);
    });
    const positions = {};
    ranked.forEach((r, i) => { positions[r.driver] = i + 1; });
    finalRows.forEach((r) => {
      seriesByDriver[r.driver].rounds.push({
        roundNumber: cp.roundNumber, axisLabel: cp.axisLabel,
        subLabel: cp.subLabel, venueName: cp.venueName,
        cumulativePoints: cumulative[r.driver] || 0, position: positions[r.driver],
      });
    });
  });

  const champion = className
    ? detail.wdcWinners?.find((w) => normalizeInlineText(w.label).toLowerCase() === className.toLowerCase())?.name || finalRows[0]?.driver || ""
    : detail.wdcWinners?.map((w) => w.name).join(", ") || finalRows[0]?.driver || "";

  return {
    title, champion, driverCount: finalRows.length,
    rounds: checkpoints.map((cp) => ({ roundNumber: cp.roundNumber, axisLabel: cp.axisLabel, subLabel: cp.subLabel, venueName: cp.venueName })),
    series: Object.values(seriesByDriver),
  };
}

function buildCheckpoints(detail, finalLookup, mode) {
  const checkpoints = [];
  let raceOrdinal = 0;

  [...detail.venues].sort((a, b) => (a.venueNumber || 0) - (b.venueNumber || 0)).forEach((venue, vi) => {
    if (mode === "race") {
      venue.raceColumns.forEach((race) => {
        raceOrdinal++;
        const delta = {};
        venue.rows.forEach((row) => {
          if (!finalLookup[row.driver]) return;
          const result = row.races.find((r) => r.number === race.number);
          delta[row.driver] = result?.points || 0;
        });
        checkpoints.push({ roundNumber: raceOrdinal, axisLabel: `R${raceOrdinal}`, subLabel: `V${venue.venueNumber || vi + 1}`, venueName: venue.venueName, deltaByDriver: delta });
      });
      return;
    }
    const delta = {};
    venue.rows.forEach((row) => {
      if (!finalLookup[row.driver]) return;
      delta[row.driver] = row.dayTotal || 0;
    });
    checkpoints.push({ roundNumber: vi + 1, axisLabel: `W${vi + 1}`, subLabel: truncateLabel(venue.venueName, 14), venueName: venue.venueName, deltaByDriver: delta });
  });

  return checkpoints;
}

function buildProgressChartHtml(detail, scope, mode) {
  const width = 980;
  const pad = { top: 24, right: 136, bottom: 58, left: 56 };
  // Height grows with the number of drivers so every line and endpoint label
  // gets vertical breathing room instead of overflowing a fixed canvas.
  const rowH = 22;
  const height = Math.max(360, pad.top + pad.bottom + scope.driverCount * rowH);
  const iw = width - pad.left - pad.right;
  const ih = height - pad.top - pad.bottom;
  const xDen = Math.max(scope.rounds.length - 1, 1);
  const scaleRank = (rank) => {
    if (scope.driverCount <= 1) return pad.top + ih / 2;
    return pad.top + ((rank - 1) / (scope.driverCount - 1)) * ih;
  };

  const ticks = scope.driverCount <= 8
    ? Array.from({ length: scope.driverCount }, (_, i) => i + 1)
    : uniqueList([1, Math.ceil(scope.driverCount / 2), scope.driverCount]);

  const yGrid = ticks.map((r) => {
    const y = scaleRank(r);
    return `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="rgba(0,0,0,0.06)" stroke-dasharray="4 6"/><text x="${pad.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#888">P${r}</text>`;
  }).join("");

  const xLabels = scope.rounds.map((r, i) => {
    const x = pad.left + (i / xDen) * iw;
    return `<text x="${x}" y="${height - 24}" text-anchor="middle" font-size="11" fill="#888">${escapeHtml(r.axisLabel)}</text><text x="${x}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#aaa">${escapeHtml(r.subLabel || "")}</text>`;
  }).join("");

  const endpoints = [];
  const series = scope.series.map((s) => {
    const pts = s.rounds.map((r, i) => ({ x: pad.left + (i / xDen) * iw, y: scaleRank(r.position), round: r }));
    if (pts.length) endpoints.push({ driver: s.driver, color: s.color, x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return `<polyline fill="none" stroke="${s.color}" stroke-width="2" points="${pts.map((p) => `${p.x},${p.y}`).join(" ")}"/>` +
      pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${s.color}" stroke="#fff" stroke-width="1.5"><title>${escapeHtml(s.driver)} | ${escapeHtml(p.round.axisLabel)} | P${p.round.position} | ${formatInteger(p.round.cumulativePoints)} pts</title></circle>`).join("");
  }).join("");

  const labels = buildEndpointLabels(endpoints, width, height, pad);

  return `
    <div class="chart-container">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.5rem">
        <div>
          <strong>${escapeHtml(scope.title)}</strong>
          <span class="subtle-text" style="margin-left:0.5rem">${escapeHtml(scope.champion ? `Champion: ${scope.champion}` : "")}</span>
        </div>
        <span class="badge">${scope.rounds.length} ${mode === "race" ? "races" : "weeks"}</span>
      </div>
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(scope.title)} progression">
        <rect x="0" y="0" width="${width}" height="${height}" rx="16" fill="#fafafa"/>
        ${yGrid}
        <line x1="${pad.left}" y1="${pad.top}" x2="${pad.left}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
        <line x1="${pad.left}" y1="${height - pad.bottom}" x2="${width - pad.right}" y2="${height - pad.bottom}" stroke="rgba(0,0,0,0.1)"/>
        ${series}${labels}${xLabels}
      </svg>
      <div class="chart-legend chart-legend--dense">
        ${scope.series.map((s) => `<span class="legend-item"><span class="legend-swatch" style="background:${s.color}"></span>${escapeHtml(s.driver)}</span>`).join("")}
      </div>
    </div>
  `;
}

function buildEndpointLabels(endpoints, width, height, pad) {
  if (!endpoints.length) return "";
  const minGap = 14, top = pad.top + 8, bottom = height - pad.bottom - 8;
  const labelX = width - pad.right + 18, connX = width - pad.right + 10;
  const labels = [...endpoints].sort((a, b) => a.y - b.y).map((e) => ({ ...e, desiredY: e.y, y: e.y }));

  labels.forEach((l, i) => { l.y = Math.max(l.y, i ? labels[i - 1].y + minGap : top); });
  for (let i = labels.length - 1; i >= 0; i--) { labels[i].y = Math.min(labels[i].y, i === labels.length - 1 ? bottom : labels[i + 1].y - minGap); }
  labels.forEach((l, i) => { l.y = Math.max(l.y, i ? labels[i - 1].y + minGap : top); });

  return labels.map((l) =>
    `<line x1="${l.x}" y1="${l.desiredY}" x2="${connX}" y2="${l.y}" stroke="${l.color}" stroke-width="1" opacity="0.7"/>` +
    `<text x="${labelX}" y="${l.y + 4}" font-size="11" font-weight="700" fill="${l.color}" style="paint-order:stroke;stroke:#fafafa;stroke-width:4;stroke-linejoin:round">${escapeHtml(l.driver)}</text>`
  ).join("");
}

function compareStandingsRows(a, b) {
  const checks = [
    (b.points || 0) - (a.points || 0),
    (b.wins || 0) - (a.wins || 0),
    (b.podiums || 0) - (a.podiums || 0),
    (b.poles || 0) - (a.poles || 0),
    (b.fastestLaps || 0) - (a.fastestLaps || 0),
  ];
  for (const gap of checks) { if (gap !== 0) return gap; }
  return normalizeInlineText(a.driver).localeCompare(normalizeInlineText(b.driver));
}

function renderStandingsTable(detail) {
  const area = document.getElementById("season-standings-area");
  if (!area) return;

  const standingsColumns = [
    { key: "rankLabel", label: "Pos", strong: true, sticky: true, stickyWidthRem: 3.75 },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col" },
    ...(detail.standings.some((r) => r.className) ? [{ key: "className", label: "Class", className: "wrap-col", widthRem: 8 }] : []),
    { key: "points", label: "Points" },
    { key: "wins", label: "Wins" },
    { key: "podiums", label: "Podiums" },
    { key: "poles", label: "Poles" },
    { key: "fastestLaps", label: "FLs" },
    { key: "pointsRate", label: "Pts Rate", format: "percent" },
    { key: "top5Rate", label: "Top 5", format: "percent" },
    { key: "teamName", label: "Team", className: "wrap-col", widthRem: 10 },
  ];

  // teamName carries no fixed width so it absorbs the table's slack and stretches
  // horizontally; points is pinned narrow so it no longer leaves dead space to its
  // right. wrap-col lets both name and members wrap on narrow/mobile widths.
  const teamColumns = [
    { key: "teamName", label: "Team", strong: true, className: "wrap-col", minWidthRem: 16 },
    { key: "points", label: "Points", className: "num-col", widthRem: 6 },
    { key: "members", label: "Drivers", className: "wrap-col", widthRem: 18, render: (r) => r.members.join(", ") || "n/a" },
  ];

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Standings</h3>
        <span class="badge">${detail.standings.length} drivers</span>
      </div>
      <div class="card__body">
        ${buildGapChartHtml(detail)}
        <div id="season-standings-table"></div>
      </div>
    </div>
    ${detail.teamStandings.length ? `
    <div class="card mt-1">
      <div class="card__header">
        <h3 class="card__title">Team Standings</h3>
      </div>
      <div class="card__body">
        <div id="season-team-standings-table"></div>
      </div>
    </div>
    ` : ""}
  `;

  renderSortableTable("season-standings-table", standingsColumns, [...detail.standings].sort(compareStandingsRows));
  if (detail.teamStandings.length) {
    renderSortableTable("season-team-standings-table", teamColumns, detail.teamStandings);
  }
}

// Compact "gap to leader" chart: turns the top of a long points table into a
// shape you can read at a glance. Top 12 classified drivers by points.
function buildGapChartHtml(detail) {
  const ranked = [...detail.standings].filter((r) => r.driver).sort(compareStandingsRows);
  if (ranked.length < 2) return "";
  const top = ranked.slice(0, 12);
  const leaderPts = top[0].points || 0;
  if (leaderPts <= 0) return "";

  const rows = top.map((r, i) => {
    const pts = r.points || 0;
    const gap = leaderPts - pts;
    const w = Math.max(2, (pts / leaderPts) * 100);
    return `
      <div class="gap-row${i === 0 ? " gap-row--leader" : ""}">
        <span class="gap-row__pos">${i + 1}</span>
        <span class="gap-row__name" title="${escapeHtml(r.driver)}">${escapeHtml(r.driver)}</span>
        <span class="gap-row__bar"><span class="gap-row__fill" style="width:${w}%"></span><span class="gap-row__pts">${formatInteger(pts)}</span></span>
        <span class="gap-row__val">${gap > 0 ? `&minus;${formatInteger(gap)}` : "leader"}</span>
      </div>`;
  }).join("");

  return `
    <div class="gap-chart" role="img" aria-label="Points gap to leader, top ${top.length}">
      <div class="gap-chart__caption">Points &amp; gap to leader · top ${top.length}</div>
      ${rows}
    </div>`;
}

// Driver x venue heatmap: points scored per venue, color-graded. Replaces the
// "read 100 cells of digits" problem with an at-a-glance form-guide. Top N by
// final standing so it stays legible.
function buildSeasonHeatmapHtml(detail) {
  if (!detail.venues || detail.venues.length < 2) return "";
  const ranked = [...detail.standings].filter((r) => r.driver).sort(compareStandingsRows).slice(0, 16);
  if (ranked.length < 2) return "";

  const venues = [...detail.venues].sort((a, b) => (a.venueNumber || 0) - (b.venueNumber || 0));
  // driver -> (venueNumber -> dayTotal)
  const byDriver = {};
  venues.forEach((v) => {
    v.rows.forEach((row) => {
      if (!byDriver[row.driver]) byDriver[row.driver] = {};
      byDriver[row.driver][v.venueNumber] = row.dayTotal;
    });
  });
  const maxPts = Math.max(1, ...venues.flatMap((v) => v.rows.map((r) => r.dayTotal || 0)));

  const head = `<tr><th class="heatmap__rowhead">Driver</th>${venues.map((v) =>
    `<th title="${escapeHtml(v.venueName)}">V${v.venueNumber}</th>`).join("")}</tr>`;

  const body = ranked.map((r) => {
    const cells = venues.map((v) => {
      const pts = byDriver[r.driver]?.[v.venueNumber];
      if (pts == null) return `<td class="is-empty">&middot;</td>`;
      const t = Math.max(0, Math.min(1, pts / maxPts));
      // Gray (low / far from max) -> green (high / near max): saturation climbs
      // from near-zero so weak results read clearly gray, strong ones vivid green.
      const bg = `hsl(150 ${Math.round(4 + t * 56)}% ${Math.round(91 - t * 45)}%)`;
      const fg = t > 0.5 ? "#fff" : "var(--text)";
      return `<td style="background:${bg};color:${fg}" title="${escapeHtml(r.driver)} — ${escapeHtml(v.venueName)}: ${formatInteger(pts)} pts">${formatInteger(pts)}</td>`;
    }).join("");
    return `<tr><td class="heatmap__rowhead">${escapeHtml(r.driver)}</td>${cells}</tr>`;
  }).join("");

  return `
    <div class="card mt-1">
      <div class="card__header">
        <div>
          <h3 class="card__title">Venue Form Guide</h3>
          <div class="card__subtitle">Points per venue · top ${ranked.length} drivers</div>
        </div>
        <span class="badge">${venues.length} venues</span>
      </div>
      <div class="card__body">
        <div class="heatmap-scroll">
          <table class="heatmap"><thead>${head}</thead><tbody>${body}</tbody></table>
        </div>
      </div>
    </div>`;
}

function renderVenueTables(detail) {
  const area = document.getElementById("season-venues-area");
  if (!area) return;

  if (!detail.venues.length) {
    area.innerHTML = "";
    return;
  }

  area.innerHTML = detail.venues.map((venue) => {
    const columns = [
      { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col" },
      ...(venue.rows.some((r) => r.carModel) ? [{ key: "carModel", label: "Car", className: "wrap-col", widthRem: 10 }] : []),
      ...venue.raceColumns.map((race) => ({
        key: `race-${race.number}`, label: `R${race.number}`,
        render: (row) => {
          const r = row.races.find((e) => e.number === race.number);
          if (!r) return "n/a";
          return r.rawPoints ? `${r.position || "n/a"} | ${r.rawPoints}` : r.position || "n/a";
        },
      })),
      { key: "dayTotal", label: "Total" },
    ];

    return `
      <div class="card mt-half">
        <div class="card__header">
          <h3 class="card__title">Venue ${venue.venueNumber}: ${escapeHtml(venue.venueName)}</h3>
          <span class="badge">${venue.raceColumns.length} races</span>
        </div>
        <div class="card__body">
          <div class="table-wrap">${renderDataTable(columns, venue.rows)}</div>
        </div>
      </div>
    `;
  }).join("");
}

const _sortableRegistry = {};

function renderSortableTable(containerId, columns, rows, options = {}) {
  const existing = _sortableRegistry[containerId];
  const sortKey = existing?.sortKey || null;
  const sortDir = existing?.sortDir || null;

  _sortableRegistry[containerId] = { columns, rows, options, sortKey, sortDir };

  const sorted = applySortToRows(columns, rows, sortKey, sortDir);
  const html = renderDataTable(columns, sorted, { ...options, sortKey, sortDir });

  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `<div class="table-wrap">${html}</div>`;
    container.addEventListener("click", handleSortHeaderClick);
  }
  return html;
}

function handleSortHeaderClick(event) {
  const th = event.target.closest("th[data-sort-key]");
  if (!th) return;

  const container = event.currentTarget;
  const containerId = container.id;
  const entry = _sortableRegistry[containerId];
  if (!entry) return;

  const key = th.dataset.sortKey;
  if (entry.sortKey === key) {
    entry.sortDir = entry.sortDir === "desc" ? "asc" : entry.sortDir === "asc" ? null : "desc";
    if (!entry.sortDir) entry.sortKey = null;
  } else {
    entry.sortKey = key;
    entry.sortDir = "desc";
  }

  const sorted = applySortToRows(entry.columns, entry.rows, entry.sortKey, entry.sortDir);
  const html = renderDataTable(entry.columns, sorted, { ...entry.options, sortKey: entry.sortKey, sortDir: entry.sortDir });
  container.innerHTML = `<div class="table-wrap">${html}</div>`;
}

function applySortToRows(columns, rows, sortKey, sortDir) {
  if (!sortKey || !sortDir) return rows;

  const col = columns.find((c) => c.key === sortKey);
  return [...rows].sort((a, b) => {
    let va = col?.sortValue ? col.sortValue(a) : a[sortKey];
    let vb = col?.sortValue ? col.sortValue(b) : b[sortKey];

    if (va == null) va = col?.format === "percent" || typeof vb === "number" ? -Infinity : "";
    if (vb == null) vb = col?.format === "percent" || typeof va === "number" ? -Infinity : "";

    let cmp;
    if (typeof va === "number" && typeof vb === "number") {
      cmp = va - vb;
    } else {
      cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: "base" });
    }

    return sortDir === "desc" ? -cmp : cmp;
  });
}

function renderDataTable(columns, rows, options = {}) {
  if (!rows.length) return renderEmptyStateMarkup("No data.");

  const prepared = prepareTableColumns(columns);
  const tableClass = ["data-table", options.tableClassName].filter(Boolean).join(" ");
  const minWidth = getTableMinWidth(prepared, options);
  const sortKey = options.sortKey || null;
  const sortDir = options.sortDir || null;

  const header = prepared.map((c) => {
    const isSorted = sortKey === c.key;
    const arrow = isSorted ? (sortDir === "desc" ? " ▼" : " ▲") : "";
    const sortCls = isSorted ? " is-sorted" : "";
    return `<th scope="col" data-sort-key="${escapeHtml(c.key)}"${cellAttrs(c, true, sortCls)}>${escapeHtml(c.label)}${arrow}</th>`;
  }).join("");

  const body = rows.map((row) => {
    const cells = prepared.map((c) => {
      const val = c.render ? c.render(row) : formatTableValue(row[c.key], c.format);
      const content = c.rawHtml ? val : escapeHtml(val);
      return `<td${cellAttrs(c, false)}>${content}</td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  return `<table class="${tableClass}" style="--table-min-width-rem:${minWidth}"><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table>`;
}

function prepareTableColumns(columns) {
  let stickyLeft = 0;
  const lastSticky = columns.reduce((idx, c, i) => c.sticky ? i : idx, -1);
  return columns.map((c, i) => {
    if (!c.sticky) return c;
    const w = c.stickyWidthRem || 10;
    const out = { ...c, stickyLeftRem: stickyLeft, stickyWidthRem: w, isStickyBoundary: i === lastSticky };
    stickyLeft += w;
    return out;
  });
}

function getTableMinWidth(columns, options) {
  const compact = Boolean(options?.compact);
  const total = columns.reduce((sum, c) => {
    if (c.widthRem) return sum + c.widthRem;
    if (c.minWidthRem) return sum + c.minWidthRem;
    if (c.sticky && c.stickyWidthRem) return sum + c.stickyWidthRem;
    return sum + (compact ? 6 : 7);
  }, 0);
  return Math.max(compact ? 34 : 40, Math.round(total * 4) / 4);
}

function cellAttrs(column, isHeader, extraCls) {
  const cls = [];
  if (column.className) cls.push(column.className);
  if (!isHeader && column.strong) cls.push("is-strong");
  if (column.sticky) cls.push("is-sticky-col");
  if (column.isStickyBoundary) cls.push("is-sticky-boundary");
  if (extraCls) cls.push(extraCls.trim());

  const styles = [];
  if (column.sticky) {
    styles.push(`left:${column.stickyLeftRem}rem`, `min-width:${column.stickyWidthRem}rem`, `width:${column.stickyWidthRem}rem`, `max-width:${column.stickyWidthRem}rem`);
  } else {
    if (column.widthRem) { styles.push(`width:${column.widthRem}rem`); if (cls.includes("wrap-col")) styles.push(`max-width:${column.widthRem}rem`); }
    if (column.minWidthRem) styles.push(`min-width:${column.minWidthRem}rem`);
  }

  return `${cls.length ? ` class="${cls.join(" ")}"` : ""}${styles.length ? ` style="${styles.join(";")}"` : ""}`;
}

function formatTableValue(value, format) {
  if (format === "percent") return formatPercent(value);
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value == null || value === "" ? "n/a" : String(value);
}
