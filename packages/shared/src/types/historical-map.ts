/**
 * Historical world map data types.
 * Supports GeoJSON-based country boundaries that evolve over time.
 */

export interface HistoricalWorldData {
  eras: HistoricalEra[];
  metadata: HistoricalDataMetadata;
}

export interface HistoricalDataMetadata {
  source: string;
  version: string;
  projection: "equirectangular" | "mercator";
  simplification: "110m" | "50m" | "10m";
}

export interface HistoricalEra {
  year: number;
  label: string;
  description: string;
  countries: HistoricalCountry[];
}

export interface HistoricalCountry {
  id: string;
  name: string;
  color: string;
  capital?: [number, number];
  capitalName?: string;
  government?: string;
  polygons: GeoPolygon[];
}

/**
 * A polygon is an array of coordinate rings.
 * First ring is the exterior, subsequent rings are holes.
 * Coordinates are [longitude, latitude].
 */
export type GeoPolygon = [number, number][][];

/**
 * Simplified GeoJSON Feature for country boundaries.
 */
export interface GeoJSONFeature {
  type: "Feature";
  properties: {
    NAME: string;
    ISO_A3?: string;
    ISO_A2?: string;
    ADMIN?: string;
    SOVEREIGNT?: string;
    [key: string]: unknown;
  };
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  };
}

export interface GeoJSONCollection {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
}

/**
 * Configuration for the world map overlay in the editor.
 */
export interface WorldMapOverlayConfig {
  enabled: boolean;
  year: number;
  opacity: number;
  showLabels: boolean;
  showBorders: boolean;
  showCapitals: boolean;
}
