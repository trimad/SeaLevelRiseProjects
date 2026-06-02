import test from "node:test";
import assert from "node:assert/strict";

import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { validateAtlasData } from "../scripts/validate-data.mjs";
import { validateExportDirectory } from "../scripts/validate-export.mjs";

test("validateAtlasData accepts the generated atlas data shape", () => {
  const data = {
    stationCount: 1,
    firstYear: 2000,
    lastYear: 2002,
    units: "millimeters relative to each local tide gauge datum",
    composite: {
      firstYear: 2000,
      lastYear: 2002,
      annual: [
        { year: 2000, anomaly: 0, count: 1 },
        { year: 2001, anomaly: 1.5, count: 1 },
      ],
    },
    stations: [
      {
        id: "alpha",
        file: "alpha.csv",
        name: "Alpha",
        country: "Testland",
        latitude: 42.5,
        longitude: -70.1,
        firstYear: 2000,
        lastYear: 2002,
        validYears: 3,
        spanYears: 3,
        trendMmYr: 1.25,
        latestAnomalyMm: 2.5,
        annual: [
          { year: 2000, value: 1000, anomaly: 0, count: 365 },
          { year: 2001, value: 1001, anomaly: 1, count: 360 },
          { year: 2002, value: 1002.5, anomaly: 2.5, count: 355 },
        ],
      },
    ],
  };

  assert.deepEqual(validateAtlasData(data), []);
});

test("build-data writes deterministic generatedAt metadata from the data year range", () => {
  const atlasPath = new URL("../static/data/sea-level-atlas.json", import.meta.url);

  execFileSync(process.execPath, ["scripts/build-data.mjs"], { cwd: new URL("..", import.meta.url) });
  const data = JSON.parse(fs.readFileSync(atlasPath, "utf8"));

  assert.equal(data.generatedAt, `${data.lastYear}-12-31T00:00:00.000Z`);
});

test("app initializes shareable URL state for mode, year, and station", () => {
  const appSource = fs.readFileSync(new URL("../static/js/app.js", import.meta.url), "utf8");

  assert.match(appSource, /function getInitialStateFromUrl\(/);
  assert.match(appSource, /searchParams\.get\("mode"\)/);
  assert.match(appSource, /searchParams\.get\("year"\)/);
  assert.match(appSource, /searchParams\.get\("station"\)/);
  assert.match(appSource, /function syncUrlState\(/);
  assert.match(appSource, /history\.replaceState\(/);
});

test("app exposes keyboard-accessible mode tabs, playback state, and station navigation", () => {
  const appSource = fs.readFileSync(new URL("../static/js/app.js", import.meta.url), "utf8");
  const htmlSource = fs.readFileSync(new URL("../layouts/index.html", import.meta.url), "utf8");

  assert.match(htmlSource, /role="tab"[^>]+data-mode="atlas"/);
  assert.match(htmlSource, /aria-pressed="false"/);
  assert.match(htmlSource, /aria-keyshortcuts="Space"/);
  assert.match(htmlSource, /id="stationList"[^>]+role="list"/);
  assert.match(appSource, /function handleModeTabKeydown\(/);
  assert.match(appSource, /function handleStationListKeydown\(/);
  assert.match(appSource, /event\.key === "ArrowRight"/);
  assert.match(appSource, /event\.key === "ArrowDown"/);
  assert.match(appSource, /aria-selected/);
  assert.match(appSource, /aria-pressed/);
});

test("site includes a p5.js 3D station movement view with year and component controls", () => {
  const appSource = fs.readFileSync(new URL("../static/js/app.js", import.meta.url), "utf8");
  const htmlSource = fs.readFileSync(new URL("../layouts/index.html", import.meta.url), "utf8");
  const p5Source = fs.readFileSync(new URL("../static/js/station-3d.js", import.meta.url), "utf8");

  assert.match(htmlSource, /data-mode="globe"/);
  assert.match(htmlSource, /id="station3dView"/);
  assert.match(htmlSource, /vendor\/p5\.js/);
  assert.match(htmlSource, /js\/station-3d\.js/);
  assert.match(appSource, /"globe"/);
  assert.match(appSource, /document\.body\.dataset\.mode = state\.mode/);
  assert.match(p5Source, /WEBGL/);
  assert.match(p5Source, /createVector/);
  assert.match(p5Source, /seaLevelScale/);
  assert.match(p5Source, /landMotionScale/);
  assert.match(p5Source, /componentMode/);
  assert.match(p5Source, /yearSlider/);
});

test("source acquisition documentation covers archived UH inputs and world land polygons", () => {
  const sourceDoc = fs.readFileSync(new URL("../docs/source-acquisition.md", import.meta.url), "utf8");

  for (const phrase of [
    "Old Junk/Sea_Level_Map_2/data/data.json",
    "Old Junk/Sea_Level_Data_Groomer/data",
    "University of Hawaii Sea Level Center",
    "scripts/build-data.mjs",
    "scripts/build-world-map.mjs",
    "world-atlas@2",
    "Natural Earth 1:110m land polygons",
    "npm run build:data",
    "npm run build:world-map",
  ]) {
    assert.match(sourceDoc, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  }
});

test("validateExportDirectory accepts a Hugo static export with required local assets and methodology note", () => {
  const publicDir = new URL("../public/", import.meta.url);

  execFileSync("hugo", ["--minify"], { cwd: new URL("..", import.meta.url) });
  assert.deepEqual(validateExportDirectory(publicDir), []);
});

test("validateAtlasData reports coordinate, year, missing-value, and unit problems", () => {
  const data = {
    stationCount: 2,
    firstYear: 2020,
    lastYear: 2019,
    units: "meters",
    composite: { annual: [{ year: 2019, anomaly: "bad", count: 0 }] },
    stations: [
      {
        id: "broken",
        name: "Broken",
        country: "Nowhere",
        latitude: 95,
        longitude: -181,
        firstYear: 2020,
        lastYear: 2019,
        validYears: 2,
        trendMmYr: "fast",
        latestAnomalyMm: null,
        annual: [
          { year: 2020, value: null, anomaly: 0, count: 0 },
          { year: 2019, value: 1, anomaly: "missing", count: 12 },
        ],
      },
    ],
  };

  const messages = validateAtlasData(data).join("\n");

  assert.match(messages, /stationCount/);
  assert.match(messages, /units/);
  assert.match(messages, /firstYear.*lastYear/);
  assert.match(messages, /latitude/);
  assert.match(messages, /longitude/);
  assert.match(messages, /trendMmYr/);
  assert.match(messages, /latestAnomalyMm/);
  assert.match(messages, /annual.*chronological/);
  assert.match(messages, /annual.*value/);
  assert.match(messages, /annual.*anomaly/);
  assert.match(messages, /annual.*count/);
  assert.match(messages, /composite.*anomaly/);
});
