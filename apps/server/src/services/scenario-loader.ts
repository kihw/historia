import { readFile, readdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { validateScenario, type ScenarioInput } from "@historia/shared";
import type { GameState, Province } from "@historia/shared";

const SCENARIOS_DIR = join(import.meta.dirname, "../../../../scenarios/templates");

/**
 * Load all available scenarios from the templates directory.
 */
export async function listScenarios(): Promise<
  { id: string; name: string; era: string; description: string }[]
> {
  const files = await readdir(SCENARIOS_DIR);
  const scenarios = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await readFile(join(SCENARIOS_DIR, file), "utf-8");
      const data = JSON.parse(raw);
      scenarios.push({
        id: data.meta?.id ?? file.replace(".json", ""),
        name: data.meta?.name ?? file,
        era: data.meta?.era ?? "unknown",
        description: data.meta?.description ?? "",
      });
    } catch {
      // Skip invalid files
    }
  }

  return scenarios;
}

/**
 * Load raw scenario JSON by ID.
 */
export async function loadScenarioRaw(scenarioId: string): Promise<ScenarioInput> {
  const filePath = join(SCENARIOS_DIR, `${scenarioId}.json`);
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as ScenarioInput;
}

/**
 * Save a scenario to the templates directory.
 */
export async function saveScenario(scenarioId: string, data: ScenarioInput): Promise<void> {
  // Sanitize the id to prevent path traversal
  const safeId = scenarioId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("Invalid scenario ID");

  validateScenario(data);
  const filePath = join(SCENARIOS_DIR, `${safeId}.json`);
  await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/**
 * Load a scenario by ID and convert it into an initial GameState.
 */
export async function loadScenario(scenarioId: string): Promise<GameState> {
  const filePath = join(SCENARIOS_DIR, `${scenarioId}.json`);
  const raw = await readFile(filePath, "utf-8");
  const data = JSON.parse(raw) as ScenarioInput;

  // Validate
  validateScenario(data);

  return scenarioToGameState(data);
}

/**
 * Convert a validated scenario into an initial GameState.
 */
function scenarioToGameState(scenario: ScenarioInput): GameState {
  // Build provinces map
  const provinces: Record<string, Province> = {};
  for (const prov of scenario.map.provinces) {
    provinces[prov.id] = prov as Province;
  }

  // Build nations map
  const nations: Record<string, import("@historia/shared").Nation> = {};
  for (const nation of scenario.nations) {
    nations[nation.id] = nation as import("@historia/shared").Nation;
  }

  return {
    gameId: "",
    scenarioId: scenario.meta.id,
    currentTurn: 0,
    currentDate: scenario.meta.startDate,
    turnDuration: scenario.config.turnDuration.default,
    determinism: scenario.config.determinism,
    nations,
    provinces,
    activeWars: [],
    activeTreaties: [],
    pendingEvents: scenario.events.causalGraph.nodes.map((n: { id: string }) => n.id),
    occurredEvents: [],
    causalGraph: scenario.events.causalGraph as import("@historia/shared").CausalGraph,
    globalModifiers: [],
  };
}

/**
 * Delete a scenario file by ID.
 */
export async function deleteScenario(scenarioId: string): Promise<void> {
  const safeId = scenarioId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) throw new Error("Invalid scenario ID");
  const filePath = join(SCENARIOS_DIR, `${safeId}.json`);
  await unlink(filePath);
}
