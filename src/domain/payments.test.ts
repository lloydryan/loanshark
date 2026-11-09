import { describe, expect, it } from "vitest";
import { allocatePayment, eligibleInstallmentsForPayment } from "./payments";
import type { InstallmentBalance } from "./types";

const rows: InstallmentBalance[] = [{ installmentNumber: 1, dueDate: "2026-01-01", openingPrincipalCentavos: 10000, scheduledPaymentCentavos: 11000, interestCentavos: 1000, principalCentavos: 10000, closingPrincipalCentavos: 0, interestPaidCentavos: 0, principalPaidCentavos: 0, outstandingInterestCentavos: 1000, outstandingPrincipalCentavos: 10000, status: "overdue" }];

describe("payment allocation", () => {
  it("allocates interest before principal", () => expect(allocatePayment(4000, rows).allocations[0]).toEqual({ installmentNumber: 1, interestCentavos: 1000, principalCentavos: 3000 }));
  it("allocates a full installment exactly", () => expect(allocatePayment(11000, rows)).toEqual({ allocations: [{ installmentNumber: 1, interestCentavos: 1000, principalCentavos: 10000 }], unappliedCentavos: 0 }));
  it("allocates across multiple installments in order", () => {
    const second = { ...rows[0], installmentNumber: 2, dueDate: "2026-02-01" };
    expect(allocatePayment(15000, [...rows, second]).allocations).toEqual([
      { installmentNumber: 1, interestCentavos: 1000, principalCentavos: 10000 },
      { installmentNumber: 2, interestCentavos: 1000, principalCentavos: 3000 },
    ]);
  });
  it("supports a second partial payment against remaining balances", () => {
    const first = allocatePayment(4000, rows).allocations[0];
    const updated = [{ ...rows[0], interestPaidCentavos: first.interestCentavos, principalPaidCentavos: first.principalCentavos, outstandingInterestCentavos: 0, outstandingPrincipalCentavos: 7000 }];
    expect(allocatePayment(7000, updated).allocations[0]).toEqual({ installmentNumber: 1, interestCentavos: 0, principalCentavos: 7000 });
  });
  it("rejects overpayment", () => expect(() => allocatePayment(11001, rows)).toThrow(/exceeds/));
  it("rejects zero payment", () => expect(() => allocatePayment(0, rows)).toThrow(/positive/));

  it("applies an early partial payment to principal without collecting unaccrued interest", () => {
    const upcoming = [{ ...rows[0], dueDate: "2026-12-01", status: "upcoming" as const }];
    const eligible = eligibleInstallmentsForPayment(
      upcoming,
      "2026-11-08",
      false,
      "advance_installments",
    );

    expect(allocatePayment(5_000, eligible)).toEqual({
      allocations: [
        {
          installmentNumber: 1,
          interestCentavos: 0,
          principalCentavos: 5_000,
        },
      ],
      unappliedCentavos: 0,
    });
    expect(upcoming[0].outstandingInterestCentavos).toBe(1_000);
  });
});
