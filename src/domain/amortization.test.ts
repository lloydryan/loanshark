import { describe, expect, it } from "vitest";
import { generateSchedule, summarizeSchedule } from "./amortization";

describe("amortization", () => {
  for (const rate of ["0", "1", "3", "5", "10"]) {
    for (const term of [3, 6, 9, 12] as const) {
      it(`reconciles a ${term}-month loan at ${rate}%`, () => {
        const schedule = generateSchedule({ principalCentavos: 1_000_050, monthlyRatePercent: rate, termMonths: term, firstPaymentDate: "2026-01-31", method: "equal_amortization" });
        const totals = summarizeSchedule(schedule);
        expect(schedule).toHaveLength(term);
        expect(totals.totalPrincipalCentavos).toBe(1_000_050);
        expect(schedule.at(-1)?.closingPrincipalCentavos).toBe(0);
        expect(totals.totalRepaymentCentavos).toBe(totals.totalPrincipalCentavos + totals.totalInterestCentavos);
      });
    }
  }

  it("calculates compound-growth maturity", () => {
    const [row] = generateSchedule({ principalCentavos: 1_000_000, monthlyRatePercent: "5", termMonths: 3, firstPaymentDate: "2026-02-28", method: "lump_sum" });
    expect(row.scheduledPaymentCentavos).toBe(1_157_625);
    expect(row.interestCentavos).toBe(157_625);
  });

  it("handles month-end and leap-year due dates", () => {
    const schedule = generateSchedule({ principalCentavos: 100_000, monthlyRatePercent: "0", termMonths: 3, firstPaymentDate: "2028-01-31", method: "equal_amortization" });
    expect(schedule.map((row) => row.dueDate)).toEqual(["2028-01-31", "2028-02-29", "2028-03-31"]);
  });
});
