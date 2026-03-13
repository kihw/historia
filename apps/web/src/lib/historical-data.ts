/**
 * Historical world map data loader.
 * Sources:
 * - Modern boundaries: world-atlas npm package (Natural Earth 110m TopoJSON)
 * - Historical boundaries: aourednik/historical-basemaps GitHub repo (GeoJSON per era)
 */

import type {
  GeoJSONCollection,
  GeoJSONFeature,
  HistoricalEra,
} from "@historia/shared";
import * as topojson from "topojson-client";
import type { Topology, GeometryCollection } from "topojson-specification";

const HISTORICAL_BASEMAPS_BASE =
  "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/geojson";

const HISTORICAL_BASEMAPS_INDEX =
  "https://raw.githubusercontent.com/aourednik/historical-basemaps/master/index.json";

interface IndexEntry {
  year: number;
  filename: string;
  countries: string[];
}

interface IndexData {
  years: IndexEntry[];
}

// In-memory cache for loaded data
const geoJsonCache = new Map<number, GeoJSONCollection>();
let availableYearsCache: IndexEntry[] | null = null;

// Color palette for countries (deterministic based on country name)
function countryColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}

/**
 * Load the index of available historical eras.
 */
export async function loadAvailableEras(): Promise<IndexEntry[]> {
  if (availableYearsCache) return availableYearsCache;

  const res = await fetch(HISTORICAL_BASEMAPS_INDEX);
  if (!res.ok) throw new Error(`Failed to fetch historical basemaps index: ${res.status}`);
  const data: IndexData = await res.json();
  availableYearsCache = data.years;
  return data.years;
}

/**
 * Load historical GeoJSON for a specific year from aourednik/historical-basemaps.
 */
export async function loadHistoricalGeoJSON(year: number): Promise<GeoJSONCollection> {
  if (geoJsonCache.has(year)) return geoJsonCache.get(year)!;

  const eras = await loadAvailableEras();
  const era = eras.find((e) => e.year === year);
  if (!era) {
    throw new Error(`No historical data for year ${year}. Available: ${eras.map((e) => e.year).join(", ")}`);
  }

  const url = `${HISTORICAL_BASEMAPS_BASE}/${era.filename}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${era.filename}: ${res.status}`);
  const geojson: GeoJSONCollection = await res.json();

  geoJsonCache.set(year, geojson);
  return geojson;
}

/**
 * Load modern world boundaries from world-atlas npm package (TopoJSON -> GeoJSON).
 */
export async function loadModernWorld(): Promise<GeoJSONCollection> {
  if (geoJsonCache.has(9999)) return geoJsonCache.get(9999)!;

  // world-atlas ships TopoJSON files — import at runtime
  const response = await fetch(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json"
  );
  if (!response.ok) throw new Error(`Failed to fetch world-atlas: ${response.status}`);
  const topoData: Topology = await response.json();

  const geojson = topojson.feature(
    topoData,
    topoData.objects.countries as GeometryCollection
  ) as unknown as GeoJSONCollection;

  geoJsonCache.set(9999, geojson);
  return geojson;
}

/**
 * Find the closest available year to the requested one.
 */
export async function findClosestYear(targetYear: number): Promise<number> {
  const eras = await loadAvailableEras();
  let closest = eras[0].year;
  let minDiff = Math.abs(targetYear - closest);

  for (const era of eras) {
    const diff = Math.abs(targetYear - era.year);
    if (diff < minDiff) {
      minDiff = diff;
      closest = era.year;
    }
  }

  return closest;
}

/**
 * Convert GeoJSON features to HistoricalEra format for use in the game.
 */
export function geoJsonToHistoricalEra(
  geojson: GeoJSONCollection,
  year: number,
  label: string
): HistoricalEra {
  const countries = geojson.features.map((feature: GeoJSONFeature) => {
    const name =
      feature.properties.NAME ||
      feature.properties.ADMIN ||
      feature.properties.SOVEREIGNT ||
      "Unknown";

    const polygons =
      feature.geometry.type === "MultiPolygon"
        ? (feature.geometry.coordinates as number[][][][])
        : [feature.geometry.coordinates as number[][][]];

    return {
      id: (feature.properties.ISO_A3 || name.toLowerCase().replace(/\s+/g, "_")).toString(),
      name,
      color: countryColor(name),
      polygons: polygons as [number, number][][][],
    };
  });

  return {
    year,
    label,
    description: `World in ${year < 0 ? Math.abs(year) + " BC" : year + " AD"}`,
    countries,
  };
}

/**
 * Get a label for a historical year.
 */
export function getYearLabel(year: number): string {
  if (year < 0) return `${Math.abs(year)} BC`;
  return `${year} AD`;
}

/**
 * Key historical eras with human-readable labels.
 * Subset of available years that are most relevant for gameplay.
 */
export const KEY_ERAS: readonly { year: number; label: string }[] = [
  { year: -3000, label: "Antiquité - 3000 av. J.-C." },
  { year: -500, label: "Grèce classique - 500 av. J.-C." },
  { year: -1, label: "Empire romain - 1 av. J.-C." },
  { year: 400, label: "Chute de Rome - 400" },
  { year: 800, label: "Carolingiens - 800" },
  { year: 1100, label: "Croisades - 1100" },
  { year: 1400, label: "Fin du Moyen Âge - 1400" },
  { year: 1492, label: "Découverte des Amériques - 1492" },
  { year: 1650, label: "Traité de Westphalie - 1650" },
  { year: 1783, label: "Indépendance américaine - 1783" },
  { year: 1815, label: "Congrès de Vienne - 1815" },
  { year: 1914, label: "Première Guerre mondiale - 1914" },
  { year: 1945, label: "Seconde Guerre mondiale - 1945" },
  { year: 1994, label: "Post-Guerre froide - 1994" },
  { year: 2010, label: "Monde contemporain - 2010" },
];

/**
 * Clear the cache (useful for memory management).
 */
export function clearHistoricalCache(): void {
  geoJsonCache.clear();
  availableYearsCache = null;
}
