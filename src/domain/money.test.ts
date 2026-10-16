import { describe, expect, it } from "vitest";
import { assertCentavos, pesosToCentavos } from "./money";

describe("money boundaries", () => {
  it("rounds decimal pesos half-up to integer centavos", () => expect(pesosToCentavos("100.005")).toBe(10001));
  it("does not exhibit binary floating-point drift", () => expect(pesosToCentavos("0.1")).toBe(10));
  it("rejects non-integer persisted money", () => expect(() => assertCentavos(10.5)).toThrow(/integer centavos/));
});
