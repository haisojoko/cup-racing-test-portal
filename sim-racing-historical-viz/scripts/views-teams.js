"use strict";

function renderTeamsView(dataset) {
  const aggregates = buildTeamAggregates(dataset);
  const available = aggregates.map((a) => a.teamName);

  if (!available.includes(state.teams.profileTeam)) {
    state.teams.profileTeam = available[0] || "";
  }
  state.teams.selectedTeams = state.teams.selectedTeams.filter((t) => available.includes(t)).slice(0, MAX_COMPARE_TEAMS);
  if (!state.teams.compareInitialized && !state.teams.selectedTeams.length && available.length) {
    state.teams.selectedTeams = available.slice(0, Math.min(2, available.length));
    state.teams.compareInitialized = true;
  }

  refs["teams-filters"].innerHTML = `
    <input class="search-input" type="search" id="team-search" placeholder="Search teams..." value="${escapeHtml(state.teams.search)}"/>
  `;

  const search = state.teams.search.trim().toLowerCase();
  const filtered = search
    ? aggregates.filter((a) => matchesTeamSearch(a, search))
    : aggregates;

  refs["teams-content"].innerHTML = `
    <div class="subtab-nav" id="teams-subtabs">
      ${["totals", "profile", "compare", "history"].map((v) => `
        <button class="subtab-button ${state.teams.view === v ? "is-active" : ""}" type="button" data-team-view="${v}">${escapeHtml(v === "history" ? "WCC History" : v.charAt(0).toUpperCase() + v.slice(1))}</button>
      `).join("")}
    </div>
    <div id="teams-view-content"></div>
  `;

  const viewArea = document.getElementById("teams-view-content");

  switch (state.teams.view) {
    case "totals":
      renderTeamTotals(filtered, viewArea);
      break;
    case "profile":
      renderTeamProfile(dataset, aggregates, viewArea);
      break;
    case "compare":
      renderTeamCompare(dataset, aggregates, filtered, viewArea);
      break;
    case "history":
      renderTeamHistory(dataset, viewArea);
      break;
    default:
      renderTeamTotals(filtered, viewArea);
  }

  document.getElementById("teams-subtabs")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-team-view]");
    if (!btn) return;
    state.teams.view = btn.dataset.teamView;
    renderTeamsView(dataset);
  });

  document.getElementById("team-search")?.addEventListener("input", (e) => {
    state.teams.search = e.target.value;
    renderTeamsView(dataset);
  });

  document.getElementById("team-profile-select")?.addEventListener("change", (e) => {
    state.teams.profileTeam = e.target.value;
    renderTeamsView(dataset);
  });

  bindTeamCompareEvents(dataset);
}

function matchesTeamSearch(aggregate, query) {
  return [aggregate.teamName, ...(aggregate.drivers || [])].some((v) =>
    normalizeInlineText(v).toLowerCase().includes(query)
  );
}

function renderTeamTotals(filtered, area) {
  if (!filtered.length) { area.innerHTML = renderEmptyStateMarkup("No teams match your search."); return; }

  const columns = [
    { key: "teamName", label: "Team", strong: true, sticky: true, stickyWidthRem: 13, className: "wrap-col" },
    { key: "seasonsCount", label: "Seasons", className: "num-col" },
    { key: "driverCount", label: "Drivers", className: "num-col" },
    { key: "totalWcc", label: "WCC", className: "num-col" },
    { key: "totalWdc", label: "WDC", className: "num-col" },
    { key: "totalPoints", label: "Points", className: "num-col" },
    { key: "totalWins", label: "Wins", className: "num-col" },
    { key: "avgTeamWeightedScore", label: "Avg WS", className: "num-col", render: (r) => formatDecimal(r.avgTeamWeightedScore), sortValue: (r) => r.avgTeamWeightedScore },
    { key: "teamScore", label: "Dynasty", className: "num-col", render: (r) => formatComposite(r.teamScore), sortValue: (r) => r.teamScore },
  ];

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Team Leaderboard</h3>
        <span class="badge">${filtered.length} teams</span>
      </div>
      <div class="card__body">
        <div id="team-totals-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("team-totals-table", columns, filtered);
}

function renderTeamProfile(dataset, aggregates, area) {
  const active = aggregates.find((a) => a.teamName === state.teams.profileTeam) || aggregates[0];
  if (!active) { area.innerHTML = renderEmptyStateMarkup("No team data."); return; }

  const contributions = buildTeamContributionRows(dataset, active.teamName);
  const options = aggregates.map((a) =>
    `<option value="${escapeHtml(a.teamName)}"${a.teamName === state.teams.profileTeam ? " selected" : ""}>${escapeHtml(a.teamName)}</option>`
  ).join("");

  const contribColumns = [
    { key: "driver", label: "Driver", strong: true, sticky: true, stickyWidthRem: 10, className: "wrap-col" },
    { key: "seasonsCount", label: "Seasons", className: "num-col" },
    { key: "points", label: "Points", className: "num-col" },
    { key: "wins", label: "Wins", className: "num-col" },
    { key: "avgWeightedScore", label: "Avg WS", className: "num-col", render: (r) => formatDecimal(r.avgWeightedScore), sortValue: (r) => r.avgWeightedScore },
    { key: "shareOfPoints", label: "Pts Share", className: "num-col", format: "percent" },
  ];

  area.innerHTML = `
    <div class="mb-1">
      <select class="select" id="team-profile-select">${options}</select>
    </div>
    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">${escapeHtml(active.teamName)}</h3>
        <span class="badge badge--accent">Dynasty ${formatComposite(active.teamScore)}</span>
      </div>
      <div class="card__body">
        <div class="stat-grid">
          ${buildStatItem(formatInteger(active.totalWcc), "WCC")}
          ${buildStatItem(formatInteger(active.totalWdc), "WDC Seasons")}
          ${buildStatItem(formatInteger(active.totalPoints), "Points")}
          ${buildStatItem(formatInteger(active.totalWins), "Wins")}
          ${buildStatItem(formatInteger(active.seasonsCount), "Seasons")}
          ${buildStatItem(formatInteger(active.driverCount), "Drivers")}
        </div>
        <div class="pill-row mt-half">
          ${active.drivers.map((d) => `<span class="pill">${escapeHtml(d)}</span>`).join("")}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Driver Contributions</h3>
      </div>
      <div class="card__body">
        <div id="team-contrib-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("team-contrib-table", contribColumns, contributions);
}

function renderTeamCompare(dataset, aggregates, filtered, area) {
  const compareColumns = [
    { key: "teamName", label: "Team", strong: true, sticky: true, stickyWidthRem: 13, className: "wrap-col" },
    { key: "seasonsCount", label: "Seasons", className: "num-col" },
    { key: "totalWcc", label: "WCC", className: "num-col" },
    { key: "totalPoints", label: "Points", className: "num-col" },
    { key: "totalWins", label: "Wins", className: "num-col" },
    { key: "avgTeamWeightedScore", label: "Avg WS", className: "num-col", render: (r) => formatDecimal(r.avgTeamWeightedScore), sortValue: (r) => r.avgTeamWeightedScore },
    { key: "teamScore", label: "Dynasty", className: "num-col", render: (r) => formatComposite(r.teamScore), sortValue: (r) => r.teamScore },
  ];

  const compareTeams = state.teams.selectedTeams
    .map((t) => aggregates.find((a) => a.teamName === t))
    .filter(Boolean);

  area.innerHTML = `
    <div class="card mb-1">
      <div class="card__header">
        <h3 class="card__title">Select Teams</h3>
        <span class="badge">${state.teams.selectedTeams.length} / ${MAX_COMPARE_TEAMS}</span>
      </div>
      <div class="card__body">
        <div class="chip-picker" id="team-compare-picker">
          ${filtered.map((a) => `
            <button class="chip ${state.teams.selectedTeams.includes(a.teamName) ? "is-selected" : ""}" type="button" data-team-toggle="${escapeHtml(a.teamName)}">${escapeHtml(a.teamName)}</button>
          `).join("")}
        </div>
      </div>
    </div>
    ${compareTeams.length ? `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">Team Comparison</h3>
      </div>
      <div class="card__body">
        <div id="team-compare-table"></div>
      </div>
    </div>
    ` : ""}
  `;

  if (compareTeams.length) {
    renderSortableTable("team-compare-table", compareColumns, compareTeams);
  }
}

function renderTeamHistory(dataset, area) {
  const rows = buildWccHistoryRows(dataset);
  if (!rows.length) { area.innerHTML = renderEmptyStateMarkup("No WCC history available."); return; }

  const columns = [
    { key: "seasonId", label: "Season", strong: true, sticky: true, stickyWidthRem: 5.5 },
    { key: "championTeam", label: "Champion", strong: true, sticky: true, stickyWidthRem: 13, className: "wrap-col" },
    { key: "championDrivers", label: "Drivers", className: "wrap-col", widthRem: 11 },
    { key: "championPoints", label: "Points", className: "num-col" },
    { key: "runnerUpTeam", label: "Runner-up", className: "wrap-col", widthRem: 10 },
    { key: "gap", label: "Gap", className: "num-col", render: (r) => r.gap == null ? "n/a" : formatDecimal(r.gap, 1), sortValue: (r) => r.gap },
    { key: "type", label: "Type" },
  ];

  area.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 class="card__title">WCC History</h3>
        <span class="badge">${rows.length} seasons</span>
      </div>
      <div class="card__body">
        <div id="team-history-table"></div>
      </div>
    </div>
  `;

  renderSortableTable("team-history-table", columns, rows);
}

function bindTeamCompareEvents(dataset) {
  document.getElementById("team-compare-picker")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-team-toggle]");
    if (!btn) return;
    toggleComparisonTeam(btn.dataset.teamToggle);
    renderTeamsView(dataset);
  });
}
