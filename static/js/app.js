const canvas = document.querySelector("#atlasCanvas");
const ctx = canvas.getContext("2d");
const ringCanvas = document.querySelector("#ringCanvas");
const ringCtx = ringCanvas.getContext("2d");
const tooltip = document.querySelector("#tooltip");

const ui = {
  stationCount: document.querySelector("#stationCount"),
  yearSpan: document.querySelector("#yearSpan"),
  dataYear: document.querySelector("#dataYear"),
  stationName: document.querySelector("#stationName"),
  stationPlace: document.querySelector("#stationPlace"),
  trendValue: document.querySelector("#trendValue"),
  signalValue: document.querySelector("#signalValue"),
  recordValue: document.querySelector("#recordValue"),
  coverageValue: document.querySelector("#coverageValue"),
  yearRange: document.querySelector("#yearRange"),
  yearOutput: document.querySelector("#yearOutput"),
  stationSearch: document.querySelector("#stationSearch"),
  stationSelect: document.querySelector("#stationSelect"),
  stationList: document.querySelector("#stationList"),
  playPause: document.querySelector("#playPause"),
  modeButtons: [...document.querySelectorAll(".mode-tabs button")],
};

const state = {
  data: null,
  stations: [],
  selected: null,
  hovered: null,
  year: 2018,
  mode: "atlas",
  playing: false,
  lastTick: 0,
  points: [],
  filteredStations: [],
  land: [],
  scatterStats: null,
};

const palette = {
  ink: "#f4f0e8",
  muted: "#b8b1a6",
  reef: "#5dd8c1",
  coral: "#ff6f61",
  amber: "#e8bf54",
  moss: "#85b66f",
  violet: "#9a8cff",
  low: "#2b6cb0",
  lowSoft: "#57b7d7",
  neutral: "#f0ead8",
  highSoft: "#f2b84b",
  high: "#d94b3d",
};

const ANOMALY_STOPS = [
  { value: -250, rgb: [43, 108, 176] },
  { value: -80, rgb: [87, 183, 215] },
  { value: 0, rgb: [240, 234, 216] },
  { value: 80, rgb: [242, 184, 75] },
  { value: 250, rgb: [217, 75, 61] },
];

const TREND_LIMIT_MM_YEAR = 8;
const MODES = new Set(["atlas", "braid", "scatter", "pulse", "rings", "globe"]);

const LAND_POLYGONS = [
  [
    [-168, 72],
    [-151, 70],
    [-141, 60],
    [-130, 55],
    [-124, 48],
    [-117, 34],
    [-106, 24],
    [-96, 19],
    [-89, 18],
    [-82, 25],
    [-80, 32],
    [-74, 40],
    [-64, 45],
    [-54, 50],
    [-58, 58],
    [-76, 69],
    [-100, 72],
    [-124, 72],
    [-145, 75],
  ],
  [
    [-73, 11],
    [-61, 9],
    [-50, 2],
    [-42, -11],
    [-38, -22],
    [-48, -35],
    [-54, -51],
    [-67, -55],
    [-75, -39],
    [-79, -20],
    [-82, -4],
  ],
  [
    [-52, 83],
    [-30, 78],
    [-22, 68],
    [-39, 60],
    [-55, 59],
    [-72, 69],
    [-66, 78],
  ],
  [
    [-17, 36],
    [6, 37],
    [31, 31],
    [45, 12],
    [43, -13],
    [32, -34],
    [18, -35],
    [7, -28],
    [-5, -35],
    [-17, -27],
    [-12, -5],
    [-18, 10],
  ],
  [
    [-10, 36],
    [-8, 49],
    [4, 58],
    [20, 66],
    [44, 67],
    [60, 73],
    [86, 78],
    [118, 72],
    [150, 66],
    [172, 56],
    [160, 48],
    [136, 43],
    [125, 34],
    [123, 23],
    [108, 18],
    [102, 2],
    [83, 8],
    [75, 22],
    [62, 25],
    [56, 16],
    [45, 13],
    [41, 30],
    [30, 31],
    [25, 41],
    [12, 43],
    [4, 39],
  ],
  [
    [95, 5],
    [107, 8],
    [119, 1],
    [124, -8],
    [113, -8],
    [103, -3],
  ],
  [
    [130, -2],
    [144, -5],
    [142, -9],
    [130, -8],
  ],
  [
    [112, -11],
    [115, -35],
    [134, -39],
    [153, -28],
    [153, -15],
    [139, -11],
    [126, -14],
  ],
  [
    [166, -34],
    [178, -38],
    [174, -46],
    [166, -45],
  ],
  [
    [-180, -68],
    [-140, -72],
    [-92, -70],
    [-35, -74],
    [20, -69],
    [75, -73],
    [130, -68],
    [180, -70],
    [180, -82],
    [-180, -82],
  ],
];

Promise.all([
  fetch("data/sea-level-atlas.json").then((response) => {
    if (!response.ok) throw new Error(`Data request failed: ${response.status}`);
    return response.json();
  }),
  fetch("data/world-land.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null),
])
  .then(([data, land]) => init(data, land?.polygons))
  .catch((error) => {
    ui.stationName.textContent = "Data unavailable";
    ui.stationPlace.textContent = error.message;
  });

function init(data, landPolygons) {
  const initial = getInitialStateFromUrl(data);
  state.data = data;
  state.land = Array.isArray(landPolygons) && landPolygons.length > 0 ? landPolygons : LAND_POLYGONS;
  state.stations = data.stations.map(enrichStation);
  state.scatterStats = buildScatterStats(state.stations);
  state.mode = initial.mode;
  state.year = initial.year;
  state.filteredStations = state.stations;
  state.selected =
    state.stations.find((station) => station.id === initial.stationId) ??
    state.stations.find((station) => station.id === data.defaultStationId) ??
    state.stations[0];

  ui.stationCount.textContent = String(data.stationCount);
  ui.yearSpan.textContent = `${data.firstYear}-${data.lastYear}`;
  ui.dataYear.textContent = `last ${data.lastYear}`;
  ui.yearRange.min = data.firstYear;
  ui.yearRange.max = data.lastYear;
  ui.yearRange.value = state.year;

  populateSelect(state.stations);
  populateFeatured();
  attachEvents();
  updateModeButtons();
  resizeAll();
  updatePanel();
  syncUrlState();
  requestAnimationFrame(loop);
}

function enrichStation(station) {
  const annualByYear = new Map(station.annual.map((row) => [row.year, row]));
  const yearToYear = [];

  for (let i = 1; i < station.annual.length; i += 1) {
    const previous = station.annual[i - 1];
    const current = station.annual[i];
    if (current.year - previous.year <= 2) {
      yearToYear.push(current.anomaly - previous.anomaly);
    }
  }

  const volatilityMm = standardDeviation(yearToYear);

  return {
    ...station,
    annualByYear,
    volatilityMm,
    volatilitySamples: yearToYear.length,
  };
}

function buildScatterStats(stations) {
  const scatterStations = stations.filter(
    (station) =>
      Number.isFinite(station.trendMmYr) &&
      Number.isFinite(station.volatilityMm) &&
      station.volatilitySamples >= 5,
  );
  const trendAbs = scatterStations.map((station) => Math.abs(station.trendMmYr)).sort((a, b) => a - b);
  const volValues = scatterStations.map((station) => station.volatilityMm).sort((a, b) => a - b);

  return {
    stations: scatterStations,
    trendLimit: Math.max(4, Math.ceil(percentile(trendAbs, 0.94))),
    volatilityMax: Math.max(40, Math.ceil(percentile(volValues, 0.94) / 10) * 10),
  };
}

function attachEvents() {
  window.addEventListener("resize", resizeAll);

  ui.yearRange.addEventListener("input", () => {
    state.year = Number(ui.yearRange.value);
    state.playing = false;
    updatePlayButton();
    updatePanel();
    syncUrlState();
  });

  ui.stationSelect.addEventListener("change", () => {
    const station = state.stations.find((row) => row.id === ui.stationSelect.value);
    if (station) selectStation(station);
  });

  ui.stationSearch.addEventListener("input", () => {
    const needle = ui.stationSearch.value.trim().toLowerCase();
    state.filteredStations = needle
      ? state.stations.filter((station) =>
          `${station.name} ${station.country}`.toLowerCase().includes(needle),
        )
      : state.stations;
    populateSelect(state.filteredStations);
  });

  ui.modeButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode;
      updateModeButtons();
      syncUrlState();
    });
    button.addEventListener("keydown", handleModeTabKeydown);
  });

  ui.playPause.addEventListener("click", () => {
    state.playing = !state.playing;
    state.lastTick = 0;
    updatePlayButton();
  });

  ui.stationList.addEventListener("keydown", handleStationListKeydown);

  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerleave", () => {
    state.hovered = null;
    tooltip.hidden = true;
  });
  canvas.addEventListener("click", () => {
    if (state.hovered) selectStation(state.hovered);
  });
}

function getInitialStateFromUrl(data) {
  const searchParams = new URLSearchParams(window.location.search);
  const mode = searchParams.get("mode");
  const year = Number(searchParams.get("year"));
  const stationId = searchParams.get("station");

  return {
    mode: MODES.has(mode) ? mode : "atlas",
    year: Number.isInteger(year) && year >= data.firstYear && year <= data.lastYear ? year : data.lastYear,
    stationId,
  };
}

function syncUrlState() {
  if (!state.data || !state.selected) return;
  const url = new URL(window.location.href);
  url.searchParams.set("mode", state.mode);
  url.searchParams.set("year", String(state.year));
  url.searchParams.set("station", state.selected.id);
  history.replaceState(null, "", url);
}

function handleModeTabKeydown(event) {
  if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const currentIndex = ui.modeButtons.indexOf(event.currentTarget);
  const lastIndex = ui.modeButtons.length - 1;
  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
  else if (event.key === "ArrowLeft") nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = lastIndex;

  const nextButton = ui.modeButtons[nextIndex];
  if (!nextButton) return;
  nextButton.focus();
  nextButton.click();
}

function handleStationListKeydown(event) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const buttons = [...ui.stationList.querySelectorAll("button")];
  if (buttons.length === 0) return;

  event.preventDefault();
  const currentIndex = Math.max(0, buttons.indexOf(document.activeElement));
  const lastIndex = buttons.length - 1;
  let nextIndex = currentIndex;

  if (event.key === "ArrowDown") nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
  else if (event.key === "ArrowUp") nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = lastIndex;

  buttons[nextIndex]?.focus();
}

function updateModeButtons() {
  document.body.dataset.mode = state.mode;
  ui.modeButtons.forEach((button) => {
    const selected = button.dataset.mode === state.mode;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-selected", selected ? "true" : "false");
    button.tabIndex = selected ? 0 : -1;
  });
}

function resizeAll() {
  resizeCanvas(canvas, ctx);
  resizeCanvas(ringCanvas, ringCtx);
  drawRing();
}

function resizeCanvas(target, context) {
  const bounds = target.getBoundingClientRect();
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  target.width = Math.max(1, Math.round(bounds.width * ratio));
  target.height = Math.max(1, Math.round(bounds.height * ratio));
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function populateSelect(stations) {
  const current = state.selected?.id;
  ui.stationSelect.innerHTML = "";
  stations.forEach((station) => {
    const option = document.createElement("option");
    option.value = station.id;
    option.textContent = `${station.name}, ${station.country}`;
    ui.stationSelect.append(option);
  });
  if (current && stations.some((station) => station.id === current)) ui.stationSelect.value = current;
}

function populateFeatured() {
  ui.stationList.innerHTML = "";
  const featured = state.data.featuredStationIds
    .map((id) => state.stations.find((station) => station.id === id))
    .filter(Boolean);

  featured.forEach((station) => {
    const button = document.createElement("button");
    const trendClass = (station.trendMmYr ?? 0) >= 0 ? "trend-up" : "trend-down";
    button.type = "button";
    button.dataset.id = station.id;
    button.setAttribute("role", "listitem");
    button.innerHTML = `
      <span><b>${escapeHtml(station.name)}</b><span>${escapeHtml(station.country)}</span></span>
      <strong class="${trendClass}">${formatTrend(station.trendMmYr)}</strong>
    `;
    button.addEventListener("click", () => selectStation(station));
    ui.stationList.append(button);
  });
}

function selectStation(station) {
  state.selected = station;
  ui.stationSelect.value = station.id;
  updatePanel();
  drawRing();
  syncUrlState();
}

function updatePanel() {
  const station = state.selected;
  const row = station.annualByYear.get(state.year);
  ui.yearOutput.value = state.year;
  ui.stationName.textContent = station.name;
  ui.stationPlace.textContent = `${station.country} · ${station.latitude.toFixed(2)}, ${station.longitude.toFixed(2)}`;
  ui.trendValue.textContent = formatTrend(station.trendMmYr);
  ui.signalValue.textContent = row ? formatMm(row.anomaly) : "no annual mean";
  ui.recordValue.textContent = `${station.firstYear}-${station.lastYear}`;
  ui.coverageValue.textContent = `${station.validYears} years`;

  [...ui.stationList.querySelectorAll("button")].forEach((button) => {
    const selected = button.dataset.id === station.id;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", selected ? "true" : "false");
  });

  drawRing();
}

function updatePlayButton() {
  ui.playPause.querySelector("span").textContent = state.playing ? "Ⅱ" : "▶";
  ui.playPause.setAttribute("aria-label", state.playing ? "Pause timeline" : "Play timeline");
  ui.playPause.setAttribute("aria-pressed", state.playing ? "true" : "false");
}

function loop(timestamp) {
  if (state.playing && (!state.lastTick || timestamp - state.lastTick > 380)) {
    state.lastTick = timestamp;
    state.year = state.year >= state.data.lastYear ? state.data.firstYear : state.year + 1;
    ui.yearRange.value = state.year;
    updatePanel();
    syncUrlState();
  }

  drawMain(timestamp);
  requestAnimationFrame(loop);
}

function drawMain(timestamp = 0) {
  if (!state.data) return;
  const { layoutWidth, renderWidth, height } = getCanvasViewport(canvas);
  ctx.clearRect(0, 0, layoutWidth, height);
  drawBackdrop(layoutWidth, height);

  if (state.mode === "globe") return;
  if (state.mode === "braid") drawBraid(renderWidth, height);
  else if (state.mode === "scatter") drawTrendVolatility(renderWidth, height);
  else if (state.mode === "pulse") drawPulseMap(renderWidth, height, timestamp);
  else if (state.mode === "rings") drawStationRings(renderWidth, height);
  else drawAtlas(renderWidth, height);

  drawComposite(renderWidth, height);
}

function getCanvasViewport(target) {
  const bounds = target.getBoundingClientRect();
  const layoutWidth = Math.max(1, bounds.width);
  const reportedWidth = Math.min(
    layoutWidth,
    document.documentElement.clientWidth || layoutWidth,
    window.visualViewport?.width || layoutWidth,
    window.innerWidth || layoutWidth,
  );
  const narrowReserve = layoutWidth < 700 ? Math.min(116, layoutWidth * 0.22) : 0;
  const renderWidth = Math.max(300, Math.min(layoutWidth, reportedWidth, layoutWidth - narrowReserve));

  return {
    layoutWidth,
    renderWidth,
    height: Math.max(1, bounds.height),
  };
}

function drawBackdrop(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "rgba(16,18,17,0.78)");
  gradient.addColorStop(0.45, "rgba(28,29,24,0.58)");
  gradient.addColorStop(1, "rgba(11,13,12,0.86)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawAtlas(width, height) {
  const bounds = mapBounds(width, height);
  drawWorldMap(bounds);
  drawGraticule(bounds);
  drawAtlasAxes(bounds);
  state.points = [];

  for (const station of state.stations) {
    const point = project(station.longitude, station.latitude, bounds);
    const row = station.annualByYear.get(state.year);
    const active = Boolean(row);
    const trend = station.trendMmYr ?? 0;
    const radius = Math.max(2.2, Math.min(10, 2.2 + Math.sqrt(station.validYears) * 0.34));

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = active ? anomalyColor(row.anomaly, 0.82) : missingColor(0.18);
    ctx.fill();
    ctx.lineWidth = station === state.selected ? 2.4 : 0.9;
    ctx.strokeStyle = trendColor(trend, station === state.selected ? 0.95 : active ? 0.55 : 0.2);
    ctx.stroke();

    if (station === state.selected || station === state.hovered) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = station === state.selected ? "rgba(232,191,84,0.82)" : "rgba(244,240,232,0.72)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    state.points.push({ station, x: point.x, y: point.y, r: radius + 8 });
  }

  drawSelectedCallout(bounds);
}

function drawWorldMap(bounds) {
  ctx.save();
  ctx.fillStyle = "rgba(133, 182, 111, 0.2)";
  ctx.strokeStyle = "rgba(244, 240, 232, 0.22)";
  ctx.lineWidth = 1;

  for (const polygon of state.land) {
    ctx.beginPath();
    polygon.forEach(([lon, lat], index) => {
      const point = project(lon, lat, bounds);
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(93,216,193,0.26)";
  ctx.lineWidth = 1.3;
  ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
  ctx.restore();
}

function drawGraticule(bounds) {
  ctx.save();
  ctx.strokeStyle = "rgba(244,240,232,0.12)";
  ctx.lineWidth = 1;

  for (let lon = -180; lon <= 180; lon += 30) {
    ctx.beginPath();
    for (let lat = -70; lat <= 80; lat += 5) {
      const point = project(lon, lat, bounds);
      if (lat === -70) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  for (let lat = -60; lat <= 60; lat += 20) {
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 5) {
      const point = project(lon, lat, bounds);
      if (lon === -180) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

function drawAtlasAxes(bounds, title = "Annual anomaly from local baseline") {
  const compact = bounds.w < 430;
  const xAxisY = bounds.y + bounds.h + 20;
  const yAxisX = bounds.x - (compact ? 14 : 18);
  const lonTicks = [-180, -120, -60, 0, 60, 120, 180];
  const latTicks = [-60, -30, 0, 30, 60];

  ctx.save();
  ctx.strokeStyle = "rgba(244,240,232,0.5)";
  ctx.fillStyle = palette.muted;
  ctx.lineWidth = 1;
  ctx.font = "12px system-ui, sans-serif";

  ctx.beginPath();
  ctx.moveTo(bounds.x, xAxisY);
  ctx.lineTo(bounds.x + bounds.w, xAxisY);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const lon of lonTicks) {
    const x = project(lon, 0, bounds).x;
    ctx.beginPath();
    ctx.moveTo(x, xAxisY - 4);
    ctx.lineTo(x, xAxisY + 4);
    ctx.stroke();
    ctx.fillText(formatLon(lon), x, xAxisY + 8);
  }

  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("Longitude", bounds.x + bounds.w / 2, xAxisY + 28);

  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.beginPath();
  ctx.moveTo(yAxisX, bounds.y);
  ctx.lineTo(yAxisX, bounds.y + bounds.h);
  ctx.stroke();

  for (const lat of latTicks) {
    const y = project(0, lat, bounds).y;
    ctx.beginPath();
    ctx.moveTo(yAxisX - 4, y);
    ctx.lineTo(yAxisX + 4, y);
    ctx.stroke();
    ctx.fillText(formatLat(lat), yAxisX - (compact ? 5 : 7), y);
  }

  ctx.save();
  ctx.translate(compact ? 8 : Math.max(12, bounds.x - 64), bounds.y + bounds.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Latitude", 0, 0);
  ctx.restore();

  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, bounds.x, Math.max(18, bounds.y - 10));
  ctx.restore();
}

function drawSelectedCallout(bounds) {
  const station = state.selected;
  const point = project(station.longitude, station.latitude, bounds);
  const row = station.annualByYear.get(state.year);
  const label = row ? `${station.name} ${formatMm(row.anomaly)}` : station.name;
  const x = Math.min(bounds.x + bounds.w - 190, point.x + 18);
  const y = Math.max(bounds.y + 20, point.y - 22);

  ctx.save();
  ctx.fillStyle = "rgba(16,18,17,0.88)";
  ctx.strokeStyle = "rgba(232,191,84,0.64)";
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, 172, 42, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText(truncate(label, 22), x + 10, y + 17);
  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`${station.firstYear}-${station.lastYear}`, x + 10, y + 32);
  ctx.restore();
}

function drawBraid(width, height) {
  const pad = Math.max(24, Math.min(width, height) * 0.08);
  const top = Math.max(34, pad * 0.8);
  const left = Math.max(62, pad * 1.45);
  const plot = {
    x: left,
    y: top,
    w: Math.max(220, width - left - pad),
    h: Math.max(220, height - top - 138),
  };
  const yearRange = state.data.lastYear - state.data.firstYear;
  const sorted = state.stations
    .filter((station) => station.annualByYear.has(state.year))
    .sort(compareStationsByCurrentAnomaly);
  state.points = [];

  ctx.save();
  drawBraidAxes(plot, sorted);

  sorted.forEach((station, index) => {
    const x = plot.x + (index / Math.max(1, sorted.length - 1)) * plot.w;
    drawBraidTrace(station, x, plot, yearRange);

    const row = station.annualByYear.get(state.year);
    if (row) {
      const y = plot.y + ((state.year - state.data.firstYear) / yearRange) * plot.h;
      const drift = Math.max(-28, Math.min(28, row.anomaly * 0.08));
      const radius = station === state.selected ? 6 : 3.2;
      ctx.beginPath();
      ctx.arc(x + drift, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = anomalyColor(row.anomaly, station === state.selected ? 1 : 0.65);
      ctx.fill();
      state.points.push({ station, x: x + drift, y, r: radius + 8 });
    }
  });

  const yearY = plot.y + ((state.year - state.data.firstYear) / yearRange) * plot.h;
  ctx.strokeStyle = "rgba(232,191,84,0.65)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(plot.x, yearY);
  ctx.lineTo(plot.x + plot.w, yearY);
  ctx.stroke();
  ctx.fillStyle = palette.amber;
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.fillText(String(state.year), plot.x + 4, Math.max(plot.y + 18, yearY - 8));
  ctx.restore();
}

function drawBraidTrace(station, x, plot, yearRange) {
  const alpha = station === state.selected ? 0.96 : 0.42;
  const lineWidth = station === state.selected ? 2.4 : 0.8;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (let i = 1; i < station.annual.length; i += 1) {
    const previous = station.annual[i - 1];
    const current = station.annual[i];
    const previousY = plot.y + ((previous.year - state.data.firstYear) / yearRange) * plot.h;
    const currentY = plot.y + ((current.year - state.data.firstYear) / yearRange) * plot.h;
    const previousDrift = Math.max(-28, Math.min(28, previous.anomaly * 0.08));
    const currentDrift = Math.max(-28, Math.min(28, current.anomaly * 0.08));

    ctx.beginPath();
    ctx.moveTo(x + previousDrift, previousY);
    ctx.lineTo(x + currentDrift, currentY);
    ctx.strokeStyle = anomalyColor((previous.anomaly + current.anomaly) / 2, alpha);
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }

  ctx.restore();
}

function compareStationsByCurrentAnomaly(a, b) {
  const aRow = a.annualByYear.get(state.year);
  const bRow = b.annualByYear.get(state.year);
  const aValue = Number.isFinite(aRow?.anomaly) ? aRow.anomaly : Infinity;
  const bValue = Number.isFinite(bRow?.anomaly) ? bRow.anomaly : Infinity;
  if (aValue !== bValue) return aValue - bValue;
  return a.name.localeCompare(b.name);
}

function drawBraidAxes(plot, sortedStations) {
  const yearTicks = [1850, 1900, 1950, 2000, state.data.lastYear];
  const yearRange = state.data.lastYear - state.data.firstYear;
  const xTicks = [
    { t: 0, label: "lower" },
    { t: 0.5, label: "baseline" },
    { t: 1, label: "higher" },
  ];

  ctx.save();
  ctx.strokeStyle = "rgba(244,240,232,0.5)";
  ctx.fillStyle = palette.muted;
  ctx.lineWidth = 1;
  ctx.font = "12px system-ui, sans-serif";

  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const year of yearTicks) {
    const y = plot.y + ((year - state.data.firstYear) / yearRange) * plot.h;
    ctx.strokeStyle = "rgba(244,240,232,0.12)";
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,240,232,0.5)";
    ctx.beginPath();
    ctx.moveTo(plot.x - 4, y);
    ctx.lineTo(plot.x + 4, y);
    ctx.stroke();
    ctx.fillText(String(year), plot.x - 8, y);
  }

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of xTicks) {
    const x = plot.x + tick.t * plot.w;
    ctx.strokeStyle = "rgba(244,240,232,0.12)";
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,240,232,0.5)";
    ctx.beginPath();
    ctx.moveTo(x, plot.y + plot.h - 4);
    ctx.lineTo(x, plot.y + plot.h + 4);
    ctx.stroke();
    ctx.fillText(tick.label, x, plot.y + plot.h + 8);
  }

  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText("Stations sorted by annual anomaly", plot.x + plot.w / 2, plot.y + plot.h + 30);

  ctx.save();
  ctx.translate(Math.max(14, plot.x - 48), plot.y + plot.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Year", 0, 0);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  const available = sortedStations.filter((station) => station.annualByYear.has(state.year)).length;
  ctx.fillText(`${available} gauge traces, ascending anomaly in ${state.year}`, plot.x, Math.max(18, plot.y - 10));
  ctx.restore();
}

function drawTrendVolatility(width, height) {
  const stats = state.scatterStats;
  if (!stats?.stations.length) return;

  const pad = Math.max(24, Math.min(width, height) * 0.07);
  const plot = {
    x: Math.max(68, pad * 1.4),
    y: Math.max(38, pad * 0.9),
    w: Math.max(260, width - Math.max(68, pad * 1.4) - pad),
    h: Math.max(240, height - Math.max(38, pad * 0.9) - 140),
  };
  state.points = [];

  ctx.save();
  drawScatterAxes(plot, stats);

  const sorted = [...stats.stations].sort((a, b) => a.validYears - b.validYears);
  sorted.forEach((station) => {
    const x = plot.x + ((clamp(station.trendMmYr, -stats.trendLimit, stats.trendLimit) + stats.trendLimit) / (stats.trendLimit * 2)) * plot.w;
    const y = plot.y + plot.h - (clamp(station.volatilityMm, 0, stats.volatilityMax) / stats.volatilityMax) * plot.h;
    const annual = station.annualByYear.get(state.year);
    const anomaly = annual?.anomaly ?? station.latestAnomalyMm;
    const radius = Math.max(3.4, Math.min(11, 2.4 + Math.sqrt(station.validYears) * 0.42));

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = anomalyColor(anomaly, station === state.selected ? 0.98 : annual ? 0.72 : 0.42);
    ctx.fill();
    ctx.lineWidth = station === state.selected ? 2.4 : 0.9;
    ctx.strokeStyle = trendColor(station.trendMmYr, station === state.selected ? 0.98 : 0.58);
    ctx.stroke();

    if (station === state.selected || station === state.hovered) {
      ctx.beginPath();
      ctx.arc(x, y, radius + 7, 0, Math.PI * 2);
      ctx.strokeStyle = station === state.selected ? "rgba(244,240,232,0.9)" : "rgba(244,240,232,0.62)";
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }

    state.points.push({ station, x, y, r: radius + 8 });
  });

  drawScatterCallout(plot, stats);
  ctx.restore();
}

function drawScatterAxes(plot, stats) {
  const trendTicks = [-stats.trendLimit, -stats.trendLimit / 2, 0, stats.trendLimit / 2, stats.trendLimit];
  const volTicks = [0, stats.volatilityMax / 4, stats.volatilityMax / 2, (stats.volatilityMax * 3) / 4, stats.volatilityMax];

  ctx.save();
  ctx.strokeStyle = "rgba(244,240,232,0.48)";
  ctx.fillStyle = palette.muted;
  ctx.lineWidth = 1;
  ctx.font = "12px system-ui, sans-serif";

  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (const tick of trendTicks) {
    const x = plot.x + ((tick + stats.trendLimit) / (stats.trendLimit * 2)) * plot.w;
    ctx.strokeStyle = tick === 0 ? "rgba(244,240,232,0.36)" : "rgba(244,240,232,0.12)";
    ctx.beginPath();
    ctx.moveTo(x, plot.y);
    ctx.lineTo(x, plot.y + plot.h);
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,240,232,0.48)";
    ctx.beginPath();
    ctx.moveTo(x, plot.y + plot.h - 4);
    ctx.lineTo(x, plot.y + plot.h + 4);
    ctx.stroke();
    ctx.fillText(formatSigned(tick), x, plot.y + plot.h + 8);
  }

  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (const tick of volTicks) {
    const y = plot.y + plot.h - (tick / stats.volatilityMax) * plot.h;
    ctx.strokeStyle = "rgba(244,240,232,0.12)";
    ctx.beginPath();
    ctx.moveTo(plot.x, y);
    ctx.lineTo(plot.x + plot.w, y);
    ctx.stroke();
    ctx.strokeStyle = "rgba(244,240,232,0.48)";
    ctx.beginPath();
    ctx.moveTo(plot.x - 4, y);
    ctx.lineTo(plot.x + 4, y);
    ctx.stroke();
    ctx.fillText(String(Math.round(tick)), plot.x - 8, y);
  }

  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Long-term trend (mm/yr)", plot.x + plot.w / 2, plot.y + plot.h + 32);

  ctx.save();
  ctx.translate(Math.max(14, plot.x - 50), plot.y + plot.h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textBaseline = "middle";
  ctx.fillText("Year-to-year variability (mm)", 0, 0);
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText("Dot size: record length", plot.x, Math.max(18, plot.y - 10));
  ctx.fillText("Color: selected-year anomaly", plot.x + 150, Math.max(18, plot.y - 10));
  ctx.restore();
}

function drawScatterCallout(plot, stats) {
  const station = state.selected;
  if (!Number.isFinite(station.trendMmYr) || !Number.isFinite(station.volatilityMm)) return;

  const x = plot.x + ((clamp(station.trendMmYr, -stats.trendLimit, stats.trendLimit) + stats.trendLimit) / (stats.trendLimit * 2)) * plot.w;
  const y = plot.y + plot.h - (clamp(station.volatilityMm, 0, stats.volatilityMax) / stats.volatilityMax) * plot.h;
  const boxW = 208;
  const boxH = 54;
  const boxX = Math.min(plot.x + plot.w - boxW, Math.max(plot.x + 8, x + 16));
  const boxY = Math.min(plot.y + plot.h - boxH, Math.max(plot.y + 8, y - 30));

  ctx.save();
  ctx.fillStyle = "rgba(16,18,17,0.9)";
  ctx.strokeStyle = trendColor(station.trendMmYr, 0.78);
  ctx.lineWidth = 1;
  roundRect(ctx, boxX, boxY, boxW, boxH, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText(truncate(station.name, 24), boxX + 10, boxY + 18);
  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`${formatTrend(station.trendMmYr)} · ${Math.round(station.volatilityMm)} mm variability`, boxX + 10, boxY + 36);
  ctx.restore();
}

function drawPulseMap(width, height, timestamp) {
  const bounds = mapBounds(width, height);
  drawWorldMap(bounds);
  drawGraticule(bounds);
  drawAtlasAxes(bounds, "Pulse height: annual anomaly from baseline");
  state.points = [];

  const phase = timestamp / 720;

  ctx.save();
  state.stations.forEach((station) => {
    const point = project(station.longitude, station.latitude, bounds);
    const row = station.annualByYear.get(state.year);
    const radius = Math.max(2.2, Math.min(8, 2 + Math.sqrt(station.validYears) * 0.28));

    ctx.beginPath();
    ctx.arc(point.x, point.y, radius * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = row ? "rgba(244,240,232,0.2)" : missingColor(0.12);
    ctx.fill();

    if (!row) {
      state.points.push({ station, x: point.x, y: point.y, r: radius + 7 });
      return;
    }

    const magnitude = Math.min(1, Math.abs(row.anomaly) / 260);
    const lift = clamp(-row.anomaly * 0.16, -58, 58);
    const endX = point.x;
    const endY = point.y + lift;
    const wave = (Math.sin(phase + station.longitude * 0.05 + station.latitude * 0.03) + 1) / 2;
    const pulseRadius = radius + 3 + magnitude * 18 + wave * 8;
    const color = anomalyColor(row.anomaly, 1);

    ctx.strokeStyle = anomalyColor(row.anomaly, 0.58);
    ctx.lineWidth = Math.max(1, 1 + magnitude * 3);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, pulseRadius, 0, Math.PI * 2);
    ctx.strokeStyle = anomalyColor(row.anomaly, 0.22 + wave * 0.34);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(endX, endY, radius + magnitude * 4, 0, Math.PI * 2);
    ctx.fillStyle = anomalyColor(row.anomaly, 0.78);
    ctx.fill();
    ctx.strokeStyle = station === state.selected ? "rgba(244,240,232,0.9)" : color;
    ctx.lineWidth = station === state.selected ? 2.2 : 0.8;
    ctx.stroke();

    if (station === state.selected || station === state.hovered) {
      ctx.beginPath();
      ctx.arc(endX, endY, pulseRadius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = station === state.selected ? "rgba(244,240,232,0.86)" : "rgba(244,240,232,0.58)";
      ctx.lineWidth = 1.3;
      ctx.stroke();
    }

    state.points.push({ station, x: endX, y: endY, r: pulseRadius + 5 });
  });

  drawPulseLabels(bounds);
  drawSelectedPulseCallout(bounds);
  ctx.restore();
}

function drawPulseLabels(bounds) {
  ctx.save();
  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = palette.ink;
  ctx.font = "760 28px system-ui, sans-serif";
  ctx.fillText(String(state.year), bounds.x + bounds.w - 78, bounds.y + 38);
  ctx.restore();
}

function drawSelectedPulseCallout(bounds) {
  const station = state.selected;
  const row = station.annualByYear.get(state.year);
  const point = project(station.longitude, station.latitude, bounds);
  const endY = row ? point.y + clamp(-row.anomaly * 0.16, -58, 58) : point.y;
  const label = row ? `${station.name} ${formatMm(row.anomaly)}` : `${station.name} no mean`;
  const x = Math.min(bounds.x + bounds.w - 190, point.x + 18);
  const y = Math.max(bounds.y + 20, endY - 22);

  ctx.save();
  ctx.fillStyle = "rgba(16,18,17,0.88)";
  ctx.strokeStyle = row ? anomalyColor(row.anomaly, 0.8) : missingColor(0.6);
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, 172, 42, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.fillText(truncate(label, 22), x + 10, y + 17);
  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillText(`${station.firstYear}-${station.lastYear}`, x + 10, y + 32);
  ctx.restore();
}

function drawStationRings(width, height) {
  const cx = width * 0.5;
  const cy = height * 0.48;
  const outer = Math.min(width, height) * 0.38;
  const inner = outer * 0.48;
  state.points = [];

  ctx.save();
  for (let i = 0; i < 7; i += 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, inner + ((outer - inner) * i) / 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(244,240,232,${0.08 + i * 0.015})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  drawOrbitAxes(cx, cy, inner, outer);

  state.stations.forEach((station) => {
    const angle = ((station.longitude + 180) / 360) * Math.PI * 2 - Math.PI / 2;
    const latPull = Math.abs(station.latitude) / 90;
    const radius = inner + (outer - inner) * latPull;
    const row = station.annualByYear.get(state.year);
    const activeRadius = row ? Math.max(-34, Math.min(34, row.anomaly * 0.12)) : 0;
    const x = cx + Math.cos(angle) * (radius + activeRadius);
    const y = cy + Math.sin(angle) * (radius + activeRadius);
    const dot = station === state.selected ? 7 : 3.4;

    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
    ctx.lineTo(x, y);
    ctx.strokeStyle = row ? anomalyColor(row.anomaly, station === state.selected ? 0.7 : 0.24) : missingColor(0.1);
    ctx.lineWidth = station === state.selected ? 1.8 : 0.8;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(x, y, dot, 0, Math.PI * 2);
    ctx.fillStyle = row ? anomalyColor(row.anomaly, station === state.selected ? 1 : 0.7) : missingColor(0.18);
    ctx.fill();
    if (station === state.selected) {
      ctx.strokeStyle = trendColor(station.trendMmYr ?? 0, 0.95);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    state.points.push({ station, x, y, r: dot + 8 });
  });

  ctx.textAlign = "center";
  ctx.fillStyle = palette.ink;
  ctx.font = "760 26px system-ui, sans-serif";
  ctx.fillText(String(state.year), cx, cy - 4);
  ctx.fillStyle = palette.muted;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText(`${state.data.stationCount} gauges`, cx, cy + 18);
  ctx.restore();
}

function drawOrbitAxes(cx, cy, inner, outer) {
  ctx.save();
  ctx.strokeStyle = "rgba(244,240,232,0.42)";
  ctx.fillStyle = palette.muted;
  ctx.lineWidth = 1;
  ctx.font = "12px system-ui, sans-serif";

  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + outer, cy);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  [
    { radius: inner, label: "0° lat" },
    { radius: inner + (outer - inner) / 2, label: "45° lat" },
    { radius: outer, label: "90° lat" },
  ].forEach((tick) => {
    const x = cx + tick.radius;
    ctx.beginPath();
    ctx.moveTo(x, cy - 4);
    ctx.lineTo(x, cy + 4);
    ctx.stroke();
    ctx.fillText(tick.label, x + 6, cy - 10);
  });

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("180°", cx, cy - outer - 16);
  ctx.fillText("0°", cx, cy + outer + 16);
  ctx.textAlign = "left";
  ctx.fillText("90°W", cx + outer + 14, cy);
  ctx.textAlign = "right";
  ctx.fillText("90°E", cx - outer - 14, cy);

  ctx.fillStyle = palette.ink;
  ctx.font = "700 13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("Longitude orbit", cx, cy + outer + 36);

  ctx.save();
  ctx.translate(cx + outer * 0.72, cy - (outer - inner) / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText("Latitude radius", 0, 0);
  ctx.restore();
  ctx.restore();
}

function drawComposite(width, height) {
  const rows = state.data.composite.annual.filter((row) => row.anomaly !== null);
  if (!rows.length) return;

  const pad = 28;
  const h = 56;
  const y = height - h - 22;
  const plot = { x: pad + 48, y: y + 8, w: width - pad * 2 - 62, h: h - 22 };
  const minYear = state.data.composite.firstYear;
  const maxYear = state.data.composite.lastYear;
  const anomalies = rows.map((row) => row.anomaly);
  const min = Math.min(...anomalies);
  const max = Math.max(...anomalies);

  ctx.save();
  ctx.fillStyle = "rgba(16,18,17,0.6)";
  roundRect(ctx, pad, y, width - pad * 2, h, 8);
  ctx.fill();

  ctx.strokeStyle = "rgba(244,240,232,0.38)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(plot.x, plot.y);
  ctx.lineTo(plot.x, plot.y + plot.h);
  ctx.lineTo(plot.x + plot.w, plot.y + plot.h);
  ctx.stroke();

  ctx.beginPath();
  rows.forEach((row, index) => {
    const x = plot.x + ((row.year - minYear) / (maxYear - minYear)) * plot.w;
    const yy = plot.y + plot.h - ((row.anomaly - min) / Math.max(1, max - min)) * plot.h;
    if (index === 0) ctx.moveTo(x, yy);
    else ctx.lineTo(x, yy);
  });
  ctx.strokeStyle = "rgba(93,216,193,0.84)";
  ctx.lineWidth = 2;
  ctx.stroke();

  const yearX = plot.x + ((state.year - minYear) / (maxYear - minYear)) * plot.w;
  ctx.strokeStyle = "rgba(232,191,84,0.86)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(yearX, plot.y);
  ctx.lineTo(yearX, plot.y + plot.h);
  ctx.stroke();

  ctx.fillStyle = palette.muted;
  ctx.font = "12px system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText(`${Math.round(max)} mm`, plot.x - 6, plot.y);
  ctx.fillText(`${Math.round(min)} mm`, plot.x - 6, plot.y + plot.h);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("Composite anomaly", pad + 10, y + 18);
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(String(minYear), plot.x, plot.y + plot.h + 5);
  ctx.fillText(String(maxYear), plot.x + plot.w, plot.y + plot.h + 5);
  ctx.fillStyle = palette.amber;
  ctx.fillText(String(state.year), yearX, plot.y + plot.h + 5);
  ctx.restore();
}

function drawRing() {
  if (!state.selected) return;
  const { width, height } = ringCanvas.getBoundingClientRect();
  ringCtx.clearRect(0, 0, width, height);
  ringCtx.fillStyle = "rgba(0,0,0,0.12)";
  ringCtx.fillRect(0, 0, width, height);

  const station = state.selected;
  const cx = width * 0.5;
  const cy = height * 0.52;
  const base = Math.min(width, height) * 0.28;
  const maxAbs = Math.max(40, ...station.annual.map((row) => Math.abs(row.anomaly)));
  const scale = base * 0.52;

  ringCtx.save();
  ringCtx.fillStyle = palette.muted;
  ringCtx.font = "12px system-ui, sans-serif";
  ringCtx.textAlign = "center";
  ringCtx.textBaseline = "top";
  ringCtx.fillText("Annual anomaly (mm)", cx, 12);

  for (let i = 1; i <= 4; i += 1) {
    ringCtx.beginPath();
    ringCtx.arc(cx, cy, base + (scale * i) / 4, 0, Math.PI * 2);
    ringCtx.strokeStyle = "rgba(244,240,232,0.1)";
    ringCtx.lineWidth = 1;
    ringCtx.stroke();
  }

  ringCtx.strokeStyle = "rgba(244,240,232,0.34)";
  ringCtx.lineWidth = 1;
  ringCtx.beginPath();
  ringCtx.arc(cx, cy, base, 0, Math.PI * 2);
  ringCtx.stroke();
  ringCtx.textAlign = "left";
  ringCtx.textBaseline = "middle";
  ringCtx.fillText("0", cx + base + 6, cy);
  ringCtx.fillText(`+${Math.round(maxAbs)}`, cx + base + scale + 6, cy);
  ringCtx.textAlign = "right";
  ringCtx.fillText(`-${Math.round(maxAbs)}`, cx + base - scale - 6, cy);

  ringCtx.beginPath();
  station.annual.forEach((row, index) => {
    const angle = (index / station.annual.length) * Math.PI * 2 - Math.PI / 2;
    const radius = base + (row.anomaly / maxAbs) * scale;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (index === 0) ringCtx.moveTo(x, y);
    else ringCtx.lineTo(x, y);
  });
  ringCtx.closePath();
  ringCtx.strokeStyle = palette.reef;
  ringCtx.lineWidth = 2;
  ringCtx.stroke();

  station.annual.forEach((row, index) => {
    const angle = (index / station.annual.length) * Math.PI * 2 - Math.PI / 2;
    const radius = base + (row.anomaly / maxAbs) * scale;
    ringCtx.beginPath();
    ringCtx.moveTo(cx + Math.cos(angle) * base, cy + Math.sin(angle) * base);
    ringCtx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ringCtx.strokeStyle = anomalyColor(row.anomaly, row.year === state.year ? 0.95 : 0.24);
    ringCtx.lineWidth = row.year === state.year ? 2.4 : 1;
    ringCtx.stroke();
  });

  const current = station.annualByYear.get(state.year);
  ringCtx.textAlign = "center";
  ringCtx.fillStyle = palette.ink;
  ringCtx.font = "760 20px system-ui, sans-serif";
  ringCtx.fillText(current ? formatMm(current.anomaly) : "no mean", cx, cy - 3);
  ringCtx.fillStyle = palette.muted;
  ringCtx.font = "12px system-ui, sans-serif";
  ringCtx.fillText(`${station.firstYear}-${station.lastYear}`, cx, cy + 17);
  ringCtx.restore();
}

function handlePointerMove(event) {
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  let nearest = null;
  let nearestDistance = Infinity;

  for (const point of state.points) {
    const distance = Math.hypot(point.x - x, point.y - y);
    if (distance < point.r && distance < nearestDistance) {
      nearest = point.station;
      nearestDistance = distance;
    }
  }

  state.hovered = nearest;
  if (!nearest) {
    tooltip.hidden = true;
    return;
  }

  const row = nearest.annualByYear.get(state.year);
  const volatilityLine =
    state.mode === "scatter" && Number.isFinite(nearest.volatilityMm)
      ? `<br><span>${Math.round(nearest.volatilityMm)} mm year-to-year variability</span>`
      : "";
  tooltip.hidden = false;
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
  tooltip.innerHTML = `
    <strong>${escapeHtml(nearest.name)}</strong>
    <span>${escapeHtml(nearest.country)}</span><br>
    <span>${state.year}: ${row ? formatMm(row.anomaly) : "no annual mean"}</span><br>
    <span>${formatTrend(nearest.trendMmYr)} · ${nearest.validYears} years</span>${volatilityLine}
  `;
}

function mapBounds(width, height) {
  const padX = width < 700 ? Math.max(54, width * 0.15) : Math.max(76, width * 0.075);
  const panelClearance = width > 980 ? 20 : 0;
  const w = width - padX * 2 - panelClearance;
  const h = Math.min(height * (width < 700 ? 0.5 : 0.58), w * 0.52);
  return { x: padX, y: Math.max(width < 700 ? 24 : 34, (height - h) * 0.22), w, h };
}

function project(lon, lat, bounds) {
  const lambda = (lon * Math.PI) / 180;
  const phi = (lat * Math.PI) / 180;
  const xNorm = (3 * lambda * Math.sqrt(Math.max(0, Math.PI * Math.PI / 3 - phi * phi))) / (2 * Math.PI);
  const yNorm = phi;
  return {
    x: bounds.x + bounds.w * (0.5 + xNorm / 5.55),
    y: bounds.y + bounds.h * (0.5 - yNorm / 2.9),
  };
}

function anomalyColor(value, alpha = 1) {
  if (value == null || !Number.isFinite(value)) return missingColor(alpha);
  const clipped = Math.max(ANOMALY_STOPS[0].value, Math.min(ANOMALY_STOPS.at(-1).value, value));

  for (let i = 0; i < ANOMALY_STOPS.length - 1; i += 1) {
    const left = ANOMALY_STOPS[i];
    const right = ANOMALY_STOPS[i + 1];
    if (clipped >= left.value && clipped <= right.value) {
      const t = (clipped - left.value) / (right.value - left.value);
      return mixRgba(left.rgb, right.rgb, t, alpha);
    }
  }

  return rgba(ANOMALY_STOPS.at(-1).rgb, alpha);
}

function trendColor(value, alpha = 1) {
  if (value == null || !Number.isFinite(value)) return missingColor(alpha);
  const t = Math.min(1, Math.abs(value) / TREND_LIMIT_MM_YEAR);
  return value >= 0
    ? mixRgba([242, 184, 75], [217, 75, 61], t, alpha)
    : mixRgba([87, 183, 215], [43, 108, 176], t, alpha);
}

function mixRgba(a, b, t, alpha) {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bb = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgba(${r},${g},${bb},${alpha})`;
}

function rgba(rgb, alpha) {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

function missingColor(alpha = 1) {
  return `rgba(142,145,139,${alpha})`;
}

function formatMm(value) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${Math.round(value)} mm`;
}

function formatTrend(value) {
  if (value == null || !Number.isFinite(value)) return "n/a";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} mm/yr`;
}

function formatSigned(value, decimals = 0) {
  if (!Number.isFinite(value)) return "n/a";
  const rounded = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  return value > 0 ? `+${rounded}` : rounded;
}

function formatLon(value) {
  if (value === 0) return "0°";
  if (Math.abs(value) === 180) return "180°";
  return `${Math.abs(value)}°${value < 0 ? "W" : "E"}`;
}

function formatLat(value) {
  if (value === 0) return "0°";
  return `${Math.abs(value)}°${value < 0 ? "S" : "N"}`;
}

function truncate(value, limit) {
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return replacements[char];
  });
}

function standardDeviation(values) {
  const finite = values.filter(Number.isFinite);
  if (finite.length < 2) return null;
  const mean = finite.reduce((sum, value) => sum + value, 0) / finite.length;
  const variance = finite.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (finite.length - 1);
  return Math.sqrt(variance);
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}
