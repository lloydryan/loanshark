import type { Centavos, InstallmentBalance, PaymentAllocation } from "./types";
import { assertCentavos } from "./money";

export interface AllocationResult {
  allocations: PaymentAllocation[];
  unappliedCentavos: Centavos;
}

export function allocatePayment(amountCentavos: Centavos, installments: InstallmentBalance[]): AllocationResult {
  assertCentavos(amountCentavos);
  if (amountCentavos <= 0) throw new Error("Payment must be positive.");
  const totalOutstanding = installments.reduce((sum, row) => sum + row.outstandingInterestCentavos + row.outstandingPrincipalCentavos, 0);
  if (amountCentavos > totalOutstanding) throw new Error("Payment exceeds the current collectible balance.");

  let remaining = amountCentavos;
  const allocations: PaymentAllocation[] = [];
  for (const row of [...installments].sort((a, b) => a.installmentNumber - b.installmentNumber)) {
    if (!remaining) break;
    const interestCentavos = Math.min(remaining, row.outstandingInterestCentavos);
    remaining -= interestCentavos;
    const principalCentavos = Math.min(remaining, row.outstandingPrincipalCentavos);
    remaining -= principalCentavos;
    if (interestCentavos || principalCentavos) allocations.push({ installmentNumber: row.installmentNumber, interestCentavos, principalCentavos });
  }
  return { allocations, unappliedCentavos: remaining };
}
