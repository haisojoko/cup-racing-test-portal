"use strict";

// Overview cards summarize the imported dataset and surface parser warnings at a glance.
function renderOverview(dataset) {
  const warnings = dataset.validations.filter((entry) => entry.level === "warning").length;
  const infos = dataset.validations.filter((entry) => entry.level === "info").length;
  refs["dataset-kicker"].textContent = `${dataset.name} | imported ${formatTimestamp(dataset.importedAt)}`;
  refs["dataset-title"].textContent = dataset.title;
  refs["dataset-status-badge"].textContent = warnings
    ? `${warnings} warning${warnings === 1 ? "" : "s"}`
    : "Ready";

  refs["overview-cards"].innerHTML = [
    buildMetricCard("Completed seasons", dataset.stats.completedSeasonCount, "Historical seasons available for ranking"),
    buildMetricCard("Driver catalog", dataset.stats.driverCount, "Union of career, CPI, and weighted-score sections"),
    buildMetricCard("Weighted records", dataset.stats.weightedRecordCount, "Season slices available for charting and comparison"),
    buildMetricCard(
      "Data signals",
      `${warnings}W / ${infos}I`,
      dataset.stats.upcomingSeasonCount
        ? `${dataset.stats.upcomingSeasonCount} upcoming season${dataset.stats.upcomingSeasonCount === 1 ? "" : "s"} excluded from completed history`
        : "No upcoming-season exclusions detected",
    ),
  ].join("");

  refs["validation-summary"].innerHTML = dataset.validations.length
    ? dataset.validations
        .map(
          (entry) => `
            <div class="validation-item fade-in">
              <div class="validation-item__status ${entry.level === "warning" ? "is-warning" : "is-info"}">${escapeHtml(entry.level)}</div>
              <div>
                <strong>${escapeHtml(entry.title)}</strong>
                <div class="subtle-text">${escapeHtml(entry.detail)}</div>
              </div>
            </div>
          `,
        )
        .join("")
    : `<div class="validation-item"><div class="validation-item__status is-info">clean</div><div><strong>No import warnings</strong><div class="subtle-text">The dataset shape matches the current parser assumptions.</div></div></div>`;
}

// The picker is just a filtered button list, but it mirrors the current analytical slice.
function renderDriverPicker() {
  const dataset = getActiveDataset();
  if (!dataset) {
    refs["driver-picker"].innerHTML = renderEmptyStateMarkup("Upload a dataset to browse drivers.");
    return;
  }

  const query = state.filters.driverSearch.trim().toLowerCase();
  const filteredRecords = getFilteredSeasonRecords(dataset);
  const visibleDrivers = filteredRecords.length
    ? uniqueList(filteredRecords.map((record) => record.driver))
    : dataset.careerRecords.map((record) => record.driver);
  const cards = dataset.careerRecords
    .filter((record) => visibleDrivers.includes(record.driver))
    .filter((record) => !query || record.driver.toLowerCase().includes(query))
    .map((record) => {
      const isSelected = state.selectedDrivers.includes(record.driver);
      return `
        <button class="driver-chip ${isSelected ? "is-selected" : ""} fade-in" type="button" data-driver="${escapeHtml(record.driver)}">
          <div>
            <div class="driver-chip__name">${escapeHtml(record.driver)}</div>
            <div class="driver-chip__meta">CPI ${formatDecimal(record.cpi)} | peak ${escapeHtml(record.bestSeasonId || "n/a")}</div>
          </div>
          <span class="badge">${formatInteger(record.wdc)} WDC</span>
        </button>
      `;
    });

  refs["driver-picker"].innerHTML = cards.length
    ? cards.join("")
    : renderEmptyStateMarkup("No drivers match the current filter and search combination.");
}

// Leaderboards are lightweight list renders over the two ranking pipelines.
function renderLeaderboards(dataset) {
  const activePreset = getActivePreset();
  const careerRanking = buildCareerAggregates(dataset);
  const seasonRanking = buildSeasonRanking(dataset);
  refs["leaderboard-context"].textContent = activePreset.label;

  refs["career-leaderboard"].innerHTML = careerRanking.length
    ? `<div class="leaderboard-table">${careerRanking
        .slice(0, 10)
        .map(
          (entry, index) => `
            <div class="leaderboard-row fade-in">
              <div class="leaderboard-row__rank">#${index + 1}</div>
              <div>
                <div class="leaderboard-row__name">${escapeHtml(entry.driver)}</div>
                <div class="leaderboard-row__meta">CPI ${formatDecimal(entry.cpi)} | peak ${formatDecimal(entry.peakWs)}</div>
              </div>
              <div class="leaderboard-row__season">${escapeHtml(entry.peakSeason ? entry.peakSeason.seasonId : entry.careerRecord.bestSeasonId || "n/a")}</div>
              <div class="leaderboard-row__score">${formatComposite(entry.composite)}</div>
            </div>
          `,
        )
        .join("")}</div>`
    : renderEmptyStateMarkup("No career ranking is available for the current filter slice.");

  refs["season-leaderboard"].innerHTML = seasonRanking.length
    ? `<div class="leaderboard-table">${seasonRanking
        .slice(0, 10)
        .map(
          (entry, index) => `
            <div class="leaderboard-row fade-in">
              <div class="leaderboard-row__rank">#${index + 1}</div>
              <div>
                <div class="leaderboard-row__name">${escapeHtml(entry.driver)}</div>
                <div class="leaderboard-row__meta">${escapeHtml(entry.type || "Unknown")} | ${escapeHtml(entry.car || "Unknown car")}</div>
              </div>
              <div class="leaderboard-row__season">${escapeHtml(entry.seasonId)}</div>
              <div class="leaderboard-row__score">${formatComposite(entry.composite)}</div>
            </div>
          `,
        )
        .join("")}</div>`
    : renderEmptyStateMarkup("No season rows match the current filters.");
}

// View labels are reused in badges, summaries, and explorer headings so the new insights tab stays self-explanatory.
const INSIGHTS_VIEW_LABELS = {
  weighted: "Weighted score",
  totals: "Raw totals",
  pace: "Raw pace",
  results: "Results",
  efficiency: "Efficiency",
};

// Populate the insights tab controls from dataset metadata while keeping those controls independent from the sidebar filters.
function populateInsightsControls(dataset) {
  refs["insights-lens-select"].value = state.insights.lens;
  refs["insights-view-select"].value = state.insights.view;
  populateInsightsSelect(
    refs["insights-era-select"],
    dataset.filterOptions.eras,
    "All eras",
    state.insights.era,
  );
  populateInsightsSelect(
    refs["insights-division-select"],
    dataset.filterOptions.divisions,
    "All divisions",
    state.insights.division,
  );
}

// Local insights selects mirror the shared select builder pattern, but write into state.insights instead of state.filters.
function populateInsightsSelect(element, options, defaultLabel, selectedValue) {
  element.innerHTML = [
    `<option value="all">${escapeHtml(defaultLabel)}</option>`,
    ...options.map(
      (option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    ),
  ].join("");

  const nextValue = options.some((option) => option.value === selectedValue)
    ? selectedValue
    : "all";
  element.value = nextValue;
  state.insights[element.id === "insights-era-select" ? "era" : "division"] = nextValue;
}

// The insights tab assembles card-ready season and career models, then promotes the selected card into the detail explorer below.
function renderInsights(dataset) {
  const seasonRecords = getInsightsSeasonRecords(dataset, state.insights);
  const careerRollups = buildInsightsCareerRollups(dataset, state.insights);
  const cards =
    state.insights.lens === "career"
      ? buildCareerInsightCards(careerRollups)
      : buildSeasonInsightCards(seasonRecords);

  refs["insights-badge"].textContent =
    state.insights.lens === "career"
      ? `${careerRollups.length} careers in scope`
      : `${seasonRecords.length} seasons in scope`;

  if (!cards.length) {
    refs["insights-cards"].innerHTML = renderEmptyStateMarkup(
      "No rows match the current insights scope. Try broadening the local era or division filters.",
    );
    refs["insights-detail-title"].textContent = "Explorer detail";
    refs["insights-detail-badge"].textContent = "No insight selected";
    refs["insights-detail-summary"].textContent = "";
    refs["insights-detail-table"].innerHTML = renderEmptyStateMarkup(
      "The insights explorer needs at least one season or career row in scope.",
    );
    return;
  }

  const activeCard = cards.find((card) => card.id === state.insights.activeInsight) || cards[0];
  state.insights.activeInsight = activeCard.id;

  refs["insights-cards"].innerHTML = cards
    .map((card) => buildInsightCardMarkup(card, card.id === activeCard.id))
    .join("");

  renderInsightExplorer(activeCard);
}

// Season insight cards now cover pure peaks, conversion stories, qualifying power, durability, and momentum swings.
function buildSeasonInsightCards(records) {
  return [
    buildInsightCardModel({
      id: "strongestPeaks",
      title: "Strongest Peaks",
      subtitle: "The highest-quality completed seasons by weighted score.",
      rowType: "season",
      recommendedView: "weighted",
      rows: [...records].sort((left, right) => (right.weightedScore || 0) - (left.weightedScore || 0)),
      metricLabel: "WS",
      metricFormatter: (row) => formatDecimal(row.weightedScore),
      describeRow: (row) => `${row.driver} | ${row.seasonId}`,
      detailTitle: "Strongest peak seasons",
      detailSummary:
        "Rows are sorted by weighted score, with the explorer view switching between weighted, totals, pace, results, and efficiency columns.",
    }),
    buildInsightCardModel({
      id: "bestNonTitle",
      title: "Best Non-Title Seasons",
      subtitle: "Elite campaigns that did not convert into a WDC.",
      rowType: "season",
      recommendedView: "weighted",
      rows: records
        .filter((record) => !record.wdc)
        .sort((left, right) => (right.weightedScore || 0) - (left.weightedScore || 0)),
      metricLabel: "WS",
      metricFormatter: (row) => formatDecimal(row.weightedScore),
      describeRow: (row) => `${row.driver} | ${row.seasonId}`,
      detailTitle: "Best non-title seasons",
      detailSummary:
        "This explorer slice excludes WDC-winning seasons so near-miss campaigns can be compared on their own terms.",
    }),
    buildInsightCardModel({
      id: "paceLeftOnTable",
      title: "Most Pace Left On The Table",
      subtitle: "Seasons whose pole and fastest-lap speed outpaced final results conversion.",
      rowType: "season",
      recommendedView: "pace",
      rows: [...records].sort((left, right) => (right.paceGap || 0) - (left.paceGap || 0)),
      metricLabel: "Gap",
      metricFormatter: (row) => formatPercent(row.paceGap),
      describeRow: (row) => `${row.driver} | ${row.seasonId}`,
      detailTitle: "Pace versus results gap",
      detailSummary:
        "Positive gaps mean the season's raw pace signal was stronger than its final results signal. Negative gaps indicate especially efficient results conversion.",
    }),
    buildInsightCardModel({
      id: "clutchConverters",
      title: "Clutch Converters",
      subtitle: "Seasons that beat their raw pace profile by cashing in results anyway.",
      rowType: "season",
      recommendedView: "results",
      rows: records
        .filter((record) => (record.clutchScore || 0) > 0)
        .sort((left, right) => (right.clutchScore || 0) - (left.clutchScore || 0)),
      metricLabel: "Clutch",
      metricFormatter: (row) => formatPercent(row.clutchScore),
      describeRow: (row) => `${row.driver} | ${row.seasonId}`,
      detailTitle: "Results-first conversion seasons",
      detailSummary:
        "Rows are sorted by how much the final results signal outperformed the underlying pace signal inside the local insights scope.",
    }),
    buildInsightCardModel({
      id: "qualifyingDemons",
      title: "Qualifying Demons",
      subtitle: "The seasons with the sharpest one-lap bite from poles and fastest laps.",
      rowType: "season",
      recommendedView: "pace",
      rows: [...records].sort(
        (left, right) => (right.qualifyingScore || 0) - (left.qualifyingScore || 0),
      ),
      metricLabel: "Qual",
      metricFormatter: (row) => formatPercent(row.qualifyingScore),
      describeRow: (row) => `${row.driver} | ${row.seasonId}`,
      detailTitle: "Qualifying power seasons",
      detailSummary:
        "Qualifying score leans on pole rate first and uses fastest-lap rate as the tie-break signal for one-lap strength.",
    }),
    buildInsightCardModel({
      id: "ironmanSeasons",
      title: "Ironman Seasons",
      subtitle: "Durable campaigns that kept showing up and still delivered meaningful results.",
      rowType: "season",
      recommendedView: "efficiency",
      rows: [...records].sort((left, right) => (right.ironmanScore || 0) - (left.ironmanScore || 0)),
      metricLabel: "Iron",
      metricFormatter: (row) => formatPercent(row.ironmanScore),
      describeRow: (row) => `${row.driver} | ${row.seasonId}`,
      detailTitle: "Durability-heavy season leaders",
      detailSummary:
        "Ironman score weights participation most heavily, then uses top-five and points rate to reward seasons that stayed present without becoming empty mileage.",
    }),
    buildInsightCardModel({
      id: "biggestJump",
      title: "Biggest Year-over-Year Jump",
      subtitle: "The sharpest weighted-score improvement from one season to the next.",
      rowType: "season",
      recommendedView: "efficiency",
      rows: records
        .filter((record) => record.weightedScoreDeltaPrev != null)
        .sort(
          (left, right) => (right.weightedScoreDeltaPrev || 0) - (left.weightedScoreDeltaPrev || 0),
        ),
      metricLabel: "Delta",
      metricFormatter: (row) => formatDecimal(row.weightedScoreDeltaPrev),
      describeRow: (row) =>
        `${row.driver} | ${row.previousSeasonId || "n/a"} -> ${row.seasonId}`,
      detailTitle: "Year-over-year weighted-score jumps",
      detailSummary:
        "Each row compares a season against the immediately previous completed season for the same driver inside the local insights scope.",
    }),
    buildInsightCardModel({
      id: "biggestDropOff",
      title: "Biggest Drop-Offs",
      subtitle: "The steepest weighted-score declines from one completed season to the next.",
      rowType: "season",
      recommendedView: "efficiency",
      rows: records
        .filter((record) => record.weightedScoreDeltaPrev != null && record.weightedScoreDeltaPrev < 0)
        .sort(
          (left, right) => (left.weightedScoreDeltaPrev || 0) - (right.weightedScoreDeltaPrev || 0),
        ),
      metricLabel: "Delta",
      metricFormatter: (row) => formatDecimal(row.weightedScoreDeltaPrev),
      describeRow: (row) =>
        `${row.driver} | ${row.previousSeasonId || "n/a"} -> ${row.seasonId}`,
      detailTitle: "Year-over-year weighted-score drop-offs",
      detailSummary:
        "Rows are limited to negative season-over-season deltas so the explorer isolates regression years instead of simply mirroring the jump card.",
    }),
  ].filter((card) => card.rows.length);
}

// Career insight cards roll up the local season slice into broader driver-level stories.
function buildCareerInsightCards(rollups) {
  return [
    buildInsightCardModel({
      id: "mostEfficientCareer",
      title: "Most Efficient Careers",
      subtitle: "Drivers turning seasons into points-rate and top-five efficiency most consistently.",
      rowType: "career",
      recommendedView: "efficiency",
      rows: [...rollups].sort((left, right) => (right.efficiencyScore || 0) - (left.efficiencyScore || 0)),
      metricLabel: "Efficiency",
      metricFormatter: (row) => formatPercent(row.efficiencyScore),
      describeRow: (row) => row.driver,
      detailTitle: "Career efficiency leaders",
      detailSummary:
        "Efficiency blends average points rate and average top-five rate across the local season slice for each driver.",
    }),
    buildInsightCardModel({
      id: "consistencyMonster",
      title: "Consistency Monsters",
      subtitle: "Drivers with the most reliable top-five presence and participation.",
      rowType: "career",
      recommendedView: "efficiency",
      rows: [...rollups].sort((left, right) => (right.consistencyScore || 0) - (left.consistencyScore || 0)),
      metricLabel: "Consistency",
      metricFormatter: (row) => formatPercent(row.consistencyScore),
      describeRow: (row) => row.driver,
      detailTitle: "Career consistency leaders",
      detailSummary:
        "Consistency blends average top-five rate and average participation so durable front-running careers rise to the top.",
    }),
    buildInsightCardModel({
      id: "strongestCareerPeak",
      title: "Strongest Career Peaks",
      subtitle: "Drivers with the single best season ceiling inside the current scope.",
      rowType: "career",
      recommendedView: "weighted",
      rows: [...rollups].sort((left, right) => (right.peakWs || 0) - (left.peakWs || 0)),
      metricLabel: "Peak WS",
      metricFormatter: (row) => formatDecimal(row.peakWs),
      describeRow: (row) =>
        `${row.driver}${row.peakSeason ? ` | ${row.peakSeason.seasonId}` : ""}`,
      detailTitle: "Career peak-season leaders",
      detailSummary:
        "Peak weighted score highlights the single strongest season reached by each driver's local-career slice.",
    }),
    buildInsightCardModel({
      id: "mostDecoratedCareer",
      title: "Most Decorated Careers",
      subtitle: "Titles first, then wins as a lightweight tie-break inside the current scope.",
      rowType: "career",
      recommendedView: "totals",
      rows: [...rollups].sort((left, right) => (right.decoratedScore || 0) - (left.decoratedScore || 0)),
      metricLabel: "Decorated",
      metricFormatter: (row) => formatDecimal(row.decoratedScore),
      describeRow: (row) => row.driver,
      detailTitle: "Most decorated career slices",
      detailSummary:
        "Decorated score weights WDCs most heavily, WCCs second, and uses wins as a small tie-break within the local slice.",
    }),
    buildInsightCardModel({
      id: "trackTyrants",
      title: "Track Tyrants",
      subtitle: "Drivers whose best venue pairing becomes a true signature weapon.",
      rowType: "career",
      recommendedView: "weighted",
      rows: [...rollups]
        .filter((row) => row.signatureTrack)
        .sort((left, right) => (right.signatureTrackScore || 0) - (left.signatureTrackScore || 0)),
      metricLabel: "Score",
      metricFormatter: (row) => formatDecimal(row.signatureTrackScore),
      describeRow: (row) => `${row.driver} | ${row.signatureTrack?.track || "n/a"}`,
      detailTitle: "Signature track dominance",
      detailSummary:
        "Each row captures the strongest single track profile for that driver inside the local scope, scored with the same Bayesian-adjusted venue model used elsewhere in the app.",
      detailColumns: buildTrackTyrantColumns,
      viewLabelMap: {
        weighted: "Track score",
        totals: "Track totals",
        pace: "Adjusted rates",
        results: "Track results",
        efficiency: "Track efficiency",
      },
    }),
  ].filter((card) => card.rows.length);
}

// A compact card model keeps the top-band UI declarative while still carrying the drill-down rows used by the explorer.
function buildInsightCardModel(config) {
  const leader = config.rows[0] || null;
  return {
    ...config,
    leader,
    leaderLabel: leader ? config.describeRow(leader) : "No result",
    leaderMetric: leader ? config.metricFormatter(leader) : "n/a",
    runnersUp: config.rows.slice(1, 3).map((row) => config.describeRow(row)),
  };
}

// Cards are clickable because they reconfigure the explorer table below, not just because they are decorative summaries.
function buildInsightCardMarkup(card, isActive) {
  const rowTypeLabel = card.rowTypeLabel || (card.rowType === "career" ? "Career insight" : "Season insight");
  return `
    <button
      class="insight-card ${isActive ? "is-active" : ""} fade-in"
      type="button"
      data-insight-id="${escapeHtml(card.id)}"
      data-insight-view="${escapeHtml(card.recommendedView)}"
    >
      <div class="insight-card__eyebrow">${escapeHtml(rowTypeLabel)}</div>
      <h3 class="insight-card__title">${escapeHtml(card.title)}</h3>
      <p class="insight-card__summary">${escapeHtml(card.subtitle)}</p>
      <div class="insight-card__leader">
        <div class="insight-card__leader-label">${escapeHtml(card.leaderLabel)}</div>
        <div class="insight-card__leader-metric">${escapeHtml(card.metricLabel)} ${escapeHtml(card.leaderMetric)}</div>
      </div>
      <div class="insight-card__footer">
        ${card.runnersUp.length ? escapeHtml(`Next: ${card.runnersUp.join(" | ")}`) : "No runner-up rows in scope"}
      </div>
    </button>
  `;
}

// The explorer table below the cards keeps every insight auditable by exposing the full sorted row list behind the headline.
function renderInsightExplorer(activeCard) {
  const currentViewLabel = activeCard.viewLabelMap?.[state.insights.view] || INSIGHTS_VIEW_LABELS[state.insights.view];
  const columns = activeCard.detailColumns
    ? activeCard.detailColumns(state.insights.view)
    : activeCard.rowType === "career"
      ? buildCareerInsightColumns(state.insights.view)
      : buildSeasonInsightColumns(state.insights.view);
  const meta = `${activeCard.detailSummary} Current column view: ${currentViewLabel}.`;

  refs["insights-detail-title"].textContent = activeCard.detailTitle;
  refs["insights-detail-badge"].textContent = `${activeCard.rows.length} rows | ${currentViewLabel}`;
  refs["insights-detail-summary"].textContent = meta;
  refs["insights-detail-table"].innerHTML = buildTableCard(
    activeCard.detailTitle,
    meta,
    columns,
    activeCard.rows,
  );
}

// Season columns pivot between weighted, totals, pace, results, and efficiency without changing the underlying ranked rows.
function buildSeasonInsightColumns(view) {
  const baseColumns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5 },
    { key: "seasonId", label: "Season", strong: true },
  ];

  const viewColumns = {
    weighted: [
      { key: "weightedScore", label: "WS", render: (row) => formatDecimal(row.weightedScore) },
      { key: "pointsRate", label: "Pts rate", format: "percent" },
      { key: "top5Rate", label: "Top 5", format: "percent" },
      { key: "winRate", label: "Win rate", format: "percent" },
      {
        key: "titleFlags",
        label: "Titles",
        render: (row) => `${row.wdc ? "WDC" : "-"} / ${row.wcc ? "WCC" : "-"}`,
      },
    ],
    totals: [
      { key: "points", label: "Points" },
      { key: "wins", label: "Wins" },
      { key: "podiums", label: "Podiums" },
      { key: "poles", label: "Poles" },
      { key: "fastestLaps", label: "FLs" },
      { key: "races", label: "Races" },
    ],
    pace: [
      { key: "paceScore", label: "Pace score", format: "percent" },
      { key: "fastestLapRate", label: "FL rate", format: "percent" },
      { key: "poleRate", label: "Pole rate", format: "percent" },
      { key: "resultsScore", label: "Results score", format: "percent" },
      { key: "paceGap", label: "Pace gap", format: "percent" },
    ],
    results: [
      { key: "resultsScore", label: "Results score", format: "percent" },
      { key: "winRate", label: "Win rate", format: "percent" },
      { key: "podiumRate", label: "Pod rate", format: "percent" },
      { key: "pointsRate", label: "Pts rate", format: "percent" },
      { key: "weightedScore", label: "WS", render: (row) => formatDecimal(row.weightedScore) },
    ],
    efficiency: [
      { key: "participationRate", label: "Participation", format: "percent" },
      { key: "pointsPerRace", label: "Pts/race", render: (row) => formatDecimal(row.pointsPerRace, 1) },
      { key: "top5Rate", label: "Top 5", format: "percent" },
      {
        key: "weightedScoreDeltaPrev",
        label: "WS delta",
        render: (row) =>
          row.weightedScoreDeltaPrev == null ? "n/a" : formatDecimal(row.weightedScoreDeltaPrev),
      },
      {
        key: "previousSeasonId",
        label: "Prev season",
        render: (row) => row.previousSeasonId || "n/a",
      },
    ],
  };

  return [...baseColumns, ...(viewColumns[view] || viewColumns.weighted)];
}

function buildTrackTyrantColumns(view) {
  const baseColumns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5 },
    {
      key: "signatureTrack",
      label: "Signature track",
      strong: true,
      render: (row) => row.signatureTrack?.track || "n/a",
    },
  ];

  const viewColumns = {
    weighted: [
      {
        key: "signatureTrackScore",
        label: "Track score",
        render: (row) => formatDecimal(row.signatureTrackScore),
      },
      { key: "signatureTrackAdjWinRate", label: "Adj win", format: "percent" },
      { key: "signatureTrackAdjPodiumRate", label: "Adj podium", format: "percent" },
      { key: "signatureTrackAdjTop5Rate", label: "Adj top 5", format: "percent" },
      { key: "signatureTrackStarts", label: "Starts" },
    ],
    totals: [
      { key: "signatureTrackStarts", label: "Starts" },
      { key: "signatureTrackWins", label: "Wins" },
      { key: "signatureTrackPodiums", label: "Podiums" },
      { key: "signatureTrackTop5s", label: "Top 5s" },
      {
        key: "signatureTrackPoints",
        label: "Points",
        render: (row) => formatInteger(row.signatureTrack?.totalPoints),
      },
      { key: "trackPortfolioCount", label: "Tracks" },
    ],
    pace: [
      {
        key: "signatureTrackRawWinRate",
        label: "Raw win",
        render: (row) => formatPercent(row.signatureTrack?.rawWinRate),
      },
      { key: "signatureTrackAdjWinRate", label: "Adj win", format: "percent" },
      {
        key: "signatureTrackRawPodiumRate",
        label: "Raw podium",
        render: (row) => formatPercent(row.signatureTrack?.rawPodiumRate),
      },
      { key: "signatureTrackAdjPodiumRate", label: "Adj podium", format: "percent" },
      { key: "signatureTrackStarts", label: "Starts" },
    ],
    results: [
      {
        key: "signatureTrackScore",
        label: "Track score",
        render: (row) => formatDecimal(row.signatureTrackScore),
      },
      { key: "signatureTrackWins", label: "Wins" },
      { key: "signatureTrackPodiums", label: "Podiums" },
      { key: "signatureTrackAdjWinRate", label: "Adj win", format: "percent" },
      { key: "signatureTrackAdjTop5Rate", label: "Adj top 5", format: "percent" },
    ],
    efficiency: [
      {
        key: "signatureTrackPointsPerStart",
        label: "Pts/start",
        render: (row) => formatDecimal(row.signatureTrackPointsPerStart, 1),
      },
      {
        key: "signatureTrackScore",
        label: "Track score",
        render: (row) => formatDecimal(row.signatureTrackScore),
      },
      { key: "signatureTrackAdjTop5Rate", label: "Adj top 5", format: "percent" },
      { key: "signatureTrackStarts", label: "Starts" },
      { key: "trackPortfolioCount", label: "Tracks" },
    ],
  };

  return [...baseColumns, ...(viewColumns[view] || viewColumns.weighted)];
}

// Career columns expose the same grouped rows through different metric families without changing which career slices are ranked.
function buildCareerInsightColumns(view) {
  const baseColumns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5 },
    { key: "seasonsCount", label: "Seasons" },
  ];

  const viewColumns = {
    weighted: [
      { key: "avgWs", label: "Avg WS", render: (row) => formatDecimal(row.avgWs) },
      { key: "peakWs", label: "Peak WS", render: (row) => formatDecimal(row.peakWs) },
      {
        key: "peakSeason",
        label: "Peak season",
        render: (row) => row.peakSeason?.seasonId || "n/a",
      },
      { key: "avgPointsRate", label: "Avg pts rate", format: "percent" },
      { key: "avgTop5Rate", label: "Avg top 5", format: "percent" },
    ],
    totals: [
      { key: "totalPoints", label: "Points" },
      { key: "totalWins", label: "Wins" },
      { key: "totalPodiums", label: "Podiums" },
      { key: "totalPoles", label: "Poles" },
      { key: "totalFastestLaps", label: "FLs" },
      {
        key: "titles",
        label: "Titles",
        render: (row) => `${row.totalWdc} / ${row.totalWcc}`,
      },
    ],
    pace: [
      { key: "averagePaceScore", label: "Pace score", format: "percent" },
      { key: "avgFastestLapRate", label: "Avg FL rate", format: "percent" },
      { key: "avgPoleRate", label: "Avg pole rate", format: "percent" },
      { key: "peakWs", label: "Peak WS", render: (row) => formatDecimal(row.peakWs) },
    ],
    results: [
      { key: "avgWinRate", label: "Avg win", format: "percent" },
      { key: "avgPodiumRate", label: "Avg podium", format: "percent" },
      { key: "avgPointsRate", label: "Avg pts rate", format: "percent" },
      { key: "totalWdc", label: "WDC" },
      { key: "totalWcc", label: "WCC" },
    ],
    efficiency: [
      { key: "efficiencyScore", label: "Efficiency", format: "percent" },
      { key: "consistencyScore", label: "Consistency", format: "percent" },
      { key: "avgTop5Rate", label: "Avg top 5", format: "percent" },
      { key: "avgParticipationRate", label: "Avg participation", format: "percent" },
      { key: "avgPointsRate", label: "Avg pts rate", format: "percent" },
    ],
  };

  return [...baseColumns, ...(viewColumns[view] || viewColumns.weighted)];
}

// The comparison tab reuses the same arc renderer, but only for explicitly selected drivers.
function renderComparisonSeasonChart(dataset) {
  refs["comparison-season-chart"].innerHTML = buildWeightedScoreArcMarkup(
    dataset,
    state.selectedDrivers,
    "Select one or more drivers in the sidebar to compare season-over-season weighted scores.",
  );
}

// Shared SVG arc renderer for both the comparison tab and the broader career chart panel.
function buildWeightedScoreArcMarkup(dataset, driverNames, emptyMessage) {
  const selectedDrivers = (driverNames || []).filter(Boolean);
  const filtered = getFilteredSeasonRecords(dataset).filter((record) =>
    selectedDrivers.includes(record.driver),
  );
  if (!filtered.length) {
    return renderEmptyStateMarkup(emptyMessage);
  }

  const seasons = uniqueList(filtered.map((record) => record.seasonId)).sort(
    (left, right) => getSeasonOrder(left) - getSeasonOrder(right),
  );
  const width = 820;
  const height = 340;
  const padding = { top: 24, right: 138, bottom: 48, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const xDenominator = Math.max(seasons.length - 1, 1);
  const yMax = Math.max(1, maxOf(filtered, (record) => record.weightedScore));

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const yValue = ratio * yMax;
    const y = padding.top + innerHeight - (yValue / yMax) * innerHeight;
    return `
      <line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(91,66,48,0.12)" stroke-dasharray="4 6" />
      <text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6a5748">${formatDecimal(yValue, 2)}</text>
    `;
  });

  const xLabels = seasons
    .map((seasonId, index) => {
      const x = padding.left + (index / xDenominator) * innerWidth;
      return `<text x="${x}" y="${height - 16}" text-anchor="middle" font-size="11" fill="#6a5748">${escapeHtml(seasonId)}</text>`;
    })
    .join("");

  const endpoints = [];
  const seriesMarkup = selectedDrivers
    .map((driver) => {
      const series = filtered
        .filter((record) => record.driver === driver)
        .sort((left, right) => getSeasonOrder(left.seasonId) - getSeasonOrder(right.seasonId));

      const color = colorForDriver(driver);
      const points = series
        .map((record) => {
          const xIndex = seasons.indexOf(record.seasonId);
          const x = padding.left + (xIndex / xDenominator) * innerWidth;
          const y =
            padding.top + innerHeight - ((record.weightedScore || 0) / yMax) * innerHeight;
          return {
            x,
            y,
            seasonId: record.seasonId,
            score: record.weightedScore,
          };
        })
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));

      if (points.length) {
        endpoints.push({
          driver,
          color,
          x: points[points.length - 1].x,
          y: points[points.length - 1].y,
        });
      }

      return `
        <polyline fill="none" stroke="${color}" stroke-width="2" points="${points
          .map((point) => `${point.x},${point.y}`)
          .join(" ")}" />
        ${points
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="3" fill="${color}" stroke="#fff9f4" stroke-width="1.5">
                <title>${escapeHtml(driver)} | ${escapeHtml(point.seasonId)} | ${formatDecimal(point.score)}</title>
              </circle>
            `,
          )
          .join("")}
      `;
    })
    .join("");

  const labelMarkup = buildArcEndpointLabelMarkup(endpoints, width, height, padding);

  return `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Season-over-season weighted score chart">
      <rect x="0" y="0" width="${width}" height="${height}" rx="24" fill="rgba(255,255,255,0.52)" />
      ${gridLines.join("")}
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="rgba(91,66,48,0.24)" />
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="rgba(91,66,48,0.24)" />
      ${seriesMarkup}
      ${labelMarkup}
      ${xLabels}
    </svg>
    <div class="chart-legend">
      ${selectedDrivers
        .map(
          (driver) => `
            <span class="legend-item">
              <button class="legend-swatch legend-swatch--button" type="button" data-driver="${escapeHtml(driver)}" aria-label="Change ${escapeHtml(driver)} line color" title="Change ${escapeHtml(driver)} line color" style="background:${colorForDriver(driver)}"></button>
              ${escapeHtml(driver)}
            </span>
          `,
        )
        .join("")}
      </div>
  `;
}

function buildArcEndpointLabelMarkup(endpoints, width, height, padding) {
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
        <line x1="${label.x}" y1="${label.desiredY}" x2="${connectorX}" y2="${label.y}" stroke="${label.color}" stroke-width="1" opacity="0.8" />
        <text x="${labelX}" y="${label.y + 4}" font-size="11" font-weight="700" fill="${label.color}" text-anchor="start" style="paint-order:stroke;stroke:#fff9f4;stroke-width:4;stroke-linejoin:round;">${escapeHtml(label.driver)}</text>
      `,
    )
    .join("");
}

// Driver profile combines static career totals with a preset-specific breakdown and narrative.
function renderDriverProfile(dataset) {
  const activePreset = getActivePreset();
  const ranking = buildCareerAggregates(dataset);
  const aggregate =
    ranking.find((entry) => entry.driver === state.filters.profileDriver) || ranking[0] || null;

  refs["profile-badge"].textContent = aggregate ? aggregate.driver : "No driver selected";

  if (!aggregate) {
    refs["driver-profile"].innerHTML = renderEmptyStateMarkup(
      "Choose a profile driver to unlock the career card and index breakdown.",
    );
    return;
  }

  state.filters.profileDriver = aggregate.driver;
  const career = aggregate.careerRecord;
  const sliceDescriptor = describeCurrentSlice();
  const narrative = buildDriverNarrative(aggregate, sliceDescriptor);

  refs["driver-profile"].innerHTML = `
    <article class="profile-card fade-in">
      <div class="profile-card__header">
        <div>
          <h3 class="profile-card__title">${escapeHtml(aggregate.driver)}</h3>
          <div class="profile-card__meta">${escapeHtml(sliceDescriptor)}</div>
        </div>
        <span class="badge badge--accent">CPI ${formatDecimal(career.cpi)}</span>
      </div>
      <div class="stat-grid">
        ${buildStatPair("WDC / WCC", `${formatInteger(career.wdc)} / ${formatInteger(career.wcc)}`)}
        ${buildStatPair("Career wins", formatInteger(career.wins))}
        ${buildStatPair("Career podiums", formatInteger(career.podiums))}
        ${buildStatPair("Career races", formatInteger(career.races))}
        ${buildStatPair("Peak season", career.bestSeasonId || "n/a")}
        ${buildStatPair("Peak WS", formatDecimal(career.bestSeasonScore))}
      </div>
      <div class="subtle-text">${escapeHtml(narrative)}</div>
      ${
        career.hasCareerGap
          ? `<div class="fine-print">This driver is missing from the Full Career Statistics table, so some totals are derived from season-level data.</div>`
          : ""
      }
    </article>
    <article class="profile-card fade-in">
      <div class="profile-card__header">
        <div>
          <h3 class="profile-card__title">Filtered index breakdown</h3>
          <div class="profile-card__meta">The current preset is ${escapeHtml(activePreset.label.toLowerCase())}</div>
        </div>
        <span class="badge">${formatComposite(aggregate.composite)}</span>
      </div>
      <div class="score-breakdown">
        ${aggregate.contributions
          .map((item) => buildBarRow(item.label, item.rawValue, item.normalized, item.key))
          .join("")}
      </div>
    </article>
  `;
}

// Comparison workspace explains why the current preset ranks the selected drivers the way it does.
function renderComparisonWorkspace(dataset) {
  const activePreset = getActivePreset();
  if (!state.selectedDrivers.length) {
    refs["comparison-workspace"].innerHTML = renderEmptyStateMarkup(
      "Select up to six drivers from the sidebar to compare their weighted-score makeup.",
    );
    return;
  }

  const ranking = buildCareerAggregates(dataset);
  const selected = state.selectedDrivers
    .map((driver) => ranking.find((entry) => entry.driver === driver))
    .filter(Boolean);
  const carSpecBreakdown = buildDriverCarSpecBreakdown(dataset, state.selectedDrivers);

  refs["comparison-workspace"].innerHTML = `
    ${
      selected.length
        ? `
          <article class="comparison-card fade-in">
            <div class="comparison-card__header">
              <div>
                <h3 class="comparison-card__title">Composite comparison</h3>
                <div class="profile-card__meta">${escapeHtml(activePreset.description)}</div>
              </div>
            </div>
            <div class="comparison-grid">
              ${selected.map((aggregate) => buildComparisonDriverCard(aggregate)).join("")}
            </div>
          </article>
          <article class="comparison-card fade-in">
            <div class="comparison-card__header">
              <div>
                <h3 class="comparison-card__title">Reading the preset</h3>
                <div class="profile-card__meta">Each band shows the weighted share of the current comparison score.</div>
              </div>
            </div>
            <div class="subtle-text">${escapeHtml(buildPresetExplanation(activePreset))}</div>
            <div class="pill-row">
              ${Object.entries(activePreset.careerWeights)
                .map(
                  ([key, weight]) =>
                    `<span class="pill" style="background:${hexToAlpha(METRIC_COLORS[key], 0.13)};color:${METRIC_COLORS[key]}">${escapeHtml(metricLabel(key))} ${Math.round(weight * 100)}%</span>`,
                )
                .join("")}
            </div>
          </article>
        `
        : `
          <article class="comparison-card fade-in">
            <div class="comparison-card__header">
              <div>
                <h3 class="comparison-card__title">Composite comparison</h3>
                <div class="profile-card__meta">${escapeHtml(activePreset.description)}</div>
              </div>
            </div>
            ${renderEmptyStateMarkup("No selected drivers match the current filter slice for the preset comparison.")}
          </article>
        `
    }
    <article class="comparison-card comparison-card--wide fade-in">
      <div class="comparison-card__header">
        <div>
          <h3 class="comparison-card__title">Formula vs Sports</h3>
          <div class="profile-card__meta">Uses the current comparison slice, but keeps both divisions visible for the split.</div>
        </div>
      </div>
      <div class="comparison-grid">
        ${state.selectedDrivers.map((driver) => buildCarSpecComparisonCard(driver, carSpecBreakdown[driver])).join("")}
      </div>
    </article>
  `;
}

// Track performance table for the profile driver — top 15 tracks by Bayesian-adjusted score.
function renderTrackPerformance(dataset) {
  const driver = state.filters.profileDriver;
  const cache = state.trackAggregateCache[dataset.id] || null;

  if (!driver) {
    refs["track-performance"].innerHTML = renderEmptyStateMarkup(
      "Choose a profile driver to see their track performance analysis.",
    );
    return;
  }

  const tracks = getDriverTrackProfile(dataset, driver, cache, 15);

  if (!tracks.length) {
    refs["track-performance"].innerHTML = renderEmptyStateMarkup(
      "No venue-level data found for this driver.",
    );
    return;
  }

  // Normalise scores against the driver's personal max so the bar widths are meaningful.
  const maxScore = tracks.reduce((best, t) => Math.max(best, t.trackScore || 0), 0);
  const tableColumns = prepareTableColumns([
    {
      label: "#",
      sticky: true,
      stickyWidthRem: 3.25,
      className: "rank-col",
    },
    {
      label: "Track",
      sticky: true,
      stickyWidthRem: 11.5,
    },
    { label: "Starts", className: "num-col" },
    { label: "Wins", className: "num-col" },
    { label: "Podiums", className: "num-col" },
    { label: "Top 5s", className: "num-col" },
    { label: "Score" },
  ]);

  refs["track-performance"].innerHTML = `
    <article class="profile-card fade-in">
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th scope="col"${buildTableCellAttributes(tableColumns[0], { header: true })}>#</th>
              <th scope="col"${buildTableCellAttributes(tableColumns[1], { header: true })}>Track</th>
              <th scope="col"${buildTableCellAttributes(tableColumns[2], { header: true })}>Starts</th>
              <th scope="col"${buildTableCellAttributes(tableColumns[3], { header: true })}>Wins</th>
              <th scope="col"${buildTableCellAttributes(tableColumns[4], { header: true })}>Podiums</th>
              <th scope="col"${buildTableCellAttributes(tableColumns[5], { header: true })}>Top 5s</th>
              <th scope="col"${buildTableCellAttributes(tableColumns[6], { header: true })}>Score</th>
            </tr>
          </thead>
          <tbody>
            ${tracks
              .map((t, index) => {
                const barWidth = maxScore > 0 ? Math.round((t.trackScore / maxScore) * 100) : 0;
                return `
                  <tr>
                    <td${buildTableCellAttributes(tableColumns[0])}>${index + 1}</td>
                    <td${buildTableCellAttributes(tableColumns[1])}>${escapeHtml(t.track)}</td>
                    <td${buildTableCellAttributes(tableColumns[2])}>${formatInteger(t.starts)}</td>
                    <td${buildTableCellAttributes(tableColumns[3])}>${formatInteger(t.wins)}</td>
                    <td${buildTableCellAttributes(tableColumns[4])}>${formatInteger(t.podiums)}</td>
                    <td${buildTableCellAttributes(tableColumns[5])}>${formatInteger(t.top5s)}</td>
                    <td${buildTableCellAttributes(tableColumns[6])}>
                      <div class="track-score-cell">
                        <div class="track-score-bar-wrap">
                          <div class="track-score-bar" style="width:${barWidth}%"></div>
                        </div>
                        <span class="track-score-label">${formatDecimal(t.trackScore)}</span>
                      </div>
                    </td>
                  </tr>
                `;
              })
              .join("")}
          </tbody>
        </table>
      </div>
      <div class="fine-print">Scores use empirical Bayes shrinkage (k&nbsp;=&nbsp;5) to balance raw performance against sample size. DNS/DNF entries excluded.</div>
    </article>
  `;
}

// Top-3-tracks cards for each selected driver in the comparison view.
function renderComparisonTopTracks(dataset) {
  const cache = state.trackAggregateCache[dataset.id] || null;

  if (!state.selectedDrivers.length) {
    refs["comparison-top-tracks"].innerHTML = renderEmptyStateMarkup(
      "Select drivers to compare their strongest tracks.",
    );
    return;
  }

  const topTracksByDriver = getDriversTopTracks(dataset, state.selectedDrivers, cache, 3);
  const comparisonColumns = prepareTableColumns([
    { label: "Track", sticky: true, stickyWidthRem: 10.5 },
    { label: "Starts", className: "num-col" },
    { label: "Wins", className: "num-col" },
    { label: "Score", className: "num-col" },
  ]);

  refs["comparison-top-tracks"].innerHTML = `
    <article class="comparison-card fade-in">
      <div class="comparison-grid">
        ${state.selectedDrivers
          .map((driver) => {
            const tracks = topTracksByDriver[driver] || [];
            const color = colorForDriver(driver);
            return `
              <div class="comparison-driver">
                <div class="comparison-driver__header" style="border-color:${color}">
                  <span class="comparison-driver__name">${escapeHtml(driver)}</span>
                </div>
                ${
                  tracks.length
                    ? `<div class="table-wrap">
                        <table class="data-table data-table--compact">
                          <thead>
                            <tr>
                              <th scope="col"${buildTableCellAttributes(comparisonColumns[0], { header: true })}>Track</th>
                              <th scope="col"${buildTableCellAttributes(comparisonColumns[1], { header: true })}>Starts</th>
                              <th scope="col"${buildTableCellAttributes(comparisonColumns[2], { header: true })}>Wins</th>
                              <th scope="col"${buildTableCellAttributes(comparisonColumns[3], { header: true })}>Score</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${tracks
                              .map(
                                (t) => `
                              <tr>
                                <td${buildTableCellAttributes(comparisonColumns[0])}>${escapeHtml(t.track)}</td>
                                <td${buildTableCellAttributes(comparisonColumns[1])}>${formatInteger(t.starts)}</td>
                                <td${buildTableCellAttributes(comparisonColumns[2])}>${formatInteger(t.wins)}</td>
                                <td${buildTableCellAttributes(comparisonColumns[3])}>${formatDecimal(t.trackScore)}</td>
                              </tr>
                            `,
                              )
                              .join("")}
                          </tbody>
                        </table>
                      </div>`
                    : `<div class="subtle-text">No venue data available.</div>`
                }
              </div>
            `;
          })
          .join("")}
      </div>
    </article>
  `;
}

// Fingerprint cards spotlight the profile driver's strongest seasons in the active slice.
function renderSeasonFingerprints(dataset) {
  const profileDriver = state.filters.profileDriver;
  const records = sortBySeason(
    dataset.weightedRecords
      .filter((record) => record.driver === profileDriver && !record.isUpcoming)
      .filter((record) => {
        if (state.filters.season !== "all" && record.seasonId !== state.filters.season) {
          return false;
        }
        if (state.filters.era !== "all" && record.eraLabel !== state.filters.era) {
          return false;
        }
        if (state.filters.division !== "all" && record.type !== state.filters.division) {
          return false;
        }
        return true;
      }),
  )
    .sort((left, right) => (right.weightedScore || 0) - (left.weightedScore || 0))
    .slice(0, 3);

  refs["season-fingerprints"].innerHTML = records.length
    ? records
        .map(
          (record) => `
            <article class="fingerprint-card fade-in">
              <div class="fingerprint-card__header">
                <div>
                  <h3 class="fingerprint-card__title">${escapeHtml(record.seasonId)}</h3>
                  <div class="fingerprint-card__meta">${escapeHtml(record.type || "Unknown")} | ${escapeHtml(record.car || "Unknown car")}</div>
                </div>
                <div class="fingerprint-card__score">${formatDecimal(record.weightedScore)}</div>
              </div>
              <div class="pill-row">
                <span class="pill">Win ${formatPercent(record.winRate)}</span>
                <span class="pill">Pod ${formatPercent(record.podiumRate)}</span>
                <span class="pill">Top 5 ${formatPercent(record.top5Rate)}</span>
              </div>
              <div class="subtle-text">Team: ${escapeHtml(record.teamName || "Not mapped")} | Pts/race ${formatDecimal(record.pointsPerRace, 1)}</div>
            </article>
          `,
        )
        .join("")
    : renderEmptyStateMarkup("This driver has no scored seasons in the current filter slice.");
}

// "What changed" is a compact season-to-season delta view for the active profile driver.
function renderWhatChanged(dataset) {
  const records = sortBySeason(
    dataset.weightedRecords
      .filter((record) => record.driver === state.filters.profileDriver && !record.isUpcoming)
      .filter((record) => {
        if (state.filters.division !== "all" && record.type !== state.filters.division) {
          return false;
        }
        if (state.filters.car !== "all" && record.car !== state.filters.car) {
          return false;
        }
        return true;
      }),
  );

  if (records.length < 2) {
    refs["what-changed"].innerHTML = renderEmptyStateMarkup(
      "At least two completed seasons are needed for a delta view.",
    );
    return;
  }

  const latest = records[records.length - 1];
  const previous = records[records.length - 2];
  const debut = records[0];
  const peak = [...records].sort((left, right) => (right.weightedScore || 0) - (left.weightedScore || 0))[0];

  refs["what-changed"].innerHTML = `
    ${buildDeltaCard("Latest vs previous", latest, previous)}
    ${buildDeltaCard("Peak vs debut", peak, debut)}
  `;
}

// Delta cards compare a pair of season records metric by metric.
function buildDeltaCard(label, newer, older) {
  const delta = (newer.weightedScore || 0) - (older.weightedScore || 0);
  const toneClass = delta >= 0 ? "positive" : "negative";
  const lines = [
    buildDeltaLine("Weighted score", newer.weightedScore, older.weightedScore, false),
    buildDeltaLine("Points rate", newer.pointsRate, older.pointsRate, true),
    buildDeltaLine("Top 5 rate", newer.top5Rate, older.top5Rate, true),
    buildDeltaLine("Win rate", newer.winRate, older.winRate, true),
  ].join("");

  return `
    <article class="change-card ${toneClass} fade-in">
      <div class="change-card__header">
        <div>
          <h3 class="change-card__title">${escapeHtml(label)}</h3>
          <div class="change-card__meta">${escapeHtml(newer.seasonId)} against ${escapeHtml(older.seasonId)}</div>
        </div>
        <span class="badge ${delta >= 0 ? "badge--accent" : "badge--warning"}">${delta >= 0 ? "+" : ""}${formatDecimal(delta, 3)}</span>
      </div>
      <div class="score-breakdown">${lines}</div>
    </article>
  `;
}

function buildDeltaLine(label, nextValue, previousValue, isPercentish) {
  const nextText = isPercentish ? formatPercent(nextValue) : formatDecimal(nextValue);
  const previousText = isPercentish ? formatPercent(previousValue) : formatDecimal(previousValue);
  const delta = (nextValue || 0) - (previousValue || 0);
  return `
    <div class="bar-row">
      <div class="bar-row__label">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(previousText)} -> ${escapeHtml(nextText)} (${delta >= 0 ? "+" : ""}${isPercentish ? formatDecimal(delta, 1) + "%" : formatDecimal(delta, 3)})</span>
      </div>
    </div>
  `;
}

// Saved views persist a frozen filter/selection combination for quick recall.
function renderSavedViews() {
  refs["saved-views"].innerHTML = state.savedViews.length
    ? state.savedViews
        .map((view) => {
          const dataset = state.datasets.find((entry) => entry.id === view.datasetId);
          return `
            <article class="saved-view fade-in">
              <div class="saved-view__header">
                <div>
                  <h3 class="saved-view__title">${escapeHtml(view.label)}</h3>
                  <div class="saved-view__meta">${escapeHtml(dataset ? dataset.title : "Dataset removed")} | ${formatTimestamp(view.createdAt)}</div>
                </div>
              </div>
              <div class="saved-view__actions">
                <button class="mini-button" type="button" data-view-action="apply" data-view-id="${escapeHtml(view.id)}">Apply</button>
                <button class="mini-button mini-button--danger" type="button" data-view-action="delete" data-view-id="${escapeHtml(view.id)}">Delete</button>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyStateMarkup("Saved comparisons will appear here after you store a view.");
}

// UI micro-helpers keep the render templates readable and consistent.
function buildMetricCard(label, value, detail) {
  return `
    <article class="metric-card fade-in">
      <p class="metric-card__label">${escapeHtml(label)}</p>
      <p class="metric-card__value">${escapeHtml(String(value))}</p>
      <div class="metric-card__value-label">${escapeHtml(detail)}</div>
    </article>
  `;
}

function buildStatPair(label, value) {
  return `
    <div class="stat-pair">
      <span class="stat-pair__label">${escapeHtml(label)}</span>
      <span class="stat-pair__value">${escapeHtml(value)}</span>
    </div>
  `;
}

function buildBarRow(label, rawValue, normalized, key) {
  return `
    <div class="bar-row">
      <div class="bar-row__label">
        <span>${escapeHtml(label)}</span>
        <span>${escapeHtml(formatMetricValue(key, rawValue))}</span>
      </div>
      <div class="bar-track">
        <div class="bar-fill" style="width:${Math.max(0, Math.min(100, (normalized || 0) * 100))}%;background:linear-gradient(90deg, ${METRIC_COLORS[key] || "#0b756f"}, ${hexToAlpha(METRIC_COLORS[key] || "#0b756f", 0.52)})"></div>
      </div>
    </div>
  `;
}

function buildComparisonDriverCard(aggregate) {
  const track = aggregate.contributions
    .map(
      (item) => `
        <span class="contribution-segment" style="width:${Math.max(item.value * 100, 0)}%;background:${METRIC_COLORS[item.key] || "#0b756f"}"></span>
      `,
    )
    .join("");

  const list = aggregate.contributions
    .map(
      (item) => `
        <span>
          <span>${escapeHtml(item.label)}</span>
          <span>${escapeHtml(formatMetricValue(item.key, item.rawValue))}</span>
        </span>
      `,
    )
    .join("");

  return `
    <div class="comparison-driver">
      <div class="comparison-driver__title">
        <strong>${escapeHtml(aggregate.driver)}</strong>
        <span class="comparison-driver__score">${formatComposite(aggregate.composite)}</span>
      </div>
      <div class="contribution-track">${track}</div>
      <div class="contribution-list">${list}</div>
    </div>
  `;
}

function buildCarSpecComparisonCard(driver, breakdown) {
  const formula = breakdown && breakdown.specs ? breakdown.specs.formula : null;
  const sports = breakdown && breakdown.specs ? breakdown.specs.sports : null;
  const maxAvgWs = Math.max(formula ? formula.avgWs || 0 : 0, sports ? sports.avgWs || 0 : 0, 0);
  const color = colorForDriver(driver);

  return `
    <div class="comparison-driver">
      <div class="comparison-driver__header" style="border-color:${color}">
        <span class="comparison-driver__name">${escapeHtml(driver)}</span>
      </div>
      <div class="spec-split-grid">
        ${buildCarSpecComparisonPanel({ label: "Formula", color: "#415e97" }, formula, maxAvgWs)}
        ${buildCarSpecComparisonPanel({ label: "Sports", color: "#b7421b" }, sports, maxAvgWs)}
      </div>
      <div class="fine-print">${escapeHtml(buildCarSpecEdgeText(breakdown))}</div>
    </div>
  `;
}

function buildCarSpecComparisonPanel(specMeta, specRecord, maxAvgWs) {
  if (!specRecord) {
    return `
      <div class="spec-split-card is-empty">
        <div class="spec-split-card__title">
          <strong>${escapeHtml(specMeta.label)}</strong>
        </div>
        <div class="subtle-text">No ${escapeHtml(specMeta.label.toLowerCase())} results in this slice.</div>
      </div>
    `;
  }

  const barWidth = maxAvgWs > 0 ? Math.round(((specRecord.avgWs || 0) / maxAvgWs) * 100) : 0;
  return `
    <div class="spec-split-card">
      <div class="spec-split-card__title">
        <strong>${escapeHtml(specMeta.label)}</strong>
        <span class="spec-split-card__score">${formatDecimal(specRecord.avgWs)}</span>
      </div>
      <div class="spec-split-card__meta">Average weighted score</div>
      <div class="spec-split-bar">
        <div class="spec-split-bar__fill" style="width:${barWidth}%;background:linear-gradient(90deg, ${specMeta.color}, ${hexToAlpha(specMeta.color, 0.45)})"></div>
      </div>
      <div class="spec-split-pills">
        <span class="spec-split-pill">Seasons ${formatInteger(specRecord.seasonsCount)}</span>
        <span class="spec-split-pill">Avg pts ${formatPercent(specRecord.avgPointsRate)}</span>
        <span class="spec-split-pill">Avg win ${formatPercent(specRecord.avgWinRate)}</span>
        <span class="spec-split-pill">${formatInteger(specRecord.totalWdc)} WDC / ${formatInteger(specRecord.totalWcc)} WCC</span>
      </div>
      <div class="subtle-text">Peak ${escapeHtml(specRecord.peakSeasonId || "n/a")} | ${formatDecimal(specRecord.peakWs)}</div>
    </div>
  `;
}

function buildCarSpecEdgeText(breakdown) {
  if (!breakdown || !breakdown.bestSpec) {
    return "No formula or sports results match the current filter slice.";
  }
  if (breakdown.edge == null) {
    return `${breakdown.bestSpec.label} is the only matching spec in this slice.`;
  }
  return `${breakdown.bestSpec.label} has the stronger average weighted score in this slice (+${formatDecimal(breakdown.edge)}).`;
}

function buildPresetExplanation(preset) {
  return `${preset.label} emphasizes ${Object.entries(preset.careerWeights)
    .map(([key, weight]) => `${metricLabel(key).toLowerCase()} (${Math.round(weight * 100)}%)`)
    .join(", ")}.`;
}

function describeCurrentSlice() {
  const parts = [];
  if (state.filters.season !== "all") {
    parts.push(state.filters.season);
  } else if (state.filters.era !== "all") {
    parts.push(state.filters.era);
  } else {
    parts.push("all completed seasons");
  }
  if (state.filters.division !== "all") {
    parts.push(state.filters.division);
  }
  if (state.filters.team !== "all") {
    parts.push(`team ${state.filters.team}`);
  }
  if (state.filters.car !== "all") {
    parts.push(state.filters.car);
  }
  return parts.join(" | ");
}

function buildDriverNarrative(aggregate, sliceDescriptor) {
  const career = aggregate.careerRecord;
  const peakSeason = aggregate.peakSeason ? aggregate.peakSeason.seasonId : career.bestSeasonId || "n/a";
  return `${aggregate.driver} carries ${formatInteger(career.wdc)} WDCs and ${formatInteger(career.wcc)} WCCs. In the ${sliceDescriptor} lens, the peak run is ${peakSeason} at ${formatDecimal(aggregate.peakWs)}, with ${formatPercent(aggregate.avgTop5Rate)} average top-5 conversion and ${formatPercent(aggregate.avgPtsRate)} points-rate efficiency.`;
}

function buildSavedViewLabel(dataset) {
  const focus = state.filters.profileDriver || state.selectedDrivers[0] || "slice";
  return `${focus} | ${getActivePreset().label} | ${dataset.title}`;
}
