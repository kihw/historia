import type {
  CountryIndexEntry,
  CountryEraInfo,
  CountryRegion,
  Era,
} from "@historia/shared";
import { listScenarios, loadScenarioRaw } from "./scenario-loader.js";

let cachedIndex: CountryIndexEntry[] | null = null;

/**
 * Build a cross-scenario country index.
 * Groups nations by ID across all scenarios.
 * Cached in memory after first call.
 */
export async function getCountryIndex(): Promise<CountryIndexEntry[]> {
  if (cachedIndex) return cachedIndex;

  const scenarioList = await listScenarios();
  const countryMap = new Map<string, CountryIndexEntry>();

  for (const scenarioInfo of scenarioList) {
    if (scenarioInfo.id === "sandbox-empty") continue;

    try {
      const scenario = await loadScenarioRaw(scenarioInfo.id);
      const era = (scenario.meta?.era ?? "custom") as Era;
      const startYear = scenario.meta?.startDate?.year ?? 0;

      for (const nation of scenario.nations) {
        const nationId = nation.id as string;
        if (!nationId) continue;

        const eraInfo: CountryEraInfo = {
          scenarioId: scenarioInfo.id,
          scenarioName: scenarioInfo.name,
          era,
          startYear,
          provinceCount: (nation.provinces as string[])?.length ?? 0,
          color: (nation.color as string) ?? "#888888",
        };

        const existing = countryMap.get(nationId);
        if (existing) {
          existing.eras.push(eraInfo);
        } else {
          const capitalId = nation.capital as string;
          const capitalProv = scenario.map?.provinces?.find(
            (p: Record<string, unknown>) => p.id === capitalId
          );

          countryMap.set(nationId, {
            id: nationId,
            name: (nation.name as string) ?? nationId,
            tag: (nation.tag as string) ?? nationId.substring(0, 3).toUpperCase(),
            color: (nation.color as string) ?? "#888888",
            capitalName: (capitalProv?.displayName as string) ?? (capitalProv?.name as string) ?? "",
            government: (nation.government as string) ?? "unknown",
            region: deriveRegion(capitalProv),
            eras: [eraInfo],
          });
        }
      }
    } catch {
      // Skip scenarios that fail to load
    }
  }

  // Sort: multi-era nations first, then alphabetical
  const result = Array.from(countryMap.values()).sort((a, b) => {
    if (a.eras.length !== b.eras.length) return b.eras.length - a.eras.length;
    return a.name.localeCompare(b.name);
  });

  cachedIndex = result;
  return result;
}

/**
 * Invalidate the country index cache (e.g., after scenario changes).
 */
export function invalidateCountryIndex(): void {
  cachedIndex = null;
}

/**
 * Derive a region from province center coordinates.
 */
function deriveRegion(province?: Record<string, unknown>): CountryRegion {
  if (!province?.center) return "other";

  const center = province.center as [number, number];
  const [lon, lat] = center;

  // Rough geographic classification
  if (lat > 35 && lon > -15 && lon < 45) return "europe";
  if (lat > 10 && lat < 45 && lon > 25 && lon < 65) return "middle_east";
  if (lat < 35 && lon > -20 && lon < 55 && lat > -40) return "africa";
  if (lat > 25 && lon > 60 && lon < 90) return "central_asia";
  if (lat > 15 && lon > 90 && lon < 150) return "east_asia";
  if (lat > 0 && lat < 35 && lon > 65 && lon < 95) return "south_asia";
  if (lat > -15 && lat < 25 && lon > 90 && lon < 140) return "southeast_asia";
  if (lon > -170 && lon < -30) return "americas";
  if (lat < 0 && lon > 100) return "oceania";

  return "other";
}
