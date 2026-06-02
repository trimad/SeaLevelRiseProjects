import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaultAtlasPath = path.join(root, "static", "data", "sea-level-atlas.json");

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function add(errors, pathName, message) {
  errors.push(`${pathName}: ${message}`);
}

function validateAnnualRows(rows, pathName, errors, { allowNullAnomaly = false } = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    add(errors, pathName, "annual rows must be a non-empty array");
    return;
  }

  let previousYear = -Infinity;
  rows.forEach((row, index) => {
    const rowPath = `${pathName}.annual[${index}]`;
    if (!row || typeof row !== "object") {
      add(errors, rowPath, "row must be an object");
      return;
    }

    if (!Number.isInteger(row.year)) {
      add(errors, `${rowPath}.year`, "must be an integer year");
    } else if (row.year <= previousYear) {
      add(errors, rowPath, "annual rows must be chronological with unique years");
    } else {
      previousYear = row.year;
    }

    if ("value" in row && !isFiniteNumber(row.value)) {
      add(errors, `${rowPath}.value`, "must be a finite millimeter value");
    }

    const anomalyValid = isFiniteNumber(row.anomaly) || (allowNullAnomaly && row.anomaly === null);
    if (!anomalyValid) {
      add(errors, `${rowPath}.anomaly`, allowNullAnomaly ? "must be a finite millimeter anomaly or null" : "must be a finite millimeter anomaly");
    }

    if (!Number.isInteger(row.count) || row.count < 1) {
      add(errors, `${rowPath}.count`, "must be a positive integer observation/station count");
    }
  });
}

export function validateAtlasData(data) {
  const errors = [];

  if (!data || typeof data !== "object") {
    return ["atlas: expected a JSON object"];
  }

  if (!Array.isArray(data.stations)) {
    add(errors, "stations", "must be an array");
    return errors;
  }

  if (data.stationCount !== data.stations.length) {
    add(errors, "stationCount", `expected ${data.stations.length}, found ${data.stationCount}`);
  }

  if (data.units !== "millimeters relative to each local tide gauge datum") {
    add(errors, "units", "must explicitly describe millimeter tide-gauge datum units");
  }

  if (!Number.isInteger(data.firstYear) || !Number.isInteger(data.lastYear)) {
    add(errors, "yearRange", "firstYear and lastYear must be integer years");
  } else if (data.firstYear > data.lastYear) {
    add(errors, "firstYear/lastYear", "firstYear must be less than or equal to lastYear");
  }

  const seenIds = new Set();
  data.stations.forEach((station, index) => {
    const stationPath = `stations[${index}]${station?.id ? `(${station.id})` : ""}`;
    if (!station || typeof station !== "object") {
      add(errors, stationPath, "station must be an object");
      return;
    }

    for (const field of ["id", "name", "country"]) {
      if (typeof station[field] !== "string" || station[field].trim() === "") {
        add(errors, `${stationPath}.${field}`, "must be a non-empty string");
      }
    }

    if (typeof station.id === "string") {
      if (seenIds.has(station.id)) add(errors, `${stationPath}.id`, "duplicate station id");
      seenIds.add(station.id);
    }

    if (!isFiniteNumber(station.latitude) || station.latitude < -90 || station.latitude > 90) {
      add(errors, `${stationPath}.latitude`, "must be a finite number from -90 to 90");
    }

    if (!isFiniteNumber(station.longitude) || station.longitude < -180 || station.longitude > 180) {
      add(errors, `${stationPath}.longitude`, "must be a finite number from -180 to 180");
    }

    if (!Number.isInteger(station.firstYear) || !Number.isInteger(station.lastYear)) {
      add(errors, `${stationPath}.yearRange`, "firstYear and lastYear must be integer years");
    } else if (station.firstYear > station.lastYear) {
      add(errors, `${stationPath}.firstYear/lastYear`, "firstYear must be less than or equal to lastYear");
    }

    if (!Number.isInteger(station.validYears) || station.validYears < 1) {
      add(errors, `${stationPath}.validYears`, "must be a positive integer");
    }

    if (!(isFiniteNumber(station.trendMmYr) || station.trendMmYr === null)) {
      add(errors, `${stationPath}.trendMmYr`, "must be a finite mm/year number or null");
    }

    if (!isFiniteNumber(station.latestAnomalyMm)) {
      add(errors, `${stationPath}.latestAnomalyMm`, "must be a finite millimeter anomaly");
    }

    validateAnnualRows(station.annual, stationPath, errors);

    if (Array.isArray(station.annual) && station.annual.length > 0) {
      const firstAnnualYear = station.annual[0]?.year;
      const lastAnnualYear = station.annual.at(-1)?.year;
      if (Number.isInteger(firstAnnualYear) && station.firstYear !== firstAnnualYear) {
        add(errors, `${stationPath}.firstYear`, `does not match first annual year ${firstAnnualYear}`);
      }
      if (Number.isInteger(lastAnnualYear) && station.lastYear !== lastAnnualYear) {
        add(errors, `${stationPath}.lastYear`, `does not match last annual year ${lastAnnualYear}`);
      }
      if (Number.isInteger(station.validYears) && station.validYears !== station.annual.length) {
        add(errors, `${stationPath}.validYears`, `does not match annual row count ${station.annual.length}`);
      }
    }
  });

  if (!data.composite || typeof data.composite !== "object") {
    add(errors, "composite", "must be an object");
  } else {
    validateAnnualRows(data.composite.annual, "composite", errors, { allowNullAnomaly: true });
  }

  return errors;
}

export function validateAtlasFile(atlasPath = defaultAtlasPath) {
  const data = JSON.parse(fs.readFileSync(atlasPath, "utf8"));
  return validateAtlasData(data);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const atlasPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultAtlasPath;
  const errors = validateAtlasFile(atlasPath);
  if (errors.length > 0) {
    console.error(`Data validation failed for ${path.relative(root, atlasPath)}:`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`Data validation passed for ${path.relative(root, atlasPath)}.`);
  }
}
