"use strict";

// Season detail follows the season filter when one is pinned; otherwise it uses its own selector.
function getSelectedSeasonDetail(dataset) {
  if (!dataset || !dataset.seasonDetails.length) {
    return null;
  }

  const detailMap = createLookup(dataset.seasonDetails, "seasonId");
  if (state.filters.season !== "all" && detailMap[state.filters.season]) {
    return detailMap[state.filters.season];
  }

  if (state.filters.detailSeason !== "auto" && detailMap[state.filters.detailSeason]) {
    return detailMap[state.filters.detailSeason];
  }

  const completed = sortBySeason(dataset.seasonDetails.filter((detail) => !detail.isUpcoming));
  return completed[completed.length - 1] || sortBySeason(dataset.seasonDetails)[0] || null;
}

// Season detail assembles the selected season's metadata cards, progression chart, and tables.
function renderSeasonDetail(dataset) {
  if (!dataset || !dataset.seasonDetails.length) {
    refs["detail-season-badge"].textContent = "No season selected";
    refs["season-detail-summary"].innerHTML = renderEmptyStateMarkup(
      "Season summary cards will appear here after import.",
    );
    refs["season-progress-chart"].innerHTML = renderEmptyStateMarkup(
      "Championship progression will appear here once a detailed season is selected.",
    );
    refs["season-class-summary"].innerHTML = "";
    refs["season-detail-standings"].innerHTML = renderEmptyStateMarkup(
      "Season standings and team tables need an imported dataset.",
    );
    refs["season-detail-venues"].innerHTML = renderEmptyStateMarkup(
      "Venue-by-venue race tables will appear here once a season is selected.",
    );
    return;
  }

  const detail = getSelectedSeasonDetail(dataset);
  const seasonFilterActive = state.filters.season !== "all";
  refs["detail-season-select"].disabled = seasonFilterActive;
  refs["detail-season-select"].title = seasonFilterActive
    ? "Detail season is locked to the active Season filter. Clear the Season filter to change it independently."
    : "";
  refs["detail-season-select"].value =
    seasonFilterActive ? detail?.seasonId || "auto" : state.filters.detailSeason;

  if (!detail) {
    refs["detail-season-badge"].textContent = "No season detail found";
    refs["season-detail-summary"].innerHTML = renderEmptyStateMarkup(
      "No detailed season block matched the current selection.",
    );
    refs["season-progress-chart"].innerHTML = renderEmptyStateMarkup(
      "No championship progression data is available for the current season selection.",
    );
    refs["season-class-summary"].innerHTML = "";
    refs["season-detail-standings"].innerHTML = "";
    refs["season-detail-venues"].innerHTML = "";
    return;
  }

  refs["detail-season-badge"].textContent =
    state.filters.season !== "all"
      ? `${detail.seasonId} | following season filter`
      : `${detail.seasonId}${detail.isMultiClass ? " | multi-class" : ""}`;

  const wdcText = detail.wdcWinners?.length
    ? detail.wdcWinners
        .map((winner) =>
          winner.label ? `${winner.name} (${winner.label})` : winner.name,
        )
        .join(", ")
    : "n/a";

  refs["season-detail-summary"].innerHTML = `
    <article class="season-panel fade-in">
      <div class="season-panel__header">
        <div>
          <h3 class="season-panel__title">Championship picture</h3>
          <div class="season-panel__meta">${escapeHtml(detail.eraLabel)} | ${escapeHtml(detail.isUpcoming ? "upcoming" : "completed")}</div>
        </div>
        <span class="badge badge--accent">${escapeHtml(detail.seasonId)}</span>
      </div>
      <div class="season-meta-list">
        <span><strong>WDC:</strong> ${escapeHtml(wdcText)}</span>
        <span><strong>WCC:</strong> ${escapeHtml(detail.wccTeam || "n/a")}</span>
      </div>
    </article>
    <article class="season-panel fade-in">
      <div class="season-panel__header">
        <div>
          <h3 class="season-panel__title">Format</h3>
          <div class="season-panel__meta">${escapeHtml(detail.type || "Unknown type")}</div>
        </div>
      </div>
      <div class="season-meta-list">
        <span><strong>Car setup:</strong> ${escapeHtml(detail.car || "n/a")}</span>
        <span><strong>Scoring:</strong> ${escapeHtml(detail.scoringSystem || "n/a")}</span>
      </div>
    </article>
    <article class="season-panel fade-in">
      <div class="season-panel__header">
        <div>
          <h3 class="season-panel__title">Calendar</h3>
          <div class="season-panel__meta">${escapeHtml(String((detail.venueNames || []).length))} venues</div>
        </div>
      </div>
      <div class="season-meta-list">
        <span><strong>Venues:</strong> ${escapeHtml((detail.venueNames || []).join(", ") || "n/a")}</span>
        <span><strong>Races per venue:</strong> ${escapeHtml(String(detail.racesPerVenue ?? "n/a"))}</span>
      </div>
    </article>
    <article class="season-panel fade-in">
      <div class="season-panel__header">
        <div>
          <h3 class="season-panel__title">Archive coverage</h3>
          <div class="season-panel__meta">${escapeHtml(detail.venues.length)} venue tables</div>
        </div>
      </div>
      <div class="season-meta-list">
        <span><strong>Drivers in standings:</strong> ${escapeHtml(String(detail.standings.length))}</span>
        <span><strong>Teams in WCC table:</strong> ${escapeHtml(String(detail.teamStandings.length))}</span>
      </div>
    </article>
  `;

  refs["season-class-summary"].innerHTML = detail.classSummary?.length
    ? detail.classSummary
        .map(
          (group) => `
            <article class="season-panel fade-in">
              <div class="season-panel__header">
                <div>
                  <h3 class="season-panel__title">${escapeHtml(group.className)}</h3>
                  <div class="season-panel__meta">${escapeHtml(String(group.driverCount))} classified drivers</div>
                </div>
                <span class="class-chip">${escapeHtml(group.champion || "n/a")}</span>
              </div>
              <div class="season-meta-list">
                <span><strong>Champion points:</strong> ${escapeHtml(formatInteger(group.championPoints))}</span>
                <span><strong>Cars:</strong> ${escapeHtml(group.cars.join(", ") || "n/a")}</span>
              </div>
            </article>
          `,
        )
        .join("")
    : "";

  renderSeasonProgressChart(detail);

  const standingsColumns = [
    { key: "rankLabel", label: "Pos", strong: true, sticky: true, stickyWidthRem: 3.75 },
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5 },
    ...(detail.standings.some((row) => row.className)
      ? [{ key: "className", label: "Class" }]
      : []),
    ...(detail.standings.some((row) => row.primaryCar)
      ? [{ key: "primaryCar", label: "Primary car" }]
      : []),
    { key: "points", label: "Points" },
    { key: "wins", label: "Wins" },
    { key: "podiums", label: "Podiums" },
    { key: "poles", label: "Poles" },
    { key: "fastestLaps", label: "FLs" },
    { key: "pointsRate", label: "Pts rate", format: "percent" },
    { key: "top5Rate", label: "Top 5", format: "percent" },
    { key: "teamName", label: "Team", className: "wrap-col", minWidthRem: 11.5 },
  ];

  const teamColumns = [
    {
      key: "teamName",
      label: "Team",
      strong: true,
      sticky: true,
      stickyWidthRem: 11.5,
      className: "wrap-col",
      minWidthRem: 11.5,
    },
    { key: "points", label: "Points" },
    {
      key: "members",
      label: "Drivers",
      className: "wrap-col",
      minWidthRem: 13,
      render: (row) => row.members.join(", ") || "n/a",
    },
  ];

  refs["season-detail-standings"].innerHTML = `
    ${buildTableCard(
      "Season standings",
      detail.isMultiClass
        ? "Driver standings are enriched with inferred class and primary-car data from venue tables."
        : "Season standings from the detailed archive block.",
      standingsColumns,
      [...detail.standings].sort(compareStandingsRows),
    )}
    ${buildTableCard(
      "Team standings",
      "WCC table from the detailed season block.",
      teamColumns,
      detail.teamStandings,
    )}
  `;

  refs["season-detail-venues"].innerHTML = detail.venues.length
    ? detail.venues
        .map((venue) => buildVenueCard(venue))
        .join("")
    : renderEmptyStateMarkup("This season detail block does not include venue result tables.");
}

// Standings are sorted by points first, then typical motorsport tie-break indicators.
function compareStandingsRows(left, right) {
  const pointGap = (right.points || 0) - (left.points || 0);
  if (pointGap !== 0) {
    return pointGap;
  }

  const winsGap = (right.wins || 0) - (left.wins || 0);
  if (winsGap !== 0) {
    return winsGap;
  }

  const podiumGap = (right.podiums || 0) - (left.podiums || 0);
  if (podiumGap !== 0) {
    return podiumGap;
  }

  const poleGap = (right.poles || 0) - (left.poles || 0);
  if (poleGap !== 0) {
    return poleGap;
  }

  const fastestLapGap = (right.fastestLaps || 0) - (left.fastestLaps || 0);
  if (fastestLapGap !== 0) {
    return fastestLapGap;
  }

  return normalizeInlineText(left.driver).localeCompare(normalizeInlineText(right.driver));
}

// Render either race-week or per-race championship progression for the selected season.
function renderSeasonProgressChart(detail) {
  const mode = state.filters.detailProgressMode || "week";
  if (!detail || !detail.venues.length || !detail.standings.length) {
    refs["season-progress-chart"].innerHTML = renderEmptyStateMarkup(
      "Detailed venue results are required to chart championship progression.",
    );
    return;
  }

  const scopes = buildSeasonProgressionScopes(detail, mode);
  if (!scopes.length) {
    refs["season-progress-chart"].innerHTML = renderEmptyStateMarkup(
      "This season does not yet have enough classified rounds to chart progression.",
    );
    return;
  }

  refs["season-progress-chart"].innerHTML = scopes
    .map((scope) => buildSeasonProgressChartCard(detail, scope, mode))
    .join("");
}

// Multi-class seasons render one progression chart per class; single-class seasons render one chart.
function buildSeasonProgressionScopes(detail, mode) {
  const classifiedStandings = detail.standings.filter(
    (row) => row.driver && ((row.races || 0) > 0 || (row.points || 0) > 0),
  );
  const finalRows = classifiedStandings.length
    ? classifiedStandings
    : detail.standings.filter((row) => row.driver);

  if (!finalRows.length) {
    return [];
  }

  const classNames = detail.isMultiClass
    ? uniqueList(finalRows.map((row) => row.className).filter(Boolean))
    : [];

  if (!classNames.length) {
    return [buildSeasonProgressionScope(detail, "Overall WDC", "", finalRows, mode)];
  }

  return classNames
    .map((className) =>
      buildSeasonProgressionScope(
        detail,
        `${className} WDC`,
        className,
        finalRows.filter((row) => row.className === className),
        mode,
      ),
    )
    .filter((scope) => scope.series.length && scope.rounds.length);
}

// Build one progression dataset by replaying checkpoints and re-ranking after each one.
function buildSeasonProgressionScope(detail, title, className, rows, mode) {
  const finalRows = [...rows].sort(compareStandingsRows);
  const scopeRows = className
    ? detail.standings.filter((row) => row.driver && row.className === className)
    : detail.standings.filter((row) => row.driver);
  if (!finalRows.length) {
    return {
      title,
      className,
      series: [],
      rounds: [],
      champion: "",
      driverCount: 0,
      excludedCount: 0,
    };
  }

  const finalLookup = createLookup(finalRows, "driver");
  const checkpoints = buildSeasonProgressionCheckpoints(detail, finalLookup, mode);
  const cumulativePoints = finalRows.reduce((accumulator, row) => {
    accumulator[row.driver] = 0;
    return accumulator;
  }, {});

  const seriesByDriver = finalRows.reduce((accumulator, row) => {
    accumulator[row.driver] = {
      driver: row.driver,
      finalRankLabel: row.rankLabel,
      color: colorForDriver(row.driver),
      rounds: [],
    };
    return accumulator;
  }, {});

  checkpoints.forEach((checkpoint) => {
    finalRows.forEach((row) => {
      cumulativePoints[row.driver] =
        (cumulativePoints[row.driver] || 0) + (checkpoint.deltaByDriver[row.driver] || 0);
    });

    const rankedRows = [...finalRows].sort((left, right) => {
      const cumulativeGap =
        (cumulativePoints[right.driver] || 0) - (cumulativePoints[left.driver] || 0);
      if (cumulativeGap !== 0) {
        return cumulativeGap;
      }
      return compareStandingsRows(left, right);
    });

    const positions = rankedRows.reduce((accumulator, row, rankIndex) => {
      accumulator[row.driver] = rankIndex + 1;
      return accumulator;
    }, {});

    finalRows.forEach((row) => {
      seriesByDriver[row.driver].rounds.push({
        roundNumber: checkpoint.roundNumber,
        axisLabel: checkpoint.axisLabel,
        subLabel: checkpoint.subLabel,
        venueName: checkpoint.venueName,
        raceLabel: checkpoint.raceLabel,
        cumulativePoints: cumulativePoints[row.driver] || 0,
        position: positions[row.driver],
      });
    });
  });

  const champion = className
    ? detail.classSummary?.find((group) => group.className === className)?.champion ||
      detail.wdcWinners?.find(
        (winner) =>
          normalizeInlineText(winner.label).toLowerCase() === className.toLowerCase(),
      )?.name ||
      finalRows[0]?.driver ||
      ""
    : detail.wdcWinners?.map((winner) => winner.name).join(", ") || finalRows[0]?.driver || "";

  return {
    title,
    className,
    champion,
    driverCount: finalRows.length,
    excludedCount: Math.max(scopeRows.length - finalRows.length, 0),
    rounds: checkpoints.map((checkpoint) => ({
      roundNumber: checkpoint.roundNumber,
      axisLabel: checkpoint.axisLabel,
      subLabel: checkpoint.subLabel,
      venueName: checkpoint.venueName,
    })),
    series: Object.values(seriesByDriver),
  };
}

// Checkpoints can be venue totals ("week") or individual race results ("race"), depending on UI mode.
function buildSeasonProgressionCheckpoints(detail, finalLookup, mode) {
  const checkpoints = [];
  let raceOrdinal = 0;

  [...detail.venues]
    .sort((left, right) => (left.venueNumber || 0) - (right.venueNumber || 0))
    .forEach((venue, venueIndex) => {
      if (mode === "race") {
        venue.raceColumns.forEach((race) => {
          raceOrdinal += 1;
          const deltaByDriver = {};
          venue.rows.forEach((row) => {
            if (!finalLookup[row.driver]) {
              return;
            }
            const result = row.races.find((entry) => entry.number === race.number);
            deltaByDriver[row.driver] = result?.points || 0;
          });

          checkpoints.push({
            roundNumber: raceOrdinal,
            axisLabel: `R${raceOrdinal}`,
            subLabel: `V${venue.venueNumber || venueIndex + 1}`,
            venueName: venue.venueName,
            raceLabel: `Race ${race.number}`,
            deltaByDriver,
          });
        });
        return;
      }

      const deltaByDriver = {};
      venue.rows.forEach((row) => {
        if (!finalLookup[row.driver]) {
          return;
        }
        deltaByDriver[row.driver] = row.dayTotal || 0;
      });

      checkpoints.push({
        roundNumber: venueIndex + 1,
        axisLabel: `W${venueIndex + 1}`,
        subLabel: truncateLabel(venue.venueName, 16),
        venueName: venue.venueName,
        raceLabel: "Race week",
        deltaByDriver,
      });
    });

  return checkpoints;
}

// Render an SVG progression chart with direct end labels so lines remain readable without hovering.
function buildSeasonProgressChartCard(detail, scope, mode) {
  const width = 980;
  const height = 360;
  const padding = { top: 24, right: 136, bottom: 58, left: 56 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xDenominator = Math.max(scope.rounds.length - 1, 1);
  const yTicks = buildRankTicks(scope.driverCount);
  const scaleRank = (rank) => {
    if (scope.driverCount <= 1) {
      return padding.top + innerHeight / 2;
    }
    return padding.top + ((rank - 1) / (scope.driverCount - 1)) * innerHeight;
  };

  const yGrid = yTicks
    .map((rank) => {
      const y = scaleRank(rank);
      return `
        <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(91,66,48,0.12)" stroke-dasharray="4 6" />
        <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6a5748">P${rank}</text>
      `;
    })
    .join("");

  const xLabels = scope.rounds
    .map((round, index) => {
      const x = padding.left + (index / xDenominator) * innerWidth;
      return `
        <text x="${x}" y="${height - 24}" text-anchor="middle" font-size="11" fill="#6a5748">${escapeHtml(round.axisLabel)}</text>
        <text x="${x}" y="${height - 10}" text-anchor="middle" font-size="10" fill="#8a7665">${escapeHtml(round.subLabel || "")}</text>
      `;
    })
    .join("");

  const endpoints = [];
  const seriesMarkup = scope.series
    .map((series) => {
      const points = series.rounds.map((round, index) => ({
        x: padding.left + (index / xDenominator) * innerWidth,
        y: scaleRank(round.position),
        round,
      }));

      if (points.length) {
        endpoints.push({
          driver: series.driver,
          color: series.color,
          x: points[points.length - 1].x,
          y: points[points.length - 1].y,
        });
      }

      return `
        <polyline fill="none" stroke="${series.color}" stroke-width="2" points="${points
          .map((point) => `${point.x},${point.y}`)
          .join(" ")}" />
        ${points
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="3" fill="${series.color}" stroke="#fff9f4" stroke-width="1.5">
                <title>${escapeHtml(series.driver)} | ${escapeHtml(point.round.axisLabel)} | ${escapeHtml(point.round.venueName)}${point.round.raceLabel ? ` | ${escapeHtml(point.round.raceLabel)}` : ""} | P${point.round.position} | ${formatInteger(point.round.cumulativePoints)} pts</title>
              </circle>
            `,
          )
          .join("")}
      `;
    })
    .join("");

  const labelMarkup = buildSeriesEndpointLabelMarkup(
    endpoints,
    width,
    height,
    padding,
  );

  return `
    <article class="table-card fade-in progress-chart-card">
      <div class="table-card__header">
        <div>
          <h3 class="table-card__title">${escapeHtml(scope.title)}</h3>
          <div class="table-card__meta">${escapeHtml(`${scope.rounds.length} ${mode === "race" ? "races" : "race weeks"} | cumulative ${mode === "race" ? "race points" : "venue totals"} | ties stabilized by final standings`)}</div>
        </div>
        <span class="badge badge--accent">${escapeHtml(scope.champion ? `Champion: ${scope.champion}` : detail.seasonId)}</span>
      </div>
      ${
        scope.excludedCount
          ? `<div class="fine-print">Zero-start or zero-point archive rows are omitted from this progression view to keep the chart readable.</div>`
          : ""
      }
      <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(scope.title)} progression chart">
        <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(255,255,255,0.52)" />
        ${yGrid}
        <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(91,66,48,0.24)" />
        <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(91,66,48,0.24)" />
        ${seriesMarkup}
        ${labelMarkup}
        ${xLabels}
      </svg>
      <div class="chart-legend chart-legend--dense">
        ${scope.series
          .map(
            (series) => `
              <span class="legend-item">
                <button class="legend-swatch legend-swatch--button" type="button" data-driver="${escapeHtml(series.driver)}" aria-label="Change ${escapeHtml(series.driver)} line color" title="Change ${escapeHtml(series.driver)} line color" style="background:${series.color}"></button>
                ${escapeHtml(series.driver)}
              </span>
            `,
          )
          .join("")}
      </div>
    </article>
  `;
}

// Offset line labels vertically so neighboring endpoints do not collide on crowded charts.
function buildSeriesEndpointLabelMarkup(endpoints, width, height, padding) {
  if (!endpoints.length) {
    return "";
  }

  const minGap = 14;
  const top = padding.top + 8;
  const bottom = height - padding.bottom - 8;
  const labelX = width - padding.right + 18;
  const connectorX = width - padding.right + 10;
  const labels = [...endpoints]
    .sort((left, right) => left.y - right.y)
    .map((entry) => ({
      ...entry,
      desiredY: entry.y,
      y: entry.y,
    }));

  labels.forEach((label, index) => {
    const previousY = index ? labels[index - 1].y : top - minGap;
    label.y = Math.max(label.desiredY, previousY + minGap, top);
  });

  for (let index = labels.length - 1; index >= 0; index -= 1) {
    const nextY = index === labels.length - 1 ? bottom + minGap : labels[index + 1].y;
    labels[index].y = Math.min(labels[index].y, nextY - minGap, bottom);
  }

  labels.forEach((label, index) => {
    const previousY = index ? labels[index - 1].y : top - minGap;
    label.y = Math.max(label.y, previousY + minGap, top);
  });

  return labels
    .map(
      (label) => `
        <line x1="${label.x}" y1="${label.desiredY}" x2="${connectorX}" y2="${label.y}" stroke="${label.color}" stroke-width="1" opacity="0.75" />
        <text x="${labelX}" y="${label.y + 4}" font-size="11" font-weight="700" fill="${label.color}" text-anchor="start" style="paint-order:stroke;stroke:#fff9f4;stroke-width:4;stroke-linejoin:round;">${escapeHtml(label.driver)}</text>
      `,
    )
    .join("");
}

// Rank tick density stays light on larger fields and fully enumerated on smaller ones.
function buildRankTicks(driverCount) {
  if (driverCount <= 1) {
    return [1];
  }

  if (driverCount <= 8) {
    return Array.from({ length: driverCount }, (_, index) => index + 1);
  }

  return uniqueList([1, Math.ceil(driverCount / 2), driverCount]);
}

// Shared table-card wrappers keep season detail sections visually consistent.
function buildTableCard(title, meta, columns, rows, options = {}) {
  return `
    <article class="table-card fade-in">
      <div class="table-card__header">
        <div>
          <h3 class="table-card__title">${escapeHtml(title)}</h3>
          <div class="table-card__meta">${escapeHtml(meta)}</div>
        </div>
        <span class="badge">${escapeHtml(String(rows.length))} rows</span>
      </div>
      <div class="table-wrap">
        ${renderDataTable(columns, rows, options)}
      </div>
    </article>
  `;
}

// Venue cards render one detailed event table per venue block in the Markdown archive.
function buildVenueCard(venue) {
  const columns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5 },
    ...(venue.rows.some((row) => row.className)
      ? [{ key: "className", label: "Class" }]
      : []),
    ...(venue.rows.some((row) => row.carModel)
      ? [{ key: "carModel", label: "Car" }]
      : []),
    ...venue.raceColumns.map((race) => ({
      key: `race-${race.number}`,
      label: `R${race.number}`,
      render: (row) => {
        const result = row.races.find((entry) => entry.number === race.number);
        if (!result) {
          return "n/a";
        }
        return result.rawPoints
          ? `${result.position || "n/a"} | ${result.rawPoints}`
          : result.position || "n/a";
      },
    })),
    { key: "dayTotal", label: "Day total" },
  ];

  return `
    <article class="venue-card fade-in">
      <div class="venue-card__header">
        <div>
          <h3 class="venue-card__title">Venue ${escapeHtml(String(venue.venueNumber || ""))}: ${escapeHtml(venue.venueName)}</h3>
          <div class="venue-card__meta">${escapeHtml(String(venue.rows.length))} classified rows${venue.classes.length ? ` | ${escapeHtml(venue.classes.join(", "))}` : ""}</div>
        </div>
        <span class="badge">${escapeHtml(String(venue.raceColumns.length))} races</span>
      </div>
      <div class="venue-card__races">
        ${venue.raceColumns
          .map((race) => `<span class="race-pill">R${escapeHtml(String(race.number))}</span>`)
          .join("")}
      </div>
      <div class="table-wrap">
        ${renderDataTable(columns, venue.rows)}
      </div>
    </article>
  `;
}

// Generic table renderer backs both standings and venue drill-down tables.
function renderDataTable(columns, rows, options = {}) {
  if (!rows.length) {
    return renderEmptyStateMarkup("No rows available for this table.");
  }

  const preparedColumns = prepareTableColumns(columns);
  const tableClassName = ["data-table", options.tableClassName].filter(Boolean).join(" ");
  const tableStyle = buildTableStyle(preparedColumns, options);
  const headerMarkup = preparedColumns
    .map(
      (column) =>
        `<th scope="col"${buildTableCellAttributes(column, { header: true })}>${escapeHtml(column.label)}</th>`,
    )
    .join("");
  const bodyMarkup = rows
    .map((row) => {
      const cells = preparedColumns
        .map((column) => {
          const value = column.render
            ? column.render(row)
            : formatTableValue(row[column.key], column.format);
          return `<td${buildTableCellAttributes(column)}>${escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <table class="${tableClassName}"${tableStyle}>
      <thead>
        <tr>${headerMarkup}</tr>
      </thead>
      <tbody>${bodyMarkup}</tbody>
    </table>
  `;
}

function buildTableStyle(columns, options = {}) {
  const tableMinWidthRem = options.minWidthRem || getTableMinWidthRem(columns, options);
  return ` style="--table-min-width-rem:${tableMinWidthRem}"`;
}

function getTableMinWidthRem(columns, options = {}) {
  const compact = Boolean(options.compact || (options.tableClassName || "").includes("data-table--compact"));
  const floor = compact ? 34 : 44;

  const totalWidth = columns.reduce((sum, column) => sum + getColumnWidthRem(column, compact), 0);
  return Math.max(floor, Math.round(totalWidth * 4) / 4);
}

function getColumnWidthRem(column, compact) {
  if (typeof column.minWidthRem === "number") {
    return column.minWidthRem;
  }

  if (column.sticky && typeof column.stickyWidthRem === "number") {
    return column.stickyWidthRem;
  }

  const className = [column.className, column.headerClassName, column.cellClassName]
    .filter(Boolean)
    .join(" ");

  if (className.includes("rank-col")) {
    return compact ? 3.25 : 3.75;
  }

  if (className.includes("num-col")) {
    return compact ? 5.5 : 6.25;
  }

  if (column.strong || typeof column.render === "function") {
    return compact ? 8 : 8.75;
  }

  return compact ? 7 : 7.75;
}

function prepareTableColumns(columns) {
  const stickyIndexes = columns.reduce((indexes, column, index) => {
    if (column.sticky) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  const stickyBoundaryIndex = stickyIndexes[stickyIndexes.length - 1];
  let stickyLeftRem = 0;

  return columns.map((column, index) => {
    if (!column.sticky) {
      return column;
    }

    const stickyWidthRem = column.stickyWidthRem || 10;
    const preparedColumn = {
      ...column,
      stickyLeftRem,
      stickyWidthRem,
      isStickyBoundary: index === stickyBoundaryIndex,
    };
    stickyLeftRem += stickyWidthRem;
    return preparedColumn;
  });
}

function buildTableCellAttributes(column, options = {}) {
  const classNames = [];
  if (column.className) {
    classNames.push(column.className);
  }
  if (options.header && column.headerClassName) {
    classNames.push(column.headerClassName);
  }
  if (!options.header && column.cellClassName) {
    classNames.push(column.cellClassName);
  }
  if (!options.header && column.strong) {
    classNames.push("is-strong");
  }
  if (column.sticky) {
    classNames.push("is-sticky-col");
  }
  if (column.isStickyBoundary) {
    classNames.push("is-sticky-boundary");
  }

  const styleParts = [];
  if (column.sticky) {
    styleParts.push(`left:${column.stickyLeftRem}rem`);
    styleParts.push(`min-width:${column.stickyWidthRem}rem`);
    styleParts.push(`width:${column.stickyWidthRem}rem`);
    styleParts.push(`max-width:${column.stickyWidthRem}rem`);
  }

  return `${classNames.length ? ` class="${classNames.join(" ")}"` : ""}${styleParts.length ? ` style="${styleParts.join(";")}"` : ""}`;
}

function formatTableValue(value, format) {
  if (format === "percent") {
    return formatPercent(value);
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }
  return value == null || value === "" ? "n/a" : String(value);
}
