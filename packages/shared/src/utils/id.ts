let counter = 0;

/**
 * Generate a simple unique ID. For production, use crypto.randomUUID().
 */
export function generateId(prefix?: string): string {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate a deterministic ID from a seed (useful for tests).
 */
export function deterministicId(seed: string, index?: number): string {
  const idx = index ?? counter++;
  return `${seed}_${idx.toString(36).padStart(4, "0")}`;
}
