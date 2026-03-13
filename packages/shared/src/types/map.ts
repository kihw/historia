export interface Province {
  id: string;
  name: string;
  displayName: string;
  terrain: TerrainType;
  isCoastal: boolean;
  /** Simple polygon ring [lon, lat][] — used for single-polygon provinces */
  polygon: [number, number][];
  /** MultiPolygon rings for complex geometries (islands, exclaves).
   *  Format: [polygon][ring][coord] where ring 0 is exterior, rest are holes.
   *  When present, this is used for rendering instead of polygon. */
  multiPolygon?: [number, number][][][];
  center: [number, number];
  neighbors: string[];
  baseTax: number;
  baseProduction: number;
  baseManpower: number;
  hasPort: boolean;
  fortLevel: number;
  resources: ResourceType[];
  buildings: string[];
  isCapital: boolean;
  owner: string;
  controller: string;
  occupation?: OccupationState;
}

export type TerrainType =
  | "plains"
  | "hills"
  | "mountains"
  | "forest"
  | "desert"
  | "marsh"
  | "ocean"
  | "coastal"
  | "arctic"
  | "jungle";

export type ResourceType =
  | "grain"
  | "wine"
  | "iron"
  | "gold"
  | "coal"
  | "oil"
  | "cotton"
  | "spices"
  | "silk"
  | "fish"
  | "wood"
  | "copper"
  | "salt";

export interface OccupationState {
  occupier: string;
  progress: number;
  startTurn: number;
}

export interface MapConfig {
  type: "province";
  projection: "mercator" | "equirectangular" | "custom";
  bounds: MapBounds;
  terrainTypes: TerrainType[];
}

export interface MapBounds {
  north: number;
  south: number;
  west: number;
  east: number;
}
