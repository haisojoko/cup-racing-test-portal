// Provide globals that data.js expects from app.js at runtime.

globalThis.state = {
  filters: {
    preset: "balanced",
    season: "all",
    era: "all",
    division: "all",
    team: "all",
    car: "all",
  },
};

globalThis.PRESETS = {
  balanced: {
    label: "Balanced",
    careerWeights: { cpi: 0.45, avgWs: 0.2, peakWs: 0.15, avgPtsRate: 0.1, avgTop5Rate: 0.1 },
    seasonWeights: { weightedScore: 0.55, pointsRate: 0.15, top5Rate: 0.15, winRate: 0.1, titles: 0.05 },
  },
};

globalThis.CAREER_PRESET_METRICS = [
  "cpi", "avgWs", "peakWs", "avgPtsRate", "avgTop5Rate",
  "avgWinRate", "avgPodiumRate", "avgFastestLapRate", "avgPoleRate",
  "titles", "participation",
];

globalThis.SEASON_PRESET_METRICS = [
  "weightedScore", "pointsRate", "top5Rate", "winRate", "podiumRate",
  "fastestLapRate", "poleRate", "titles", "participation",
];

globalThis.createId = (prefix) =>
  `${prefix}-test-${Math.random().toString(36).slice(2, 9)}`;

globalThis.getActivePreset = () => globalThis.PRESETS.balanced;

globalThis.metricLabel = (key) => key;
