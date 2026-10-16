import Decimal from "decimal.js";
import type { Centavos } from "./types";

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export const ROUNDING_POLICY = "ROUND_HALF_UP to the nearest centavo; the final installment absorbs residual principal rounding.";

export function pesosToCentavos(value: Decimal.Value): Centavos {
  const centavos = new Decimal(value).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  if (!centavos.isInteger() || !centavos.isFinite() || centavos.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Money value is outside the supported range.");
  }
  return centavos.toNumber();
}

export function centavosToPesos(value: Centavos): Decimal {
  assertCentavos(value);
  return new Decimal(value).div(100);
}

export function assertCentavos(value: number): asserts value is Centavos {
  if (!Number.isSafeInteger(value)) throw new Error("Persisted money must be safe integer centavos.");
}

export function formatPHP(value: Centavos): string {
  assertCentavos(value);
  return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(value / 100);
}
