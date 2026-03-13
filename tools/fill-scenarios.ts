/**
 * Fill scenario files with missing countries using Natural Earth GeoJSON data.
 *
 * Usage: npx tsx tools/fill-scenarios.ts
 *
 * This script:
 * 1. Loads world-atlas TopoJSON and converts to GeoJSON
 * 2. For each scenario, identifies missing countries
 * 3. Generates nation + province entries with real polygons
 * 4. Merges into existing scenario JSON files
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as topojson from "topojson-client";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = join(__dirname, "../scenarios/templates");

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeoFeature {
  type: "Feature";
  properties: { name: string };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

interface NationDef {
  id: string;
  name: string;
  tag: string;
  color: string;
  government: string;
  rulerName: string;
  /** Which scenarios this nation should appear in */
  scenarios: ("europe-1444" | "ww2-1939" | "cold-war-1962")[];
}

// ─── GeoJSON name → scenario existing nation ID mapping ──────────────────────
// Maps GeoJSON country names to existing nation IDs in each scenario
// This prevents adding duplicates for countries that already exist under different names

const GEO_TO_EXISTING: Record<string, Record<string, string>> = {
  // Cold War 1962 mappings
  "eSwatini": { "cold-war-1962": "swaziland", "ww2-1939": "swaziland" },
  "Myanmar": { "cold-war-1962": "burma" },
  "North Korea": { "cold-war-1962": "korea_democratic_peoples_republic_of" },
  "South Korea": { "cold-war-1962": "korea_republic_of" },
  "Czechia": { "cold-war-1962": "czechoslovakia", "ww2-1939": "czechoslovakia" },
  "Dem. Rep. Congo": { "cold-war-1962": "zaire", "ww2-1939": "belgian_congo" },
  "Dominican Rep.": { "cold-war-1962": "dominican_republic", "ww2-1939": "dominican_republic" },
  "W. Sahara": { "cold-war-1962": "western_sahara", "ww2-1939": "spanish_sahara" },
  "Côte d'Ivoire": { "cold-war-1962": "ivory_coast" },
  "Central African Rep.": { "cold-war-1962": "central_african_republic" },
  "Bosnia and Herz.": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Serbia": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Montenegro": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Kosovo": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Macedonia": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Croatia": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Slovenia": { "ww2-1939": "yugoslavia", "cold-war-1962": "yugoslavia" },
  "Russia": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Belarus": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Ukraine": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Moldova": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Lithuania": { "cold-war-1962": "ussr", "ww2-1939": "lithuania" },
  "Latvia": { "cold-war-1962": "ussr", "ww2-1939": "latvia" },
  "Estonia": { "cold-war-1962": "ussr", "ww2-1939": "estonia" },
  "Armenia": { "cold-war-1962": "ussr", "ww2-1939": "armenia" },
  "Azerbaijan": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Georgia": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Kazakhstan": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Uzbekistan": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Tajikistan": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Kyrgyzstan": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Turkmenistan": { "cold-war-1962": "ussr", "ww2-1939": "ussr" },
  "Palestine": { "cold-war-1962": "israel", "ww2-1939": "mandatory_palestine_gb" },
  "N. Cyprus": { "cold-war-1962": "cyprus" },
  "Falkland Is.": { "cold-war-1962": "united_kingdom", "ww2-1939": "united_kingdom" },
  "Fr. S. Antarctic Lands": { "cold-war-1962": "france", "ww2-1939": "france" },
  "Antarctica": { "cold-war-1962": "_skip_", "ww2-1939": "_skip_", "europe-1444": "_skip_" },
  "Somaliland": { "cold-war-1962": "somalia", "ww2-1939": "british_somaliland" },
  "S. Sudan": { "cold-war-1962": "sudan", "ww2-1939": "sudan" },
  "New Caledonia": { "cold-war-1962": "france", "ww2-1939": "new_caledonia" },
  "Greenland": { "cold-war-1962": "greenland", "ww2-1939": "denmark" },

  // WW2 1939 mappings (not already covered above)
  "Thailand": { "ww2-1939": "siam" },
  "Vietnam": { "ww2-1939": "french_indo_china" },
  "Indonesia": { "ww2-1939": "dutch_east_indies" },
  "Sri Lanka": { "ww2-1939": "ceylon" },
  "Taiwan": { "ww2-1939": "empire_of_japan" },
  "India": { "ww2-1939": "british_raj" },
  "Bangladesh": { "ww2-1939": "british_raj", "cold-war-1962": "pakistan" },
  "Pakistan": { "ww2-1939": "british_raj" },
  "Zimbabwe": { "ww2-1939": "southern_rhodesia" },
  "Namibia": { "ww2-1939": "union_of_south_africa" },
  "Zambia": { "ww2-1939": "northern_rhodesia" },
  "Ghana": { "ww2-1939": "gold_coast" },
  "Benin": { "ww2-1939": "french_west_africa" },
  "Burkina Faso": { "ww2-1939": "french_west_africa" },
  "Senegal": { "ww2-1939": "french_west_africa" },
  "Mauritania": { "ww2-1939": "french_west_africa" },
  "Chad": { "ww2-1939": "french_equatorial_africa" },
  "Gabon": { "ww2-1939": "french_equatorial_africa" },
  "Congo": { "ww2-1939": "congo_france" },
  "Somalia": { "ww2-1939": "italian_somaliland" },
  "Eq. Guinea": { "ww2-1939": "equatorial_guinea" },
  "Papua New Guinea": { "ww2-1939": "australia" },
  "Timor-Leste": { "ww2-1939": "dutch_east_indies", "cold-war-1962": "indonesia" },
  "Vanuatu": { "ww2-1939": "new_hebrides", "cold-war-1962": "france" },
  "Solomon Is.": { "ww2-1939": "united_kingdom", "cold-war-1962": "united_kingdom" },
  "Lebanon": { "ww2-1939": "syria_france" },
  "Jordan": { "ww2-1939": "mandatory_palestine_gb" },
  "Iraq": { "ww2-1939": "mesopotamia_gb" },
  "Kuwait": { "ww2-1939": "mesopotamia_gb" },
  "United Arab Emirates": { "ww2-1939": "oman_british_raj" },
  "Djibouti": { "ww2-1939": "french_somaliland" },

  // Europe 1444 mappings
  "Turkey": { "europe-1444": "ottoman_empire" },
  "Greece": { "europe-1444": "byzantine_empire" },
  "United Kingdom": { "europe-1444": "english_territory" },
  "Spain": { "europe-1444": "castile" },
  "Italy": { "europe-1444": "papal_states" },
  "Germany": { "europe-1444": "holy_roman_empire" },
  "Austria": { "europe-1444": "holy_roman_empire" },
  "Switzerland": { "europe-1444": "holy_roman_empire" },
  "Czechia": { "europe-1444": "holy_roman_empire" },
  "Belgium": { "europe-1444": "holy_roman_empire" },
  "Netherlands": { "europe-1444": "holy_roman_empire" },
  "Luxembourg": { "europe-1444": "holy_roman_empire" },
  "Hungary": { "europe-1444": "kingdom_of_hungary" },
  "Romania": { "europe-1444": "principality_of_wallachia" },
  "Bulgaria": { "europe-1444": "bulgar_khanate" },
  "Albania": { "europe-1444": "byzantine_empire" },
  "Croatia": { "europe-1444": "kingdom_of_hungary" },
  "Serbia": { "europe-1444": "byzantine_empire" },
  "Montenegro": { "europe-1444": "byzantine_empire" },
  "Kosovo": { "europe-1444": "byzantine_empire" },
  "Macedonia": { "europe-1444": "byzantine_empire" },
  "Bosnia and Herz.": { "europe-1444": "bosnia" },
  "Slovenia": { "europe-1444": "holy_roman_empire" },
  "Slovakia": { "europe-1444": "kingdom_of_hungary" },
  "Norway": { "europe-1444": "kalmar_union" },
  "Sweden": { "europe-1444": "kalmar_union" },
  "Denmark": { "europe-1444": "kalmar_union" },
  "Finland": { "europe-1444": "kalmar_union" },
  "Iceland": { "europe-1444": "kalmar_union" },
  "Ireland": { "europe-1444": "english_territory" },
  "Poland": { "europe-1444": "poland_lithuania" },
  "Lithuania": { "europe-1444": "poland_lithuania" },
  "Latvia": { "europe-1444": "teutonic_knights" },
  "Estonia": { "europe-1444": "teutonic_knights" },
  "Belarus": { "europe-1444": "poland_lithuania" },
  "Ukraine": { "europe-1444": "poland_lithuania" },
  "India": { "europe-1444": "sultanate_of_delhi" },
  "Bangladesh": { "europe-1444": "sultanate_of_delhi" },
  "Pakistan": { "europe-1444": "sultanate_of_delhi" },
  "Nepal": { "europe-1444": "sultanate_of_delhi" },
  "Thailand": { "europe-1444": "ayutthaya" },
  "Cambodia": { "europe-1444": "khmer_empire" },
  "Laos": { "europe-1444": "khmer_empire" },
  "Vietnam": { "europe-1444": "i_vi_t" },
  "Myanmar": { "europe-1444": "pagan" },
  "Malaysia": { "europe-1444": "srivijaya_empire" },
  "Indonesia": { "europe-1444": "kediri" },
  "Philippines": { "europe-1444": "srivijaya_empire" },
  "Brunei": { "europe-1444": "srivijaya_empire" },
  "Sri Lanka": { "europe-1444": "sinhalese_kingdom" },
  "Bhutan": { "europe-1444": "tibet" },
  "Mongolia": { "europe-1444": "great_khanate" },
  "North Korea": { "europe-1444": "_add_joseon_" },
  "South Korea": { "europe-1444": "_add_joseon_" },
  "Japan": { "europe-1444": "shogun_japan_kamakura" },
  "Taiwan": { "europe-1444": "_add_ming_" },
  "Iran": { "europe-1444": "timurid_empire" },
  "Iraq": { "europe-1444": "timurid_empire" },
  "Syria": { "europe-1444": "mamluke_sultanate" },
  "Lebanon": { "europe-1444": "mamluke_sultanate" },
  "Israel": { "europe-1444": "mamluke_sultanate" },
  "Palestine": { "europe-1444": "mamluke_sultanate" },
  "Jordan": { "europe-1444": "mamluke_sultanate" },
  "Saudi Arabia": { "europe-1444": "hadramaut" },
  "Qatar": { "europe-1444": "hadramaut" },
  "United Arab Emirates": { "europe-1444": "hadramaut" },
  "Kuwait": { "europe-1444": "timurid_empire" },
  "Oman": { "europe-1444": "muscat" },
  "Egypt": { "europe-1444": "mamluke_sultanate" },
  "Libya": { "europe-1444": "hafsid_caliphate" },
  "Tunisia": { "europe-1444": "hafsid_caliphate" },
  "Algeria": { "europe-1444": "hafsid_caliphate" },
  "Nigeria": { "europe-1444": "bornu_kanem" },
  "Niger": { "europe-1444": "mali" },
  "Senegal": { "europe-1444": "mali" },
  "Gambia": { "europe-1444": "mali" },
  "Guinea": { "europe-1444": "mali" },
  "Guinea-Bissau": { "europe-1444": "mali" },
  "Mauritania": { "europe-1444": "mali" },
  "Burkina Faso": { "europe-1444": "mali" },
  "Sierra Leone": { "europe-1444": "mali" },
  "Liberia": { "europe-1444": "mali" },
  "Ghana": { "europe-1444": "mali" },
  "Côte d'Ivoire": { "europe-1444": "mali" },
  "Togo": { "europe-1444": "benin" },
  "Cameroon": { "europe-1444": "bornu_kanem" },
  "Chad": { "europe-1444": "bornu_kanem" },
  "Central African Rep.": { "europe-1444": "bornu_kanem" },
  "Congo": { "europe-1444": "bantou" },
  "Dem. Rep. Congo": { "europe-1444": "bantou" },
  "Gabon": { "europe-1444": "bantou" },
  "Eq. Guinea": { "europe-1444": "bantou" },
  "Angola": { "europe-1444": "bantou" },
  "Zambia": { "europe-1444": "bantou" },
  "Malawi": { "europe-1444": "bantou" },
  "Mozambique": { "europe-1444": "islamic_city_states" },
  "Tanzania": { "europe-1444": "islamic_city_states" },
  "Kenya": { "europe-1444": "islamic_city_states" },
  "Uganda": { "europe-1444": "bantou" },
  "Rwanda": { "europe-1444": "bantou" },
  "Burundi": { "europe-1444": "bantou" },
  "Somalia": { "europe-1444": "islamic_city_states" },
  "Djibouti": { "europe-1444": "islamic_city_states" },
  "Eritrea": { "europe-1444": "ethiopia" },
  "Sudan": { "europe-1444": "makkura" },
  "S. Sudan": { "europe-1444": "makkura" },
  "South Africa": { "europe-1444": "khoiasan" },
  "Lesotho": { "europe-1444": "khoiasan" },
  "eSwatini": { "europe-1444": "khoiasan" },
  "Botswana": { "europe-1444": "khoiasan" },
  "Namibia": { "europe-1444": "khoiasan" },
  "Zimbabwe": { "europe-1444": "great_zimbabwe" },
  "Afghanistan": { "europe-1444": "timurid_empire" },
  "Falkland Is.": { "europe-1444": "_skip_" },
  "Fr. S. Antarctic Lands": { "europe-1444": "_skip_" },
  "Somaliland": { "europe-1444": "islamic_city_states" },
  "N. Cyprus": { "europe-1444": "cyprus" },
  "Vanuatu": { "europe-1444": "tu_i_tonga_empire" },
  "Solomon Is.": { "europe-1444": "tu_i_tonga_empire" },
  "Papua New Guinea": { "europe-1444": "tu_i_tonga_empire" },
  "New Zealand": { "europe-1444": "tu_i_tonga_empire" },
  "Australia": { "europe-1444": "tasmanian_hunter_gatherers" },
  "Fiji": { "europe-1444": "tu_i_tonga_empire" },
  "New Caledonia": { "europe-1444": "tu_i_tonga_empire" },
  "Trinidad and Tobago": { "europe-1444": "_skip_" },
};

// ─── Countries to ADD (not mapped to existing) ──────────────────────────────

const COUNTRIES_TO_ADD: NationDef[] = [
  // === EUROPE 1444 additions ===
  { id: "muscovy", name: "Muscovy", tag: "MUS", color: "#3a7d44", government: "monarchy", rulerName: "Vasily II", scenarios: ["europe-1444"] },
  { id: "ming_dynasty", name: "Ming Dynasty", tag: "MNG", color: "#c4a942", government: "monarchy", rulerName: "Zhu Qizhen", scenarios: ["europe-1444"] },
  { id: "joseon", name: "Joseon", tag: "JOS", color: "#2e86ab", government: "monarchy", rulerName: "Sejong", scenarios: ["europe-1444"] },
  { id: "aztec_empire", name: "Aztec Empire", tag: "AZT", color: "#c91a1a", government: "monarchy", rulerName: "Itzcoatl", scenarios: ["europe-1444"] },
  { id: "inca_empire", name: "Inca Empire", tag: "INC", color: "#d4a017", government: "monarchy", rulerName: "Pachacuti", scenarios: ["europe-1444"] },
  { id: "songhai_empire", name: "Songhai Empire", tag: "SON", color: "#b5651d", government: "monarchy", rulerName: "Sulaiman Dama", scenarios: ["europe-1444"] },

  // === WW2 1939 additions ===
  { id: "austria", name: "Austria", tag: "AUS", color: "#c8102e", government: "republic", rulerName: "Arthur Seyss-Inquart", scenarios: ["ww2-1939"] },
  { id: "luxembourg", name: "Luxembourg", tag: "LUX", color: "#00a1de", government: "monarchy", rulerName: "Charlotte", scenarios: ["ww2-1939", "cold-war-1962"] },
  { id: "iceland", name: "Iceland", tag: "ICE", color: "#003897", government: "republic", rulerName: "Sveinn Bjornsson", scenarios: ["ww2-1939"] },
  { id: "cyprus", name: "Cyprus", tag: "CYP", color: "#d57800", government: "colony", rulerName: "British Governor", scenarios: ["ww2-1939"] },
  { id: "trinidad_and_tobago", name: "Trinidad and Tobago", tag: "TRI", color: "#ce1126", government: "colony", rulerName: "British Governor", scenarios: ["ww2-1939", "cold-war-1962"] },

  // === COLD WAR 1962 additions ===
  { id: "malta", name: "Malta", tag: "MLT", color: "#cf142b", government: "colony", rulerName: "British Governor", scenarios: ["cold-war-1962"] },
  { id: "bahrain", name: "Bahrain", tag: "BAH", color: "#ce1126", government: "monarchy", rulerName: "Isa bin Salman", scenarios: ["cold-war-1962"] },
  { id: "singapore", name: "Singapore", tag: "SIN", color: "#ef3340", government: "republic", rulerName: "Lee Kuan Yew", scenarios: ["cold-war-1962"] },
];

// Mapping: NationDef id → GeoJSON name for polygon extraction
const ADD_TO_GEO: Record<string, string> = {
  muscovy: "Russia",
  ming_dynasty: "China",
  joseon: "South Korea",  // Will also use North Korea polygon
  aztec_empire: "Mexico",
  inca_empire: "Peru",
  songhai_empire: "Niger",
  austria: "Austria",
  luxembourg: "Luxembourg",
  iceland: "Iceland",
  cyprus: "Cyprus",
  trinidad_and_tobago: "Trinidad and Tobago",
  malta: "Italy",  // Malta is too small for 110m, use Italy as fallback (we'll set a manual point)
  bahrain: "Qatar", // Same issue, tiny
  singapore: "Malaysia", // Same, tiny
};

// Manual polygons for countries too small for 110m resolution
const MANUAL_PROVINCES: Record<string, { center: [number, number]; polygon: number[][]; isCoastal: boolean }> = {
  malta: {
    center: [14.42, 35.90],
    polygon: [[14.32, 35.80], [14.52, 35.80], [14.52, 36.00], [14.32, 36.00], [14.32, 35.80]],
    isCoastal: true,
  },
  bahrain: {
    center: [50.55, 26.07],
    polygon: [[50.40, 25.90], [50.70, 25.90], [50.70, 26.25], [50.40, 26.25], [50.40, 25.90]],
    isCoastal: true,
  },
  singapore: {
    center: [103.82, 1.35],
    polygon: [[103.60, 1.20], [104.05, 1.20], [104.05, 1.48], [103.60, 1.48], [103.60, 1.20]],
    isCoastal: true,
  },
  luxembourg: {
    center: [6.13, 49.81],
    polygon: [[5.73, 49.44], [6.53, 49.44], [6.53, 50.18], [5.73, 50.18], [5.73, 49.44]],
    isCoastal: false,
  },
};

// ─── Utility functions ──────────────────────────────────────────────────────

function getLargestPolygon(geometry: GeoFeature["geometry"]): number[][] {
  if (geometry.type === "Polygon") {
    // Polygon: coordinates = [ring], ring = [[lon,lat], ...]
    return (geometry.coordinates as number[][][])[0];
  }
  // MultiPolygon: coordinates = [[ring, ...], ...] — pick the largest outer ring
  const allRings = (geometry.coordinates as number[][][][]).map((poly) => poly[0]);
  let largest = allRings[0];
  let maxArea = 0;
  for (const ring of allRings) {
    const area = approxArea(ring);
    if (area > maxArea) {
      maxArea = area;
      largest = ring;
    }
  }
  return largest;
}

function approxArea(polygon: number[][]): number {
  let area = 0;
  for (let i = 0; i < polygon.length - 1; i++) {
    area += polygon[i][0] * polygon[i + 1][1] - polygon[i + 1][0] * polygon[i][1];
  }
  return Math.abs(area / 2);
}

function centroid(polygon: number[][]): [number, number] {
  const lons = polygon.map((p) => p[0]);
  const lats = polygon.map((p) => p[1]);
  return [
    (Math.min(...lons) + Math.max(...lons)) / 2,
    (Math.min(...lats) + Math.max(...lats)) / 2,
  ];
}

function deriveTerrain(lat: number, lon: number): string {
  if (lat > 65) return "tundra";
  if (lat > 50) return "forest";
  if (lat > 35) return "plains";
  if (lat > 23) {
    if (lon > 10 && lon < 60) return "desert";
    return "plains";
  }
  if (lat > -10) return "jungle";
  if (lat > -35) return "plains";
  return "tundra";
}

function sizeCategory(vertexCount: number): "small" | "medium" | "large" {
  if (vertexCount < 15) return "small";
  if (vertexCount < 50) return "medium";
  return "large";
}

function generateProvince(
  nationId: string,
  nationName: string,
  polygon: number[][],
  center: [number, number],
  isCoastal: boolean,
  size: "small" | "medium" | "large"
) {
  const stats = {
    small: { tax: 2, prod: 2, manpower: 1, pop: 50000, infantry: 500, cavalry: 100, artillery: 30 },
    medium: { tax: 4, prod: 3, manpower: 3, pop: 200000, infantry: 3000, cavalry: 500, artillery: 150 },
    large: { tax: 6, prod: 5, manpower: 5, pop: 500000, infantry: 8000, cavalry: 1500, artillery: 400 },
  }[size];

  return {
    id: `prov_${nationId}`,
    name: nationId,
    displayName: nationName,
    terrain: deriveTerrain(center[1], center[0]),
    isCoastal,
    polygon,
    center,
    neighbors: [] as string[],
    baseTax: stats.tax,
    baseProduction: stats.prod,
    baseManpower: stats.manpower,
    hasPort: isCoastal,
    fortLevel: size === "large" ? 2 : 1,
    resources: ["grain"],
    buildings: size === "small" ? [] : ["marketplace"],
    isCapital: true,
    owner: nationId,
    controller: nationId,
  };
}

function generateNation(
  def: NationDef,
  polygon: number[][],
  center: [number, number],
  size: "small" | "medium" | "large"
) {
  const stats = {
    small: { treasury: 30, income: 8, expenses: 6, trade: 10, pop: 50000, manpower: 1000, maxManpower: 2000, forceLimit: 3000, infantry: 500, cavalry: 100, artillery: 30 },
    medium: { treasury: 75, income: 20, expenses: 16, trade: 30, pop: 200000, manpower: 4000, maxManpower: 8000, forceLimit: 12000, infantry: 3000, cavalry: 500, artillery: 150 },
    large: { treasury: 150, income: 40, expenses: 30, trade: 60, pop: 500000, manpower: 10000, maxManpower: 20000, forceLimit: 30000, infantry: 8000, cavalry: 1500, artillery: 400 },
  }[size];

  return {
    id: def.id,
    name: def.name,
    tag: def.tag,
    color: def.color,
    government: def.government,
    ruler: {
      name: def.rulerName,
      adminSkill: 4 + Math.floor(Math.random() * 4),
      diplomacySkill: 3 + Math.floor(Math.random() * 4),
      militarySkill: 3 + Math.floor(Math.random() * 4),
      age: 30 + Math.floor(Math.random() * 30),
      traits: [],
    },
    capital: `prov_${def.id}`,
    provinces: [`prov_${def.id}`],
    economy: {
      treasury: stats.treasury,
      taxRate: 0.1,
      inflation: 0.02,
      tradePower: stats.trade,
      monthlyIncome: stats.income,
      monthlyExpenses: stats.expenses,
    },
    military: {
      armies: [
        {
          id: `${def.id}_army_1`,
          name: `Army of ${def.name}`,
          location: `prov_${def.id}`,
          units: {
            infantry: stats.infantry,
            cavalry: stats.cavalry,
            artillery: stats.artillery,
          },
          morale: 0.7,
          supply: 0.8,
        },
      ],
      manpower: stats.manpower,
      maxManpower: stats.maxManpower,
      forceLimit: stats.forceLimit,
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
      total: stats.pop,
      growthRate: 0.003,
      stability: 50,
      warExhaustion: 0,
      culture: def.id,
      religion: "unknown",
    },
    playable: true,
  };
}

function bboxOverlap(a: number[][], b: number[][]): boolean {
  const aMinX = Math.min(...a.map((p) => p[0]));
  const aMaxX = Math.max(...a.map((p) => p[0]));
  const aMinY = Math.min(...a.map((p) => p[1]));
  const aMaxY = Math.max(...a.map((p) => p[1]));
  const bMinX = Math.min(...b.map((p) => p[0]));
  const bMaxX = Math.max(...b.map((p) => p[0]));
  const bMinY = Math.min(...b.map((p) => p[1]));
  const bMaxY = Math.max(...b.map((p) => p[1]));

  // Add small buffer for adjacency
  const buf = 0.5;
  return aMinX - buf < bMaxX && aMaxX + buf > bMinX && aMinY - buf < bMaxY && aMaxY + buf > bMinY;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  // 1. Load GeoJSON
  console.log("Loading world-atlas TopoJSON...");
  const topoPath = join(__dirname, "../node_modules/world-atlas/countries-110m.json");
  const topoData = JSON.parse(readFileSync(topoPath, "utf-8"));
  const geoCollection = topojson.feature(topoData, topoData.objects.countries) as unknown as {
    type: "FeatureCollection";
    features: GeoFeature[];
  };

  // Build index by name
  const geoIndex = new Map<string, GeoFeature>();
  for (const f of geoCollection.features) {
    geoIndex.set(f.properties.name, f);
  }
  console.log(`Loaded ${geoIndex.size} country features`);

  // 2. Process each scenario
  const scenarioIds = ["europe-1444", "ww2-1939", "cold-war-1962"] as const;

  for (const scenarioId of scenarioIds) {
    console.log(`\n=== Processing ${scenarioId} ===`);
    const filePath = join(SCENARIOS_DIR, `${scenarioId}.json`);
    const scenario = JSON.parse(readFileSync(filePath, "utf-8"));

    const existingNationIds = new Set(scenario.nations.map((n: { id: string }) => n.id));
    const existingProvIds = new Set(scenario.map.provinces.map((p: { id: string }) => p.id));

    let addedCount = 0;

    // 2a. Add new nations from COUNTRIES_TO_ADD
    for (const def of COUNTRIES_TO_ADD) {
      if (!def.scenarios.includes(scenarioId)) continue;
      if (existingNationIds.has(def.id)) {
        console.log(`  Skip ${def.id} (already exists)`);
        continue;
      }

      let polygon: number[][];
      let center: [number, number];
      let isCoastal: boolean;

      if (MANUAL_PROVINCES[def.id]) {
        const manual = MANUAL_PROVINCES[def.id];
        polygon = manual.polygon;
        center = manual.center;
        isCoastal = manual.isCoastal;
      } else {
        const geoName = ADD_TO_GEO[def.id];
        const feature = geoName ? geoIndex.get(geoName) : null;
        if (!feature) {
          console.log(`  WARNING: No GeoJSON for ${def.id} (${geoName}), skipping`);
          continue;
        }
        polygon = getLargestPolygon(feature.geometry);
        center = centroid(polygon);
        isCoastal = feature.geometry.type === "MultiPolygon";
      }

      const size = sizeCategory(polygon.length);
      const province = generateProvince(def.id, def.name, polygon, center, isCoastal, size);
      const nation = generateNation(def, polygon, center, size);

      scenario.nations.push(nation);
      scenario.map.provinces.push(province);
      existingNationIds.add(def.id);
      existingProvIds.add(province.id);
      addedCount++;
      console.log(`  Added ${def.name} (${polygon.length} vertices, ${size})`);
    }

    // 2b. Recalculate neighbors for all provinces
    console.log("  Recalculating neighbors...");
    const provinces = scenario.map.provinces;
    for (let i = 0; i < provinces.length; i++) {
      const neighbors: string[] = [];
      const polyA = provinces[i].polygon;
      if (!polyA) continue;

      for (let j = 0; j < provinces.length; j++) {
        if (i === j) continue;
        const polyB = provinces[j].polygon;
        if (!polyB) continue;
        if (bboxOverlap(polyA, polyB)) {
          neighbors.push(provinces[j].id);
        }
      }
      provinces[i].neighbors = neighbors;
    }

    // 2c. Save
    console.log(`  Total nations: ${scenario.nations.length} (+${addedCount})`);
    writeFileSync(filePath, JSON.stringify(scenario, null, 2), "utf-8");
    console.log(`  Saved ${filePath}`);
  }

  console.log("\nDone!");
}

main();
