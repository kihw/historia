import type { DeterminismConfig } from "../types/scenario.js";

export const DETERMINISM_PRESETS: Record<string, DeterminismConfig> = {
  sandbox_pure: {
    simulationIntensity: 0.3,
    historicalConstraint: 0.0,
    fantasyFreedom: 0.8,
  },
  hybrid: {
    simulationIntensity: 0.6,
    historicalConstraint: 0.5,
    fantasyFreedom: 0.2,
  },
  historical_strict: {
    simulationIntensity: 0.9,
    historicalConstraint: 0.9,
    fantasyFreedom: 0.0,
  },
};

export const DEFAULT_TURN_DURATION = "1_month" as const;

export const RELATION_MIN = -200;
export const RELATION_MAX = 200;
export const STABILITY_MIN = 0;
export const STABILITY_MAX = 100;
export const MORALE_MIN = 0;
export const MORALE_MAX = 1;
export const TAX_RATE_MIN = 0;
export const TAX_RATE_MAX = 0.5;
