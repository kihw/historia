/**
 * Download and simplify historical GeoJSON maps from aourednik/historical-basemaps.
 * Outputs simplified GeoJSON files to data/geo/ for embedding in the project.
 *
 * Usage: npx tsx tools/geo/download-historical-maps.ts
 */

import { writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve } from "path";

const BASE_URL =
  "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson";

const MODERN_WORLD_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

// Years to download for our scenarios
const YEARS_TO_DOWNLOAD = [
  { year: 1400, filename: "world_1400.geojson", scenario: "europe-1444" },
  { year: 1938, filename: "world_1938.geojson", scenario: "ww2-1939" },
  { year: 1960, filename: "world_1960.geojson", scenario: "cold-war-1962" },
];

const OUTPUT_DIR = resolve(__dirname, "../../data/geo");

interface GeoJSONFeature {
  type: "Feature";
  properties: Record<string, unknown>;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

/**
 * Douglas-Peucker line simplification algorithm.
 */
function perpendicularDistance(
  point: number[],
  lineStart: number[],
  lineEnd: number[]
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const mag = Math.sqrt(dx * dx + dy * dy);
  if (mag === 0) {
    return Math.sqrt(
      (point[0] - lineStart[0]) ** 2 + (point[1] - lineStart[1]) ** 2
    );
  }
  const u =
    ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) /
    (mag * mag);
  const closestX = lineStart[0] + u * dx;
  const closestY = lineStart[1] + u * dy;
  return Math.sqrt((point[0] - closestX) ** 2 + (point[1] - closestY) ** 2);
}

function douglasPeucker(points: number[][], epsilon: number): number[][] {
  if (points.length <= 2) return points;

  let maxDist = 0;
  let maxIdx = 0;
  const end = points.length - 1;

  for (let i = 1; i < end; i++) {
    const dist = perpendicularDistance(points[i], points[0], points[end]);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }

  return [points[0], points[end]];
}

/**
 * Simplify a polygon ring using Douglas-Peucker.
 * Ensures the ring stays closed and has at least 4 points.
 */
function simplifyRing(ring: number[][], epsilon: number): number[][] {
  if (ring.length <= 4) return ring;

  const simplified = douglasPeucker(ring, epsilon);

  // Ensure closed polygon (first == last)
  if (
    simplified.length > 0 &&
    (simplified[0][0] !== simplified[simplified.length - 1][0] ||
      simplified[0][1] !== simplified[simplified.length - 1][1])
  ) {
    simplified.push([...simplified[0]]);
  }

  // Minimum 4 points for a valid polygon (triangle + closing point)
  if (simplified.length < 4) return ring;

  return simplified;
}

/**
 * Round coordinates to N decimal places.
 */
function roundCoords(coords: number[], decimals: number): number[] {
  const factor = 10 ** decimals;
  return coords.map((c) => Math.round(c * factor) / factor);
}

/**
 * Simplify a GeoJSON feature's geometry.
 */
function simplifyFeature(
  feature: GeoJSONFeature,
  epsilon: number
): GeoJSONFeature {
  const { geometry } = feature;

  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    const simplified = rings
      .map((ring) => {
        const s = simplifyRing(ring, epsilon);
        return s.map((c) => roundCoords(c, 2));
      })
      .filter((ring) => ring.length >= 4);

    if (simplified.length === 0) return feature;

    return {
      ...feature,
      geometry: { type: "Polygon", coordinates: simplified },
    };
  }

  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    const simplified = polygons
      .map((polygon) =>
        polygon
          .map((ring) => {
            const s = simplifyRing(ring, epsilon);
            return s.map((c) => roundCoords(c, 2));
          })
          .filter((ring) => ring.length >= 4)
      )
      .filter((polygon) => polygon.length > 0);

    if (simplified.length === 0) return feature;

    // If only one polygon remains, convert to Polygon type
    if (simplified.length === 1) {
      return {
        ...feature,
        geometry: { type: "Polygon", coordinates: simplified[0] },
      };
    }

    return {
      ...feature,
      geometry: { type: "MultiPolygon", coordinates: simplified },
    };
  }

  return feature;
}

/**
 * Calculate polygon area (approximate, in square degrees).
 * Uses Shoelace formula.
 */
function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area / 2);
}

function featureArea(feature: GeoJSONFeature): number {
  const { geometry } = feature;
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as number[][][];
    return rings[0] ? ringArea(rings[0]) : 0;
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates as number[][][][];
    return polygons.reduce(
      (sum, poly) => sum + (poly[0] ? ringArea(poly[0]) : 0),
      0
    );
  }
  return 0;
}

/**
 * Filter out tiny features (islands, artifacts).
 */
function filterSmallFeatures(
  collection: GeoJSONCollection,
  minArea: number
): GeoJSONCollection {
  return {
    ...collection,
    features: collection.features.filter((f) => featureArea(f) > minArea),
  };
}

async function downloadAndSimplify(
  url: string,
  outputPath: string,
  epsilon: number,
  minArea: number
): Promise<void> {
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  const data: GeoJSONCollection = await res.json();

  console.log(`  Downloaded: ${data.features.length} features`);

  // Simplify all features
  const simplified: GeoJSONCollection = {
    type: "FeatureCollection",
    features: data.features.map((f) => simplifyFeature(f, epsilon)),
  };

  // Filter small features
  const filtered = filterSmallFeatures(simplified, minArea);
  console.log(
    `  After filtering: ${filtered.features.length} features (removed ${simplified.features.length - filtered.features.length} tiny features)`
  );

  // Count total coordinates
  let totalCoords = 0;
  for (const f of filtered.features) {
    if (f.geometry.type === "Polygon") {
      for (const ring of f.geometry.coordinates as number[][][]) {
        totalCoords += ring.length;
      }
    } else if (f.geometry.type === "MultiPolygon") {
      for (const poly of f.geometry.coordinates as number[][][][]) {
        for (const ring of poly) {
          totalCoords += ring.length;
        }
      }
    }
  }
  console.log(`  Total coordinate points: ${totalCoords}`);

  const json = JSON.stringify(filtered);
  writeFileSync(outputPath, json);
  const sizeMB = (json.length / (1024 * 1024)).toFixed(2);
  console.log(`  Written to ${outputPath} (${sizeMB} MB)`);
}

async function downloadCoastlines(): Promise<void> {
  console.log("\n--- Downloading coastlines (Natural Earth 110m) ---");
  const url = MODERN_WORLD_URL;
  console.log(`  Fetching ${url}...`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch coastlines: ${res.status}`);

  const topoData = await res.json();

  // Convert TopoJSON to GeoJSON manually (simplified extraction)
  // The world-atlas countries-110m has objects.countries and objects.land
  const { objects, arcs, transform } = topoData;

  // We need topojson-client to convert properly, but since this is a standalone script,
  // we'll save the raw TopoJSON and convert it at runtime in the app
  const outputPath = resolve(OUTPUT_DIR, "coastlines-110m.topojson");
  const json = JSON.stringify(topoData);
  writeFileSync(outputPath, json);
  const sizeMB = (json.length / (1024 * 1024)).toFixed(2);
  console.log(`  Written to ${outputPath} (${sizeMB} MB)`);
}

async function main() {
  console.log("=== Historia Historical Map Downloader ===\n");

  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
    console.log(`Created output directory: ${OUTPUT_DIR}`);
  }

  // Simplification parameters:
  // epsilon = tolerance in degrees (~0.1 degree = ~11km at equator)
  // minArea = minimum polygon area in square degrees to keep
  const EPSILON = 0.15; // ~17km tolerance - good balance of detail vs size
  const MIN_AREA = 0.5; // Filter very small islands/territories

  // Download historical maps
  for (const entry of YEARS_TO_DOWNLOAD) {
    console.log(
      `\n--- Downloading ${entry.filename} (for ${entry.scenario}) ---`
    );
    const url = `${BASE_URL}/${entry.filename}`;
    const outputPath = resolve(OUTPUT_DIR, entry.filename);
    await downloadAndSimplify(url, outputPath, EPSILON, MIN_AREA);
  }

  // Download coastlines
  await downloadCoastlines();

  console.log("\n=== Done! ===");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
