import { describe, expect, it } from "vitest";
import { assertBalanced, paymentJournal, reverseJournal } from "./ledger";

describe("double-entry ledger", () => {
  it("creates balanced payment and compensating reversal entries", () => {
    const payment = paymentJournal({ id: "JE_1", occurredAt: "2026-01-01T00:00:00+08:00", paymentId: "PAY_1", loanId: "LOAN_1", borrowerId: "BOR_1", principalCentavos: 9_000, interestCentavos: 1_000 });
    expect(() => assertBalanced(payment.lines)).not.toThrow();
    const reversal = reverseJournal(payment, "JE_2", "2026-01-02T00:00:00+08:00");
    expect(reversal.lines[0].creditCentavos).toBe(10_000);
    expect(() => assertBalanced(reversal.lines)).not.toThrow();
  });

  it("rejects an unbalanced journal", () => expect(() => assertBalanced([
    { account: "cash", debitCentavos: 100, creditCentavos: 0 },
    { account: "capital", debitCentavos: 0, creditCentavos: 99 },
  ])).toThrow(/Unbalanced/));
});
