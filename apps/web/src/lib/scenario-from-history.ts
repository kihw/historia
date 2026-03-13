/**
 * Generate a Historia scenario from historical GeoJSON data.
 * Takes country boundaries from a given era and converts them into
 * provinces and nations for the game engine.
 */

import type {
  Province,
  Nation,
  Scenario,
  TerrainType,
  GeoJSONCollection,
  GeoJSONFeature,
} from "@historia/shared";
import { loadHistoricalGeoJSON, getYearLabel } from "./historical-data";

// Government type mapping based on era
function governmentForEra(year: number): Nation["government"] {
  if (year < 0) return "tribal";
  if (year < 500) return "tribal";
  if (year < 1500) return "feudal_monarchy";
  if (year < 1789) return "absolute_monarchy";
  if (year < 1900) return "constitutional_monarchy";
  return "republic";
}

// Determine era from year
function eraFromYear(year: number): Scenario["meta"]["era"] {
  if (year < -500) return "ancient";
  if (year < 500) return "ancient";
  if (year < 1453) return "medieval";
  if (year < 1789) return "early_modern";
  if (year < 1914) return "industrial";
  if (year < 1991) return "modern";
  return "contemporary";
}

// Determine terrain from latitude
function terrainFromLatitude(lat: number): TerrainType {
  const absLat = Math.abs(lat);
  if (absLat > 66) return "arctic";
  if (absLat > 55) return "forest";
  if (absLat > 35) return "plains";
  if (absLat > 23) return "desert";
  return "jungle";
}

// Compute centroid of polygon rings
function computeCentroid(coords: number[][][]): [number, number] {
  let cx = 0, cy = 0, count = 0;
  for (const ring of coords) {
    for (const coord of ring) {
      cx += coord[0];
      cy += coord[1];
      count++;
    }
  }
  return count > 0 ? [cx / count, cy / count] : [0, 0];
}

// Compute bounding box of all features
function computeBounds(features: GeoJSONFeature[]): {
  north: number;
  south: number;
  west: number;
  east: number;
} {
  let north = -90, south = 90, west = 180, east = -180;
  for (const f of features) {
    const coords =
      f.geometry.type === "MultiPolygon"
        ? (f.geometry.coordinates as number[][][][]).flat()
        : (f.geometry.coordinates as number[][][]);
    for (const ring of coords) {
      for (const [lon, lat] of ring) {
        if (lat > north) north = lat;
        if (lat < south) south = lat;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
      }
    }
  }
  return { north, south, west, east };
}

// Deterministic color
function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  const sat = 45 + (Math.abs(hash >> 8) % 25);
  const light = 40 + (Math.abs(hash >> 16) % 20);
  return `hsl(${hue}, ${sat}%, ${light}%)`;
}

/**
 * Generate a Scenario from a historical era's GeoJSON data.
 * Each country becomes both a nation and a province (with the main polygon).
 */
export async function generateScenarioFromEra(
  year: number,
  options?: {
    /** Only include countries in this bounding box */
    regionBounds?: { north: number; south: number; west: number; east: number };
    /** Max number of countries/provinces to include */
    maxCountries?: number;
  }
): Promise<Scenario> {
  const geojson = await loadHistoricalGeoJSON(year);
  return generateScenarioFromGeoJSON(geojson, year, options);
}

export function generateScenarioFromGeoJSON(
  geojson: GeoJSONCollection,
  year: number,
  options?: {
    regionBounds?: { north: number; south: number; west: number; east: number };
    maxCountries?: number;
  }
): Scenario {
  let features = geojson.features;

  // Filter by region if specified
  if (options?.regionBounds) {
    const b = options.regionBounds;
    features = features.filter((f) => {
      const coords =
        f.geometry.type === "MultiPolygon"
          ? (f.geometry.coordinates as number[][][][]).flat()
          : (f.geometry.coordinates as number[][][]);
      const centroid = computeCentroid(coords);
      return (
        centroid[1] >= b.south &&
        centroid[1] <= b.north &&
        centroid[0] >= b.west &&
        centroid[0] <= b.east
      );
    });
  }

  // Limit number of countries
  if (options?.maxCountries && features.length > options.maxCountries) {
    features = features.slice(0, options.maxCountries);
  }

  const bounds = computeBounds(features);
  const provinces: Province[] = [];
  const nations: Nation[] = [];
  const govt = governmentForEra(year);

  for (const feature of features) {
    const name =
      feature.properties.NAME ||
      feature.properties.ADMIN ||
      feature.properties.SOVEREIGNT ||
      "Unknown";
    const id = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    if (!id) continue;

    // Get the main (largest) polygon
    const allRings =
      feature.geometry.type === "MultiPolygon"
        ? (feature.geometry.coordinates as number[][][][])
        : [feature.geometry.coordinates as number[][][]];

    // Use the largest polygon ring as the province shape
    let largestRing: number[][] = [];
    let largestSize = 0;
    for (const polygon of allRings) {
      if (polygon[0] && polygon[0].length > largestSize) {
        largestSize = polygon[0].length;
        largestRing = polygon[0];
      }
    }

    if (largestRing.length < 3) continue;

    const center = computeCentroid([largestRing]);
    const terrain = terrainFromLatitude(center[1]);
    const color = colorFromName(name);

    // Simplify polygon if too many points (keep max 100 points per province)
    const simplified =
      largestRing.length > 100
        ? simplifyPolygon(largestRing, 100)
        : largestRing;

    const province: Province = {
      id: `prov_${id}`,
      name: id,
      displayName: name,
      terrain,
      isCoastal: false, // Could be computed but skipped for simplicity
      polygon: simplified.map(([lon, lat]) => [lon, lat] as [number, number]),
      center: center as [number, number],
      neighbors: [],
      baseTax: 5,
      baseProduction: 4,
      baseManpower: 3,
      hasPort: false,
      fortLevel: 1,
      resources: [],
      buildings: [],
      isCapital: true,
      owner: id,
      controller: id,
    };

    provinces.push(province);

    const nation: Nation = {
      id,
      name,
      tag: id.substring(0, 3).toUpperCase(),
      color,
      government: govt,
      ruler: {
        name: `Ruler of ${name}`,
        adminSkill: 3,
        diplomacySkill: 3,
        militarySkill: 3,
        age: 40,
        traits: [],
      },
      capital: province.id,
      provinces: [province.id],
      economy: {
        treasury: 100,
        taxRate: 0.1,
        inflation: 0.02,
        tradePower: 30,
        monthlyIncome: 15,
        monthlyExpenses: 10,
      },
      military: {
        armies: [],
        manpower: 10000,
        maxManpower: 20000,
        forceLimit: 15000,
        militaryTechnology: 1,
      },
      diplomacy: {
        relations: {},
        alliances: [],
        rivals: [],
        truces: {},
        royalMarriages: [],
      },
      population: {
        total: 1000000,
        growthRate: 0.003,
        stability: 50,
        warExhaustion: 0,
        culture: id,
        religion: "unknown",
      },
      playable: true,
    };

    nations.push(nation);
  }

  // Compute neighbors based on proximity
  for (let i = 0; i < provinces.length; i++) {
    for (let j = i + 1; j < provinces.length; j++) {
      const dist = Math.sqrt(
        (provinces[i].center[0] - provinces[j].center[0]) ** 2 +
        (provinces[i].center[1] - provinces[j].center[1]) ** 2
      );
      // Consider neighbors if centroids are within ~5 degrees
      if (dist < 5) {
        provinces[i].neighbors.push(provinces[j].id);
        provinces[j].neighbors.push(provinces[i].id);
      }
    }
  }

  return {
    meta: {
      id: `world-${year}`,
      name: `World ${getYearLabel(year)}`,
      version: "1.0.0",
      author: "Auto-generated",
      description: `Scenario auto-generated from historical data for ${getYearLabel(year)}.`,
      era: eraFromYear(year),
      startDate: { year: Math.max(1, year), month: 1 },
      tags: ["historical", "world", "auto-generated"],
      difficultySuggestion: "normal",
      recommendedPlayers: { min: 1, max: 8 },
    },
    config: {
      determinism: {
        simulationIntensity: 0.7,
        historicalConstraint: 0.8,
        fantasyFreedom: 0.1,
      },
      turnDuration: {
        default: "1_year",
        options: ["1_month", "3_months", "1_year"],
      },
      victoryConditions: [
        {
          type: "domination",
          description: "Control 30% of the world",
          threshold: 0.3,
        },
      ],
    },
    map: {
      type: "province",
      projection: "equirectangular",
      bounds,
      terrainTypes: [
        "plains",
        "hills",
        "mountains",
        "forest",
        "desert",
        "marsh",
        "coastal",
        "arctic",
        "jungle",
      ],
      provinces,
    },
    nations,
    events: { causalGraph: { nodes: [], edges: [] } },
    narrative: {
      introduction: `The world in ${getYearLabel(year)}. Nations rise and fall as history unfolds.`,
      style: "historical_chronicle",
      tone: "formal",
      vocabularyEra: eraFromYear(year) === "ancient" ? "ancient" : eraFromYear(year) === "medieval" ? "medieval" : "modern",
    },
  };
}

/** Simple polygon simplification by keeping every Nth point */
function simplifyPolygon(ring: number[][], targetCount: number): number[][] {
  if (ring.length <= targetCount) return ring;
  const step = ring.length / targetCount;
  const result: number[][] = [];
  for (let i = 0; i < targetCount; i++) {
    result.push(ring[Math.floor(i * step)]);
  }
  // Ensure closed polygon
  if (
    result[0][0] !== result[result.length - 1][0] ||
    result[0][1] !== result[result.length - 1][1]
  ) {
    result.push(result[0]);
  }
  return result;
}
