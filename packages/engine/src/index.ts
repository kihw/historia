export { resolveTurn, type TurnActions } from "./core/game-loop.js";
export { resolveEconomy } from "./systems/economy.js";
export { resolveDiplomacy } from "./systems/diplomacy.js";
export { resolveMilitary } from "./systems/military.js";
export { resolvePopulation } from "./systems/population.js";
export { resolveTechnology, getTechBonuses } from "./systems/technology.js";
export { resolveEspionage } from "./systems/espionage.js";
export { evaluateEvents, type EventEvaluationResult } from "./events/event-evaluator.js";
export {
  evaluateAction,
  type DeterminismDecision,
  type DeterminismVerdict,
  type Constraint,
} from "./modular-determinism/intensity.js";
