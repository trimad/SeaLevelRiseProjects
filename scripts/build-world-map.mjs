import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "static", "data", "world-land.json");

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function decodeTopology(topology) {
  const { scale, translate } = topology.transform;

  const arcs = topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx, dy]) => {
      x += dx;
      y += dy;
      return [round(x * scale[0] + translate[0]), round(y * scale[1] + translate[1])];
    });
  });

  function arcByIndex(index) {
    const reversed = index < 0;
    const arc = arcs[reversed ? ~index : index];
    return reversed ? [...arc].reverse() : arc;
  }

  const polygons = [];

  for (const geometry of topology.objects.land.geometries) {
    if (geometry.type !== "MultiPolygon") continue;

    for (const polygon of geometry.arcs) {
      const exterior = polygon[0];
      const points = [];

      for (const arcIndex of exterior) {
        const arc = arcByIndex(arcIndex);
        const stitched = points.length > 0 ? arc.slice(1) : arc;
        points.push(...stitched);
      }

      if (points.length >= 4) polygons.push(points);
    }
  }

  return polygons;
}

const response = await fetch(sourceUrl);
if (!response.ok) throw new Error(`Unable to download ${sourceUrl}: ${response.status}`);

const topology = await response.json();
const polygons = decodeTopology(topology);

fs.writeFileSync(
  outputPath,
  `${JSON.stringify({
    source: "world-atlas@2 land-110m, derived from Natural Earth 1:110m land polygons",
    sourceUrl,
    polygons,
  })}\n`,
);

console.log(`Wrote ${path.relative(root, outputPath)} with ${polygons.length} land polygons.`);

