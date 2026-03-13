/**
 * Generate Historia scenarios from historical GeoJSON data.
 * Each country in the GeoJSON becomes one province and one nation.
 *
 * Usage: npx tsx tools/geo/generate-scenario.ts
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const DATA_DIR = resolve(__dirname, "../../data/geo");
const OUTPUT_DIR = resolve(__dirname, "../../scenarios/templates");

// --- Types matching shared package ---

interface Province {
  id: string;
  name: string;
  displayName: string;
  terrain: string;
  isCoastal: boolean;
  polygon: [number, number][];
  multiPolygon?: [number, number][][][];
  center: [number, number];
  neighbors: string[];
  baseTax: number;
  baseProduction: number;
  baseManpower: number;
  hasPort: boolean;
  fortLevel: number;
  resources: string[];
  buildings: string[];
  isCapital: boolean;
  owner: string;
  controller: string;
}

interface Nation {
  id: string;
  name: string;
  tag: string;
  color: string;
  government: string;
  ruler: {
    name: string;
    adminSkill: number;
    diplomacySkill: number;
    militarySkill: number;
    age: number;
    traits: string[];
  };
  capital: string;
  provinces: string[];
  economy: {
    treasury: number;
    taxRate: number;
    inflation: number;
    tradePower: number;
    monthlyIncome: number;
    monthlyExpenses: number;
  };
  military: {
    armies: Array<{
      id: string;
      name: string;
      location: string;
      units: { infantry: number; cavalry: number; artillery: number };
      morale: number;
      supply: number;
    }>;
    manpower: number;
    maxManpower: number;
    forceLimit: number;
    militaryTechnology: number;
  };
  diplomacy: {
    relations: Record<string, number>;
    alliances: string[];
    rivals: string[];
    truces: Record<string, number>;
    royalMarriages: string[];
  };
  population: {
    total: number;
    growthRate: number;
    stability: number;
    warExhaustion: number;
    culture: string;
    religion: string;
  };
  aiPersonality?: {
    aggressiveness: number;
    diplomacyFocus: number;
    expansionDesire: number;
    historicalGoals: string[];
  };
  playable: boolean;
}

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

// --- Utility functions ---

function nameToId(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function nameToTag(name: string): string {
  // Common abbreviations
  const tags: Record<string, string> = {
    "United States": "USA",
    "United Kingdom": "GBR",
    USSR: "SOV",
    France: "FRA",
    Germany: "GER",
    Italy: "ITA",
    Japan: "JAP",
    China: "CHN",
    Spain: "SPA",
    Portugal: "POR",
    Brazil: "BRA",
    "Ottoman Empire": "OTT",
    "Byzantine Empire": "BYZ",
    "Holy Roman Empire": "HRE",
    "Poland-Lithuania": "POL",
    "Kalmar Union": "KAL",
    Castile: "CAS",
    "Aragón": "ARA",
    "Empire of Japan": "JAP",
    Canada: "CAN",
    Australia: "AUS",
    "British Raj": "RAJ",
    Mexico: "MEX",
    Argentina: "ARG",
    Turkey: "TUR",
    India: "IND",
    Egypt: "EGY",
    Iran: "IRN",
    "Saudi Arabia": "SAU",
    Cuba: "CUB",
    "East Germany": "DDR",
    "West Germany": "BRD",
    Czechoslovakia: "CZE",
    Yugoslavia: "YUG",
    Poland: "POL",
    Hungary: "HUN",
    Romania: "ROM",
    Bulgaria: "BUL",
    Greece: "GRE",
    Sweden: "SWE",
    Norway: "NOR",
    Denmark: "DEN",
    Finland: "FIN",
    Ireland: "IRL",
    Switzerland: "SWI",
    Netherlands: "NED",
    Belgium: "BEL",
    Austria: "AUT",
  };
  if (tags[name]) return tags[name];
  return name
    .replace(/[^A-Za-z]/g, "")
    .substring(0, 3)
    .toUpperCase();
}

function deterministicColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const r = 60 + (Math.abs(hash) % 140);
  const g = 60 + (Math.abs(hash >> 8) % 140);
  const b = 60 + (Math.abs(hash >> 16) % 140);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/** Compute centroid using signed area weighting (proper polygon centroid). */
function computeCentroid(rings: number[][][]): [number, number] {
  // Use the largest ring (exterior)
  let largestRing = rings[0];
  let largestLen = 0;
  for (const ring of rings) {
    if (ring.length > largestLen) {
      largestLen = ring.length;
      largestRing = ring;
    }
  }
  if (!largestRing || largestRing.length === 0) return [0, 0];

  let cx = 0,
    cy = 0,
    signedArea = 0;
  for (let i = 0; i < largestRing.length - 1; i++) {
    const x0 = largestRing[i][0],
      y0 = largestRing[i][1];
    const x1 = largestRing[i + 1][0],
      y1 = largestRing[i + 1][1];
    const a = x0 * y1 - x1 * y0;
    signedArea += a;
    cx += (x0 + x1) * a;
    cy += (y0 + y1) * a;
  }
  signedArea *= 0.5;
  if (Math.abs(signedArea) < 1e-10) {
    // Fallback to average
    let sx = 0,
      sy = 0;
    for (const c of largestRing) {
      sx += c[0];
      sy += c[1];
    }
    return [
      Math.round((sx / largestRing.length) * 100) / 100,
      Math.round((sy / largestRing.length) * 100) / 100,
    ];
  }
  cx /= 6 * signedArea;
  cy /= 6 * signedArea;
  return [Math.round(cx * 100) / 100, Math.round(cy * 100) / 100];
}

/** Calculate polygon area in square degrees (Shoelace formula). */
function ringArea(ring: number[][]): number {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    area += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(area / 2);
}

function featureArea(feature: GeoJSONFeature): number {
  if (feature.geometry.type === "Polygon") {
    const rings = feature.geometry.coordinates as number[][][];
    return rings[0] ? ringArea(rings[0]) : 0;
  }
  if (feature.geometry.type === "MultiPolygon") {
    const polygons = feature.geometry.coordinates as number[][][][];
    return polygons.reduce(
      (sum, poly) => sum + (poly[0] ? ringArea(poly[0]) : 0),
      0
    );
  }
  return 0;
}

/** Get all exterior rings of a feature. */
function getExteriorRings(
  feature: GeoJSONFeature
): number[][][] {
  if (feature.geometry.type === "Polygon") {
    return [feature.geometry.coordinates as number[][][]];
  }
  return feature.geometry.coordinates as number[][][][];
}

/** Get the largest exterior ring of a feature. */
function getLargestRing(feature: GeoJSONFeature): number[][] {
  const allPolygons = getExteriorRings(feature);
  let largest: number[][] = [];
  let maxArea = 0;
  for (const poly of allPolygons) {
    if (poly[0]) {
      const a = ringArea(poly[0]);
      if (a > maxArea) {
        maxArea = a;
        largest = poly[0];
      }
    }
  }
  return largest;
}

/** Determine terrain from latitude and approximate geography. */
function terrainFromLatitude(lat: number, isCoastal: boolean): string {
  const absLat = Math.abs(lat);
  if (absLat > 66) return "arctic";
  if (absLat > 55) return "forest";
  if (isCoastal && absLat < 40) return "coastal";
  if (absLat > 40) return "plains";
  if (absLat < 20 && absLat > 5) return "jungle";
  if (absLat >= 20 && absLat <= 35) return "desert";
  return "plains";
}

/** Check if polygons share a boundary (are neighbors). */
function areNeighbors(
  feat1: GeoJSONFeature,
  feat2: GeoJSONFeature,
  threshold: number = 0.5
): boolean {
  const rings1 = getAllExteriorRings(feat1);
  const rings2 = getAllExteriorRings(feat2);

  // Quick bounding box check
  const bb1 = boundingBox(rings1);
  const bb2 = boundingBox(rings2);
  const margin = threshold;
  if (
    bb1.maxX + margin < bb2.minX ||
    bb2.maxX + margin < bb1.minX ||
    bb1.maxY + margin < bb2.minY ||
    bb2.maxY + margin < bb1.minY
  ) {
    return false;
  }

  // Check if any points are within threshold distance
  for (const ring1 of rings1) {
    for (const ring2 of rings2) {
      for (const p1 of ring1) {
        for (const p2 of ring2) {
          const dx = p1[0] - p2[0];
          const dy = p1[1] - p2[1];
          if (dx * dx + dy * dy < threshold * threshold) {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function getAllExteriorRings(feature: GeoJSONFeature): number[][][] {
  if (feature.geometry.type === "Polygon") {
    return [(feature.geometry.coordinates as number[][][])[0] || []];
  }
  return (feature.geometry.coordinates as number[][][][]).map(
    (poly) => poly[0] || []
  );
}

function boundingBox(rings: number[][][]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return { minX, maxX, minY, maxY };
}

/** Determine if a country has coastal provinces. */
function isCoastalCountry(feature: GeoJSONFeature): boolean {
  // Simple heuristic: if the centroid is within ~5 degrees of ocean bounds
  // or if the country has multiple disconnected polygons (islands)
  if (feature.geometry.type === "MultiPolygon") {
    const polys = feature.geometry.coordinates as number[][][][];
    if (polys.length > 1) return true; // Has islands
  }

  // Check if bounding box touches known coastal areas
  const rings = getAllExteriorRings(feature);
  const bb = boundingBox(rings);

  // Very rough: if touches the edge of a continent
  // More accurate: most countries with coastline have their BB reach to within
  // a certain distance of major water bodies. For simplicity, we mark as coastal
  // if the country touches extreme longitudes or has multipolygon geometry.
  // In practice most countries are coastal except landlocked ones.
  // We'll use a whitelist of landlocked countries instead.
  return true; // Default to coastal, will be overridden for landlocked countries
}

// Known landlocked countries (all eras)
const LANDLOCKED = new Set([
  "afghanistan", "austria", "bhutan", "bolivia", "botswana",
  "burkina_faso", "burundi", "central_african_republic", "chad",
  "czechoslovakia", "east_germany", "ethiopia", "hungary",
  "kashmir_and_ladakh", "laos", "lesotho", "luxembourg",
  "malawi", "mali", "mongolia", "nepal", "niger", "paraguay",
  "rwanda", "swaziland", "switzerland", "tibet", "uganda",
  "zambia", "zimbabwe", "holy_roman_empire", "bohemia",
  "serbia", "moldova", "kosovo", "rwanda_belgium_",
  "poland_lithuania", "white_horde", "blue_horde",
  "chagatai_khanate", "great_khanate", "timurid_empire",
  "teutonic_knights", "west_germany",
]);

/** Get resources based on terrain and region. */
function getResources(
  terrain: string,
  lat: number,
  lon: number
): string[] {
  const resources: string[] = [];
  if (terrain === "plains" || terrain === "forest") resources.push("grain");
  if (terrain === "forest") resources.push("wood");
  if (terrain === "hills" || terrain === "mountains") resources.push("iron");
  if (terrain === "desert" && lat < 35 && lat > 15) resources.push("oil");
  if (terrain === "jungle") resources.push("spices");
  if (terrain === "coastal") resources.push("fish");
  if (terrain === "arctic") resources.push("fish");
  // Regional resources
  if (lon > 20 && lon < 50 && lat > 20 && lat < 40) resources.push("oil"); // Middle East
  if (lon > -10 && lon < 5 && lat > 35 && lat < 50) resources.push("wine"); // Southern Europe
  if (lon > 70 && lon < 130 && lat > 10 && lat < 30) resources.push("silk"); // South/East Asia
  return [...new Set(resources)].slice(0, 3);
}

/** Government type from era and region. */
function governmentForEra(year: number, name: string): string {
  const lname = name.toLowerCase();
  if (lname.includes("republic")) return "republic";
  if (lname.includes("caliphate") || lname.includes("sultanate"))
    return "theocracy";
  if (lname.includes("empire") || lname.includes("kingdom"))
    return year < 1789 ? "feudal_monarchy" : "absolute_monarchy";
  if (lname.includes("communist") || lname === "ussr" || lname === "china")
    return "communist_state";
  if (lname.includes("tribal") || lname.includes("hunter"))
    return "tribal";

  if (year < 500) return "tribal";
  if (year < 1500) return "feudal_monarchy";
  if (year < 1789) return "absolute_monarchy";
  if (year < 1900) return "constitutional_monarchy";
  return "republic";
}

function eraFromYear(year: number): string {
  if (year < 500) return "ancient";
  if (year < 1453) return "medieval";
  if (year < 1789) return "early_modern";
  if (year < 1914) return "industrial";
  if (year < 1991) return "modern";
  return "contemporary";
}

// --- Main scenario generation ---

interface ScenarioConfig {
  geoFile: string;
  year: number;
  id: string;
  name: string;
  description: string;
  era: string;
  startDate: { year: number; month: number };
  difficulty: string;
  determinism: {
    simulationIntensity: number;
    historicalConstraint: number;
    fantasyFreedom: number;
  };
  /** Initial viewport focus (does NOT filter countries, only sets initial camera position) */
  viewportFocus?: {
    north: number;
    south: number;
    west: number;
    east: number;
  };
  victoryConditions: Array<{
    type: string;
    description: string;
    endDate?: { year: number; month: number };
    threshold?: number;
  }>;
  narrativeStyle: string;
  narrativeTone: string;
  introduction: string;
  /** Override nation data (colors, rulers, etc.) */
  nationOverrides?: Record<
    string,
    Partial<{
      color: string;
      government: string;
      ruler: Nation["ruler"];
      economy: Partial<Nation["economy"]>;
      military: Partial<Nation["military"]>;
      population: Partial<Nation["population"]>;
      aiPersonality: Nation["aiPersonality"];
    }>
  >;
  /** Custom events for the causal graph */
  events?: {
    causalGraph: {
      nodes: unknown[];
      edges: unknown[];
    };
  };
  /** Exclude features matching these names */
  excludeNames?: string[];
  /** Only include features matching these names (if set) */
  includeNames?: string[];
}

function generateScenario(config: ScenarioConfig): unknown {
  const geoPath = resolve(DATA_DIR, config.geoFile);
  const geojson: GeoJSONCollection = JSON.parse(
    readFileSync(geoPath, "utf8")
  );

  let features = geojson.features.filter(
    (f) => f.properties.NAME && f.properties.NAME !== ""
  );

  // Name filters
  if (config.excludeNames) {
    const excluded = new Set(config.excludeNames.map((n) => n.toLowerCase()));
    features = features.filter(
      (f) =>
        !excluded.has((f.properties.NAME as string).toLowerCase())
    );
  }
  if (config.includeNames) {
    const included = new Set(config.includeNames.map((n) => n.toLowerCase()));
    features = features.filter((f) =>
      included.has((f.properties.NAME as string).toLowerCase())
    );
  }

  // Remove duplicates (same NAME)
  const seen = new Set<string>();
  features = features.filter((f) => {
    const name = f.properties.NAME as string;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });

  console.log(`  Processing ${features.length} features...`);

  // Build provinces and nations
  const provinces: Province[] = [];
  const nations: Nation[] = [];

  for (const feature of features) {
    const name = feature.properties.NAME as string;
    const id = nameToId(name);
    if (!id) continue;

    const provId = `prov_${id}`;
    const area = featureArea(feature);

    // Get geometry
    const allPolygons = getExteriorRings(feature);
    const largestRing = getLargestRing(feature);
    const center = computeCentroid(
      allPolygons.map((p) => p[0] || [])
    );

    // Check if MultiPolygon
    const isMulti =
      feature.geometry.type === "MultiPolygon" &&
      (feature.geometry.coordinates as number[][][][]).length > 1;

    const isCoastal = !LANDLOCKED.has(id);
    const terrain = terrainFromLatitude(center[1], isCoastal);
    const resources = getResources(terrain, center[1], center[0]);

    // Scale stats by area (log scale to avoid extremes)
    const areaFactor = Math.max(1, Math.log2(area + 1));
    const baseTax = Math.round(Math.max(2, areaFactor * 2));
    const baseProd = Math.round(Math.max(1, areaFactor * 1.5));
    const baseMP = Math.round(Math.max(1, areaFactor * 1.2));

    // Build province
    const province: Province = {
      id: provId,
      name: id,
      displayName: name,
      terrain,
      isCoastal,
      polygon: largestRing.map(
        (c) => [c[0], c[1]] as [number, number]
      ),
      center,
      neighbors: [], // filled later
      baseTax,
      baseProduction: baseProd,
      baseManpower: baseMP,
      hasPort: isCoastal,
      fortLevel: area > 50 ? 2 : 1,
      resources,
      buildings: baseTax >= 5 ? ["marketplace"] : [],
      isCapital: true,
      owner: id,
      controller: id,
    };

    if (isMulti) {
      province.multiPolygon = (
        feature.geometry.coordinates as number[][][][]
      ).map((poly) =>
        poly.map((ring) =>
          ring.map((c) => [c[0], c[1]] as [number, number])
        )
      );
    }

    provinces.push(province);

    // Build nation
    const govt = governmentForEra(config.year, name);
    const overrides = config.nationOverrides?.[name] || {};

    const populationBase = Math.round(
      Math.max(100000, area * 50000)
    );

    const nation: Nation = {
      id,
      name,
      tag: nameToTag(name),
      color: overrides.color || deterministicColor(name),
      government: overrides.government || govt,
      ruler: overrides.ruler || {
        name: `Ruler of ${name}`,
        adminSkill: 3 + Math.floor(Math.random() * 4),
        diplomacySkill: 3 + Math.floor(Math.random() * 4),
        militarySkill: 3 + Math.floor(Math.random() * 4),
        age: 30 + Math.floor(Math.random() * 30),
        traits: [],
      },
      capital: provId,
      provinces: [provId],
      economy: {
        treasury: Math.round(50 + area * 5),
        taxRate: 0.1,
        inflation: 0.02,
        tradePower: Math.round(20 + area * 2),
        monthlyIncome: Math.round(10 + baseTax * 2),
        monthlyExpenses: Math.round(8 + baseTax * 1.5),
        ...overrides.economy,
      },
      military: {
        armies: [
          {
            id: `${id}_army_1`,
            name: `Army of ${name}`,
            location: provId,
            units: {
              infantry: Math.round(1000 + area * 200),
              cavalry: Math.round(200 + area * 50),
              artillery: Math.round(50 + area * 20),
            },
            morale: 0.7,
            supply: 0.8,
          },
        ],
        manpower: Math.round(populationBase * 0.01),
        maxManpower: Math.round(populationBase * 0.02),
        forceLimit: Math.round(5000 + area * 500),
        militaryTechnology: 1,
        ...overrides.military,
      },
      diplomacy: {
        relations: {},
        alliances: [],
        rivals: [],
        truces: {},
        royalMarriages: [],
      },
      population: {
        total: populationBase,
        growthRate: 0.003,
        stability: 50,
        warExhaustion: 0,
        culture: id,
        religion: "unknown",
        ...overrides.population,
      },
      aiPersonality: overrides.aiPersonality,
      playable: true,
    };

    nations.push(nation);
  }

  // Compute neighbors
  console.log(`  Computing neighbors for ${features.length} features...`);
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      if (areNeighbors(features[i], features[j], 0.8)) {
        const idI = nameToId(features[i].properties.NAME as string);
        const idJ = nameToId(features[j].properties.NAME as string);
        const provI = provinces.find((p) => p.name === idI);
        const provJ = provinces.find((p) => p.name === idJ);
        if (provI && provJ) {
          if (!provI.neighbors.includes(provJ.id)) {
            provI.neighbors.push(provJ.id);
          }
          if (!provJ.neighbors.includes(provI.id)) {
            provJ.neighbors.push(provI.id);
          }
        }
      }
    }
  }

  // Log neighbor stats
  const noNeighbors = provinces.filter((p) => p.neighbors.length === 0);
  if (noNeighbors.length > 0) {
    console.log(
      `  Warning: ${noNeighbors.length} provinces have no neighbors: ${noNeighbors.map((p) => p.displayName).join(", ")}`
    );
  }

  // Compute map bounds (viewport focus or full world)
  let north: number, south: number, west: number, east: number;
  if (config.viewportFocus) {
    // Use the viewport focus for the initial camera position
    north = config.viewportFocus.north;
    south = config.viewportFocus.south;
    west = config.viewportFocus.west;
    east = config.viewportFocus.east;
  } else {
    // Default: compute from all provinces
    north = -90;
    south = 90;
    west = 180;
    east = -180;
    for (const p of provinces) {
      for (const [lon, lat] of p.polygon) {
        if (lat > north) north = lat;
        if (lat < south) south = lat;
        if (lon < west) west = lon;
        if (lon > east) east = lon;
      }
    }
    // Add padding
    north = Math.min(90, north + 2);
    south = Math.max(-90, south - 2);
    west = Math.max(-180, west - 2);
    east = Math.min(180, east + 2);
  }

  return {
    meta: {
      id: config.id,
      name: config.name,
      version: "2.0.0",
      author: "Historia",
      description: config.description,
      era: config.era,
      startDate: config.startDate,
      tags: ["historical", "realistic"],
      difficultySuggestion: config.difficulty,
      recommendedPlayers: { min: 1, max: 8 },
    },
    config: {
      determinism: config.determinism,
      turnDuration: {
        default: "1_month",
        options: ["1_month", "3_months", "6_months", "1_year"],
      },
      victoryConditions: config.victoryConditions,
    },
    map: {
      type: "province",
      projection: "equirectangular",
      bounds: {
        north: Math.round(north * 100) / 100,
        south: Math.round(south * 100) / 100,
        west: Math.round(west * 100) / 100,
        east: Math.round(east * 100) / 100,
      },
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
    events: config.events || { causalGraph: { nodes: [], edges: [] } },
    narrative: {
      introduction: config.introduction,
      style: config.narrativeStyle,
      tone: config.narrativeTone,
      vocabularyEra:
        eraFromYear(config.year) === "ancient"
          ? "ancient"
          : eraFromYear(config.year) === "medieval"
            ? "medieval"
            : "modern",
    },
  };
}

// --- Scenario configurations ---

const EUROPE_1444: ScenarioConfig = {
  geoFile: "world_1400.geojson",
  year: 1444,
  id: "europe-1444",
  name: "Europa Universalis - 1444",
  description:
    "November 11, 1444. The Fall of Varna has shaken Christendom. The Ottoman Empire rises in the East. The Hundred Years' War enters its final phase. The Age of Exploration beckons.",
  era: "early_modern",
  startDate: { year: 1444, month: 11 },
  difficulty: "normal",
  determinism: {
    simulationIntensity: 0.7,
    historicalConstraint: 0.6,
    fantasyFreedom: 0.1,
  },
  viewportFocus: {
    north: 72,
    south: 10,
    west: -15,
    east: 70,
  },
  victoryConditions: [
    {
      type: "score",
      description: "Highest score by 1821",
      endDate: { year: 1821, month: 1 },
    },
    {
      type: "domination",
      description: "Control 60% of the map",
      threshold: 0.6,
    },
  ],
  narrativeStyle: "historical_chronicle",
  narrativeTone: "formal",
  introduction:
    "It is November 1444. The Battle of Varna has claimed the life of King Władysław III of Poland and Hungary. Europe stands at a crossroads between the medieval world and the dawn of a new age.",
  excludeNames: [
    "Polynesians",
    "Maori",
    "Amazon hunter-gatherers",
    "Andean hunter-gatherers",
    "Australian aboriginal hunter-gatherers",
    "Caribbean hunter-gatherers",
    "Desert hunter-gatherers",
    "Savanna hunter-gatherers",
    "Subarctic forest hunter-gatherers",
    "Siberians",
    "West African cereal farmers",
    "Pampas cultures",
    "Patagonian shellfish and marine mammal hunters",
    "Eastern North Amercian hunter-gatherers",
    "North American Pacifi foraging, hunting and fishing peoples",
    "Plain bison hunters",
    "Plateau fichers and hunter gatherers",
    "Athabaskan",
    "Dorset",
    "Thule",
    "Innu",
    "Beothuk",
    "Caloosahatchee cultureure",
    "Taino",
    "Kalinago",
    "Guanahatabeyes",
    "Shuar",
    "Ainus",
  ],
  nationOverrides: {
    France: {
      color: "#3B5998",
      government: "feudal_monarchy",
      ruler: {
        name: "Charles VII",
        adminSkill: 5,
        diplomacySkill: 6,
        militarySkill: 4,
        age: 41,
        traits: ["diplomat", "reformer"],
      },
    },
    "English territory": {
      color: "#C8102E",
      government: "feudal_monarchy",
      ruler: {
        name: "Henry VI",
        adminSkill: 2,
        diplomacySkill: 3,
        militarySkill: 1,
        age: 22,
        traits: ["weak", "pious"],
      },
    },
    "Ottoman Empire": {
      color: "#2E8B57",
      government: "absolute_monarchy",
      ruler: {
        name: "Murad II",
        adminSkill: 5,
        diplomacySkill: 4,
        militarySkill: 7,
        age: 40,
        traits: ["conqueror", "warrior"],
      },
      aiPersonality: {
        aggressiveness: 0.8,
        diplomacyFocus: 0.3,
        expansionDesire: 0.9,
        historicalGoals: ["conquer_constantinople", "balkans_domination"],
      },
    },
    "Byzantine Empire": {
      color: "#800080",
      government: "absolute_monarchy",
      ruler: {
        name: "Constantine XI",
        adminSkill: 4,
        diplomacySkill: 5,
        militarySkill: 4,
        age: 39,
        traits: ["last_emperor", "brave"],
      },
    },
    Castile: {
      color: "#DAA520",
      government: "feudal_monarchy",
      ruler: {
        name: "John II",
        adminSkill: 3,
        diplomacySkill: 4,
        militarySkill: 3,
        age: 39,
        traits: [],
      },
    },
    Portugal: {
      color: "#003399",
      government: "feudal_monarchy",
      ruler: {
        name: "Afonso V",
        adminSkill: 4,
        diplomacySkill: 5,
        militarySkill: 3,
        age: 12,
        traits: ["explorer"],
      },
    },
    "Poland-Lithuania": {
      color: "#DC143C",
      government: "feudal_monarchy",
      ruler: {
        name: "Casimir IV",
        adminSkill: 5,
        diplomacySkill: 5,
        militarySkill: 4,
        age: 17,
        traits: [],
      },
    },
    "Kalmar Union": {
      color: "#C60C30",
      government: "feudal_monarchy",
      ruler: {
        name: "Christopher III",
        adminSkill: 3,
        diplomacySkill: 3,
        militarySkill: 3,
        age: 28,
        traits: [],
      },
    },
    "Holy Roman Empire": {
      color: "#FFD700",
      government: "feudal_monarchy",
      ruler: {
        name: "Frederick III",
        adminSkill: 4,
        diplomacySkill: 5,
        militarySkill: 2,
        age: 29,
        traits: ["cautious"],
      },
    },
    "Kingdom of Hungary": {
      color: "#228B22",
      government: "feudal_monarchy",
      ruler: {
        name: "Ladislaus V",
        adminSkill: 2,
        diplomacySkill: 2,
        militarySkill: 2,
        age: 4,
        traits: ["child_ruler"],
      },
    },
    Venice: {
      color: "#00CED1",
      government: "republic",
      ruler: {
        name: "Francesco Foscari",
        adminSkill: 6,
        diplomacySkill: 7,
        militarySkill: 3,
        age: 71,
        traits: ["merchant", "diplomat"],
      },
    },
    Scotland: {
      color: "#0065BF",
      government: "feudal_monarchy",
      ruler: {
        name: "James II",
        adminSkill: 4,
        diplomacySkill: 3,
        militarySkill: 5,
        age: 14,
        traits: [],
      },
    },
  },
  events: {
    causalGraph: {
      nodes: [
        {
          id: "fall_of_constantinople",
          name: "Fall of Constantinople",
          description:
            "The Ottoman Empire conquers Constantinople, ending the Byzantine Empire.",
          type: "historical",
          scheduledDate: { year: 1453, month: 5 },
          conditions: [
            { type: "nation_exists", nation: "ottoman_empire" },
            { type: "nation_exists", nation: "byzantine_empire" },
          ],
          preventionConditions: [
            {
              description: "Byzantium is strong enough to resist",
              conditions: [
                {
                  type: "stability_below",
                  nation: "ottoman_empire",
                  threshold: 30,
                },
              ],
              difficulty: 0.9,
            },
          ],
          effects: [
            {
              type: "annex",
              annexer: "ottoman_empire",
              annexed: "byzantine_empire",
            },
          ],
          narrativePrompt:
            "Describe the fall of Constantinople to the Ottoman Turks.",
        },
        {
          id: "hundred_years_war_end",
          name: "End of the Hundred Years' War",
          description: "France and England sign peace, ending the long conflict.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1450, month: 1 },
            latest: { year: 1460, month: 12 },
          },
          conditions: [
            { type: "nation_exists", nation: "france" },
            { type: "nation_exists", nation: "english_territory" },
          ],
          effects: [
            {
              type: "modify_relations",
              nationA: "france",
              nationB: "english_territory",
              delta: 50,
            },
          ],
          narrativePrompt:
            "Describe the end of the Hundred Years' War between France and England.",
        },
        {
          id: "age_of_exploration",
          name: "Age of Exploration Begins",
          description:
            "European powers begin exploring the Atlantic and beyond.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1470, month: 1 },
            latest: { year: 1500, month: 12 },
          },
          conditions: [{ type: "nation_exists", nation: "portugal" }],
          effects: [
            {
              type: "modify_stat",
              nation: "portugal",
              stat: "tradePower",
              delta: 20,
            },
          ],
          narrativePrompt:
            "Describe the beginning of the Age of Exploration as Portuguese sailors venture further into the unknown.",
        },
      ],
      edges: [
        {
          from: "fall_of_constantinople",
          to: "age_of_exploration",
          type: "enables",
        },
      ],
    },
  },
};

const WW2_1939: ScenarioConfig = {
  geoFile: "world_1938.geojson",
  year: 1939,
  id: "ww2-1939",
  name: "World War II - 1939",
  description:
    "September 1, 1939. Germany invades Poland. The world plunges into the deadliest conflict in human history.",
  era: "modern",
  startDate: { year: 1939, month: 9 },
  difficulty: "hard",
  determinism: {
    simulationIntensity: 0.8,
    historicalConstraint: 0.7,
    fantasyFreedom: 0.1,
  },
  victoryConditions: [
    {
      type: "score",
      description: "Highest score by September 1945",
      endDate: { year: 1945, month: 9 },
    },
    {
      type: "domination",
      description: "Control 50% of the map",
      threshold: 0.5,
    },
  ],
  narrativeStyle: "war_report",
  narrativeTone: "dramatic",
  introduction:
    "September 1, 1939. At dawn, German forces crossed the Polish border. The world holds its breath as the greatest conflict in human history begins.",
  excludeNames: [
    "Dominion of Newfoundland",
    "Emirate of Bin Shal'an",
    "Trucial Oman",
    "Hail",
    "Hejaz",
    "Chinese warlords",
  ],
  nationOverrides: {
    Germany: {
      color: "#4A4A4A",
      government: "dictatorship",
      ruler: {
        name: "Adolf Hitler",
        adminSkill: 4,
        diplomacySkill: 6,
        militarySkill: 5,
        age: 50,
        traits: ["dictator", "aggressive"],
      },
      aiPersonality: {
        aggressiveness: 0.95,
        diplomacyFocus: 0.2,
        expansionDesire: 1.0,
        historicalGoals: [
          "conquer_poland",
          "defeat_france",
          "invade_russia",
        ],
      },
    },
    "United Kingdom": {
      color: "#C8102E",
      government: "constitutional_monarchy",
      ruler: {
        name: "George VI",
        adminSkill: 4,
        diplomacySkill: 5,
        militarySkill: 3,
        age: 43,
        traits: ["steadfast"],
      },
    },
    France: {
      color: "#3B5998",
      government: "republic",
      ruler: {
        name: "Albert Lebrun",
        adminSkill: 3,
        diplomacySkill: 4,
        militarySkill: 2,
        age: 68,
        traits: [],
      },
    },
    USSR: {
      color: "#CC0000",
      government: "communist_state",
      ruler: {
        name: "Joseph Stalin",
        adminSkill: 7,
        diplomacySkill: 4,
        militarySkill: 5,
        age: 60,
        traits: ["dictator", "industrialist"],
      },
      aiPersonality: {
        aggressiveness: 0.6,
        diplomacyFocus: 0.4,
        expansionDesire: 0.7,
        historicalGoals: ["industrialize", "defend_motherland"],
      },
    },
    "United States": {
      color: "#3C3B6E",
      government: "republic",
      ruler: {
        name: "Franklin D. Roosevelt",
        adminSkill: 8,
        diplomacySkill: 7,
        militarySkill: 5,
        age: 57,
        traits: ["leader", "diplomat"],
      },
    },
    Italy: {
      color: "#009246",
      government: "dictatorship",
      ruler: {
        name: "Benito Mussolini",
        adminSkill: 4,
        diplomacySkill: 5,
        militarySkill: 3,
        age: 55,
        traits: ["dictator"],
      },
    },
    "Empire of Japan": {
      color: "#BC002D",
      government: "absolute_monarchy",
      ruler: {
        name: "Hirohito",
        adminSkill: 4,
        diplomacySkill: 3,
        militarySkill: 4,
        age: 38,
        traits: ["militarist"],
      },
      aiPersonality: {
        aggressiveness: 0.85,
        diplomacyFocus: 0.2,
        expansionDesire: 0.9,
        historicalGoals: ["pacific_domination", "co_prosperity_sphere"],
      },
    },
    Poland: {
      color: "#DC143C",
      government: "republic",
      ruler: {
        name: "Ignacy Mościcki",
        adminSkill: 3,
        diplomacySkill: 3,
        militarySkill: 2,
        age: 72,
        traits: [],
      },
    },
  },
  events: {
    causalGraph: {
      nodes: [
        {
          id: "invasion_of_poland",
          name: "German Invasion of Poland",
          description:
            "Germany launches a Blitzkrieg attack on Poland, starting WWII.",
          type: "historical",
          scheduledDate: { year: 1939, month: 9 },
          conditions: [
            { type: "nation_exists", nation: "germany" },
            { type: "nation_exists", nation: "poland" },
          ],
          effects: [
            {
              type: "declare_war",
              attacker: "germany",
              defender: "poland",
            },
          ],
          narrativePrompt:
            "Describe the German Blitzkrieg invasion of Poland in September 1939.",
        },
        {
          id: "fall_of_france",
          name: "Fall of France",
          description: "Germany conquers France in a swift campaign.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1940, month: 5 },
            latest: { year: 1941, month: 6 },
          },
          conditions: [
            { type: "nation_exists", nation: "germany" },
            { type: "nation_exists", nation: "france" },
            { type: "at_war", nation: "germany" },
          ],
          effects: [
            {
              type: "modify_stat",
              nation: "france",
              stat: "stability",
              delta: -30,
            },
          ],
          narrativePrompt:
            "Describe the fall of France as German forces breach the Maginot Line.",
        },
        {
          id: "operation_barbarossa",
          name: "Operation Barbarossa",
          description: "Germany invades the Soviet Union.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1941, month: 6 },
            latest: { year: 1942, month: 6 },
          },
          conditions: [
            { type: "nation_exists", nation: "germany" },
            { type: "nation_exists", nation: "ussr" },
          ],
          effects: [
            {
              type: "declare_war",
              attacker: "germany",
              defender: "ussr",
            },
          ],
          narrativePrompt:
            "Describe Operation Barbarossa - the largest military invasion in history.",
        },
        {
          id: "pearl_harbor",
          name: "Attack on Pearl Harbor",
          description:
            "Japan attacks the US Pacific Fleet, bringing America into the war.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1941, month: 12 },
            latest: { year: 1942, month: 6 },
          },
          conditions: [
            { type: "nation_exists", nation: "empire_of_japan" },
            { type: "nation_exists", nation: "united_states" },
          ],
          effects: [
            {
              type: "declare_war",
              attacker: "empire_of_japan",
              defender: "united_states",
            },
          ],
          narrativePrompt:
            "Describe the Japanese surprise attack on Pearl Harbor.",
        },
        {
          id: "d_day",
          name: "D-Day - Normandy Landings",
          description: "Allied forces land in Normandy, opening a Western front.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1944, month: 6 },
            latest: { year: 1945, month: 1 },
          },
          conditions: [
            { type: "nation_exists", nation: "united_kingdom" },
            { type: "nation_exists", nation: "united_states" },
            { type: "at_war", nation: "germany" },
          ],
          effects: [
            {
              type: "modify_stat",
              nation: "germany",
              stat: "stability",
              delta: -20,
            },
          ],
          narrativePrompt:
            "Describe D-Day - the greatest amphibious invasion in history.",
        },
      ],
      edges: [
        {
          from: "invasion_of_poland",
          to: "fall_of_france",
          type: "enables",
        },
        {
          from: "fall_of_france",
          to: "operation_barbarossa",
          type: "enables",
        },
        { from: "operation_barbarossa", to: "d_day", type: "enables" },
        { from: "pearl_harbor", to: "d_day", type: "enables" },
      ],
    },
  },
};

const COLD_WAR_1962: ScenarioConfig = {
  geoFile: "world_1960.geojson",
  year: 1962,
  id: "cold-war-1962",
  name: "Cold War - Cuban Missile Crisis",
  description:
    "October 1962. The world stands on the brink of nuclear war. Soviet missiles in Cuba threaten the United States. Tensions are at an all-time high.",
  era: "modern",
  startDate: { year: 1962, month: 10 },
  difficulty: "hard",
  determinism: {
    simulationIntensity: 0.6,
    historicalConstraint: 0.5,
    fantasyFreedom: 0.2,
  },
  victoryConditions: [
    {
      type: "score",
      description: "Highest score by 2000",
      endDate: { year: 2000, month: 1 },
    },
    {
      type: "domination",
      description: "Control 40% of the world",
      threshold: 0.4,
    },
  ],
  narrativeStyle: "diplomatic_cable",
  narrativeTone: "dramatic",
  introduction:
    "CLASSIFIED - TOP SECRET. October 1962. Intelligence confirms the deployment of Soviet nuclear missiles in Cuba, just 90 miles from the American mainland. The clock is ticking.",
  excludeNames: ["Antarctica"],
  nationOverrides: {
    "United States": {
      color: "#3C3B6E",
      government: "republic",
      ruler: {
        name: "John F. Kennedy",
        adminSkill: 7,
        diplomacySkill: 8,
        militarySkill: 5,
        age: 45,
        traits: ["charismatic", "diplomat"],
      },
      aiPersonality: {
        aggressiveness: 0.4,
        diplomacyFocus: 0.7,
        expansionDesire: 0.3,
        historicalGoals: [
          "contain_communism",
          "space_race",
          "nato_leadership",
        ],
      },
    },
    USSR: {
      color: "#CC0000",
      government: "communist_state",
      ruler: {
        name: "Nikita Khrushchev",
        adminSkill: 5,
        diplomacySkill: 5,
        militarySkill: 4,
        age: 68,
        traits: ["reformer", "unpredictable"],
      },
      aiPersonality: {
        aggressiveness: 0.5,
        diplomacyFocus: 0.5,
        expansionDesire: 0.6,
        historicalGoals: [
          "spread_communism",
          "space_race",
          "warsaw_pact_unity",
        ],
      },
    },
    "United Kingdom": {
      color: "#C8102E",
      government: "constitutional_monarchy",
      ruler: {
        name: "Harold Macmillan",
        adminSkill: 5,
        diplomacySkill: 6,
        militarySkill: 3,
        age: 68,
        traits: ["diplomat"],
      },
    },
    France: {
      color: "#3B5998",
      government: "republic",
      ruler: {
        name: "Charles de Gaulle",
        adminSkill: 6,
        diplomacySkill: 5,
        militarySkill: 7,
        age: 71,
        traits: ["nationalist", "leader"],
      },
    },
    China: {
      color: "#DE2910",
      government: "communist_state",
      ruler: {
        name: "Mao Zedong",
        adminSkill: 5,
        diplomacySkill: 3,
        militarySkill: 6,
        age: 68,
        traits: ["revolutionary", "dictator"],
      },
    },
    Cuba: {
      color: "#005BAA",
      government: "communist_state",
      ruler: {
        name: "Fidel Castro",
        adminSkill: 5,
        diplomacySkill: 4,
        militarySkill: 5,
        age: 36,
        traits: ["revolutionary", "charismatic"],
      },
    },
  },
  events: {
    causalGraph: {
      nodes: [
        {
          id: "cuban_missile_crisis",
          name: "Cuban Missile Crisis",
          description:
            "Soviet nuclear missiles discovered in Cuba, triggering a 13-day standoff.",
          type: "historical",
          scheduledDate: { year: 1962, month: 10 },
          conditions: [
            { type: "nation_exists", nation: "united_states" },
            { type: "nation_exists", nation: "ussr" },
            { type: "nation_exists", nation: "cuba" },
          ],
          effects: [
            {
              type: "modify_relations",
              nationA: "united_states",
              nationB: "ussr",
              delta: -50,
            },
          ],
          narrativePrompt:
            "Describe the Cuban Missile Crisis and the tense 13-day standoff between the US and USSR.",
        },
        {
          id: "vietnam_war",
          name: "Vietnam War Escalation",
          description:
            "The conflict in Vietnam escalates into a full-scale war.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1964, month: 8 },
            latest: { year: 1966, month: 12 },
          },
          conditions: [
            { type: "nation_exists", nation: "united_states" },
            { type: "nation_exists", nation: "vietnam" },
          ],
          effects: [
            {
              type: "modify_stat",
              nation: "united_states",
              stat: "warExhaustion",
              delta: 20,
            },
          ],
          narrativePrompt:
            "Describe the escalation of the Vietnam War following the Gulf of Tonkin incident.",
        },
        {
          id: "moon_landing",
          name: "Moon Landing",
          description:
            "The United States lands a man on the moon, winning the Space Race.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1967, month: 1 },
            latest: { year: 1972, month: 12 },
          },
          conditions: [
            { type: "nation_exists", nation: "united_states" },
          ],
          effects: [
            {
              type: "modify_stat",
              nation: "united_states",
              stat: "stability",
              delta: 15,
            },
          ],
          narrativePrompt:
            "Describe the Apollo 11 Moon landing and its impact on the Cold War.",
        },
        {
          id: "sino_soviet_split",
          name: "Sino-Soviet Split",
          description:
            "Relations between China and the USSR deteriorate, fracturing the communist bloc.",
          type: "historical",
          scheduledDate: { year: 1963, month: 6 },
          conditions: [
            { type: "nation_exists", nation: "china" },
            { type: "nation_exists", nation: "ussr" },
          ],
          effects: [
            {
              type: "modify_relations",
              nationA: "china",
              nationB: "ussr",
              delta: -60,
            },
          ],
          narrativePrompt:
            "Describe the growing rift between China and the Soviet Union.",
        },
        {
          id: "detente",
          name: "Détente",
          description:
            "A period of relaxed tensions between the US and USSR.",
          type: "conditional",
          triggerWindow: {
            earliest: { year: 1969, month: 1 },
            latest: { year: 1975, month: 12 },
          },
          conditions: [
            { type: "nation_exists", nation: "united_states" },
            { type: "nation_exists", nation: "ussr" },
            { type: "not_at_war", nation: "united_states" },
          ],
          effects: [
            {
              type: "modify_relations",
              nationA: "united_states",
              nationB: "ussr",
              delta: 30,
            },
          ],
          narrativePrompt:
            "Describe the period of Détente and improving US-Soviet relations.",
        },
      ],
      edges: [
        {
          from: "cuban_missile_crisis",
          to: "vietnam_war",
          type: "enables",
        },
        {
          from: "cuban_missile_crisis",
          to: "sino_soviet_split",
          type: "enables",
        },
        { from: "vietnam_war", to: "detente", type: "enables" },
        { from: "sino_soviet_split", to: "detente", type: "enables" },
        { from: "moon_landing", to: "detente", type: "enables" },
      ],
    },
  },
};

// --- Execute ---

function main() {
  console.log("=== Historia Scenario Generator ===\n");

  const configs = [
    { config: EUROPE_1444, output: "europe-1444.json" },
    { config: WW2_1939, output: "ww2-1939.json" },
    { config: COLD_WAR_1962, output: "cold-war-1962.json" },
  ];

  for (const { config, output } of configs) {
    console.log(`\n--- Generating ${output} ---`);
    const scenario = generateScenario(config);
    const outputPath = resolve(OUTPUT_DIR, output);
    const json = JSON.stringify(scenario, null, 2);
    writeFileSync(outputPath, json);
    const sizeMB = (json.length / (1024 * 1024)).toFixed(2);
    const provCount = (scenario as { map: { provinces: unknown[] } }).map
      .provinces.length;
    const nationCount = (scenario as { nations: unknown[] }).nations.length;
    console.log(
      `  Written: ${output} (${sizeMB} MB, ${provCount} provinces, ${nationCount} nations)`
    );
  }

  console.log("\n=== Done! ===");
}

main();
