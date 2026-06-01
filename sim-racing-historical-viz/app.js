"use strict";

const MAX_COMPARE_DRIVERS = 6;
const MAX_COMPARE_TEAMS = 4;
const DEFAULT_COMPARE_DRIVERS = ["Josie", "Toby"];

const DRIVER_PALETTE = [
  "#0d6efd", "#0b756f", "#b28a28", "#8b5cf6",
  "#dc3545", "#198754", "#fd7e14", "#6610f2",
];

const METRIC_COLORS = {
  cpi: "#0d6efd",
  avgWs: "#0b756f",
  peakWs: "#b28a28",
  avgPtsRate: "#6366f1",
  avgTop5Rate: "#8b5cf6",
  avgWinRate: "#dc3545",
  avgPodiumRate: "#fd7e14",
  avgFastestLapRate: "#3b82f6",
  avgPoleRate: "#0b756f",
  titles: "#4b5563",
  winRate: "#dc3545",
  podiumRate: "#fd7e14",
  fastestLapRate: "#3b82f6",
  poleRate: "#0b756f",
  participation: "#198754",
  weightedScore: "#0d6efd",
  pointsRate: "#0b756f",
  top5Rate: "#6366f1",
  totalWcc: "#0d6efd",
  totalPoints: "#0b756f",
  totalWins: "#b28a28",
  avgTeamWeightedScore: "#6366f1",
  peakTeamWeightedScore: "#dc3545",
  totalWdc: "#4b5563",
};

const PRESETS = {
  balanced: {
    label: "Balanced",
    description: "Blend career index with season quality and consistent scoring.",
    careerWeights: { cpi: 0.45, avgWs: 0.2, peakWs: 0.15, avgPtsRate: 0.1, avgTop5Rate: 0.1 },
    seasonWeights: { weightedScore: 0.55, pointsRate: 0.15, top5Rate: 0.15, winRate: 0.1, titles: 0.05 },
  },
  peak: {
    label: "Peak Season",
    description: "Prioritize ceiling over longevity.",
    careerWeights: { peakWs: 0.45, avgWs: 0.15, cpi: 0.1, avgPtsRate: 0.1, titles: 0.2 },
    seasonWeights: { weightedScore: 0.5, winRate: 0.2, pointsRate: 0.15, top5Rate: 0.05, titles: 0.1 },
  },
  consistency: {
    label: "Consistency",
    description: "Reward repeatable top-five scoring and strong participation.",
    careerWeights: { avgWs: 0.28, avgTop5Rate: 0.28, avgPtsRate: 0.24, participation: 0.2 },
    seasonWeights: { weightedScore: 0.35, top5Rate: 0.25, pointsRate: 0.2, participation: 0.2 },
  },
  titles: {
    label: "Championships",
    description: "Put WDC and WCC conversion first.",
    careerWeights: { titles: 0.5, cpi: 0.15, peakWs: 0.15, avgWs: 0.1, avgPtsRate: 0.1 },
    seasonWeights: { titles: 0.35, weightedScore: 0.35, winRate: 0.15, pointsRate: 0.15 },
  },
  winsPodiums: {
    label: "Wins & Podiums",
    description: "Lean into front-running conversion with extra weight on wins and podiums.",
    careerWeights: { avgWinRate: 0.3, avgPodiumRate: 0.28, peakWs: 0.16, titles: 0.16, cpi: 0.1 },
    seasonWeights: { winRate: 0.28, podiumRate: 0.26, weightedScore: 0.2, titles: 0.14, pointsRate: 0.08, top5Rate: 0.04 },
  },
  rawPace: {
    label: "Raw Pace",
    description: "Favor poles and fastest laps to spotlight outright speed.",
    careerWeights: { avgFastestLapRate: 0.3, avgPoleRate: 0.3, peakWs: 0.16, cpi: 0.14, avgWs: 0.1 },
    seasonWeights: { fastestLapRate: 0.32, poleRate: 0.28, weightedScore: 0.18, winRate: 0.12, pointsRate: 0.1 },
  },
};

const CAREER_PRESET_METRICS = [
  "cpi", "avgWs", "peakWs", "avgPtsRate", "avgTop5Rate",
  "avgWinRate", "avgPodiumRate", "avgFastestLapRate", "avgPoleRate",
  "titles", "participation",
];

const SEASON_PRESET_METRICS = [
  "weightedScore", "pointsRate", "top5Rate", "winRate", "podiumRate",
  "fastestLapRate", "poleRate", "titles", "participation",
];

const state = {
  dataset: null,
  activeTab: "seasons",
  filters: {
    preset: "balanced",
    season: "all",
    era: "all",
    division: "all",
    team: "all",
    car: "all",
    profileDriver: "",
    driverSearch: "",
    detailSeason: null,
    detailProgressMode: "week",
  },
  drivers: {
    view: "list",
  },
  selectedDrivers: [],
  teams: {
    view: "totals",
    search: "",
    profileTeam: "",
    selectedTeams: [],
    compareInitialized: false,
  },
  trackAggregateCache: null,
};

const refs = {};

document.addEventListener("DOMContentLoaded", init);

function getPresetById(presetId) {
  return PRESETS[presetId] || PRESETS.balanced;
}

function getActivePreset() {
  return getPresetById(state.filters.preset);
}

function init() {
  cacheRefs();
  bindEvents();
  loadData();
}

function cacheRefs() {
  [
    "main-nav", "loading-state",
    "seasons-header", "seasons-filters", "seasons-content",
    "drivers-header", "drivers-filters", "drivers-content", "drivers-title",
    "compare-filters", "compare-content",
    "teams-filters", "teams-content",
  ].forEach((id) => {
    refs[id] = document.getElementById(id);
  });
}

function bindEvents() {
  refs["main-nav"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (!button) return;
    state.activeTab = button.dataset.tab;
    renderTabState();
    renderActiveView();
  });
}

function loadData() {
  var localUrl = "data/Cup_Racing_Complete_Data.md";
  var remoteUrl = "https://raw.githubusercontent.com/haisojoko/cup-racing-test-portal/refs/heads/main/sim-racing-historical-viz/data/Cup_Racing_Complete_Data.md";

  fetchAndParse(localUrl)
    .catch(function (localErr) {
      console.warn("Local fetch failed:", localErr.message, "— trying remote…");
      return fetchAndParse(remoteUrl);
    })
    .then(function (dataset) {
      state.dataset = dataset;
      state.trackAggregateCache = buildTrackAggregates(dataset);
      initDefaults(dataset);
      refs["loading-state"].hidden = true;
      render();
    })
    .catch(function (err) {
      console.error("Cup Racing Data load failed:", err);
      refs["loading-state"].innerHTML =
        '<p style="color:var(--danger)">Failed to load data: ' + escapeHtml(err.message) + "</p>" +
        '<p class="subtle-text">Check the browser console for details. ' +
        "If opening index.html directly, serve via a local server.</p>";
    });
}

function fetchAndParse(url) {
  return fetch(url)
    .then(function (res) {
      if (!res.ok) throw new Error("Fetch " + url + " returned HTTP " + res.status);
      return res.text();
    })
    .then(function (text) {
      if (!text || text.length < 100) throw new Error("Response from " + url + " was empty or too short (" + text.length + " chars)");
      return parseDataset("Cup_Racing_Complete_Data.md", text, "auto");
    });
}

function initDefaults(dataset) {
  const drivers = dataset.filterOptions.drivers.map((e) => e.value);
  if (drivers.length) {
    state.filters.profileDriver = drivers[0];
    const preferred = DEFAULT_COMPARE_DRIVERS.filter((d) => drivers.includes(d));
    const rest = dataset.careerRecords
      .map((r) => r.driver)
      .filter((d) => drivers.includes(d) && !preferred.includes(d));
    state.selectedDrivers = [...preferred, ...rest].slice(0, 2);
  }
  const completedSeasons = dataset.seasonDetails
    .filter((d) => !d.isUpcoming)
    .sort((a, b) => getSeasonOrder(a.seasonId) - getSeasonOrder(b.seasonId));
  if (completedSeasons.length) {
    state.filters.detailSeason = completedSeasons[completedSeasons.length - 1].seasonId;
  }
}

function render() {
  renderTabState();
  renderActiveView();
}

function renderTabState() {
  const buttons = Array.from(refs["main-nav"].querySelectorAll("button[data-tab]"));
  const views = Array.from(document.querySelectorAll("[data-view]"));

  buttons.forEach((btn) => {
    const isActive = btn.dataset.tab === state.activeTab;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  views.forEach((view) => {
    view.hidden = view.dataset.view !== state.activeTab;
  });
}

function renderActiveView() {
  const dataset = state.dataset;
  if (!dataset) return;

  switch (state.activeTab) {
    case "seasons":
      renderSeasonsView(dataset);
      break;
    case "drivers":
      renderDriversView(dataset);
      break;
    case "compare":
      renderCompareView(dataset);
      break;
    case "teams":
      renderTeamsView(dataset);
      break;
  }
}

function toggleComparisonDriver(driver) {
  const clean = normalizeInlineText(driver);
  if (!clean) return;
  if (state.selectedDrivers.includes(clean)) {
    state.selectedDrivers = state.selectedDrivers.filter((d) => d !== clean);
  } else {
    state.selectedDrivers = [...state.selectedDrivers, clean].slice(-MAX_COMPARE_DRIVERS);
  }
}

function toggleComparisonTeam(teamName) {
  const clean = normalizeInlineText(teamName);
  if (!clean) return;
  state.teams.compareInitialized = true;
  if (state.teams.selectedTeams.includes(clean)) {
    state.teams.selectedTeams = state.teams.selectedTeams.filter((t) => t !== clean);
  } else {
    state.teams.selectedTeams = [...state.teams.selectedTeams, clean].slice(-MAX_COMPARE_TEAMS);
  }
}

function colorForDriver(driver) {
  const clean = normalizeInlineText(driver);
  if (!clean) return DRIVER_PALETTE[0];
  const hash = Array.from(clean).reduce((sum, c) => sum + c.charCodeAt(0), 0);
  return DRIVER_PALETTE[hash % DRIVER_PALETTE.length];
}

function metricLabel(key) {
  const labels = {
    cpi: "Career Performance Index",
    avgWs: "Avg weighted score",
    peakWs: "Peak weighted score",
    avgPtsRate: "Avg points rate",
    avgTop5Rate: "Avg top 5 rate",
    avgWinRate: "Avg win rate",
    avgPodiumRate: "Avg podium rate",
    avgFastestLapRate: "Avg fastest-lap rate",
    avgPoleRate: "Avg pole rate",
    titles: "Title conversion",
    participation: "Participation",
    winRate: "Win rate",
    podiumRate: "Podium rate",
    fastestLapRate: "Fastest-lap rate",
    poleRate: "Pole rate",
    weightedScore: "Weighted score",
    pointsRate: "Points rate",
    top5Rate: "Top 5 rate",
    totalWcc: "WCC titles",
    totalPoints: "Total points",
    totalWins: "Total wins",
    avgTeamWeightedScore: "Avg team WS",
    peakTeamWeightedScore: "Peak team WS",
    totalWdc: "WDC seasons",
  };
  return labels[key] || key;
}

function formatComposite(value) {
  return `${Math.round((value || 0) * 100)}`;
}

function formatInteger(value) {
  return value == null ? "n/a" : `${Math.round(value)}`;
}

function formatDecimal(value, digits = 3) {
  return value == null || Number.isNaN(value) ? "n/a" : Number(value).toFixed(digits);
}

function formatPercent(value) {
  return value == null || Number.isNaN(value) ? "n/a" : `${Number(value).toFixed(1)}%`;
}

function formatMetricValue(key, value) {
  if (value == null) return "n/a";
  const percentKeys = [
    "avgPtsRate", "avgTop5Rate", "avgWinRate", "avgPodiumRate",
    "avgFastestLapRate", "avgPoleRate", "participation",
    "winRate", "podiumRate", "fastestLapRate", "poleRate", "pointsRate", "top5Rate",
  ];
  if (percentKeys.includes(key)) return formatPercent(value);
  const decimalKeys = ["avgWs", "peakWs", "weightedScore", "cpi", "avgTeamWeightedScore", "peakTeamWeightedScore"];
  if (decimalKeys.includes(key)) return formatDecimal(value);
  const intKeys = ["totalWcc", "totalPoints", "totalWins", "totalWdc"];
  if (intKeys.includes(key)) return formatInteger(value);
  if (key === "titles") return formatDecimal(value, 2);
  return String(value);
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderEmptyStateMarkup(message) {
  return `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function hexToAlpha(hex, alpha) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) return hex;
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function truncateLabel(value, maxLength = 16) {
  const clean = normalizeInlineText(value);
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
}

function showErrorBanner(message) {
  let banner = document.getElementById("app-error-banner");
  if (!banner) {
    banner = document.createElement("div");
    banner.id = "app-error-banner";
    banner.className = "app-error-banner";
    banner.setAttribute("role", "alert");
    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "app-error-banner__close";
    closeBtn.textContent = "Dismiss";
    closeBtn.addEventListener("click", () => banner.remove());
    banner.appendChild(closeBtn);
    document.querySelector(".content").insertAdjacentElement("afterbegin", banner);
  }
  const msg = document.createElement("p");
  msg.className = "app-error-banner__message";
  msg.textContent = message;
  banner.insertBefore(msg, banner.firstChild);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker
    .register("sw.js", { updateViaCache: "none" })
    .then((registration) => registration.update())
    .catch(() => {});
}
