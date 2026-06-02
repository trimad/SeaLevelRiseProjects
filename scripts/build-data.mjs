import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metadataPath = path.join(root, "Old Junk", "Sea_Level_Map_2", "data", "data.json");
const stationDataDir = path.join(root, "Old Junk", "Sea_Level_Data_Groomer", "data");
const outputPath = path.join(root, "static", "data", "sea-level-atlas.json");

const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf8")).locations;

function round(value, places = 2) {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function linearTrend(years, values) {
  const n = years.length;
  if (n < 8) return null;

  const meanYear = years.reduce((sum, year) => sum + year, 0) / n;
  const meanValue = values.reduce((sum, value) => sum + value, 0) / n;
  let numerator = 0;
  let denominator = 0;

  for (let i = 0; i < n; i += 1) {
    const yearDelta = years[i] - meanYear;
    numerator += yearDelta * (values[i] - meanValue);
    denominator += yearDelta * yearDelta;
  }

  return denominator === 0 ? null : numerator / denominator;
}

function readStation(file) {
  const stationPath = path.join(stationDataDir, file);
  if (!fs.existsSync(stationPath)) return null;

  const byYear = new Map();
  const lines = fs.readFileSync(stationPath, "utf8").trim().split(/\r?\n/);

  for (const line of lines) {
    const [yearRaw, , , levelRaw] = line.split(",");
    const year = Number(yearRaw);
    const level = Number(levelRaw);
    if (!Number.isFinite(year) || !Number.isFinite(level) || level <= 0) continue;

    if (!byYear.has(year)) byYear.set(year, { sum: 0, count: 0 });
    const row = byYear.get(year);
    row.sum += level;
    row.count += 1;
  }

  const annual = [...byYear.entries()]
    .map(([year, row]) => ({
      year,
      value: row.sum / row.count,
      count: row.count,
    }))
    .filter((row) => row.count >= 90)
    .sort((a, b) => a.year - b.year);

  if (annual.length < 6) return null;

  const baselineRows = annual.slice(0, Math.min(5, annual.length));
  const baseline = baselineRows.reduce((sum, row) => sum + row.value, 0) / baselineRows.length;
  const years = annual.map((row) => row.year);
  const values = annual.map((row) => row.value);
  const anomalies = annual.map((row) => row.value - baseline);
  const trend = linearTrend(years, values);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    annual: annual.map((row, index) => ({
      year: row.year,
      value: round(row.value, 2),
      anomaly: round(anomalies[index], 2),
      count: row.count,
    })),
    baseline: round(baseline, 2),
    firstYear: years[0],
    lastYear: years[years.length - 1],
    validYears: annual.length,
    spanYears: years[years.length - 1] - years[0] + 1,
    trendMmYr: trend === null ? null : round(trend, 3),
    totalShiftMm: round(values[values.length - 1] - values[0], 2),
    minMm: round(min, 2),
    maxMm: round(max, 2),
    latestAnomalyMm: round(anomalies[anomalies.length - 1], 2),
  };
}

function buildComposite(stations) {
  const byYear = new Map();

  for (const station of stations) {
    for (const row of station.annual) {
      if (!byYear.has(row.year)) byYear.set(row.year, { sum: 0, count: 0 });
      const bucket = byYear.get(row.year);
      bucket.sum += row.anomaly;
      bucket.count += 1;
    }
  }

  const rows = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, row]) => ({
      year,
      anomaly: row.count >= 8 ? round(row.sum / row.count, 2) : null,
      count: row.count,
    }));

  return {
    firstYear: rows[0]?.year ?? null,
    lastYear: rows[rows.length - 1]?.year ?? null,
    annual: rows,
  };
}

const stations = metadata
  .map((entry) => {
    const station = readStation(entry.File);
    if (!station) return null;

    return {
      id: entry.File.replace(/\.csv$/i, ""),
      file: entry.File,
      name: entry.Location,
      country: entry.Country,
      latitude: Number(entry.Latitude),
      longitude: Number(entry.Longitude),
      metadataStart: entry.Start,
      metadataEnd: entry.End,
      ...station,
    };
  })
  .filter(Boolean)
  .sort((a, b) => a.name.localeCompare(b.name));

const ranked = [...stations]
  .filter((station) => station.validYears >= 20 && station.trendMmYr !== null)
  .sort((a, b) => Math.abs(b.trendMmYr) - Math.abs(a.trendMmYr));

const defaultStation =
  stations.find((station) => station.name === "Brest") ??
  [...stations].sort((a, b) => b.validYears - a.validYears)[0];

const deterministicGeneratedAt = `${Math.max(...stations.map((station) => station.lastYear))}-12-31T00:00:00.000Z`;

const output = {
  generatedAt: deterministicGeneratedAt,
  generatedFrom: [
    path.relative(root, metadataPath).replaceAll("\\", "/"),
    path.relative(root, stationDataDir).replaceAll("\\", "/"),
  ],
  units: "millimeters relative to each local tide gauge datum",
  stationCount: stations.length,
  firstYear: Math.min(...stations.map((station) => station.firstYear)),
  lastYear: Math.max(...stations.map((station) => station.lastYear)),
  defaultStationId: defaultStation.id,
  featuredStationIds: ranked.slice(0, 10).map((station) => station.id),
  composite: buildComposite(stations),
  stations,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output)}\n`);
console.log(`Wrote ${path.relative(root, outputPath)} with ${stations.length} stations.`);

