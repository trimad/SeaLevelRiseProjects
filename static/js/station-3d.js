(() => {
  const container = document.querySelector("#station3dView");
  if (!container || typeof window.p5 !== "function") return;

  const state = {
    data: null,
    year: 2018,
    seaLevelScale: 0.48,
    landMotionScale: 0.18,
    componentMode: "combined",
  };

  function stationAnomalyAtYear(station, year) {
    const row = station.annual.find((entry) => entry.year === year);
    return Number.isFinite(row?.anomaly) ? row.anomaly : 0;
  }

  function inferredLandMotion(station, year) {
    const yearsSinceStart = year - station.firstYear;
    const trend = Number.isFinite(station.trendMmYr) ? station.trendMmYr : 0;
    // Placeholder until SONEL station velocities are imported: use a small fraction of
    // the relative tide-gauge trend as a visible land-motion proxy, clearly separated
    // by component controls so real GNSS velocities can replace it later.
    return -trend * yearsSinceStart;
  }

  function currentDisplacement(station) {
    const seaLevel = stationAnomalyAtYear(station, state.year) * state.seaLevelScale;
    const landMotion = inferredLandMotion(station, state.year) * state.landMotionScale;
    if (state.componentMode === "sea") return seaLevel;
    if (state.componentMode === "land") return landMotion;
    return seaLevel + landMotion;
  }

  function readSharedYear(data) {
    const fromInput = Number(document.querySelector("#yearRange")?.value);
    if (Number.isInteger(fromInput)) return Math.max(data.firstYear, Math.min(data.lastYear, fromInput));
    const fromUrl = Number(new URLSearchParams(window.location.search).get("year"));
    return Number.isInteger(fromUrl) ? Math.max(data.firstYear, Math.min(data.lastYear, fromUrl)) : data.lastYear;
  }

  function setupControls(data) {
    container.innerHTML = `
      <div class="station-3d-controls" aria-label="3D station movement controls">
        <label>3D year <input id="station3dYear" type="range" min="${data.firstYear}" max="${data.lastYear}" value="${state.year}"></label>
        <label>Scale <input id="station3dScale" type="range" min="0.1" max="1.5" step="0.1" value="${state.seaLevelScale}"></label>
        <label>Component
          <select id="station3dComponent">
            <option value="combined">sea + land proxy</option>
            <option value="sea">sea level only</option>
            <option value="land">land motion proxy</option>
          </select>
        </label>
      </div>
      <div id="station3dCanvas" class="station-3d-canvas" aria-label="p5.js 3D station movement globe"></div>
    `;

    const yearSlider = container.querySelector("#station3dYear");
    const scaleSlider = container.querySelector("#station3dScale");
    const componentSelect = container.querySelector("#station3dComponent");

    yearSlider.addEventListener("input", () => {
      state.year = Number(yearSlider.value);
    });
    scaleSlider.addEventListener("input", () => {
      state.seaLevelScale = Number(scaleSlider.value);
      state.landMotionScale = state.seaLevelScale * 0.375;
    });
    componentSelect.addEventListener("change", () => {
      state.componentMode = componentSelect.value;
    });
  }

  fetch("data/sea-level-atlas.json")
    .then((response) => {
      if (!response.ok) throw new Error(`3D data request failed: ${response.status}`);
      return response.json();
    })
    .then((data) => {
      state.data = data;
      state.year = readSharedYear(data);
      setupControls(data);
      createSketch();
    })
    .catch((error) => {
      container.textContent = error.message;
    });

  function createSketch() {
    const sketch = (p) => {
      let fontSize = 12;

      p.setup = () => {
        const bounds = container.getBoundingClientRect();
        const canvas = p.createCanvas(Math.max(320, bounds.width), Math.max(360, bounds.height), p.WEBGL);
        canvas.parent("station3dCanvas");
        p.pixelDensity(Math.min(window.devicePixelRatio || 1, 2));
      };

      p.windowResized = () => {
        const bounds = container.getBoundingClientRect();
        p.resizeCanvas(Math.max(320, bounds.width), Math.max(360, bounds.height));
      };

      p.draw = () => {
        const data = state.data;
        if (!data) return;
        p.background(12, 17, 19);
        p.orbitControl(1.2, 1.2, 0.05);
        p.rotateY(p.frameCount * 0.0015);
        p.noFill();
        p.stroke(93, 216, 193, 70);
        p.sphere(Math.min(p.width, p.height) * 0.28, 32, 18);

        const radius = Math.min(p.width, p.height) * 0.28;
        for (const station of data.stations) {
          const lat = p.radians(station.latitude);
          const lon = p.radians(station.longitude);
          const base = p.createVector(
            radius * Math.cos(lat) * Math.cos(lon),
            -radius * Math.sin(lat),
            radius * Math.cos(lat) * Math.sin(lon),
          );
          const normal = base.copy().normalize();
          const displacement = currentDisplacement(station);
          const tip = p5.Vector.add(base, normal.mult(displacement));
          const rising = displacement >= 0;
          p.stroke(rising ? 255 : 87, rising ? 111 : 183, rising ? 97 : 215, 150);
          p.line(base.x, base.y, base.z, tip.x, tip.y, tip.z);
          p.push();
          p.translate(tip.x, tip.y, tip.z);
          p.noStroke();
          p.fill(rising ? [255, 111, 97] : [87, 183, 215]);
          p.sphere(2.2, 6, 4);
          p.pop();
        }

        p.resetMatrix();
        p.fill(244, 240, 232);
        p.noStroke();
        p.textSize(fontSize);
        p.textAlign(p.LEFT, p.TOP);
        p.text(`p5.js 3D stations · ${state.year} · ${state.componentMode}`, -p.width / 2 + 16, -p.height / 2 + 16);
      };
    };

    new p5(sketch);
  }
})();
