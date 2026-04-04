"use strict";

// Local-storage keys keep imported archives and saved compare views available between refreshes.
const STORAGE_KEYS = {
  datasets: "slipstream.datasets.v1",
  activeDatasetId: "slipstream.activeDatasetId.v1",
  savedViews: "slipstream.savedViews.v1",
  customPresets: "slipstream.customPresets.v1",
  driverColors: "slipstream.driverColors.v1",
  trackAggregates: "slipstream.trackAggregates.v1",
};

// Core UI configuration: compare limits, palette assignment, scoring colors, and preset weights.
const MAX_COMPARE_DRIVERS = 6;
const DEFAULT_COMPARE_DRIVERS = ["Josie", "Toby"];
const DRIVER_PALETTE = [
  "#b7421b",
  "#0b756f",
  "#b28a28",
  "#415e97",
  "#7d4c9d",
  "#8a2d2d",
  "#4b6a32",
  "#9a5a14",
];

const METRIC_COLORS = {
  cpi: "#b7421b",
  avgWs: "#0b756f",
  peakWs: "#b28a28",
  avgPtsRate: "#415e97",
  avgTop5Rate: "#7d4c9d",
  avgWinRate: "#8a2d2d",
  avgPodiumRate: "#bc7c19",
  avgFastestLapRate: "#5776b3",
  avgPoleRate: "#1f8f84",
  titles: "#5c3d2e",
  winRate: "#8a2d2d",
  podiumRate: "#bc7c19",
  fastestLapRate: "#5776b3",
  poleRate: "#1f8f84",
  participation: "#46643d",
  weightedScore: "#b7421b",
  pointsRate: "#0b756f",
  top5Rate: "#415e97",
};

const CAREER_PRESET_METRICS = [
  "cpi",
  "avgWs",
  "peakWs",
  "avgPtsRate",
  "avgTop5Rate",
  "avgWinRate",
  "avgPodiumRate",
  "avgFastestLapRate",
  "avgPoleRate",
  "titles",
  "participation",
];

const SEASON_PRESET_METRICS = [
  "weightedScore",
  "pointsRate",
  "top5Rate",
  "winRate",
  "podiumRate",
  "fastestLapRate",
  "poleRate",
  "titles",
  "participation",
];

const PRESETS = {
  balanced: {
    label: "Balanced CPI lens",
    description: "Blend career index with season quality and consistent scoring.",
    careerWeights: { cpi: 0.45, avgWs: 0.2, peakWs: 0.15, avgPtsRate: 0.1, avgTop5Rate: 0.1 },
    seasonWeights: { weightedScore: 0.55, pointsRate: 0.15, top5Rate: 0.15, winRate: 0.1, titles: 0.05 },
  },
  peak: {
    label: "Peak-season bias",
    description: "Prioritize ceiling over longevity.",
    careerWeights: { peakWs: 0.45, avgWs: 0.15, cpi: 0.1, avgPtsRate: 0.1, titles: 0.2 },
    seasonWeights: { weightedScore: 0.5, winRate: 0.2, pointsRate: 0.15, top5Rate: 0.05, titles: 0.1 },
  },
  consistency: {
    label: "Consistency bias",
    description: "Reward repeatable top-five scoring and strong participation.",
    careerWeights: { avgWs: 0.28, avgTop5Rate: 0.28, avgPtsRate: 0.24, participation: 0.2 },
    seasonWeights: { weightedScore: 0.35, top5Rate: 0.25, pointsRate: 0.2, participation: 0.2 },
  },
  titles: {
    label: "Championship bias",
    description: "Put WDC and WCC conversion first.",
    careerWeights: { titles: 0.5, cpi: 0.15, peakWs: 0.15, avgWs: 0.1, avgPtsRate: 0.1 },
    seasonWeights: { titles: 0.35, weightedScore: 0.35, winRate: 0.15, pointsRate: 0.15 },
  },
  winsPodiums: {
    label: "Wins & podiums bias",
    description: "Lean into front-running conversion with extra weight on wins, podiums, and finishing punch.",
    careerWeights: { avgWinRate: 0.3, avgPodiumRate: 0.28, peakWs: 0.16, titles: 0.16, cpi: 0.1 },
    seasonWeights: { winRate: 0.28, podiumRate: 0.26, weightedScore: 0.2, titles: 0.14, pointsRate: 0.08, top5Rate: 0.04 },
  },
  rawPace: {
    label: "Raw pace bias",
    description: "Favor poles and fastest laps to spotlight outright speed over pure title conversion.",
    careerWeights: { avgFastestLapRate: 0.3, avgPoleRate: 0.3, peakWs: 0.16, cpi: 0.14, avgWs: 0.1 },
    seasonWeights: { fastestLapRate: 0.32, poleRate: 0.28, weightedScore: 0.18, winRate: 0.12, pointsRate: 0.1 },
  },
};

// Demo data lets the static app bootstrap itself without any external service or build step.
const DEMO_MARKDOWN = `# Slipstream Demo Archive

## Season Registry

| Season | Type | Car | Venues | Races/Venue | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | Formula | Formula Rookie | Lime Rock, Road Atlanta | 3 | Nova | Nova + Finch |
| S2 | Sports | GT4 Sprint | Watkins Glen, Spa | 3 | Finch | Finch + Vale |

## Weighted Score Formula

Win% x 0.20 + Podium% x 0.20 + Top 5 Rate x 0.20 + Pts/Race x 0.20 + Points Rate x 0.10 + FL Rate x 0.05 + Pole Rate x 0.05

## Full Career Statistics

| Driver | WDC | WCC | Wins | Podiums | Poles | FLs | Points | Races | Win% | Pod% | Pts/Race | FL% | Top5 | Top5% |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Finch | 1 | 1 | 7 | 15 | 3 | 3 | 508 | 18 | 38.9% | 83.3% | 28.2 | 16.7% | 17 | 94.4% |
| Nova | 1 | 1 | 7 | 13 | 9 | 6 | 482 | 18 | 38.9% | 72.2% | 26.8 | 33.3% | 16 | 88.9% |
| Vale | 0 | 1 | 2 | 8 | 1 | 1 | 380 | 18 | 11.1% | 44.4% | 21.1 | 5.6% | 11 | 61.1% |

## CPI Rankings

| Rank | Driver | CPI | Avg WS | Peak WS | Avg Pts Rate | Avg Top5 Rate | WDCs | WCCs |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Finch | 1.522 | 0.725 | 0.944 | 84.0% | 92.0% | 1 | 1 |
| 2 | Nova | 1.416 | 0.664 | 0.821 | 80.2% | 88.9% | 1 | 1 |
| 3 | Vale | 0.912 | 0.471 | 0.488 | 63.1% | 61.1% | 0 | 1 |

## All-Time Weighted Score Rankings

| Rank | Driver | Season | W.Score | Win% | Pod% | Top5% | Pts/Race | FL% | Pole% | PtsRate | Part. | WDC | WCC |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Finch | S2 | 0.9440 | 55.6% | 100.0% | 100.0% | 30.9 | 22.2% | 11.1% | 91.6% | 100.0% | Yes | Yes |
| 2 | Nova | S1 | 0.8210 | 55.6% | 88.9% | 100.0% | 29.8 | 44.4% | 66.7% | 89.3% | 100.0% | Yes | Yes |
| 3 | Finch | S1 | 0.5070 | 22.2% | 66.7% | 88.9% | 25.5 | 11.1% | 22.2% | 76.4% | 100.0% |  |  |
| 4 | Vale | S2 | 0.4540 | 11.1% | 44.4% | 66.7% | 22.6 | 11.1% | 0% | 67.9% | 100.0% |  | Yes |

# Season-by-Season Results

## Season 1 Results

**Type:** Formula Car Season
**Car:** Formula Rookie
**Venues:** Lime Rock, Road Atlanta
**Races Per Venue:** 3
**WDC:** Nova
**WCC:** Nova + Finch

### Season Standings

| Pos | Driver | Points | Wins | Podiums | Poles | FLs | Races | Part. | Pts Rate | Top 5 Rate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Nova **WDC** (WCC) | 268 | 5 | 8 | 6 | 4 | 9 | 100.0% | 89.3% | 100.0% |
| 2 | Finch (WCC) | 230 | 2 | 6 | 2 | 1 | 9 | 100.0% | 76.4% | 88.9% |
| 3 | Vale | 175 | 1 | 4 | 1 | 0 | 9 | 100.0% | 58.3% | 77.8% |

### Team Standings (WCC)

| Team | Points |
| --- | --- |
| Nova + Finch | 498 |
| Vale | 175 |`;

// All application state lives in this one in-memory object and is re-rendered on change.
const state = {
  datasets: [],
  activeDatasetId: null,
  activeTab: "season-detail",
  filters: getDefaultFilters(),
  insights: getDefaultInsightsFilters(),
  selectedDrivers: [],
  savedViews: [],
  customPresets: {},
  presetLab: getDefaultPresetLabState(),
  driverColors: {},
  pendingColorDriver: "",
  trackAggregateCache: {},
};

// DOM references are cached once at startup so render functions stay simple and fast.
const refs = {};

document.addEventListener("DOMContentLoaded", init);

function getDefaultPresetLabState() {
  return {
    sourcePresetId: "balanced",
    customPresetId: "",
    dirty: false,
    collapsed: false,
  };
}

function getDefaultFilters() {
  return {
    preset: "balanced",
    season: "all",
    era: "all",
    division: "all",
    team: "all",
    car: "all",
    detailSeason: "auto",
    detailProgressMode: "week",
    profileDriver: "",
    driverSearch: "",
  };
}

// The insights tab keeps its own local controls so broader statistics are not driven by the sidebar filters.
function getDefaultInsightsFilters() {
  return {
    lens: "season",
    view: "weighted",
    era: "all",
    division: "all",
    activeInsight: "strongestPeaks",
  };
}

function getPresetRegistry() {
  return { ...PRESETS, ...state.customPresets };
}

function getCustomPresetEntries() {
  return Object.entries(state.customPresets).sort(([, left], [, right]) =>
    left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
  );
}

function getPresetById(presetId) {
  return getPresetRegistry()[presetId] || PRESETS.balanced;
}

function getValidPresetId(presetId) {
  return getPresetRegistry()[presetId] ? presetId : "balanced";
}

function syncActivePresetSelection() {
  const nextPresetId = getValidPresetId(state.filters.preset);
  state.filters.preset = nextPresetId;
  if (refs["preset-select"]) {
    refs["preset-select"].value = nextPresetId;
  }
  return nextPresetId;
}

function getActivePreset() {
  return getPresetById(syncActivePresetSelection());
}

function isCustomPresetId(presetId) {
  return Object.prototype.hasOwnProperty.call(state.customPresets, presetId);
}

function getActiveDataset() {
  return state.datasets.find((dataset) => dataset.id === state.activeDatasetId) || null;
}

function getDefaultComparisonDrivers(dataset, drivers) {
  const availableDrivers = (drivers || []).filter(Boolean);
  if (!availableDrivers.length) {
    return [];
  }

  const preferredDrivers = DEFAULT_COMPARE_DRIVERS.filter((driver) => availableDrivers.includes(driver));
  const rankedFallback = (dataset?.careerRecords || [])
    .map((record) => record.driver)
    .filter((driver) => availableDrivers.includes(driver) && !preferredDrivers.includes(driver));
  const alphabeticalFallback = availableDrivers.filter(
    (driver) => !preferredDrivers.includes(driver) && !rankedFallback.includes(driver),
  );

  return [...preferredDrivers, ...rankedFallback, ...alphabeticalFallback].slice(
    0,
    Math.min(2, availableDrivers.length),
  );
}

function syncSelectionDefaults(dataset, preserveActiveSelection) {
  if (!dataset) {
    state.filters.profileDriver = "";
    state.selectedDrivers = [];
    return;
  }

  const drivers = dataset.filterOptions.drivers.map((entry) => entry.value);
  if (!drivers.length) {
    state.filters.profileDriver = "";
    state.selectedDrivers = [];
    state.filters.detailSeason = "auto";
    return;
  }

  const detailSeasonIds = dataset.seasonDetails
    .filter((detail) => !detail.isUpcoming)
    .map((detail) => detail.seasonId);
  if (
    !preserveActiveSelection ||
    (state.filters.detailSeason !== "auto" && !detailSeasonIds.includes(state.filters.detailSeason))
  ) {
    state.filters.detailSeason = detailSeasonIds[detailSeasonIds.length - 1] || "auto";
  }

  if (!preserveActiveSelection || !drivers.includes(state.filters.profileDriver)) {
    state.filters.profileDriver = drivers[0];
  }

  const hadSelectionBeforeFiltering = state.selectedDrivers.length > 0;
  state.selectedDrivers = state.selectedDrivers.filter((driver) => drivers.includes(driver)).slice(0, MAX_COMPARE_DRIVERS);
  if (!state.selectedDrivers.length && (!preserveActiveSelection || hadSelectionBeforeFiltering)) {
    state.selectedDrivers = getDefaultComparisonDrivers(dataset, drivers);
  }
}

function toggleComparisonDriver(driver) {
  const clean = normalizeInlineText(driver);
  if (!clean) {
    return;
  }

  if (state.selectedDrivers.includes(clean)) {
    state.selectedDrivers = state.selectedDrivers.filter((entry) => entry !== clean);
    return;
  }

  state.selectedDrivers = [...state.selectedDrivers, clean].slice(-MAX_COMPARE_DRIVERS);
}

// Boot sequence: cache DOM, seed UI selects, wire events, restore saved state, then render.
function init() {
  cacheRefs();
  ensureDriverColorPicker();
  seedPresetOptions();
  renderPresetLab();
  bindEvents();
  hydrateState();
  render();
}

// Cache every DOM node that the renderer writes to or the event layer listens to.
function cacheRefs() {
  [
    "load-sample",
    "export-summary",
    "export-chart",
    "export-json",
    "dataset-upload",
    "markdown-paste",
    "import-pasted",
    "clear-pasted",
    "global-filters-panel",
    "dataset-list",
    "dataset-count-badge",
    "selection-badge",
    "preset-select",
    "preset-lab",
    "season-select",
    "era-select",
    "division-select",
    "team-select",
    "car-select",
    "detail-season-select",
    "detail-progress-mode-select",
    "profile-driver-select",
    "view-tabs",
    "driver-search",
    "driver-picker",
    "save-view",
    "reset-filters",
    "saved-views",
    "dataset-kicker",
    "dataset-title",
    "dataset-status-badge",
    "overview-cards",
    "validation-summary",
    "detail-season-badge",
    "season-detail-summary",
    "season-progress-chart",
    "season-class-summary",
    "season-detail-standings",
    "season-detail-venues",
    "comparison-season-chart",
    "career-leaderboard",
    "season-leaderboard",
    "leaderboard-context",
    "insights-badge",
    "insights-lens-select",
    "insights-view-select",
    "insights-era-select",
    "insights-division-select",
    "insights-cards",
    "insights-detail-title",
    "insights-detail-badge",
    "insights-detail-summary",
    "insights-detail-table",
    "profile-badge",
    "driver-profile",
    "comparison-workspace",
    "season-fingerprints",
    "what-changed",
    "track-performance",
    "track-perf-badge",
    "comparison-top-tracks",
  ].forEach((id) => {
    refs[id] = document.getElementById(id);
  });
}

function seedPresetOptions() {
  const customEntries = getCustomPresetEntries();
  refs["preset-select"].innerHTML = [
    `<optgroup label="Built-in presets">${Object.entries(PRESETS)
      .map(([value, preset]) => `<option value="${value}">${escapeHtml(preset.label)}</option>`)
      .join("")}</optgroup>`,
    customEntries.length
      ? `<optgroup label="Saved custom presets">${customEntries
          .map(([value, preset]) => `<option value="${value}">${escapeHtml(preset.label)}</option>`)
          .join("")}</optgroup>`
      : "",
  ].join("");
  syncActivePresetSelection();
}

function renderPresetLab(presetId = state.filters.preset) {
  loadPresetLab(presetId);
}

function loadPresetLab(presetId = state.filters.preset) {
  if (!refs["preset-lab"]) {
    return;
  }

  const activePresetId = syncActivePresetSelection();
  const sourcePresetId = getValidPresetId(presetId || activePresetId);
  const sourcePreset = getPresetById(sourcePresetId);

  state.presetLab.sourcePresetId = sourcePresetId;
  state.presetLab.customPresetId = isCustomPresetId(sourcePresetId) ? sourcePresetId : "";
  state.presetLab.dirty = false;

  refs["preset-lab"].innerHTML = `
    <div class="preset-lab__card">
      <div class="preset-lab__header">
        <div>
          <h3 class="preset-lab__title">Build a saved ranking lens</h3>
          <div class="subtle-text">Clone the active preset, tune the weight mix, and save it as a reusable custom preset.</div>
        </div>
        <div class="preset-lab__header-actions">
          <span class="badge badge--accent" data-preset-lab-status></span>
          <button class="mini-button" type="button" data-preset-lab-action="toggle-collapse"></button>
        </div>
      </div>

      <div class="preset-lab__body" data-preset-lab-body${state.presetLab.collapsed ? " hidden" : ""}>
        <div class="preset-lab__summary">
          <div class="stat-pair">
            <div class="stat-pair__label">Active ranking</div>
            <span class="stat-pair__value preset-lab__summary-value" data-preset-lab-active-label>${escapeHtml(getActivePreset().label)}</span>
          </div>
          <div class="stat-pair">
            <div class="stat-pair__label">Draft source</div>
            <span class="stat-pair__value preset-lab__summary-value" data-preset-lab-source-label>${escapeHtml(sourcePreset.label)}</span>
          </div>
        </div>

        <div class="preset-lab__fields">
          <label class="field">
            <span>Preset name</span>
            <input
              type="text"
              value="${escapeHtml(sourcePreset.label)}"
              data-preset-lab-field="label"
              placeholder="Weekend warrior lens"
            />
          </label>
          <label class="field">
            <span>Description</span>
            <textarea class="textarea preset-lab__description" rows="3" data-preset-lab-field="description" placeholder="Explain what this preset values most.">${escapeHtml(sourcePreset.description || "")}</textarea>
          </label>
        </div>

        <div class="preset-lab__groups">
          <section class="preset-lab__group">
            <div class="preset-lab__group-header">
              <div>
                <h3 class="preset-lab__group-title">Career weights</h3>
                <div class="fine-print">Used for driver profile, career leaderboard, and comparison ranking.</div>
              </div>
              <span class="badge" data-preset-lab-total="career">0%</span>
            </div>
            <div class="preset-lab__metric-grid">
              ${CAREER_PRESET_METRICS.map((key) => buildPresetLabMetricInput("career", key, sourcePreset.careerWeights)).join("")}
            </div>
          </section>

          <section class="preset-lab__group">
            <div class="preset-lab__group-header">
              <div>
                <h3 class="preset-lab__group-title">Season weights</h3>
                <div class="fine-print">Used for the all-time season leaderboard inside the current filter slice.</div>
              </div>
              <span class="badge" data-preset-lab-total="season">0%</span>
            </div>
            <div class="preset-lab__metric-grid">
              ${SEASON_PRESET_METRICS.map((key) => buildPresetLabMetricInput("season", key, sourcePreset.seasonWeights)).join("")}
            </div>
          </section>
        </div>

        <div class="preset-lab__actions">
          <button class="mini-button" type="button" data-preset-lab-action="load-active">Load Active Preset</button>
          <button class="mini-button" type="button" data-preset-lab-action="reset-draft">Reset Draft</button>
          <button class="button button--secondary" type="button" data-preset-lab-action="save"></button>
          ${
            state.presetLab.customPresetId
              ? `<button class="mini-button mini-button--danger" type="button" data-preset-lab-action="delete">Delete Saved Preset</button>`
              : ""
          }
        </div>

        <div class="fine-print" data-preset-lab-note>
          Enter percentage weights for each group. Totals do not have to equal 100% because the app normalizes them when you save.
        </div>
      </div>
    </div>
  `;

  updatePresetLabUi();
}

function buildPresetLabMetricInput(scope, key, weights) {
  const color = METRIC_COLORS[key] || "#6a5748";
  return `
    <label class="preset-lab__metric-row">
      <span class="preset-lab__metric-name">
        <span class="preset-lab__metric-dot" style="background:${color}"></span>
        ${escapeHtml(metricLabel(key))}
      </span>
      <span class="preset-lab__metric-input-wrap">
        <input
          class="preset-lab__metric-input"
          type="number"
          min="0"
          step="0.1"
          value="${escapeHtml(formatPresetLabPercentage((weights?.[key] || 0) * 100))}"
          data-preset-scope="${scope}"
          data-metric="${key}"
        />
        <span>%</span>
      </span>
    </label>
  `;
}

function handlePresetLabClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const button = target.closest("button[data-preset-lab-action]");
  if (!button) {
    return;
  }

  const action = button.dataset.presetLabAction;
  if (action === "toggle-collapse") {
    state.presetLab.collapsed = !state.presetLab.collapsed;
    applyPresetLabCollapseState();
    return;
  }

  if (action === "load-active") {
    loadPresetLab(state.filters.preset);
    return;
  }

  if (action === "reset-draft") {
    loadPresetLab(state.presetLab.customPresetId || state.presetLab.sourcePresetId || state.filters.preset);
    return;
  }

  if (action === "save") {
    savePresetLab();
    return;
  }

  if (action === "delete") {
    deletePresetLabPreset();
  }
}

function handlePresetLabInput(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) {
    return;
  }

  const isLabField = target.matches("[data-preset-lab-field], [data-preset-scope][data-metric]");
  if (!isLabField) {
    return;
  }

  if (target.matches("[data-preset-scope][data-metric]") && event.type === "change") {
    target.value = formatPresetLabPercentage(sanitizePresetLabInput(target.value));
  }

  state.presetLab.dirty = true;
  updatePresetLabUi();
}

function updatePresetLabUi() {
  if (!refs["preset-lab"]) {
    return;
  }

  const careerTotal = sumPresetLabInputs("career");
  const seasonTotal = sumPresetLabInputs("season");
  const careerBadge = refs["preset-lab"].querySelector('[data-preset-lab-total="career"]');
  const seasonBadge = refs["preset-lab"].querySelector('[data-preset-lab-total="season"]');
  const statusBadge = refs["preset-lab"].querySelector("[data-preset-lab-status]");
  const saveButton = refs["preset-lab"].querySelector('[data-preset-lab-action="save"]');
  const note = refs["preset-lab"].querySelector("[data-preset-lab-note]");
  const activeLabel = refs["preset-lab"].querySelector("[data-preset-lab-active-label]");
  const hasValidTotals = careerTotal > 0 && seasonTotal > 0;

  if (activeLabel) {
    activeLabel.textContent = getActivePreset().label;
  }

  if (careerBadge) {
    careerBadge.textContent = `${formatPresetLabPercentage(careerTotal)}%`;
    careerBadge.classList.toggle("badge--warning", careerTotal <= 0);
  }

  if (seasonBadge) {
    seasonBadge.textContent = `${formatPresetLabPercentage(seasonTotal)}%`;
    seasonBadge.classList.toggle("badge--warning", seasonTotal <= 0);
  }

  if (statusBadge) {
    if (state.presetLab.customPresetId) {
      statusBadge.textContent = state.presetLab.dirty ? "Unsaved custom changes" : "Editing saved custom";
    } else {
      statusBadge.textContent = state.presetLab.dirty ? "Unsaved new custom" : "Ready for custom save";
    }
  }

  if (saveButton) {
    saveButton.textContent = state.presetLab.customPresetId ? "Update Custom Preset" : "Save Custom Preset";
    saveButton.disabled = !hasValidTotals;
    saveButton.title = hasValidTotals ? "" : "Career and season totals both need to be above 0%.";
  }

  if (note) {
    note.textContent = hasValidTotals
      ? "Enter percentage weights for each group. Totals do not have to equal 100% because the app normalizes them when you save."
      : "Both the career and season groups need at least some non-zero weight before the preset can be saved.";
  }

  applyPresetLabCollapseState();
}

function applyPresetLabCollapseState() {
  if (!refs["preset-lab"]) {
    return;
  }

  const card = refs["preset-lab"].querySelector(".preset-lab__card");
  const body = refs["preset-lab"].querySelector("[data-preset-lab-body]");
  const toggleButton = refs["preset-lab"].querySelector('[data-preset-lab-action="toggle-collapse"]');
  const isCollapsed = Boolean(state.presetLab.collapsed);

  if (card) {
    card.classList.toggle("is-collapsed", isCollapsed);
  }

  if (body) {
    body.hidden = isCollapsed;
  }

  if (toggleButton) {
    toggleButton.textContent = isCollapsed ? "Expand" : "Minimize";
    toggleButton.setAttribute("aria-expanded", String(!isCollapsed));
    toggleButton.title = isCollapsed ? "Expand the Custom Preset Lab" : "Minimize the Custom Preset Lab";
  }
}

function sumPresetLabInputs(scope) {
  if (!refs["preset-lab"]) {
    return 0;
  }

  return Array.from(refs["preset-lab"].querySelectorAll(`[data-preset-scope="${scope}"][data-metric]`)).reduce(
    (sum, input) => sum + sanitizePresetLabInput(input.value),
    0,
  );
}

function readPresetLabDraft() {
  if (!refs["preset-lab"]) {
    return null;
  }

  const labelInput = refs["preset-lab"].querySelector('[data-preset-lab-field="label"]');
  const descriptionInput = refs["preset-lab"].querySelector('[data-preset-lab-field="description"]');
  return {
    label: normalizePresetText(labelInput?.value),
    description: normalizePresetText(descriptionInput?.value),
    careerWeights: readPresetLabWeights("career", CAREER_PRESET_METRICS),
    seasonWeights: readPresetLabWeights("season", SEASON_PRESET_METRICS),
  };
}

function readPresetLabWeights(scope, metricKeys) {
  if (!refs["preset-lab"]) {
    return {};
  }

  return metricKeys.reduce((weights, key) => {
    const input = refs["preset-lab"].querySelector(`[data-preset-scope="${scope}"][data-metric="${key}"]`);
    weights[key] = sanitizePresetLabInput(input?.value);
    return weights;
  }, {});
}

function savePresetLab() {
  const draft = readPresetLabDraft();
  if (!draft) {
    return;
  }

  if (!draft.label) {
    showErrorBanner("Custom presets need a name before they can be saved.");
    return;
  }

  const careerWeights = normalizePresetWeightGroup(draft.careerWeights, CAREER_PRESET_METRICS);
  const seasonWeights = normalizePresetWeightGroup(draft.seasonWeights, SEASON_PRESET_METRICS);
  if (!careerWeights || !seasonWeights) {
    showErrorBanner("Both the career and season weight groups need at least one non-zero value.");
    return;
  }

  const presetId = state.presetLab.customPresetId || createId("preset");
  const existingPreset = state.customPresets[presetId] || null;
  const nextPreset = {
    id: presetId,
    label: draft.label,
    description:
      draft.description ||
      `Custom preset built from ${getPresetById(state.presetLab.sourcePresetId).label.toLowerCase()}.`,
    careerWeights,
    seasonWeights,
    createdAt: existingPreset?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  state.customPresets = {
    ...state.customPresets,
    [presetId]: nextPreset,
  };
  state.filters.preset = presetId;
  persistCustomPresets();
  seedPresetOptions();
  loadPresetLab(presetId);
  renderAnalysisView();
}

function deletePresetLabPreset() {
  const presetId = state.presetLab.customPresetId;
  if (!presetId || !state.customPresets[presetId]) {
    return;
  }

  const presetLabel = state.customPresets[presetId].label;
  if (!window.confirm(`Delete the saved preset "${presetLabel}"?`)) {
    return;
  }

  const nextCustomPresets = { ...state.customPresets };
  delete nextCustomPresets[presetId];
  state.customPresets = nextCustomPresets;

  if (state.filters.preset === presetId) {
    state.filters.preset = "balanced";
  }

  persistCustomPresets();
  seedPresetOptions();
  loadPresetLab(state.filters.preset);
  renderAnalysisView();
}

function sanitizePresetLabInput(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Number(numeric.toFixed(1));
}

function formatPresetLabPercentage(value) {
  return Number((Number(value) || 0).toFixed(1)).toString();
}

function normalizePresetWeightGroup(rawWeights, metricKeys) {
  const weightsByKey = metricKeys.reduce((weights, key) => {
    weights[key] = sanitizePresetLabInput(rawWeights?.[key]);
    return weights;
  }, {});
  const total = Object.values(weightsByKey).reduce((sum, value) => sum + value, 0);

  if (total <= 0) {
    return null;
  }

  return metricKeys.reduce((weights, key) => {
    const weight = weightsByKey[key];
    if (weight > 0) {
      weights[key] = Number((weight / total).toFixed(4));
    }
    return weights;
  }, {});
}

function normalizeCustomPresets(rawPresets) {
  if (!rawPresets || typeof rawPresets !== "object" || Array.isArray(rawPresets)) {
    return {};
  }

  return Object.entries(rawPresets).reduce((presets, [presetId, preset]) => {
    if (Object.prototype.hasOwnProperty.call(PRESETS, presetId)) {
      return presets;
    }

    const label = normalizePresetText(preset?.label);
    const description = normalizePresetText(preset?.description);
    const careerWeights = normalizePresetWeightGroup(preset?.careerWeights, CAREER_PRESET_METRICS);
    const seasonWeights = normalizePresetWeightGroup(preset?.seasonWeights, SEASON_PRESET_METRICS);
    if (!label || !careerWeights || !seasonWeights) {
      return presets;
    }

    presets[presetId] = {
      id: presetId,
      label,
      description,
      careerWeights,
      seasonWeights,
      createdAt: preset?.createdAt || "",
      updatedAt: preset?.updatedAt || "",
    };
    return presets;
  }, {});
}

// All user interactions funnel through this event layer, then trigger centralized renders.
function bindEvents() {
  refs["load-sample"].addEventListener("click", () => {
    importDataset("Slipstream_Demo_Archive.md", DEMO_MARKDOWN, "demo");
  });

  refs["dataset-upload"].addEventListener("change", async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) {
      return;
    }

    const uploadInput = refs["dataset-upload"];
    const label = document.querySelector('label[for="dataset-upload"]');
    const originalLabelText = label ? label.textContent : null;
    uploadInput.disabled = true;
    uploadInput.setAttribute("aria-busy", "true");
    if (label) {
      label.textContent = `Reading ${files.length} file${files.length > 1 ? "s" : ""}...`;
    }

    for (const file of files) {
      try {
        importDataset(file.name, await file.text(), "upload");
      } catch (error) {
        showErrorBanner(`Could not read "${file.name}": ${error.message}`);
      }
    }

    uploadInput.disabled = false;
    uploadInput.removeAttribute("aria-busy");
    if (label && originalLabelText !== null) {
      label.textContent = originalLabelText;
    }
    refs["dataset-upload"].value = "";
  });

  refs["import-pasted"].addEventListener("click", () => {
    const raw = refs["markdown-paste"].value.trim();
    if (!raw) {
      showErrorBanner("Paste Markdown content into the text area before importing.");
      return;
    }
    importDataset("Pasted_Archive.md", raw, "paste");
  });

  refs["clear-pasted"].addEventListener("click", () => {
    refs["markdown-paste"].value = "";
  });

  refs["preset-select"].addEventListener("change", (event) => {
    state.filters.preset = getValidPresetId(event.target.value);
    if (!state.presetLab.dirty) {
      loadPresetLab(state.filters.preset);
    } else {
      updatePresetLabUi();
    }
    persistViews();
    renderAnalysisView();
  });

  refs["preset-lab"].addEventListener("click", handlePresetLabClick);
  refs["preset-lab"].addEventListener("input", handlePresetLabInput);
  refs["preset-lab"].addEventListener("change", handlePresetLabInput);

  ["season-select", "era-select", "division-select", "team-select", "car-select"].forEach((id) => {
    refs[id].addEventListener("change", (event) => {
      state.filters[id.replace("-select", "")] = event.target.value;
      renderAnalysisView();
    });
  });

  refs["profile-driver-select"].addEventListener("change", (event) => {
    state.filters.profileDriver = event.target.value;
    renderAnalysisView();
  });

  refs["detail-season-select"].addEventListener("change", (event) => {
    state.filters.detailSeason = event.target.value;
    renderSeasonDetail(getActiveDataset());
  });

  refs["detail-progress-mode-select"].addEventListener("change", (event) => {
    state.filters.detailProgressMode = event.target.value;
    renderSeasonDetail(getActiveDataset());
  });

  // Insights controls are local to the insights tab and intentionally do not touch the sidebar filter state.
  refs["insights-lens-select"].addEventListener("change", (event) => {
    state.insights.lens = event.target.value;
    renderAnalysisView();
  });

  refs["insights-view-select"].addEventListener("change", (event) => {
    state.insights.view = event.target.value;
    renderAnalysisView();
  });

  refs["insights-era-select"].addEventListener("change", (event) => {
    state.insights.era = event.target.value;
    renderAnalysisView();
  });

  refs["insights-division-select"].addEventListener("change", (event) => {
    state.insights.division = event.target.value;
    renderAnalysisView();
  });

  refs["view-tabs"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-tab]");
    if (!button) {
      return;
    }
    state.activeTab = button.dataset.tab || "season-detail";
    renderTabState();
  });

  refs["driver-search"].addEventListener("input", (event) => {
    state.filters.driverSearch = event.target.value;
    renderDriverPicker();
  });

  // Clicking an insight card promotes it to the active drill-down for the explorer table below.
  refs["insights-cards"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-insight-id]");
    if (!button) {
      return;
    }

    state.insights.activeInsight = button.dataset.insightId || "";
    if (button.dataset.insightView) {
      state.insights.view = button.dataset.insightView;
    }
    renderAnalysisView();
  });

  refs["reset-filters"].addEventListener("click", () => {
    const preset = getValidPresetId(state.filters.preset);
    state.filters = getDefaultFilters();
    state.filters.preset = preset;
    state.selectedDrivers = [];
    syncSelectionDefaults(getActiveDataset());
    if (!state.presetLab.dirty) {
      loadPresetLab(state.filters.preset);
    }
    renderAnalysisView();
  });

  refs["save-view"].addEventListener("click", () => {
    const dataset = getActiveDataset();
    if (!dataset) {
      showErrorBanner("Load a dataset before saving a comparison view.");
      return;
    }

    state.savedViews = [
      {
        id: createId("view"),
        datasetId: dataset.id,
        label: buildSavedViewLabel(dataset),
        createdAt: new Date().toISOString(),
        filters: { ...state.filters },
        selectedDrivers: [...state.selectedDrivers],
      },
      ...state.savedViews,
    ].slice(0, 12);

    persistViews();
    renderSavedViews();
  });

  refs["dataset-list"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button || !button.dataset.datasetId) {
      return;
    }

    const datasetId = button.dataset.datasetId;
    if (button.dataset.action === "activate") {
      state.activeDatasetId = datasetId;
      syncSelectionDefaults(getActiveDataset(), true);
      persistDatasets();
      render();
    }

    if (button.dataset.action === "remove") {
      state.datasets = state.datasets.filter((dataset) => dataset.id !== datasetId);
      state.savedViews = state.savedViews.filter((view) => view.datasetId !== datasetId);
      delete state.trackAggregateCache[datasetId];
      if (state.activeDatasetId === datasetId) {
        state.activeDatasetId = state.datasets[0] ? state.datasets[0].id : null;
        state.selectedDrivers = [];
        state.filters = getDefaultFilters();
      }

      persistDatasets();
      persistViews();
      persistTrackAggregates();
      syncSelectionDefaults(getActiveDataset());
      render();
    }
  });

  refs["saved-views"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-view-action]");
    if (!button) {
      return;
    }

    const viewId = button.dataset.viewId;
    const view = state.savedViews.find((entry) => entry.id === viewId);
    if (!view) {
      return;
    }

    if (button.dataset.viewAction === "apply") {
      state.activeDatasetId = view.datasetId;
      state.filters = { ...getDefaultFilters(), ...view.filters };
      state.filters.preset = getValidPresetId(state.filters.preset);
      state.selectedDrivers = [...view.selectedDrivers];
      syncSelectionDefaults(getActiveDataset(), true);
      if (!state.presetLab.dirty) {
        loadPresetLab(state.filters.preset);
      } else {
        updatePresetLabUi();
      }
      persistDatasets();
      render();
    }

    if (button.dataset.viewAction === "delete") {
      state.savedViews = state.savedViews.filter((entry) => entry.id !== viewId);
      persistViews();
      renderSavedViews();
    }
  });

  refs["driver-picker"].addEventListener("click", (event) => {
    const button = event.target.closest("button[data-driver]");
    if (!button) {
      return;
    }

    toggleComparisonDriver(button.dataset.driver);
    renderAnalysisView();
  });

  refs["export-summary"].addEventListener("click", exportSummary);
  refs["export-chart"].addEventListener("click", exportCareerChart);
  refs["export-json"].addEventListener("click", exportDatasetJson);

  document.addEventListener("click", (event) => {
    const button = event.target.closest(".legend-swatch[data-driver]");
    if (button) {
      event.preventDefault();
      openDriverColorPicker(button.dataset.driver, button);
      return;
    }

    if (event.target.closest("#driver-color-popover")) {
      return;
    }

    closeDriverColorPicker();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeDriverColorPicker();
    }
  });
}

// Restore persisted datasets/views from localStorage and rebuild parsed dataset objects.
function hydrateState() {
  const savedViews = readJson(STORAGE_KEYS.savedViews, []);
  if (Array.isArray(savedViews)) {
    state.savedViews = savedViews;
  }

  state.customPresets = normalizeCustomPresets(readJson(STORAGE_KEYS.customPresets, {}));

  const driverColors = readJson(STORAGE_KEYS.driverColors, {});
  if (driverColors && typeof driverColors === "object" && !Array.isArray(driverColors)) {
    state.driverColors = driverColors;
  }

  const trackAggregates = readJson(STORAGE_KEYS.trackAggregates, {});
  if (trackAggregates && typeof trackAggregates === "object" && !Array.isArray(trackAggregates)) {
    state.trackAggregateCache = trackAggregates;
  }

  const persistedDatasets = readJson(STORAGE_KEYS.datasets, []);
  if (Array.isArray(persistedDatasets) && persistedDatasets.length) {
    console.info(
      `${persistedDatasets.length} dataset(s) found in storage but cannot be restored without rawMarkdown. Please re-import your archive files.`,
    );
  }

  const activeDatasetId = window.localStorage.getItem(STORAGE_KEYS.activeDatasetId);
  state.activeDatasetId = activeDatasetId || (state.datasets[0] ? state.datasets[0].id : null);

  if (!state.datasets.length) {
    refs["dataset-kicker"].textContent = "No dataset loaded";
    refs["dataset-title"].textContent = "Upload your Cup Racing Markdown archive or load the demo archive";
  }

  syncSelectionDefaults(getActiveDataset());
  seedPresetOptions();
  loadPresetLab(state.filters.preset);
}

// Parse and register a new dataset, replacing an older copy when the same file is re-imported.
function importDataset(name, rawMarkdown, source) {
  try {
    const dataset = parseDataset(name, rawMarkdown, source);
    const existingIndex = state.datasets.findIndex(
      (entry) => entry.name === name && entry.title === dataset.title,
    );

    if (existingIndex >= 0) {
      dataset.id = state.datasets[existingIndex].id;
      state.datasets.splice(existingIndex, 1, dataset);
    } else {
      state.datasets.unshift(dataset);
    }

    state.activeDatasetId = dataset.id;
    state.filters = { ...getDefaultFilters(), preset: getValidPresetId(state.filters.preset) };
    state.selectedDrivers = [];
    syncSelectionDefaults(dataset);
    state.trackAggregateCache[dataset.id] = buildTrackAggregates(dataset);
    persistDatasets();
    persistTrackAggregates();
    render();
  } catch (error) {
    showErrorBanner(`Import failed for "${name}": ${error.message}`);
  }
}

function syncExportButtons() {
  const hasDataset = Boolean(getActiveDataset());
  const noDatasetTitle = "Load a dataset first before exporting.";
  ["export-summary", "export-json"].forEach((id) => {
    refs[id].disabled = !hasDataset;
    refs[id].title = hasDataset ? "" : noDatasetTitle;
  });
  const chartConfig = hasDataset ? getActiveChartExportConfig() : null;
  const hasSvg = Boolean(chartConfig?.svg);
  refs["export-chart"].disabled = !hasSvg;
  refs["export-chart"].title = hasSvg
    ? ""
    : hasDataset
      ? "Open a tab with a chart before exporting."
      : noDatasetTitle;
}

// One top-level render pass keeps all panels synchronized from the same slice of state.
function render() {
  renderDatasetList();
  renderSavedViews();
  renderTabState();

  const dataset = getActiveDataset();
  if (!dataset) {
    renderEmptyWorkspace();
    return;
  }

  renderAnalysisPanels(dataset);
}

function renderAnalysisView() {
  renderTabState();
  const dataset = getActiveDataset();
  if (!dataset) {
    renderEmptyWorkspace();
    return;
  }

  renderAnalysisPanels(dataset);
}

function renderAnalysisPanels(dataset) {
  syncActivePresetSelection();
  syncSelectionDefaults(dataset, true);
  populateFilterControls(dataset);
  populateInsightsControls(dataset);
  renderOverview(dataset);
  renderSeasonDetail(dataset);
  renderDriverPicker();
  renderLeaderboards(dataset);
  renderComparisonSeasonChart(dataset);
  renderInsights(dataset);
  renderDriverProfile(dataset);
  renderComparisonWorkspace(dataset);
  renderSeasonFingerprints(dataset);
  renderWhatChanged(dataset);
  renderTrackPerformance(dataset);
  renderComparisonTopTracks(dataset);
  refs["selection-badge"].textContent = `${state.selectedDrivers.length} drivers selected`;
  refs["dataset-count-badge"].textContent = `${state.datasets.length} loaded`;
  syncExportButtons();
}

// Empty workspace markup keeps the static shell readable before any archive is imported.
function renderEmptyWorkspace() {
  renderTabState();
  refs["dataset-count-badge"].textContent = `${state.datasets.length} loaded`;
  refs["selection-badge"].textContent = "0 drivers selected";
  refs["dataset-status-badge"].textContent = "Idle";
  refs["overview-cards"].innerHTML = renderEmptyStateMarkup(
    "Load a Markdown archive to populate the analyst workspace.",
  );
  refs["validation-summary"].innerHTML = "";
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
  refs["comparison-season-chart"].innerHTML = renderEmptyStateMarkup(
    "Select drivers to compare their season-over-season weighted-score arc.",
  );
  refs["career-leaderboard"].innerHTML = renderEmptyStateMarkup(
    "Career rankings need an imported dataset.",
  );
  refs["season-leaderboard"].innerHTML = renderEmptyStateMarkup(
    "Season rankings need an imported dataset.",
  );
  refs["insights-badge"].textContent = "Local controls only";
  refs["insights-cards"].innerHTML = renderEmptyStateMarkup(
    "Load a dataset to surface broader totals and weighted-score insights.",
  );
  refs["insights-detail-title"].textContent = "Explorer detail";
  refs["insights-detail-badge"].textContent = "Click a card to focus";
  refs["insights-detail-summary"].textContent = "";
  refs["insights-detail-table"].innerHTML = renderEmptyStateMarkup(
    "The insight explorer will appear here after you load a dataset.",
  );
  refs["profile-badge"].textContent = "No driver selected";
  refs["driver-profile"].innerHTML = renderEmptyStateMarkup(
    "Choose a profile driver after importing data.",
  );
  refs["comparison-workspace"].innerHTML = renderEmptyStateMarkup(
    "Select up to six drivers to compare weighted-score profiles.",
  );
  refs["season-fingerprints"].innerHTML = renderEmptyStateMarkup(
    "The top seasons for the profile driver will show up here.",
  );
  refs["what-changed"].innerHTML = renderEmptyStateMarkup(
    "Season-over-season deltas will appear here once a driver is selected.",
  );
  refs["track-performance"].innerHTML = renderEmptyStateMarkup(
    "Track performance analysis will appear here after importing data.",
  );
  refs["comparison-top-tracks"].innerHTML = renderEmptyStateMarkup(
    "Select drivers to compare their strongest tracks.",
  );
  refs["driver-picker"].innerHTML = renderEmptyStateMarkup(
    "Upload a dataset to browse drivers.",
  );
  refs["saved-views"].innerHTML = renderEmptyStateMarkup(
    "Saved comparisons will appear here.",
  );
  syncExportButtons();
}

function getActiveChartExportConfig() {
  const chartTargetByTab = {
    "season-detail": {
      root: refs["season-progress-chart"],
      fileName: "season-detail-chart.svg",
    },
    comparison: {
      root: refs["comparison-season-chart"],
      fileName: "driver-comparison-chart.svg",
    },
  };

  const activeTarget = chartTargetByTab[state.activeTab];
  if (!activeTarget) {
    return null;
  }

  const svg = activeTarget.root?.querySelector("svg");
  return svg ? { ...activeTarget, svg } : null;
}

function renderTabState() {
  const buttons = Array.from(refs["view-tabs"]?.querySelectorAll("button[data-tab]") || []);
  const panels = Array.from(document.querySelectorAll("[data-tab-panel]"));
  const availableTabs = buttons.map((button) => button.dataset.tab).filter(Boolean);
  if (!availableTabs.includes(state.activeTab)) {
    state.activeTab = availableTabs[0] || "season-detail";
  }

  buttons.forEach((button) => {
    const isActive = button.dataset.tab === state.activeTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", String(isActive));
    button.tabIndex = isActive ? 0 : -1;
  });

  panels.forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== state.activeTab;
  });

  // The insights tab uses its own local controls, so the sidebar filter panel steps aside while it is active.
  if (refs["global-filters-panel"]) {
    refs["global-filters-panel"].hidden = state.activeTab === "insights";
  }
}

function renderDatasetList() {
  refs["dataset-list"].innerHTML = state.datasets.length
    ? state.datasets
        .map((dataset) => {
          const isActive = dataset.id === state.activeDatasetId;
          return `
            <article class="dataset-item ${isActive ? "is-active" : ""} fade-in">
              <div class="dataset-item__header">
                <div>
                  <h3 class="dataset-item__title">${escapeHtml(dataset.title)}</h3>
                  <div class="dataset-item__meta">${escapeHtml(dataset.name)} | ${dataset.stats.completedSeasonCount} completed seasons | ${dataset.stats.driverCount} drivers</div>
                </div>
                <span class="badge ${dataset.validations.some((entry) => entry.level === "warning") ? "badge--warning" : "badge--accent"}">${dataset.validations.length} checks</span>
              </div>
              <div class="dataset-item__actions">
                <button class="mini-button" type="button" data-action="activate" data-dataset-id="${escapeHtml(dataset.id)}">${isActive ? "Active" : "Use dataset"}</button>
                <button class="mini-button mini-button--danger" type="button" data-action="remove" data-dataset-id="${escapeHtml(dataset.id)}">Remove</button>
              </div>
            </article>
          `;
        })
        .join("")
    : renderEmptyStateMarkup("Imported archives will show up here.");
}

function populateFilterControls(dataset) {
  populateSelect(refs["season-select"], dataset.filterOptions.seasons, "All seasons", state.filters.season);
  populateSelect(refs["era-select"], dataset.filterOptions.eras, "All eras", state.filters.era);
  populateSelect(refs["division-select"], dataset.filterOptions.divisions, "All divisions", state.filters.division);
  populateSelect(refs["team-select"], dataset.filterOptions.teams, "All teams", state.filters.team);
  populateSelect(refs["car-select"], dataset.filterOptions.cars, "All cars", state.filters.car);
  populateSelect(
    refs["detail-season-select"],
    dataset.filterOptions.detailSeasons,
    "Auto season",
    state.filters.detailSeason,
    "auto",
  );
  populateSelect(
    refs["profile-driver-select"],
    dataset.filterOptions.drivers,
    "Choose a driver",
    state.filters.profileDriver,
  );

  refs["preset-select"].value = syncActivePresetSelection();
  refs["driver-search"].value = state.filters.driverSearch;
  refs["detail-progress-mode-select"].value = state.filters.detailProgressMode;
}

function populateSelect(element, options, defaultLabel, selectedValue, defaultValue = "all") {
  element.innerHTML = [
    `<option value="${escapeHtml(defaultValue)}">${escapeHtml(defaultLabel)}</option>`,
    ...options.map(
      (option) => `<option value="${escapeHtml(option.value)}">${escapeHtml(option.label)}</option>`,
    ),
  ].join("");

  const nextValue = options.some((option) => option.value === selectedValue)
    ? selectedValue
    : defaultValue;
  element.value = nextValue || defaultValue;
  const stateKeyMap = {
    "season-select": "season",
    "era-select": "era",
    "division-select": "division",
    "team-select": "team",
    "car-select": "car",
    "detail-season-select": "detailSeason",
    "profile-driver-select": "profileDriver",
  };
  state.filters[stateKeyMap[element.id]] = nextValue || defaultValue;
}

function exportSummary() {
  const dataset = getActiveDataset();
  if (!dataset) {
    showErrorBanner("Load a dataset before exporting a summary.");
    return;
  }

  const activePreset = getActivePreset();
  const ranking = buildCareerAggregates(dataset);
  const seasonRanking = buildSeasonRanking(dataset);
  const profile = ranking.find((entry) => entry.driver === state.filters.profileDriver) || ranking[0];
  const selected = state.selectedDrivers.join(", ") || "None";
  const lines = [
    "# Slipstream Archive Summary",
    "",
    `- Dataset: ${dataset.title}`,
    `- Imported file: ${dataset.name}`,
    `- Preset: ${activePreset.label}`,
    `- Slice: ${describeCurrentSlice()}`,
    `- Profile driver: ${profile ? profile.driver : "None"}`,
    `- Compared drivers: ${selected}`,
    "",
    "## Career Top 5",
    ...ranking.slice(0, 5).map(
      (entry, index) =>
        `${index + 1}. ${entry.driver} - score ${formatComposite(entry.composite)}, CPI ${formatDecimal(entry.cpi)}, peak ${formatDecimal(entry.peakWs)}`,
    ),
    "",
    "## Season Top 5",
    ...seasonRanking.slice(0, 5).map(
      (entry, index) =>
        `${index + 1}. ${entry.driver} ${entry.seasonId} - score ${formatComposite(entry.composite)}, WS ${formatDecimal(entry.weightedScore)}, points rate ${formatPercent(entry.pointsRate)}`,
    ),
  ];

  if (profile) {
    lines.push("", "## Profile Narrative", buildDriverNarrative(profile, describeCurrentSlice()));
  }

  downloadTextFile(`slipstream-summary-${slugify(dataset.title)}.md`, lines.join("\n"));
}

function exportCareerChart() {
  const chartConfig = getActiveChartExportConfig();
  if (!chartConfig?.svg) {
    showErrorBanner("Open a tab with a chart before exporting.");
    return;
  }

  const serializer = new XMLSerializer();
  const exportSvg = buildChartSvgExport(chartConfig.root, chartConfig.svg);
  downloadTextFile(
    chartConfig.fileName,
    serializer.serializeToString(exportSvg),
    "image/svg+xml",
  );
}

function exportDatasetJson() {
  const dataset = getActiveDataset();
  if (!dataset) {
    showErrorBanner("Load a dataset before exporting JSON.");
    return;
  }

  downloadTextFile(
    `slipstream-${slugify(dataset.title)}.json`,
    JSON.stringify(
      {
        id: dataset.id,
        name: dataset.name,
        title: dataset.title,
        source: dataset.source,
        importedAt: dataset.importedAt,
        scoringFormula: dataset.scoringFormula,
        stats: dataset.stats,
        validations: dataset.validations,
        seasonCatalog: dataset.seasonCatalog,
        seasonDetails: dataset.seasonDetails,
        careerRecords: dataset.careerRecords,
        weightedRecords: dataset.weightedRecords,
      },
      null,
      2,
    ),
    "application/json",
  );
}

function persistDatasets() {
  try {
    window.localStorage.setItem(
      STORAGE_KEYS.datasets,
      JSON.stringify(
        state.datasets.map((dataset) => ({
          id: dataset.id,
          name: dataset.name,
          title: dataset.title,
          source: dataset.source,
          importedAt: dataset.importedAt,
        })),
      ),
    );
    window.localStorage.setItem(STORAGE_KEYS.activeDatasetId, state.activeDatasetId || "");
  } catch (error) {
    console.warn("Could not persist datasets", error);
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      showErrorBanner(
        "Storage quota exceeded - your session will not be saved between page loads. Try removing unused datasets from the Dataset Library.",
      );
    }
  }
}

function persistViews() {
  try {
    window.localStorage.setItem(STORAGE_KEYS.savedViews, JSON.stringify(state.savedViews));
  } catch (error) {
    console.warn("Could not persist saved views", error);
  }
}

function persistCustomPresets() {
  try {
    window.localStorage.setItem(STORAGE_KEYS.customPresets, JSON.stringify(state.customPresets));
  } catch (error) {
    console.warn("Could not persist custom presets", error);
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      showErrorBanner(
        "Storage quota exceeded - custom presets will not persist between page loads.",
      );
    }
  }
}

function persistDriverColors() {
  try {
    window.localStorage.setItem(STORAGE_KEYS.driverColors, JSON.stringify(state.driverColors));
  } catch (error) {
    console.warn("Could not persist driver colors", error);
  }
}

function persistTrackAggregates() {
  try {
    window.localStorage.setItem(STORAGE_KEYS.trackAggregates, JSON.stringify(state.trackAggregateCache));
  } catch (error) {
    console.warn("Could not persist track aggregates", error);
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      showErrorBanner(
        "Storage quota exceeded - track performance data will not persist between page loads.",
      );
    }
  }
}

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.warn(`Could not parse ${key}`, error);
    return fallback;
  }
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
    (document.querySelector(".app-shell") || document.body).insertAdjacentElement("afterbegin", banner);
  }
  const msg = document.createElement("p");
  msg.className = "app-error-banner__message";
  msg.textContent = message;
  banner.insertBefore(msg, banner.firstChild);
}

function ensureDriverColorPicker() {
  let popover = document.getElementById("driver-color-popover");
  if (!popover) {
    popover = document.createElement("div");
    popover.id = "driver-color-popover";
    popover.className = "color-popover";
    popover.hidden = true;
    popover.innerHTML = `
      <div class="color-popover__header">
        <div>
          <p class="color-popover__eyebrow">Driver line color</p>
          <h3 class="color-popover__title" id="driver-color-picker-title">Choose a color</h3>
        </div>
        <button class="mini-button" id="driver-color-close" type="button">Close</button>
      </div>
      <label class="color-popover__field" for="driver-color-picker">
        <span>Custom color</span>
        <input id="driver-color-picker" class="color-popover__picker" type="color" />
      </label>
      <div class="color-popover__section">
        <div class="color-popover__label">Quick picks</div>
        <div class="color-popover__preset-grid" id="driver-color-presets"></div>
      </div>
      <div class="color-popover__actions">
        <button class="mini-button" id="driver-color-reset" type="button">Reset to default</button>
      </div>
    `;
    document.body.appendChild(popover);
  }

  refs["driver-color-popover"] = popover;
  refs["driver-color-picker"] = popover.querySelector("#driver-color-picker");
  refs["driver-color-picker-title"] = popover.querySelector("#driver-color-picker-title");
  refs["driver-color-presets"] = popover.querySelector("#driver-color-presets");
  refs["driver-color-close"] = popover.querySelector("#driver-color-close");
  refs["driver-color-reset"] = popover.querySelector("#driver-color-reset");

  refs["driver-color-picker"].addEventListener("input", handleDriverColorInput);
  refs["driver-color-picker"].addEventListener("change", handleDriverColorInput);
  refs["driver-color-close"].addEventListener("click", closeDriverColorPicker);
  refs["driver-color-reset"].addEventListener("click", resetDriverColor);
  refs["driver-color-presets"].addEventListener("click", handleDriverColorPresetClick);
}

function openDriverColorPicker(driver, anchor) {
  const clean = normalizeInlineText(driver);
  if (!clean || !refs["driver-color-picker"] || !refs["driver-color-popover"]) {
    return;
  }

  if (!refs["driver-color-popover"].hidden && state.pendingColorDriver === clean) {
    closeDriverColorPicker();
    return;
  }

  state.pendingColorDriver = clean;
  refs["driver-color-picker-title"].textContent = `${clean} line color`;
  refs["driver-color-picker"].value = normalizeHexColor(colorForDriver(clean));
  renderDriverColorPresets(clean);
  refs["driver-color-popover"].hidden = false;
  positionDriverColorPopover(anchor);
}

function handleDriverColorInput(event) {
  const driver = state.pendingColorDriver;
  const value = normalizeHexColor(event.target.value);
  if (!driver || !value) {
    return;
  }

  applyDriverColor(driver, value);
}

function handleDriverColorPresetClick(event) {
  const button = event.target.closest("button[data-color]");
  if (!button || !state.pendingColorDriver) {
    return;
  }

  applyDriverColor(state.pendingColorDriver, button.dataset.color);
}

function applyDriverColor(driver, value) {
  const cleanDriver = normalizeInlineText(driver);
  const cleanValue = normalizeHexColor(value);
  if (!cleanDriver || !cleanValue) {
    return;
  }

  if (refs["driver-color-picker"]) {
    refs["driver-color-picker"].value = cleanValue;
  }

  renderDriverColorPresets(cleanDriver, cleanValue);
  state.driverColors[cleanDriver] = cleanValue;
  persistDriverColors();
  renderAnalysisView();
}

function resetDriverColor() {
  const driver = state.pendingColorDriver;
  if (!driver) {
    return;
  }

  delete state.driverColors[driver];
  persistDriverColors();

  const defaultColor = defaultColorForDriver(driver);
  if (refs["driver-color-picker"]) {
    refs["driver-color-picker"].value = defaultColor;
  }

  renderDriverColorPresets(driver, defaultColor);
  renderAnalysisView();
}

function closeDriverColorPicker() {
  state.pendingColorDriver = "";
  if (refs["driver-color-popover"]) {
    refs["driver-color-popover"].hidden = true;
  }
}

function renderDriverColorPresets(driver, activeColor = colorForDriver(driver)) {
  if (!refs["driver-color-presets"]) {
    return;
  }

  const currentColor = normalizeHexColor(activeColor) || defaultColorForDriver(driver);
  const colors = [...new Set([...DRIVER_PALETTE, currentColor])];
  refs["driver-color-presets"].innerHTML = colors
    .map(
      (color) => `
        <button
          class="color-popover__preset ${color === currentColor ? "is-active" : ""}"
          type="button"
          data-color="${color}"
          aria-label="Use ${color} for ${escapeHtml(driver)}"
          title="${color}"
          style="background:${color}"
        ></button>
      `,
    )
    .join("");
}

function positionDriverColorPopover(anchor) {
  if (!anchor || !refs["driver-color-popover"]) {
    return;
  }

  const popover = refs["driver-color-popover"];
  const anchorRect = anchor.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();
  const gutter = 12;

  let left = anchorRect.left + anchorRect.width / 2 - popoverRect.width / 2;
  left = Math.max(gutter, Math.min(left, window.innerWidth - popoverRect.width - gutter));

  let top = anchorRect.bottom + gutter;
  if (top + popoverRect.height > window.innerHeight - gutter) {
    top = Math.max(gutter, anchorRect.top - popoverRect.height - gutter);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

function normalizeHexColor(value) {
  const clean = String(value || "").trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(clean) ? clean : "";
}

function defaultColorForDriver(driver) {
  const clean = normalizeInlineText(driver);
  if (!clean) {
    return DRIVER_PALETTE[0];
  }

  const hash = Array.from(clean).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DRIVER_PALETTE[hash % DRIVER_PALETTE.length];
}

function buildChartSvgExport(chartRoot, sourceSvg) {
  const clone = sourceSvg.cloneNode(true);
  const viewBox = (clone.getAttribute("viewBox") || "0 0 820 340")
    .split(/\s+/)
    .map((value) => Number(value));
  const [, , width = 820, height = 340] = viewBox;
  const legendItems = Array.from(chartRoot.querySelectorAll(".legend-item"))
    .map((item) => {
      const swatch = item.querySelector(".legend-swatch");
      const style = swatch?.getAttribute("style") || "";
      const colorMatch = style.match(/background:\s*([^;]+)/i);
      return {
        label: item.textContent.trim(),
        color: colorMatch ? colorMatch[1].trim() : "#0b756f",
      };
    })
    .filter((item) => item.label);

  if (!legendItems.length) {
    return clone;
  }

  const columns = Math.min(legendItems.length, 3);
  const rows = Math.ceil(legendItems.length / columns);
  const legendRowHeight = 22;
  const legendTopPadding = 18;
  const legendHeight = legendTopPadding + rows * legendRowHeight + 16;
  const newHeight = height + legendHeight;
  clone.setAttribute("viewBox", `0 0 ${width} ${newHeight}`);

  const firstRect = clone.querySelector("rect");
  if (firstRect) {
    firstRect.setAttribute("height", String(newHeight));
  }

  const ns = "http://www.w3.org/2000/svg";
  const legendGroup = document.createElementNS(ns, "g");
  legendGroup.setAttribute("aria-label", "Chart legend");

  const legendBg = document.createElementNS(ns, "rect");
  legendBg.setAttribute("x", "18");
  legendBg.setAttribute("y", String(height + 8));
  legendBg.setAttribute("width", String(width - 36));
  legendBg.setAttribute("height", String(legendHeight - 12));
  legendBg.setAttribute("rx", "18");
  legendBg.setAttribute("fill", "rgba(255,249,244,0.92)");
  legendBg.setAttribute("stroke", "rgba(91,66,48,0.12)");
  legendGroup.appendChild(legendBg);

  const legendTitle = document.createElementNS(ns, "text");
  legendTitle.setAttribute("x", "34");
  legendTitle.setAttribute("y", String(height + 30));
  legendTitle.setAttribute("font-size", "12");
  legendTitle.setAttribute("font-weight", "700");
  legendTitle.setAttribute("fill", "#6a5748");
  legendTitle.textContent = "Legend";
  legendGroup.appendChild(legendTitle);

  const innerWidth = width - 68;
  const columnWidth = innerWidth / columns;
  legendItems.forEach((item, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = 34 + column * columnWidth;
    const y = height + 52 + row * legendRowHeight;

    const swatch = document.createElementNS(ns, "rect");
    swatch.setAttribute("x", String(x));
    swatch.setAttribute("y", String(y - 9));
    swatch.setAttribute("width", "12");
    swatch.setAttribute("height", "12");
    swatch.setAttribute("rx", "3");
    swatch.setAttribute("fill", item.color);
    legendGroup.appendChild(swatch);

    const label = document.createElementNS(ns, "text");
    label.setAttribute("x", String(x + 18));
    label.setAttribute("y", String(y + 1));
    label.setAttribute("font-size", "12");
    label.setAttribute("fill", "#3d2f25");
    label.textContent = item.label;
    legendGroup.appendChild(label);
  });

  clone.appendChild(legendGroup);
  return clone;
}

function metricLabel(key) {
  const labels = {
    cpi: "Career Performance Index",
    avgWs: "Average weighted score",
    peakWs: "Peak weighted score",
    avgPtsRate: "Average points rate",
    avgTop5Rate: "Average top 5 rate",
    avgWinRate: "Average win rate",
    avgPodiumRate: "Average podium rate",
    avgFastestLapRate: "Average fastest-lap rate",
    avgPoleRate: "Average pole rate",
    titles: "Title conversion",
    participation: "Participation",
    winRate: "Win rate",
    podiumRate: "Podium rate",
    fastestLapRate: "Fastest-lap rate",
    poleRate: "Pole rate",
    weightedScore: "Weighted score",
    pointsRate: "Points rate",
    top5Rate: "Top 5 rate",
  };

  return labels[key] || key;
}

function colorForDriver(driver) {
  const clean = normalizeInlineText(driver);
  if (state.driverColors[clean]) {
    return state.driverColors[clean];
  }
  return defaultColorForDriver(clean);
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
  if (value == null) {
    return "n/a";
  }
  if (["avgPtsRate", "avgTop5Rate", "avgWinRate", "avgPodiumRate", "avgFastestLapRate", "avgPoleRate", "participation", "winRate", "podiumRate", "fastestLapRate", "poleRate", "pointsRate", "top5Rate"].includes(key)) {
    return formatPercent(value);
  }
  if (["avgWs", "peakWs", "weightedScore", "cpi"].includes(key)) {
    return formatDecimal(value);
  }
  if (key === "titles") {
    return formatDecimal(value, 2);
  }
  return String(value);
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}-${Date.now().toString(36)}`;
}

function slugify(value) {
  return String(value || "dataset")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizePresetText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function truncateLabel(value, maxLength = 16) {
  const clean = normalizeInlineText(value);
  if (clean.length <= maxLength) {
    return clean;
  }
  return `${clean.slice(0, Math.max(1, maxLength - 3)).trim()}...`;
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

function downloadTextFile(name, contents, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function hexToAlpha(hex, alpha) {
  const clean = hex.replace("#", "");
  if (clean.length !== 6) {
    return hex;
  }
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
