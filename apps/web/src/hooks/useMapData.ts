"use client";

import { useMemo } from "react";
import type { Province } from "@historia/shared";

/**
 * Get all renderable polygon rings from a province.
 * Returns array of rings, where each ring is an array of [lon, lat] pairs.
 * For MultiPolygon provinces, returns all exterior rings from all polygons.
 */
export function getProvinceRings(province: Province): [number, number][][] {
  if (province.multiPolygon && province.multiPolygon.length > 0) {
    // MultiPolygon: each element is a polygon with rings (exterior + holes)
    // We return all rings (exterior + holes) for proper rendering
    return province.multiPolygon.flat();
  }
  // Simple polygon: single ring
  return [province.polygon];
}

/**
 * Get only exterior rings (for hit-testing and fill).
 * For MultiPolygon, returns the first ring of each polygon (the exterior).
 */
export function getProvinceExteriorRings(
  province: Province
): [number, number][][] {
  if (province.multiPolygon && province.multiPolygon.length > 0) {
    return province.multiPolygon.map((poly) => poly[0]).filter(Boolean);
  }
  return [province.polygon];
}

/**
 * Point-in-polygon test for a province, supporting MultiPolygon.
 */
export function isPointInProvince(
  lon: number,
  lat: number,
  province: Province
): boolean {
  const exteriorRings = getProvinceExteriorRings(province);
  for (const ring of exteriorRings) {
    if (pointInRing(lon, lat, ring)) return true;
  }
  return false;
}

function pointInRing(
  x: number,
  y: number,
  ring: [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Compute bounding box of a province (all rings).
 */
export function getProvinceBounds(province: Province): {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
} {
  const rings = getProvinceExteriorRings(province);
  let minLon = Infinity,
    maxLon = -Infinity,
    minLat = Infinity,
    maxLat = -Infinity;
  for (const ring of rings) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return { minLon, maxLon, minLat, maxLat };
}

/**
 * Pre-compute province bounds for viewport culling.
 */
export function useProvinceBounds(
  provinces: Record<string, Province>
): Map<string, { minLon: number; maxLon: number; minLat: number; maxLat: number }> {
  return useMemo(() => {
    const bounds = new Map<
      string,
      { minLon: number; maxLon: number; minLat: number; maxLat: number }
    >();
    for (const [id, prov] of Object.entries(provinces)) {
      bounds.set(id, getProvinceBounds(prov));
    }
    return bounds;
  }, [provinces]);
}
