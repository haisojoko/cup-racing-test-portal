"use strict";

// The parser turns one Markdown archive into every data structure the UI consumes.
function parseDataset(name, rawMarkdown, source) {
  const normalized = normalizeMarkdown(rawMarkdown);
  const lines = normalized.split("\n");
  const dataset = {
    id: createId("dataset"),
    name,
    title: parseDocumentTitle(lines) || name,
    source,
    importedAt: new Date().toISOString(),
    rawMarkdown: rawMarkdown,
    scoringFormula: extractParagraphAfterHeading(lines, /^##\s+Weighted Score Formula\s*$/i),
    seasonCatalog: [],
    seasonDetails: [],
    seasonStandings: [],
    weightedRecords: [],
    careerRecords: [],
    validations: [],
    championshipWinners: [],
    stats: {
      seasonCount: 0,
      completedSeasonCount: 0,
      upcomingSeasonCount: 0,
      driverCount: 0,
      weightedRecordCount: 0,
    },
    filterOptions: {
      seasons: [],
      detailSeasons: [],
      eras: [],
      divisions: [],
      teams: [],
      cars: [],
      drivers: [],
    },
  };

  if (/Ã¢â‚¬â€|Ã¢â‚¬â€œ|Ã¢â‚¬â„¢|Ã¢â‚¬Å“|Ã¢â‚¬/.test(rawMarkdown)) {
    dataset.validations.push({
      level: "warning",
      title: "Encoding artifacts normalized",
      detail: "The upload contained mojibake characters. The importer cleaned the common cases during parsing.",
    });
  }

  const registryRows = extractTableRowsAfterHeading(lines, /^##\s+Season Registry\s*$/i);
  if (!registryRows.length) {
    throw new Error("Missing a parsable `## Season Registry` table.");
  }

  // Season Registry is the canonical season index and supplies the broad metadata/future flags.
  dataset.seasonCatalog = registryRows.map((row) => {
    const seasonId = normalizeSeasonId(row.Season);
    const wdcWinners = parseWinnerList(row.WDC);
    const wccTeam = normalizeInlineText(row.WCC);
    const isUpcoming = /tbd/i.test(row.WDC || "") || /tbd/i.test(row.WCC || "");
    return {
      seasonId,
      seasonLabel: seasonId,
      seasonOrder: getSeasonOrder(seasonId),
      eraLabel: buildEraLabel(seasonId),
      type: normalizeInlineText(row.Type),
      car: normalizeInlineText(row.Car),
      venues: splitCsvLike(row.Venues),
      racesPerVenue: parseNumberish(row["Races/Venue"]),
      wdcWinners,
      wccTeam,
      wccMembers: parseTeamMembers(wccTeam),
      isUpcoming,
      isMultiClass: wdcWinners.length > 1 || /multi-class/i.test(row.Car || ""),
    };
  });

  dataset.championshipWinners = extractBulletsAfterHeading(lines, /^##\s+Championship Winners\s*$/i).map(
    (line) => {
      const match = line.match(/^\*\*(.+?)\*\*:\s*(.+)$/);
      return {
        driver: match ? normalizeInlineText(match[1]) : normalizeInlineText(line),
        detail: match ? normalizeInlineText(match[2]) : normalizeInlineText(line),
      };
    },
  );

  const seasonBlocks = extractSeasonBlocks(lines);
  const seasonDetailMap = new Map();

  // Detailed season blocks enrich the registry with standings, venue rows, and class inference.
  seasonBlocks.forEach((block) => {
    const registryEntry =
      dataset.seasonCatalog.find((season) => season.seasonId === block.seasonId) || {};
    const meta = parseSeasonMetaBlock(block.lines);
    const teamRows = extractTableRowsAfterHeading(block.lines, /^### Team Standings \(WCC\)$/);
    const parsedTeamStandings = teamRows.map((row) => ({
      teamName: normalizeInlineText(row.Team),
      points: parseNumberish(row.Points),
      rawPoints: normalizeInlineText(row.Points),
      members: parseTeamMembers(row.Team),
    }));
    const teamAssignments = buildTeamAssignments(parsedTeamStandings);
    const venueBlocks = extractVenueBlocks(block.lines, meta);
    const driverContext = buildSeasonDriverContext(venueBlocks, teamAssignments);
    const standingsRows = extractTableRowsAfterHeading(block.lines, /^### Season Standings$/);

    const parsedStandings = standingsRows.map((row) => {
      const driverInfo = parseDriverCell(row.Driver);
      const driverMeta = driverContext[driverInfo.name] || {};
      return {
        seasonId: block.seasonId,
        seasonLabel: block.seasonId,
        seasonOrder: getSeasonOrder(block.seasonId),
        eraLabel: buildEraLabel(block.seasonId),
        rankLabel: normalizeInlineText(row.Pos),
        driver: driverInfo.name,
        points: parseNumberish(row.Points),
        wins: parseNumberish(row.Wins),
        podiums: parseNumberish(row.Podiums),
        poles: parseNumberish(row.Poles),
        fastestLaps: parseNumberish(row.FLs),
        races: parseNumberish(row.Races),
        participationRate: parsePercent(row["Part."]),
        pointsRate: parsePercent(row["Pts Rate"]),
        top5Rate: parsePercent(row["Top 5 Rate"]),
        wdc: driverInfo.wdc,
        wcc: driverInfo.wcc,
        teamName: driverMeta.teamName || teamAssignments[driverInfo.name] || "",
        className:
          driverMeta.className ||
          inferClassFromWinnerLabels(driverInfo.name, meta.wdcWinners) ||
          "",
        primaryCar: driverMeta.primaryCar || "",
        type: meta.type,
        car: meta.car,
        venues: meta.venues,
        racesPerVenue: meta.racesPerVenue,
        wdcWinners: meta.wdcWinners,
        wccTeam: meta.wccTeam,
        isMultiClass: meta.isMultiClass,
      };
    });

    const seasonDetail = {
      seasonId: block.seasonId,
      seasonOrder: getSeasonOrder(block.seasonId),
      seasonLabel: block.seasonId,
      eraLabel: buildEraLabel(block.seasonId),
      ...registryEntry,
      ...meta,
      isUpcoming: Boolean(registryEntry.isUpcoming),
      venueNames: meta.venues,
      scoringSystem: extractParagraphAfterHeading(block.lines, /^###\s+Scoring System\s*$/i),
      standings: parsedStandings,
      teamStandings: parsedTeamStandings,
      venues: venueBlocks,
      driverContext,
      classSummary: buildSeasonClassSummary(parsedStandings, meta, venueBlocks),
      teamAssignments,
    };

    dataset.seasonDetails.push(seasonDetail);
    seasonDetailMap.set(block.seasonId, seasonDetail);

    dataset.seasonStandings.push(...parsedStandings);
  });

  const careerRows = extractTableRowsAfterHeading(lines, /^##\s+Full Career Statistics\s*$/i);
  const cpiRows = extractTableRowsAfterHeading(lines, /^##\s+CPI Rankings\s*$/i);
  const weightedRows = extractTableRowsAfterHeading(lines, /^##\s+All-Time Weighted Score Rankings\s*$/i);
  const bestSeasonRows = parseBestSeasonBullets(
    extractBulletsAfterHeading(lines, /^##\s+Best Season by Driver\s*$/i),
  );

  if (!weightedRows.length) {
    throw new Error("Missing a parsable `## All-Time Weighted Score Rankings` table.");
  }

  const registryMap = createLookup(dataset.seasonCatalog, "seasonId");
  const standingMap = {};
  dataset.seasonStandings.forEach((entry) => {
    standingMap[makeSeasonDriverKey(entry.seasonId, entry.driver)] = entry;
  });

  // Weighted-score rows are the primary scoring slices used by the ranking views and arc charts.
  dataset.weightedRecords = weightedRows.map((row) => {
    const seasonId = normalizeSeasonId(row.Season);
    const standing = standingMap[makeSeasonDriverKey(seasonId, row.Driver)] || {};
    const seasonMeta = registryMap[seasonId] || seasonDetailMap.get(seasonId) || {};
    const titlesScore =
      (/yes/i.test(row.WDC || "") ? 1 : 0) + (/yes/i.test(row.WCC || "") ? 0.55 : 0);

    return {
      rank: parseNumberish(row.Rank),
      driver: normalizeInlineText(row.Driver),
      seasonId,
      seasonOrder: getSeasonOrder(seasonId),
      seasonLabel: seasonId,
      eraLabel: seasonMeta.eraLabel || buildEraLabel(seasonId),
      type: standing.type || seasonMeta.type || "",
      car: standing.car || seasonMeta.car || "",
      teamName: standing.teamName || inferTeamFromRegistry(seasonMeta, row.Driver),
      weightedScore: parseDecimal(row["W.Score"]),
      winRate: parsePercent(row["Win%"]),
      podiumRate: parsePercent(row["Pod%"]),
      top5Rate: parsePercent(row["Top5%"]),
      pointsPerRace: parseDecimal(row["Pts/Race"]),
      fastestLapRate: parsePercent(row["FL%"]),
      poleRate: parsePercent(row["Pole%"]),
      pointsRate: parsePercent(row.PtsRate),
      participationRate: parsePercent(row["Part."]),
      wdc: /yes/i.test(row.WDC || "") || Boolean(standing.wdc),
      wcc: /yes/i.test(row.WCC || "") || Boolean(standing.wcc),
      titlesScore,
      points: standing.points ?? null,
      wins: standing.wins ?? null,
      podiums: standing.podiums ?? null,
      poles: standing.poles ?? null,
      fastestLaps: standing.fastestLaps ?? null,
      races: standing.races ?? null,
      isUpcoming: Boolean(seasonMeta.isUpcoming),
      isMultiClass: Boolean(seasonMeta.isMultiClass),
    };
  });

  const weightedByDriver = groupBy(dataset.weightedRecords, "driver");
  const cpiLookup = {};
  cpiRows.forEach((row) => {
    cpiLookup[normalizeInlineText(row.Driver)] = {
      cpi: parseDecimal(row.CPI),
      avgWs: parseDecimal(row["Avg WS"]),
      peakWs: parseDecimal(row["Peak WS"]),
      avgPtsRate: parsePercent(row["Avg Pts Rate"]),
      avgTop5Rate: parsePercent(row["Avg Top5 Rate"]),
      wdcs: parseNumberish(row.WDCs),
      wccs: parseNumberish(row.WCCs),
    };
  });

  const careerLookup = {};
  careerRows.forEach((row) => {
    careerLookup[normalizeInlineText(row.Driver)] = {
      driver: normalizeInlineText(row.Driver),
      wdc: parseNumberish(row.WDC),
      wcc: parseNumberish(row.WCC),
      wins: parseNumberish(row.Wins),
      podiums: parseNumberish(row.Podiums),
      poles: parseNumberish(row.Poles),
      fastestLaps: parseNumberish(row.FLs),
      points: parseNumberish(row.Points),
      races: parseNumberish(row.Races),
      winRate: parsePercent(row["Win%"]),
      podiumRate: parsePercent(row["Pod%"]),
      pointsPerRace: parseDecimal(row["Pts/Race"]),
      fastestLapRate: parsePercent(row["FL%"]),
      poleRate: deriveRate(parseNumberish(row.Poles), parseNumberish(row.Races)),
      top5: parseNumberish(row.Top5),
      top5Rate: parsePercent(row["Top5%"]),
    };
  });

  const allDriverNames = uniqueList([
    ...Object.keys(careerLookup),
    ...Object.keys(cpiLookup),
    ...dataset.weightedRecords.map((record) => record.driver),
  ]);

  // Career records are merged from career totals, CPI rows, and derived season-level fallbacks.
  dataset.careerRecords = allDriverNames
    .map((driver) => {
      const career = careerLookup[driver] || {};
      const cpi = cpiLookup[driver] || {};
      const seasons = sortBySeason(weightedByDriver[driver] || []);
      const peakSeason = seasons.length
        ? [...seasons].sort((left, right) => (right.weightedScore || 0) - (left.weightedScore || 0))[0]
        : null;
      const derivedRaces = seasons.reduce((total, record) => total + (record.races || 0), 0);
      const derivedWins = seasons.reduce((total, record) => total + (record.wins || 0), 0);
      const derivedPodiums = seasons.reduce((total, record) => total + (record.podiums || 0), 0);
      const derivedPoints = seasons.reduce((total, record) => total + (record.points || 0), 0);
      const derivedPoles = seasons.reduce((total, record) => total + (record.poles || 0), 0);
      const derivedFastestLaps = seasons.reduce(
        (total, record) => total + (record.fastestLaps || 0),
        0,
      );
      const derivedTop5 = seasons.reduce((total, record) => {
        if (record.races == null || record.top5Rate == null) {
          return total;
        }
        return total + Math.round((record.races * record.top5Rate) / 100);
      }, 0);
      const bestSeason = peakSeason || bestSeasonRows[driver] || { seasonId: "", score: null };
      const bestSeasonScore = peakSeason
        ? peakSeason.weightedScore ?? null
        : bestSeason.score ?? null;

      return {
        driver,
        wdc: career.wdc ?? cpi.wdcs ?? seasons.filter((entry) => entry.wdc).length,
        wcc: career.wcc ?? cpi.wccs ?? seasons.filter((entry) => entry.wcc).length,
        wins: career.wins ?? derivedWins,
        podiums: career.podiums ?? derivedPodiums,
        poles: career.poles ?? derivedPoles,
        fastestLaps: career.fastestLaps ?? derivedFastestLaps,
        points: career.points ?? derivedPoints,
        races: career.races ?? derivedRaces,
        winRate:
          career.winRate ??
          deriveRate(career.wins ?? derivedWins, career.races ?? derivedRaces),
        podiumRate:
          career.podiumRate ??
          deriveRate(career.podiums ?? derivedPodiums, career.races ?? derivedRaces),
        pointsPerRace:
          career.pointsPerRace ??
          deriveAverage(career.points ?? derivedPoints, career.races ?? derivedRaces),
        fastestLapRate:
          career.fastestLapRate ??
          deriveRate(career.fastestLaps ?? derivedFastestLaps, career.races ?? derivedRaces),
        poleRate:
          career.poleRate ??
          deriveRate(career.poles ?? derivedPoles, career.races ?? derivedRaces),
        top5: career.top5 ?? derivedTop5,
        top5Rate:
          career.top5Rate ??
          deriveRate(career.top5 ?? derivedTop5, career.races ?? derivedRaces),
        cpi: cpi.cpi ?? null,
        avgWs: cpi.avgWs ?? averageOf(seasons, "weightedScore"),
        peakWs: cpi.peakWs ?? bestSeasonScore,
        avgPtsRate: cpi.avgPtsRate ?? averageOf(seasons, "pointsRate"),
        avgTop5Rate: cpi.avgTop5Rate ?? averageOf(seasons, "top5Rate"),
        bestSeasonId: bestSeason.seasonId || "",
        bestSeasonScore,
        seasonCount: seasons.length,
        seasons,
        hasCareerGap: !careerLookup[driver],
      };
    })
    .sort((left, right) => {
      const cpiGap = (right.cpi || 0) - (left.cpi || 0);
      if (cpiGap !== 0) {
        return cpiGap;
      }
      return (right.avgWs || 0) - (left.avgWs || 0);
    });

  const cpiOnlyDrivers = allDriverNames.filter((driver) => !careerLookup[driver] && cpiLookup[driver]);
  if (cpiOnlyDrivers.length) {
    dataset.validations.push({
      level: "warning",
      title: "Career statistics table is missing some drivers",
      detail: `${cpiOnlyDrivers.join(", ")} appear in CPI or weighted-score sections but not in Full Career Statistics. The app derives partial career cards for them.`,
    });
  }

  const upcomingSeasons = dataset.seasonCatalog.filter((season) => season.isUpcoming);
  if (upcomingSeasons.length) {
    dataset.validations.push({
      level: "info",
      title: "Upcoming seasons detected",
      detail: `${upcomingSeasons.map((season) => season.seasonId).join(", ")} are marked as upcoming or incomplete and are excluded from completed-history leaderboards.`,
    });
  }

  const detailedSeasonIds = new Set(seasonBlocks.map((block) => block.seasonId));
  const undetailedCompletedSeasons = dataset.seasonCatalog.filter(
    (season) => !season.isUpcoming && !detailedSeasonIds.has(season.seasonId),
  );
  if (undetailedCompletedSeasons.length) {
    dataset.validations.push({
      level: "warning",
      title: "Some completed seasons have no detailed result block",
      detail: `${undetailedCompletedSeasons.map((season) => season.seasonId).join(", ")} exist in the season registry but do not have a matching Season Results section.`,
    });
  }

  const multiClassSeasons = dataset.seasonCatalog.filter((season) => season.isMultiClass);
  if (multiClassSeasons.length) {
    dataset.validations.push({
      level: "info",
      title: "Multi-class seasons preserved",
      detail: `${multiClassSeasons.map((season) => season.seasonId).join(", ")} contain multiple WDC winners. The importer keeps all class champions without collapsing them.`,
    });
  }

  const placeholderMatches = normalized.match(/\b(TBD|Maybe)\b/g) || [];
  if (placeholderMatches.length) {
    dataset.validations.push({
      level: "info",
      title: "Placeholder values ignored in drill-down tables",
      detail: `${placeholderMatches.length} placeholder cells such as TBD or Maybe were found in the detailed result sections. They do not affect the historical leaderboards.`,
    });
  }

  if (/upgrade/i.test(normalized)) {
    dataset.validations.push({
      level: "info",
      title: "Upgrade annotations ignored",
      detail: "Team-standing notes about upgrades were treated as comments and excluded from numeric parsing.",
    });
  }

  dataset.stats = {
    seasonCount: dataset.seasonCatalog.length,
    completedSeasonCount: dataset.seasonCatalog.filter((season) => !season.isUpcoming).length,
    upcomingSeasonCount: upcomingSeasons.length,
    driverCount: dataset.careerRecords.length,
    weightedRecordCount: dataset.weightedRecords.length,
  };

  dataset.filterOptions = buildFilterOptions(dataset);
  return dataset;
}

// Basic title extraction keeps the imported page name human-friendly in the UI.
function parseDocumentTitle(lines) {
  const titleLine = lines.find((line) => /^#\s+/.test(line.trim()));
  return titleLine ? normalizeInlineText(titleLine.replace(/^#\s+/, "")) : "";
}

// Filters are built once per dataset so all selects can be repopulated from parsed data.
function buildFilterOptions(dataset) {
  return {
    seasons: sortBySeason(dataset.seasonCatalog).map((season) => ({
      value: season.seasonId,
      label: season.isUpcoming ? `${season.seasonId} (upcoming)` : season.seasonId,
    })),
    detailSeasons: sortBySeason(dataset.seasonDetails)
      .filter((season) => !season.isUpcoming)
      .map((season) => ({
        value: season.seasonId,
        label: season.seasonId,
      })),
    eras: uniqueList(dataset.seasonCatalog.map((season) => season.eraLabel))
      .filter(Boolean)
      .map((value) => ({ value, label: value })),
    divisions: uniqueList(dataset.seasonCatalog.map((season) => season.type))
      .filter(Boolean)
      .map((value) => ({ value, label: value })),
    teams: uniqueList(dataset.weightedRecords.map((record) => record.teamName))
      .filter((value) => value && !/tbd/i.test(value))
      .map((value) => ({ value, label: value })),
    cars: uniqueList(dataset.seasonCatalog.map((season) => season.car))
      .filter(Boolean)
      .map((value) => ({ value, label: value })),
    drivers: dataset.careerRecords.map((record) => ({
      value: record.driver,
      label: record.driver,
    })),
  };
}

// Split the giant archive into season-sized blocks starting at each "Season X Results" heading.
function extractSeasonBlocks(lines) {
  const blocks = [];
  const starts = [];

  lines.forEach((line, index) => {
    const match = line.trim().match(/^##\s+Season\s+(.+?)\s+Results\s*$/i);
    if (match) {
      starts.push({
        index,
        seasonId: normalizeSeasonId(match[1]),
      });
    }
  });

  starts.forEach((entry, index) => {
    const nextStart = starts[index + 1] ? starts[index + 1].index : lines.length;
    blocks.push({
      seasonId: entry.seasonId,
      lines: lines.slice(entry.index, nextStart),
    });
  });

  return blocks;
}

// Parse the metadata lines at the top of a detailed season block.
function parseSeasonMetaBlock(blockLines) {
  const meta = {
    type: "",
    car: "",
    venues: [],
    racesPerVenue: null,
    wdcWinners: [],
    wccTeam: "",
    isMultiClass: false,
  };

  blockLines.forEach((line) => {
    const match = line.match(/^\*\*(.+?):\*\*\s*(.+)$/);
    if (!match) {
      return;
    }

    const key = match[1].trim().toLowerCase();
    const value = normalizeInlineText(match[2]);
    if (key === "type") {
      meta.type = value.replace(/\s+season$/i, "");
    }
    if (key === "car") {
      meta.car = value;
    }
    if (key === "venues") {
      meta.venues = splitCsvLike(value);
    }
    if (key === "races per venue") {
      meta.racesPerVenue = parseNumberish(value);
    }
    if (key === "wdc") {
      meta.wdcWinners = parseWinnerList(value);
    }
    if (key === "wcc") {
      meta.wccTeam = value;
    }
  });

  meta.isMultiClass =
    meta.wdcWinners.length > 1 ||
    /multi-class/i.test(meta.car) ||
    /gt3|street/i.test(meta.wdcWinners.map((winner) => winner.label).join(" "));

  return meta;
}

// Expand WCC table rows into driver -> team lookup entries used across several views.
function buildTeamAssignments(teamRows) {
  const assignments = {};
  teamRows.forEach((row) => {
    const teamName = normalizeInlineText(row.teamName || row.Team);
    parseTeamMembers(teamName).forEach((driver) => {
      assignments[driver] = teamName;
    });
  });
  return assignments;
}

// Venue sections become the source of truth for progression charts and class/car inference.
function extractVenueBlocks(blockLines, seasonMeta) {
  const starts = [];
  blockLines.forEach((line, index) => {
    const match = line.trim().match(/^#### Venue\s+(\d+):\s*(.+)$/);
    if (match) {
      starts.push({
        index,
        venueNumber: parseNumberish(match[1]),
        venueName: normalizeInlineText(match[2]),
      });
    }
  });

  return starts.map((entry, index) => {
    const nextStart = starts[index + 1] ? starts[index + 1].index : blockLines.length;
    const slice = blockLines.slice(entry.index, nextStart);
    const rawRows = extractFirstTableRows(slice);
    const rows = parseVenueRows(rawRows, seasonMeta);
    const raceColumns = extractRaceColumns(rawRows[0] || {});
    return {
      venueNumber: entry.venueNumber,
      venueName: entry.venueName,
      raceColumns,
      rows,
      classes: uniqueList(rows.map((row) => row.className)).filter(Boolean),
    };
  });
}

// Pull the first markdown table from a section slice and convert it to row objects.
function extractFirstTableRows(lines) {
  let tableStart = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim().startsWith("|")) {
      tableStart = index;
      break;
    }
  }
  if (tableStart < 0) {
    return [];
  }

  const tableLines = [];
  for (let index = tableStart; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith("|")) {
      break;
    }
    tableLines.push(trimmed);
  }
  return parseMarkdownTable(tableLines);
}

// Venue rows preserve per-race results as well as the day-total checkpoint used in progression.
function parseVenueRows(rows, seasonMeta) {
  const raceColumns = extractRaceColumns(rows[0] || {});
  return rows.map((row) => {
    const driver = normalizeInlineText(row.Driver);
    const carModel = normalizeInlineText(row.Car || "");
    return {
      driver,
      carModel,
      className: inferClassFromCar(carModel, seasonMeta),
      dayTotal: parseNumberish(row["Day Total"]),
      raw: row,
      races: raceColumns.map((column) => ({
        number: column.number,
        position: normalizeInlineText(row[column.posKey] || ""),
        points: parseNumberish(row[column.ptsKey]),
        rawPoints: normalizeInlineText(row[column.ptsKey] || ""),
      })),
    };
  });
}

// Detect repeating "R1 Pos / R1 Pts" style column pairs so venue tables can be generalized.
function extractRaceColumns(row) {
  return Object.keys(row)
    .map((key) => {
      const match = key.match(/^R(\d+)\s+Pos$/);
      if (!match) {
        return null;
      }
      return {
        number: Number(match[1]),
        posKey: key,
        ptsKey: `R${match[1]} Pts`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.number - right.number);
}

// Build a driver profile per season from venue rows so standings can show inferred class/car/team.
function buildSeasonDriverContext(venues, teamAssignments) {
  const byDriver = {};

  venues.forEach((venue) => {
    venue.rows.forEach((row) => {
      if (!row.driver) {
        return;
      }

      if (!byDriver[row.driver]) {
        byDriver[row.driver] = {
          carCounts: {},
          classCounts: {},
          teamName: teamAssignments[row.driver] || "",
        };
      }

      if (row.carModel && !isPlaceholderValue(row.carModel)) {
        byDriver[row.driver].carCounts[row.carModel] =
          (byDriver[row.driver].carCounts[row.carModel] || 0) + 1;
      }

      if (row.className) {
        byDriver[row.driver].classCounts[row.className] =
          (byDriver[row.driver].classCounts[row.className] || 0) + 1;
      }
    });
  });

  return Object.entries(byDriver).reduce((accumulator, [driver, entry]) => {
    accumulator[driver] = {
      teamName: entry.teamName,
      primaryCar: mostCommonKey(entry.carCounts),
      className: mostCommonKey(entry.classCounts),
      carChoices: Object.keys(entry.carCounts),
      classChoices: Object.keys(entry.classCounts),
    };
    return accumulator;
  }, {});
}

// Multi-class seasons surface one summary card per inferred class and champion.
function buildSeasonClassSummary(standings, seasonMeta, venues) {
  const inferredClasses = uniqueList([
    ...standings.map((row) => row.className),
    ...venues.flatMap((venue) => venue.classes || []),
    ...seasonMeta.wdcWinners.map((winner) => normalizeInlineText(winner.label)),
  ]).filter(Boolean);

  if (!seasonMeta.isMultiClass && inferredClasses.length <= 1) {
    return [];
  }

  return inferredClasses.map((className) => {
    const rows = standings
      .filter((row) => row.className === className)
      .sort((left, right) => (right.points || 0) - (left.points || 0));
    const cars = uniqueList(
      venues.flatMap((venue) =>
        venue.rows
          .filter((row) => row.className === className)
          .map((row) => row.carModel),
      ),
    ).filter(Boolean);
    const labeledWinner = seasonMeta.wdcWinners.find(
      (winner) => normalizeInlineText(winner.label).toLowerCase() === className.toLowerCase(),
    );
    const champion =
      (labeledWinner && rows.find((row) => row.driver === labeledWinner.name)) || rows[0] || null;
    return {
      className,
      champion: champion ? champion.driver : labeledWinner ? labeledWinner.name : "",
      championPoints: champion ? champion.points : null,
      driverCount: rows.length,
      cars,
    };
  });
}

// When standings do not declare a class, winner labels can still identify the driver's category.
function inferClassFromWinnerLabels(driver, winners) {
  const winner = (winners || []).find(
    (entry) => normalizeInlineText(entry.name).toLowerCase() === normalizeInlineText(driver).toLowerCase(),
  );
  return winner ? normalizeInlineText(winner.label) : "";
}

// Car-name heuristics are used to recover class information from semi-structured archive text.
function inferClassFromCar(carModel, seasonMeta) {
  const clean = normalizeInlineText(carModel);
  if (!clean || isPlaceholderValue(clean)) {
    return "";
  }

  const normalized = clean.toLowerCase();
  const patterns = [
    [/street/i, "Street"],
    [/gt3/i, "GT3"],
    [/hyper/i, "Hypercar"],
    [/tcr/i, "TCR"],
    [/gt4/i, "GT4"],
    [/formula|f1|super formula|tatuus/i, "Formula"],
  ];

  for (const [pattern, label] of patterns) {
    if (pattern.test(normalized)) {
      return label;
    }
  }

  if (!seasonMeta.isMultiClass) {
    return seasonMeta.type || "";
  }

  return "";
}

// Ignore human-note placeholders that should not affect rankings or UI summaries.
function isPlaceholderValue(value) {
  return /^(tbd|maybe)$/i.test(normalizeInlineText(value));
}

// The importer occasionally needs the most frequently seen inferred value for a driver.
function mostCommonKey(counts) {
  return Object.entries(counts || {}).sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

// Some archives express best seasons as bullet lines instead of tables.
function parseBestSeasonBullets(bullets) {
  return bullets.reduce((accumulator, line) => {
    const match = line.match(/^\*\*(.+?)\*\*:\s*Best\s*=\s*(S[^\s]+)\s*\(([\d.]+)\)/i);
    if (match) {
      accumulator[normalizeInlineText(match[1])] = {
        seasonId: normalizeSeasonId(match[2]),
        score: parseDecimal(match[3]),
      };
    }
    return accumulator;
  }, {});
}

// Heading-targeted extractors let the parser stay resilient without requiring exact line numbers.
function extractTableRowsAfterHeading(lines, headingRegex) {
  const headingIndex = findLineIndex(lines, headingRegex);
  if (headingIndex < 0) {
    return [];
  }

  let tableStart = -1;
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("|")) {
      tableStart = index;
      break;
    }
    if (/^#{1,6}\s/.test(trimmed) && tableStart < 0) {
      return [];
    }
  }

  if (tableStart < 0) {
    return [];
  }

  const tableLines = [];
  for (let index = tableStart; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith("|")) {
      break;
    }
    tableLines.push(trimmed);
  }

  return parseMarkdownTable(tableLines);
}

function extractBulletsAfterHeading(lines, headingRegex) {
  const headingIndex = findLineIndex(lines, headingRegex);
  if (headingIndex < 0) {
    return [];
  }

  const bullets = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      break;
    }
    if (/^- /.test(trimmed)) {
      bullets.push(trimmed.replace(/^- /, "").trim());
    }
  }

  return bullets;
}

function extractParagraphAfterHeading(lines, headingRegex) {
  const headingIndex = findLineIndex(lines, headingRegex);
  if (headingIndex < 0) {
    return "";
  }

  const paragraph = [];
  for (let index = headingIndex + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (/^#{1,6}\s/.test(trimmed)) {
      break;
    }
    if (!trimmed) {
      if (paragraph.length) {
        break;
      }
      continue;
    }
    if (trimmed.startsWith("|")) {
      break;
    }
    paragraph.push(trimmed);
  }

  return paragraph.join(" ");
}

// Markdown table parsing utilities are intentionally lightweight so the app stays dependency-free.
function parseMarkdownTable(lines) {
  if (lines.length < 2) {
    return [];
  }

  const rows = lines.map(splitMarkdownRow).filter((cells) => cells.some(Boolean));
  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0];
  const dataRows = rows.slice(1).filter((cells) => !cells.every(isSeparatorCell));
  return dataRows.map((cells) => {
    const row = {};
    headers.forEach((header, index) => {
      row[header] = cells[index] != null ? cells[index] : "";
    });
    return row;
  });
}

function splitMarkdownRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isSeparatorCell(cell) {
  return /^:?-{3,}:?$/.test(cell);
}

function findLineIndex(lines, matcher) {
  return lines.findIndex((line) => matcher.test(line.trim()));
}

// Normalize common mojibake cases before parsing so real-world uploads remain usable.
function normalizeMarkdown(raw) {
  let value = raw.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const replacements = [
    ["Ã¢â‚¬â€", "—"],
    ["Ã¢â‚¬â€œ", "–"],
    ["Ã¢â‚¬â„¢", "'"],
    ["Ã¢â‚¬Å“", '"'],
    ["Ã¢â‚¬Â", '"'],
    ["Ã¢â‚¬Ëœ", "'"],
    ["Ã‚", ""],
  ];
  replacements.forEach(([search, replacement]) => {
    value = value.split(search).join(replacement);
  });
  return value;
}

// Text/value helpers clean up mixed-format archive text and convert it into sortable numeric data.
function normalizeInlineText(value) {
  return String(value || "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitCsvLike(value) {
  return normalizeInlineText(value)
    .split(/\s*,\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseWinnerList(value) {
  const clean = normalizeInlineText(value);
  if (!clean || /tbd/i.test(clean)) {
    return [];
  }

  return clean
    .split(/\s*,\s*/)
    .map((entry) => {
      const match = entry.match(/^(.*?)\s*\((.*?)\)\s*$/);
      return {
        name: normalizeInlineText(match ? match[1] : entry),
        label: normalizeInlineText(match ? match[2] : ""),
      };
    })
    .filter((entry) => entry.name);
}

function parseTeamMembers(teamName) {
  const clean = normalizeInlineText(teamName);
  if (!clean || /tbd/i.test(clean)) {
    return [];
  }
  return clean
    .split(/\s+\+\s+/)
    .map((entry) => normalizeInlineText(entry))
    .filter(Boolean);
}

function parseDriverCell(value) {
  const clean = normalizeInlineText(value);
  return {
    name: clean
      .replace(/\bWDC\b/gi, "")
      .replace(/\(\s*WCC\s*\)/gi, "")
      .replace(/\(\s*WDC\s*\)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim(),
    wdc: /\bWDC\b/i.test(clean),
    wcc: /\bWCC\b/i.test(clean),
  };
}

function parseNumberish(value) {
  if (value == null) {
    return null;
  }

  const match = String(value).replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseDecimal(value) {
  const parsed = parseNumberish(value);
  return parsed == null ? null : Number(parsed.toFixed(4));
}

function parsePercent(value) {
  if (value == null) {
    return null;
  }
  const parsed = parseNumberish(value);
  return parsed == null ? null : Number(parsed.toFixed(1));
}

// Season IDs are treated as text first so variants like S18a / S18b remain stable.
function normalizeSeasonId(value) {
  const clean = normalizeInlineText(value).replace(/^Season\s+/i, "");
  if (!clean) {
    return "";
  }
  return clean.startsWith("S") ? clean : `S${clean}`;
}

// Sort seasons chronologically while still supporting split-season suffixes like "a" and "b".
function getSeasonOrder(seasonId) {
  const match = normalizeSeasonId(seasonId).match(/^S(\d+)([a-zA-Z]?)$/);
  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }
  const base = Number(match[1]) * 10;
  const suffix = (match[2] || "").toLowerCase();
  if (!suffix) {
    return base;
  }
  return base + suffix.charCodeAt(0) - 96;
}

// Era labels are lightweight buckets derived from season order for top-level filtering.
function buildEraLabel(seasonId) {
  const match = normalizeSeasonId(seasonId).match(/^S(\d+)/i);
  const value = match ? Number(match[1]) : 0;
  if (value <= 5) {
    return "S1-S5";
  }
  if (value <= 10) {
    return "S6-S10";
  }
  if (value <= 15) {
    return "S11-S15";
  }
  if (value <= 20) {
    return "S16-S20";
  }
  return "S21+";
}

// Generic collection helpers keep the parser and ranking code terse and dependency-free.
function makeSeasonDriverKey(seasonId, driver) {
  return `${normalizeSeasonId(seasonId)}::${normalizeInlineText(driver).toLowerCase()}`;
}

function createLookup(items, key) {
  return items.reduce((accumulator, item) => {
    accumulator[item[key]] = item;
    return accumulator;
  }, {});
}

function inferTeamFromRegistry(seasonMeta, driver) {
  if (!seasonMeta || !seasonMeta.wccTeam) {
    return "";
  }
  const members = parseTeamMembers(seasonMeta.wccTeam);
  return members.includes(normalizeInlineText(driver)) ? seasonMeta.wccTeam : "";
}

function groupBy(items, key) {
  return items.reduce((accumulator, item) => {
    const bucketKey = item[key];
    if (!accumulator[bucketKey]) {
      accumulator[bucketKey] = [];
    }
    accumulator[bucketKey].push(item);
    return accumulator;
  }, {});
}

function uniqueList(items) {
  return [...new Set(items.filter(Boolean))];
}

function sortBySeason(items) {
  return [...items].sort((left, right) => getSeasonOrder(left.seasonId) - getSeasonOrder(right.seasonId));
}

function averageOf(items, key) {
  const values = items.map((item) => item[key]).filter((value) => value != null);
  if (!values.length) {
    return null;
  }
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3));
}

function deriveAverage(total, count) {
  if (!count) {
    return null;
  }
  return Number((total / count).toFixed(2));
}

function deriveRate(total, count) {
  if (!count) {
    return null;
  }
  return Number(((total / count) * 100).toFixed(1));
}

// All leaderboards and charts start from the same filtered weighted-season record slice.
function getFilteredSeasonRecords(dataset) {
  return dataset.weightedRecords.filter((record) => {
    if (record.isUpcoming) {
      return false;
    }
    if (state.filters.season !== "all" && record.seasonId !== state.filters.season) {
      return false;
    }
    if (state.filters.era !== "all" && record.eraLabel !== state.filters.era) {
      return false;
    }
    if (state.filters.division !== "all" && record.type !== state.filters.division) {
      return false;
    }
    if (state.filters.team !== "all" && record.teamName !== state.filters.team) {
      return false;
    }
    if (state.filters.car !== "all" && record.car !== state.filters.car) {
      return false;
    }
    return true;
  });
}

// Career aggregates blend raw career totals with the currently filtered season slice.
function buildCareerAggregates(dataset) {
  const filtered = getFilteredSeasonRecords(dataset);
  const filteredByDriver = groupBy(filtered, "driver");
  const aggregates = dataset.careerRecords
    .map((careerRecord) => {
      const slice = sortBySeason(filteredByDriver[careerRecord.driver] || []);
      const slicePeak = slice.length
        ? [...slice].sort((left, right) => (right.weightedScore || 0) - (left.weightedScore || 0))[0]
        : null;
      return {
        driver: careerRecord.driver,
        careerRecord,
        slice,
        seasonsCount: slice.length,
        avgWs: slice.length ? averageOf(slice, "weightedScore") : careerRecord.avgWs,
        peakWs: slicePeak ? slicePeak.weightedScore : careerRecord.peakWs,
        avgPtsRate: slice.length ? averageOf(slice, "pointsRate") : careerRecord.avgPtsRate,
        avgTop5Rate: slice.length ? averageOf(slice, "top5Rate") : careerRecord.avgTop5Rate,
        avgWinRate: slice.length ? averageOf(slice, "winRate") : careerRecord.winRate,
        avgPodiumRate: slice.length ? averageOf(slice, "podiumRate") : careerRecord.podiumRate,
        avgFastestLapRate: slice.length
          ? averageOf(slice, "fastestLapRate")
          : careerRecord.fastestLapRate,
        avgPoleRate: slice.length ? averageOf(slice, "poleRate") : careerRecord.poleRate,
        participation: slice.length
          ? averageOf(slice, "participationRate")
          : careerRecord.races
            ? 100
            : null,
        cpi: careerRecord.cpi,
        titles:
          (careerRecord.wdc || 0) * 1 +
          (careerRecord.wcc || 0) * 0.45,
        latestSeason: slice[slice.length - 1] || careerRecord.seasons[careerRecord.seasons.length - 1] || null,
        peakSeason: slicePeak || (careerRecord.bestSeasonId
          ? careerRecord.seasons.find((record) => record.seasonId === careerRecord.bestSeasonId) || null
          : null),
      };
    })
    .filter((aggregate) => aggregate.slice.length || isNoSliceFilterActive());

  return scoreCareerAggregates(aggregates, PRESETS[state.filters.preset]);
}

// Presets score normalized career metrics against the strongest driver in the current slice.
function scoreCareerAggregates(aggregates, preset) {
  const metricMax = {
    cpi: maxOf(aggregates, (item) => item.cpi),
    avgWs: maxOf(aggregates, (item) => item.avgWs),
    peakWs: maxOf(aggregates, (item) => item.peakWs),
    avgPtsRate: maxOf(aggregates, (item) => item.avgPtsRate),
    avgTop5Rate: maxOf(aggregates, (item) => item.avgTop5Rate),
    avgWinRate: maxOf(aggregates, (item) => item.avgWinRate),
    avgPodiumRate: maxOf(aggregates, (item) => item.avgPodiumRate),
    avgFastestLapRate: maxOf(aggregates, (item) => item.avgFastestLapRate),
    avgPoleRate: maxOf(aggregates, (item) => item.avgPoleRate),
    titles: maxOf(aggregates, (item) => item.titles),
    participation: maxOf(aggregates, (item) => item.participation),
  };

  return aggregates
    .map((aggregate) => {
      const normalized = {};
      Object.keys(metricMax).forEach((key) => {
        normalized[key] = normalizeAgainstMax(aggregate[key], metricMax[key]);
      });

      const contributions = Object.entries(preset.careerWeights).map(([key, weight]) => ({
        key,
        label: metricLabel(key),
        weight,
        normalized: normalized[key] || 0,
        rawValue: aggregate[key],
        value: (normalized[key] || 0) * weight,
      }));

      const composite = contributions.reduce((sum, contribution) => sum + contribution.value, 0);
      return {
        ...aggregate,
        composite,
        contributions,
      };
    })
    .sort((left, right) => right.composite - left.composite);
}

// Build per-driver-per-track aggregates across all completed seasons.
// This is the expensive function — results are cached in localStorage via app.js.
function buildTrackAggregates(dataset) {
  const accumulator = {};

  (dataset.seasonDetails || []).forEach((seasonDetail) => {
    if (seasonDetail.isUpcoming) return;
    (seasonDetail.venues || []).forEach((venue) => {
      const trackName = normalizeInlineText(venue.venueName || "");
      if (!trackName) return;
      (venue.rows || []).forEach((row) => {
        const driver = normalizeInlineText(row.driver || "");
        if (!driver) return;
        const key = driver + "|||" + trackName;
        if (!accumulator[key]) {
          accumulator[key] = {
            driver,
            track: trackName,
            starts: 0,
            wins: 0,
            podiums: 0,
            top5s: 0,
            totalPoints: 0,
            seasonIds: [],
          };
        }
        const entry = accumulator[key];
        if (!entry.seasonIds.includes(seasonDetail.seasonId)) {
          entry.seasonIds.push(seasonDetail.seasonId);
        }
        (row.races || []).forEach((race) => {
          const pos = parseNumberish(race.position);
          if (pos == null) return; // skip DNS/DNF/DSQ
          entry.starts += 1;
          if (pos === 1) entry.wins += 1;
          if (pos <= 3) entry.podiums += 1;
          if (pos <= 5) entry.top5s += 1;
          entry.totalPoints += race.points || 0;
        });
      });
    });
  });

  const aggregates = Object.values(accumulator).filter((entry) => entry.starts > 0);

  // Compute raw rates
  aggregates.forEach((entry) => {
    entry.rawWinRate = (entry.wins / entry.starts) * 100;
    entry.rawPodiumRate = (entry.podiums / entry.starts) * 100;
    entry.rawTop5Rate = (entry.top5s / entry.starts) * 100;
  });

  return applyBayesianShrinkage(aggregates);
}

// Apply empirical Bayes shrinkage (k=5) to balance raw rates against sample size,
// then compute composite track scores.
function applyBayesianShrinkage(aggregates) {
  const K = 5;

  // Compute global averages as the empirical prior
  const totalStarts = aggregates.reduce((sum, e) => sum + e.starts, 0);
  const globalWinRate = totalStarts > 0
    ? (aggregates.reduce((sum, e) => sum + e.wins, 0) / totalStarts) * 100
    : 0;
  const globalPodiumRate = totalStarts > 0
    ? (aggregates.reduce((sum, e) => sum + e.podiums, 0) / totalStarts) * 100
    : 0;
  const globalTop5Rate = totalStarts > 0
    ? (aggregates.reduce((sum, e) => sum + e.top5s, 0) / totalStarts) * 100
    : 0;

  const maxStarts = maxOf(aggregates, (e) => e.starts);

  aggregates.forEach((entry) => {
    entry.adjWinRate = (entry.starts * entry.rawWinRate + K * globalWinRate) / (entry.starts + K);
    entry.adjPodiumRate = (entry.starts * entry.rawPodiumRate + K * globalPodiumRate) / (entry.starts + K);
    entry.adjTop5Rate = (entry.starts * entry.rawTop5Rate + K * globalTop5Rate) / (entry.starts + K);

    const longevityBonus = maxStarts > 0
      ? Math.min(100, (Math.log2(entry.starts + 1) / Math.log2(maxStarts + 1)) * 100)
      : 0;

    entry.trackScore =
      entry.adjWinRate * 0.35 +
      entry.adjPodiumRate * 0.30 +
      entry.adjTop5Rate * 0.20 +
      longevityBonus * 0.15;
  });

  return aggregates;
}

// Return a single driver's top N tracks by adjusted score.
function getDriverTrackProfile(dataset, driver, trackAggregateCache, limit) {
  const allAggregates = trackAggregateCache || buildTrackAggregates(dataset);
  return allAggregates
    .filter((entry) => entry.driver === driver)
    .sort((a, b) => (b.trackScore || 0) - (a.trackScore || 0))
    .slice(0, limit != null ? limit : 15);
}

// Return top N tracks for each of the given drivers, keyed by driver name.
function getDriversTopTracks(dataset, drivers, trackAggregateCache, limit) {
  const allAggregates = trackAggregateCache || buildTrackAggregates(dataset);
  const byDriver = groupBy(allAggregates, "driver");
  const result = {};
  drivers.forEach((driver) => {
    result[driver] = (byDriver[driver] || [])
      .sort((a, b) => (b.trackScore || 0) - (a.trackScore || 0))
      .slice(0, limit != null ? limit : 3);
  });
  return result;
}

// Season ranking uses the same preset concept, but applies it at a single-season level.
function buildSeasonRanking(dataset) {
  const records = getFilteredSeasonRecords(dataset);
  const preset = PRESETS[state.filters.preset];
  const metricMax = {
    weightedScore: maxOf(records, (record) => record.weightedScore),
    pointsRate: maxOf(records, (record) => record.pointsRate),
    top5Rate: maxOf(records, (record) => record.top5Rate),
    winRate: maxOf(records, (record) => record.winRate),
    podiumRate: maxOf(records, (record) => record.podiumRate),
    fastestLapRate: maxOf(records, (record) => record.fastestLapRate),
    poleRate: maxOf(records, (record) => record.poleRate),
    titles: maxOf(records, (record) => record.titlesScore),
    participation: maxOf(records, (record) => record.participationRate),
  };

  return records
    .map((record) => {
      const contributions = Object.entries(preset.seasonWeights).map(([key, weight]) => ({
        key,
        label: metricLabel(key),
        weight,
        normalized: normalizeAgainstMax(record[key], metricMax[key]),
        rawValue: record[key],
        value: normalizeAgainstMax(record[key], metricMax[key]) * weight,
      }));

      return {
        ...record,
        composite: contributions.reduce((sum, contribution) => sum + contribution.value, 0),
        contributions,
      };
    })
    .sort((left, right) => right.composite - left.composite);
}

// Insights use a separate, local filter set so the broader stats tab can explore the archive independently.
function getInsightsSeasonRecords(dataset, insightsFilters = {}) {
  const filtered = dataset.weightedRecords
    .filter((record) => !record.isUpcoming)
    .filter((record) => {
      if (insightsFilters.era && insightsFilters.era !== "all" && record.eraLabel !== insightsFilters.era) {
        return false;
      }
      if (
        insightsFilters.division &&
        insightsFilters.division !== "all" &&
        record.type !== insightsFilters.division
      ) {
        return false;
      }
      return true;
    });

  const seasonMetricsByKey = {};
  Object.values(groupBy(filtered, "driver")).forEach((driverRecords) => {
    const ordered = sortBySeason(driverRecords);
    ordered.forEach((record, index) => {
      const previous = index ? ordered[index - 1] : null;
      const paceScore = Number(
        ((((record.fastestLapRate || 0) * 0.5) + ((record.poleRate || 0) * 0.5))).toFixed(1),
      );
      const resultsScore = Number(
        (
          ((record.winRate || 0) * 0.35) +
          ((record.podiumRate || 0) * 0.3) +
          ((record.pointsRate || 0) * 0.35)
        ).toFixed(1),
      );

      seasonMetricsByKey[makeSeasonDriverKey(record.seasonId, record.driver)] = {
        paceScore,
        resultsScore,
        paceGap: Number((paceScore - resultsScore).toFixed(1)),
        previousSeasonId: previous ? previous.seasonId : "",
        weightedScoreDeltaPrev:
          previous && previous.weightedScore != null && record.weightedScore != null
            ? Number((record.weightedScore - previous.weightedScore).toFixed(3))
            : null,
      };
    });
  });

  return filtered.map((record) => ({
    ...record,
    ...(seasonMetricsByKey[makeSeasonDriverKey(record.seasonId, record.driver)] || {
      paceScore: 0,
      resultsScore: 0,
      paceGap: 0,
      previousSeasonId: "",
      weightedScoreDeltaPrev: null,
    }),
  }));
}

// Career rollups for the insights tab are rebuilt from the locally filtered season slice so era/division lenses stay honest.
function buildInsightsCareerRollups(dataset, insightsFilters = {}) {
  const seasonRecords = getInsightsSeasonRecords(dataset, insightsFilters);
  const careerLookup = createLookup(dataset.careerRecords, "driver");

  return Object.entries(groupBy(seasonRecords, "driver"))
    .map(([driver, records]) => {
      const ordered = sortBySeason(records);
      const peakSeason = [...ordered].sort(
        (left, right) => (right.weightedScore || 0) - (left.weightedScore || 0),
      )[0] || null;
      const totalWdc = ordered.filter((record) => record.wdc).length;
      const totalWcc = ordered.filter((record) => record.wcc).length;
      const totalWins = ordered.reduce((sum, record) => sum + (record.wins || 0), 0);
      const totalPodiums = ordered.reduce((sum, record) => sum + (record.podiums || 0), 0);
      const totalPoles = ordered.reduce((sum, record) => sum + (record.poles || 0), 0);
      const totalFastestLaps = ordered.reduce((sum, record) => sum + (record.fastestLaps || 0), 0);
      const totalPoints = ordered.reduce((sum, record) => sum + (record.points || 0), 0);
      const totalRaces = ordered.reduce((sum, record) => sum + (record.races || 0), 0);
      const averagePaceScore = averageOf(ordered, "paceScore");
      const efficiencyScore = Number(
        ((((averageOf(ordered, "pointsRate") || 0) * 0.55) + ((averageOf(ordered, "top5Rate") || 0) * 0.45))).toFixed(1),
      );
      const consistencyScore = Number(
        ((((averageOf(ordered, "top5Rate") || 0) * 0.6) + ((averageOf(ordered, "participationRate") || 0) * 0.4))).toFixed(1),
      );
      const decoratedScore = Number(((totalWdc * 1) + (totalWcc * 0.45) + totalWins * 0.02).toFixed(3));

      return {
        driver,
        seasonsCount: ordered.length,
        seasons: ordered,
        careerRecord: careerLookup[driver] || null,
        totalWdc,
        totalWcc,
        totalWins,
        totalPodiums,
        totalPoles,
        totalFastestLaps,
        totalPoints,
        totalRaces,
        avgWs: averageOf(ordered, "weightedScore"),
        peakWs: peakSeason ? peakSeason.weightedScore : null,
        avgPointsRate: averageOf(ordered, "pointsRate"),
        avgTop5Rate: averageOf(ordered, "top5Rate"),
        avgWinRate: averageOf(ordered, "winRate"),
        avgPodiumRate: averageOf(ordered, "podiumRate"),
        avgFastestLapRate: averageOf(ordered, "fastestLapRate"),
        avgPoleRate: averageOf(ordered, "poleRate"),
        avgParticipationRate: averageOf(ordered, "participationRate"),
        averagePaceScore,
        efficiencyScore,
        consistencyScore,
        decoratedScore,
        peakSeason,
        latestSeason: ordered[ordered.length - 1] || null,
      };
    })
    .filter((rollup) => rollup.seasonsCount > 0);
}

function isNoSliceFilterActive() {
  return (
    state.filters.season === "all" &&
    state.filters.era === "all" &&
    state.filters.division === "all" &&
    state.filters.team === "all" &&
    state.filters.car === "all"
  );
}

function normalizeAgainstMax(value, maximum) {
  if (value == null || maximum == null || maximum <= 0) {
    return 0;
  }
  return value / maximum;
}

function maxOf(items, getter) {
  if (!items.length) {
    return 0;
  }
  return items.reduce((max, item) => Math.max(max, getter(item) || 0), 0);
}
