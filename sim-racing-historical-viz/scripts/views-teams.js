"use strict";

function renderTeamsTab(dataset) {
  renderTeamsToolbar(dataset);
  renderTeamsContent(dataset);
}

function renderTeamsToolbar(dataset) {
  const model = buildTeamsViewModel(dataset);
  const profileOptions = model.aggregates
    .map(
      (aggregate) =>
        `<option value="${escapeHtml(aggregate.teamName)}"${aggregate.teamName === state.teams.profileTeam ? " selected" : ""}>${escapeHtml(aggregate.teamName)}</option>`,
    )
    .join("");

  refs["teams-toolbar"].innerHTML = `
    <div class="subtab-nav" role="tablist" aria-label="Team views">
      ${[
        ["totals", "Totals"],
        ["profile", "Profile"],
        ["compare", "Compare"],
        ["history", "WCC History"],
      ]
        .map(
          ([value, label]) => `
            <button
              class="subtab-button ${state.teams.view === value ? "is-active" : ""}"
              type="button"
              data-team-view="${escapeHtml(value)}"
              aria-pressed="${state.teams.view === value ? "true" : "false"}"
            >
              ${escapeHtml(label)}
            </button>
          `,
        )
        .join("")}
    </div>
    ${
      state.teams.view === "profile"
        ? `
          <label class="field field--compact teams-toolbar__field" for="team-profile-select">
            <span>Spotlight team</span>
            <select id="team-profile-select">
              ${profileOptions}
            </select>
          </label>
          <div class="fine-print teams-toolbar__note">Profile mode turns one team into a roster history and contribution breakdown.</div>
        `
        : state.teams.view === "compare" || state.teams.view === "totals"
          ? `
            <label class="field field--compact teams-toolbar__field" for="team-search-input">
              <span>${state.teams.view === "compare" ? "Find teams" : "Filter teams"}</span>
              <input
                id="team-search-input"
                type="search"
                value="${escapeHtml(state.teams.search)}"
                placeholder="${escapeHtml(state.teams.view === "compare" ? "Search teams or drivers" : "Search teams")}"
              />
            </label>
            <div class="fine-print teams-toolbar__note">
              ${
                state.teams.view === "compare"
                  ? `Select up to ${escapeHtml(String(MAX_COMPARE_TEAMS))} teams without using the sidebar compare driver picker.`
                  : "Leaderboard rows stay inside the current global season, era, division, and car slice."
              }
            </div>
          `
          : `
            <div class="fine-print teams-toolbar__note">WCC history tracks official team champions and runner-up gaps across completed seasons.</div>
          `
    }
  `;
}

function renderTeamsContent(dataset) {
  const model = buildTeamsViewModel(dataset);

  if (!model.aggregates.length) {
    refs["teams-badge"].textContent = "No teams in slice";
    refs["teams-content"].innerHTML = renderEmptyStateMarkup(
      "No teams match the current season, era, division, and car filters.",
    );
    syncSidebarMode();
    return;
  }

  if (state.teams.view === "profile" && model.activeTeam) {
    refs["teams-badge"].textContent = model.activeTeam.teamName;
  } else if (state.teams.view === "compare") {
    refs["teams-badge"].textContent = `${state.teams.selectedTeams.length} selected`;
  } else if (state.teams.view === "history") {
    refs["teams-badge"].textContent = `${model.historyRows.length} seasons`;
  } else {
    refs["teams-badge"].textContent = `${model.searchFiltered.length} teams in slice`;
  }

  const contentByView = {
    totals: renderTeamTotalsView(model),
    profile: renderTeamProfileView(dataset, model),
    compare: renderTeamCompareView(dataset, model),
    history: renderTeamHistoryView(model),
  };

  refs["teams-content"].innerHTML = contentByView[state.teams.view] || contentByView.totals;
  syncSidebarMode();
}

function buildTeamsViewModel(dataset) {
  const aggregates = buildTeamAggregates(dataset);
  const availableTeams = aggregates.map((aggregate) => aggregate.teamName);

  if (!availableTeams.includes(state.teams.profileTeam)) {
    state.teams.profileTeam = availableTeams[0] || "";
  }

  state.teams.selectedTeams = state.teams.selectedTeams
    .filter((teamName) => availableTeams.includes(teamName))
    .slice(0, MAX_COMPARE_TEAMS);
  if (!state.teams.compareInitialized && !state.teams.selectedTeams.length && availableTeams.length) {
    state.teams.selectedTeams = availableTeams.slice(0, Math.min(2, availableTeams.length));
    state.teams.compareInitialized = true;
  }

  const activeTeam =
    aggregates.find((aggregate) => aggregate.teamName === state.teams.profileTeam) || aggregates[0] || null;
  const search = state.teams.search.trim().toLowerCase();
  const searchFiltered = search
    ? aggregates.filter((aggregate) => matchesTeamSearch(aggregate, search))
    : aggregates;

  return {
    aggregates,
    activeTeam,
    search,
    searchFiltered,
    compareTeams: state.teams.selectedTeams
      .map((teamName) => aggregates.find((aggregate) => aggregate.teamName === teamName))
      .filter(Boolean),
    historyRows: buildWccHistoryRows(dataset),
  };
}

function matchesTeamSearch(aggregate, query) {
  if (!query) {
    return true;
  }

  return [aggregate.teamName, ...(aggregate.drivers || [])].some((value) =>
    normalizeInlineText(value).toLowerCase().includes(query),
  );
}

function renderTeamTotalsView(model) {
  if (!model.searchFiltered.length) {
    return renderEmptyStateMarkup("No teams match the current search.");
  }

  const leader = model.searchFiltered[0] || null;
  const totalWcc = model.searchFiltered.reduce((sum, aggregate) => sum + (aggregate.totalWcc || 0), 0);
  const totalTeamSeasons = model.searchFiltered.reduce(
    (sum, aggregate) => sum + (aggregate.seasonsCount || 0),
    0,
  );

  const columns = [
    { key: "teamName", label: "Team", strong: true, sticky: true, stickyWidthRem: 14, className: "wrap-col" },
    { key: "seasonsCount", label: "Seasons", className: "num-col" },
    { key: "driverCount", label: "Drivers", className: "num-col" },
    { key: "totalWcc", label: "WCC", className: "num-col" },
    { key: "totalWdc", label: "WDC seasons", className: "num-col" },
    { key: "totalPoints", label: "Points", className: "num-col" },
    { key: "totalWins", label: "Wins", className: "num-col" },
    { key: "totalPodiums", label: "Podiums", className: "num-col" },
    {
      key: "avgTeamWeightedScore",
      label: "Avg team WS",
      className: "num-col",
      render: (row) => formatDecimal(row.avgTeamWeightedScore),
    },
    {
      key: "peakSeason",
      label: "Peak season",
      render: (row) =>
        row.peakSeason
          ? `${row.peakSeason.seasonId} | ${formatDecimal(row.peakSeason.teamWeightedScore)}`
          : "n/a",
    },
    {
      key: "teamScore",
      label: "Dynasty",
      className: "num-col",
      render: (row) => formatComposite(row.teamScore),
    },
  ];

  return `
    <div class="overview-cards">
      ${buildMetricCard("Teams in slice", model.searchFiltered.length, "Leaderboard rows visible after local search")}
      ${buildMetricCard("Team seasons", formatInteger(totalTeamSeasons), "Completed team-season entries in scope")}
      ${buildMetricCard("WCC seasons", formatInteger(totalWcc), "Official team titles represented in this slice")}
      ${buildMetricCard("Top team", leader ? leader.teamName : "n/a", leader?.peakSeason ? `Peak ${leader.peakSeason.seasonId}` : "No peak season available")}
    </div>
    <div class="season-detail-shell">
      ${buildTableCard(
        "Team totals leaderboard",
        "Rows use a fixed dynasty score built from WCC count, points, wins, and weighted-season strength.",
        columns,
        model.searchFiltered,
      )}
    </div>
  `;
}

function renderTeamProfileView(dataset, model) {
  if (!model.activeTeam) {
    return renderEmptyStateMarkup("Choose a team to open the profile workspace.");
  }

  const aggregate = model.activeTeam;
  const contributionRows = buildTeamContributionRows(dataset, aggregate.teamName);
  const bestSeasons = [...aggregate.seasons]
    .sort((left, right) => (right.teamWeightedScore || 0) - (left.teamWeightedScore || 0))
    .slice(0, 6);
  const rosterRows = [...aggregate.seasons]
    .sort((left, right) => right.seasonOrder - left.seasonOrder)
    .map((row) => ({
      seasonId: row.seasonId,
      drivers: row.drivers.join(", ") || "n/a",
      cars: row.cars.join(", ") || "n/a",
      points: row.points,
      wins: row.wins,
      wcc: row.wcc ? "Yes" : "-",
      wdcDrivers: row.wdcDrivers.join(", ") || "n/a",
    }));

  const seasonColumns = [
    { key: "seasonId", label: "Season", strong: true, sticky: true, stickyWidthRem: 6.25 },
    { key: "points", label: "Points", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "podiums", label: "Podiums", className: "num-col" },
    { key: "teamWeightedScore", label: "Team WS", className: "num-col", render: (row) => formatDecimal(row.teamWeightedScore) },
    { key: "avgDriverWeightedScore", label: "Avg driver WS", className: "num-col", render: (row) => formatDecimal(row.avgDriverWeightedScore) },
    { key: "drivers", label: "Drivers", className: "wrap-col", widthRem: 11.5, render: (row) => row.drivers.join(", ") || "n/a" },
    { key: "wcc", label: "WCC", render: (row) => (row.wcc ? "Yes" : "-") },
  ];
  const contributionColumns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5, className: "wrap-col" },
    { key: "seasonsCount", label: "Seasons", className: "num-col" },
    { key: "points", label: "Points", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "podiums", label: "Podiums", className: "num-col" },
    { key: "avgWeightedScore", label: "Avg WS", className: "num-col", render: (row) => formatDecimal(row.avgWeightedScore) },
    { key: "shareOfPoints", label: "Pts share", className: "num-col", format: "percent" },
    { key: "shareOfWeightedScore", label: "WS share", className: "num-col", format: "percent" },
    { key: "wdcCount", label: "WDC seasons", className: "num-col" },
    { key: "wccCount", label: "WCC seasons", className: "num-col" },
  ];
  const rosterColumns = [
    { key: "seasonId", label: "Season", strong: true, sticky: true, stickyWidthRem: 6.25 },
    { key: "drivers", label: "Drivers", strong: true, sticky: true, stickyWidthRem: 15.5, className: "wrap-col" },
    { key: "cars", label: "Cars", className: "wrap-col", widthRem: 11 },
    { key: "points", label: "Points", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "wcc", label: "WCC" },
    { key: "wdcDrivers", label: "WDC drivers", className: "wrap-col", widthRem: 11.5 },
  ];

  return `
    <div class="profile-shell">
      <article class="profile-card fade-in">
        <div class="profile-card__header">
          <div>
            <h3 class="profile-card__title">${escapeHtml(aggregate.teamName)}</h3>
            <div class="profile-card__meta">Current global slice: ${escapeHtml(describeTeamSlice())}</div>
          </div>
          <span class="badge badge--accent">Dynasty ${formatComposite(aggregate.teamScore)}</span>
        </div>
        <div class="stat-grid">
          ${buildStatPair("WCC / WDC seasons", `${formatInteger(aggregate.totalWcc)} / ${formatInteger(aggregate.totalWdc)}`)}
          ${buildStatPair("Total points", formatInteger(aggregate.totalPoints))}
          ${buildStatPair("Total wins", formatInteger(aggregate.totalWins))}
          ${buildStatPair("Seasons tracked", formatInteger(aggregate.seasonsCount))}
          ${buildStatPair("Drivers used", formatInteger(aggregate.driverCount))}
          ${buildStatPair(
            "Peak season",
            aggregate.peakSeason
              ? `${aggregate.peakSeason.seasonId} | ${formatDecimal(aggregate.peakSeason.teamWeightedScore)}`
              : "n/a",
          )}
        </div>
        <div class="pill-row">
          ${aggregate.drivers
            .map((driver) => `<span class="pill">${escapeHtml(driver)}</span>`)
            .join("")}
        </div>
        <div class="subtle-text">${escapeHtml(buildTeamNarrative(aggregate))}</div>
        <div class="stack-inline">
          <button class="mini-button" type="button" data-team-action="view-history">Open WCC history</button>
        </div>
      </article>
      <article class="profile-card fade-in">
        <div class="profile-card__header">
          <div>
            <h3 class="profile-card__title">Team score breakdown</h3>
            <div class="profile-card__meta">A fixed team lens keeps the leaderboard and comparison workspace readable without borrowing driver CPI.</div>
          </div>
        </div>
        <div class="score-breakdown">
          ${aggregate.contributions
            .map((item) => buildBarRow(item.label, item.rawValue, item.normalized, item.key))
            .join("")}
        </div>
      </article>
    </div>
    <div class="season-detail-shell">
      ${buildTableCard(
        "Best team seasons",
        "Peak runs are ranked by combined team weighted score, with official team points kept visible beside it.",
        seasonColumns,
        bestSeasons,
      )}
      ${buildTableCard(
        "Driver contribution split",
        "Shares are calculated within the current filtered slice for this team.",
        contributionColumns,
        contributionRows,
      )}
      ${buildTableCard(
        "Roster history",
        "Season-by-season rosters show how the team lineup, cars, and title conversion changed over time.",
        rosterColumns,
        rosterRows,
      )}
    </div>
  `;
}

function renderTeamCompareView(dataset, model) {
  const pickerRows = model.searchFiltered;
  const compareColumns = [
    { key: "teamName", label: "Team", strong: true, sticky: true, stickyWidthRem: 14, className: "wrap-col" },
    { key: "seasonsCount", label: "Seasons", className: "num-col" },
    { key: "driverCount", label: "Drivers", className: "num-col" },
    { key: "totalWcc", label: "WCC", className: "num-col" },
    { key: "totalPoints", label: "Points", className: "num-col" },
    { key: "totalWins", label: "Wins", className: "num-col" },
    { key: "avgTeamWeightedScore", label: "Avg team WS", className: "num-col", render: (row) => formatDecimal(row.avgTeamWeightedScore) },
    {
      key: "peakSeason",
      label: "Peak season",
      render: (row) =>
        row.peakSeason
          ? `${row.peakSeason.seasonId} | ${formatDecimal(row.peakSeason.teamWeightedScore)}`
          : "n/a",
    },
    {
      key: "teamScore",
      label: "Dynasty",
      className: "num-col",
      render: (row) => formatComposite(row.teamScore),
    },
  ];

  return `
    <article class="comparison-card fade-in">
      <div class="comparison-card__header">
        <div>
          <h3 class="comparison-card__title">Team compare picker</h3>
          <div class="profile-card__meta">Use the local picker here so the sidebar can stay focused on global archive filters.</div>
        </div>
        <span class="badge badge--warning">${state.teams.selectedTeams.length} / ${MAX_COMPARE_TEAMS} selected</span>
      </div>
      ${
        state.teams.selectedTeams.length
          ? `<div class="pill-row">
              ${state.teams.selectedTeams
                .map(
                  (teamName) => `
                    <button class="pill pill--button" type="button" data-team-toggle="${escapeHtml(teamName)}">
                      ${escapeHtml(teamName)} ×
                    </button>
                  `,
                )
                .join("")}
              <button class="mini-button" type="button" data-team-action="clear-compare">Clear</button>
            </div>`
          : `<div class="subtle-text">No teams selected yet. Pick a few below to populate the comparison workspace.</div>`
      }
      <div class="driver-picker team-picker">
        ${
          pickerRows.length
            ? pickerRows
                .map(
                  (aggregate) => `
                    <button
                      class="driver-chip ${state.teams.selectedTeams.includes(aggregate.teamName) ? "is-selected" : ""}"
                      type="button"
                      data-team-toggle="${escapeHtml(aggregate.teamName)}"
                    >
                      <div>
                        <div class="driver-chip__name">${escapeHtml(aggregate.teamName)}</div>
                        <div class="driver-chip__meta">${formatInteger(aggregate.seasonsCount)} seasons | ${formatInteger(aggregate.totalWcc)} WCC | ${formatInteger(aggregate.totalPoints)} pts</div>
                      </div>
                      <span class="badge">Dyn ${formatComposite(aggregate.teamScore)}</span>
                    </button>
                  `,
                )
                .join("")
            : renderEmptyStateMarkup("No teams match the current search.")
        }
      </div>
    </article>
    ${
      model.compareTeams.length
        ? `
          <article class="comparison-card fade-in">
            <div class="comparison-card__header">
              <div>
                <h3 class="comparison-card__title">Selected team comparison</h3>
                <div class="profile-card__meta">Each card compresses titles, points, peak team seasons, and roster breadth into one glanceable snapshot.</div>
              </div>
            </div>
            <div class="comparison-grid team-compare-grid">
              ${model.compareTeams.map((aggregate) => buildTeamComparisonCard(aggregate)).join("")}
            </div>
          </article>
          <div class="season-detail-shell">
            ${buildTableCard(
              "Selected team matrix",
              "This matrix keeps the comparison auditable with the same totals shown in the headline cards above.",
              compareColumns,
              model.compareTeams,
            )}
          </div>
          <article class="comparison-card fade-in">
            <div class="comparison-card__header">
              <div>
                <h3 class="comparison-card__title">Contribution split by team</h3>
                <div class="profile-card__meta">Top contributors are ranked inside the current filtered slice for each selected team.</div>
              </div>
            </div>
            <div class="comparison-grid team-compare-grid">
              ${model.compareTeams
                .map((aggregate) =>
                  buildTeamContributionCard(
                    aggregate,
                    buildTeamContributionRows(dataset, aggregate.teamName).slice(0, 5),
                  ),
                )
                .join("")}
            </div>
          </article>
        `
        : ""
    }
  `;
}

function renderTeamHistoryView(model) {
  if (!model.historyRows.length) {
    return renderEmptyStateMarkup("No completed WCC history rows are available in this archive.");
  }

  const uniqueChampions = uniqueList(model.historyRows.map((row) => row.championTeam)).length;
  const repeatChampion = findMostFrequentLabel(model.historyRows.map((row) => row.championTeam));
  const columns = [
    { key: "seasonId", label: "Season", strong: true, sticky: true, stickyWidthRem: 6.25 },
    { key: "championTeam", label: "Champion", strong: true, sticky: true, stickyWidthRem: 14, className: "wrap-col" },
    { key: "championDrivers", label: "Champion drivers", className: "wrap-col", widthRem: 11.5 },
    { key: "championPoints", label: "Champion pts", className: "num-col" },
    { key: "runnerUpTeam", label: "Runner-up", className: "wrap-col", widthRem: 10.5 },
    { key: "gap", label: "Gap", className: "num-col", render: (row) => (row.gap == null ? "n/a" : formatDecimal(row.gap, 1)) },
    { key: "wdcWinners", label: "WDC", className: "wrap-col", widthRem: 11 },
    { key: "type", label: "Division" },
  ];

  return `
    <div class="overview-cards">
      ${buildMetricCard("Completed seasons", model.historyRows.length, "WCC rows with season detail blocks")}
      ${buildMetricCard("Unique champions", uniqueChampions, "Different teams winning the constructors title")}
      ${buildMetricCard("Most recent champion", model.historyRows[0]?.championTeam || "n/a", model.historyRows[0]?.seasonId || "No season")}
      ${buildMetricCard("Repeat leader", repeatChampion.label || "n/a", repeatChampion.count ? `${repeatChampion.count} titles` : "No repeat champion")}
    </div>
    <div class="season-detail-shell">
      ${buildTableCard(
        "WCC history tracker",
        "Official team titles are sorted from newest to oldest, with runner-up context kept visible beside each championship row.",
        columns,
        model.historyRows,
      )}
    </div>
  `;
}

function buildTeamComparisonCard(aggregate) {
  const segments = aggregate.contributions
    .map(
      (item) => `
        <span class="contribution-segment" style="width:${Math.max(item.value * 100, 0)}%;background:${teamMetricColor(item.key)}"></span>
      `,
    )
    .join("");
  const contributionList = aggregate.contributions
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
        <strong>${escapeHtml(aggregate.teamName)}</strong>
        <span class="comparison-driver__score">${formatComposite(aggregate.teamScore)}</span>
      </div>
      <div class="contribution-track">${segments}</div>
      <div class="contribution-list">${contributionList}</div>
      <div class="subtle-text">Peak ${escapeHtml(aggregate.peakSeason?.seasonId || "n/a")} | ${formatInteger(aggregate.totalWcc)} WCC | ${formatInteger(aggregate.totalPoints)} pts</div>
    </div>
  `;
}

function buildTeamContributionCard(aggregate, rows) {
  const contributionColumns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 11.5, className: "wrap-col" },
    { key: "points", label: "Pts", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "shareOfPoints", label: "Pts share", className: "num-col", format: "percent" },
  ];

  return `
    <div class="comparison-driver">
      <div class="comparison-driver__header" style="border-color:${teamMetricColor("totalPoints")}">
        <span class="comparison-driver__name">${escapeHtml(aggregate.teamName)}</span>
      </div>
      ${
        rows.length
          ? `
            <div class="table-wrap">
              ${renderDataTable(contributionColumns, rows, {
                tableClassName: "data-table--compact",
                compact: true,
              })}
            </div>
          `
          : `<div class="subtle-text">No driver contribution rows match this slice.</div>`
      }
    </div>
  `;
}

function buildTeamNarrative(aggregate) {
  const peakSeason = aggregate.peakSeason ? aggregate.peakSeason.seasonId : "n/a";
  const latestSeason = aggregate.latestSeason ? aggregate.latestSeason.seasonId : "n/a";
  return `${aggregate.teamName} logs ${formatInteger(aggregate.totalWcc)} WCC titles across ${formatInteger(aggregate.seasonsCount)} tracked seasons. The strongest team-season in the current slice is ${peakSeason}, while the latest matching season is ${latestSeason}, and the roster pool covers ${formatInteger(aggregate.driverCount)} different drivers.`;
}

function describeTeamSlice() {
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
  if (state.filters.car !== "all") {
    parts.push(state.filters.car);
  }
  return parts.join(" | ");
}

function findMostFrequentLabel(labels) {
  const counts = labels.reduce((accumulator, label) => {
    accumulator[label] = (accumulator[label] || 0) + 1;
    return accumulator;
  }, {});
  const entries = Object.entries(counts).sort((left, right) => right[1] - left[1]);
  return {
    label: entries[0]?.[0] || "",
    count: entries[0]?.[1] || 0,
  };
}

function teamMetricColor(key) {
  const colors = {
    totalWcc: "#b7421b",
    totalPoints: "#0b756f",
    totalWins: "#b28a28",
    avgTeamWeightedScore: "#415e97",
    peakTeamWeightedScore: "#8a2d2d",
    totalWdc: "#5c3d2e",
  };
  return colors[key] || "#6a5748";
}
