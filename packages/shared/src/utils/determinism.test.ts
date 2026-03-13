import { describe, it, expect } from "vitest";
import { createRNG, randomInt, probabilityCheck } from "./determinism.js";

describe("Seeded RNG", () => {
  it("should produce deterministic results for the same seed", () => {
    const rng1 = createRNG(42);
    const rng2 = createRNG(42);

    const results1 = Array.from({ length: 10 }, () => rng1());
    const results2 = Array.from({ length: 10 }, () => rng2());

    expect(results1).toEqual(results2);
  });

  it("should produce different results for different seeds", () => {
    const rng1 = createRNG(42);
    const rng2 = createRNG(43);

    const result1 = rng1();
    const result2 = rng2();

    expect(result1).not.toBe(result2);
  });

  it("should produce values between 0 and 1", () => {
    const rng = createRNG(12345);
    for (let i = 0; i < 1000; i++) {
      const val = rng();
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(1);
    }
  });
});

describe("randomInt", () => {
  it("should produce integers within range", () => {
    const rng = createRNG(99);
    for (let i = 0; i < 100; i++) {
      const val = randomInt(rng, 1, 6);
      expect(val).toBeGreaterThanOrEqual(1);
      expect(val).toBeLessThanOrEqual(6);
      expect(Number.isInteger(val)).toBe(true);
    }
  });
});

describe("probabilityCheck", () => {
  it("should always pass with probability 1", () => {
    const rng = createRNG(1);
    for (let i = 0; i < 100; i++) {
      expect(probabilityCheck(rng, 1)).toBe(true);
    }
  });

  it("should never pass with probability 0", () => {
    const rng = createRNG(1);
    for (let i = 0; i < 100; i++) {
      expect(probabilityCheck(rng, 0)).toBe(false);
    }
  });
});
