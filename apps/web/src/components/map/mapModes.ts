import type { MapMode } from "./layers/types";

export interface MapModeConfig {
  id: MapMode;
  label: string;
  icon: string;
}

export const MAP_MODES: MapModeConfig[] = [
  { id: "political", label: "Political", icon: "\u2691" },
  { id: "terrain", label: "Terrain", icon: "\u26F0" },
  { id: "trade", label: "Trade", icon: "\u2696" },
  { id: "diplomatic", label: "Diplo", icon: "\u2694" },
  { id: "military", label: "Military", icon: "\u2618" },
];
