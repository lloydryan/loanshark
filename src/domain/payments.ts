import type { Centavos, InstallmentBalance, PaymentAllocation } from "./types";
import { assertCentavos } from "./money";

export interface AllocationResult {
  allocations: PaymentAllocation[];
  unappliedCentavos: Centavos;
}

export type EarlyPaymentPolicy =
  | "advance_installments"
  | "principal_prepayment";

/**
 * Returns the balances a payment may be applied to on its posting date.
 * Interest on future installments is never collectible before it accrues, but
 * their principal may be paid early under either supported early-payment policy.
 */
export function eligibleInstallmentsForPayment(
  installments: InstallmentBalance[],
  paymentDate: string,
  isFullSettlement: boolean,
  earlyPaymentPolicy: EarlyPaymentPolicy = "advance_installments",
): InstallmentBalance[] {
  return installments
    .filter(
      (row) =>
        isFullSettlement ||
        row.dueDate <= paymentDate ||
        ["advance_installments", "principal_prepayment"].includes(
          earlyPaymentPolicy,
        ),
    )
    .map((row) =>
      row.dueDate > paymentDate
        ? { ...row, outstandingInterestCentavos: 0 }
        : row,
    );
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
