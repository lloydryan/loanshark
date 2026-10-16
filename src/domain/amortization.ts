import Decimal from "decimal.js";
import { addMonths, format, parseISO } from "date-fns";
import { assertCentavos, pesosToCentavos } from "./money";
import type { Centavos, ContractInstallment, InterestMethod, LoanTerm } from "./types";

export interface ScheduleInput {
  principalCentavos: Centavos;
  monthlyRatePercent: string;
  termMonths: LoanTerm;
  firstPaymentDate: string;
  method: InterestMethod;
}

function dueDate(first: string, offset: number) {
  return format(addMonths(parseISO(`${first}T12:00:00`), offset), "yyyy-MM-dd");
}

export function effectiveAnnualRatePercent(monthlyRatePercent: string): string {
  const r = new Decimal(monthlyRatePercent).div(100);
  return r.plus(1).pow(12).minus(1).mul(100).toDecimalPlaces(6).toFixed(6);
}

export function generateSchedule(input: ScheduleInput): ContractInstallment[] {
  assertCentavos(input.principalCentavos);
  if (input.principalCentavos <= 0) throw new Error("Principal must be positive.");
  const rate = new Decimal(input.monthlyRatePercent).div(100);
  if (rate.isNegative() || !rate.isFinite()) throw new Error("Interest rate must be non-negative.");

  if (input.method === "lump_sum") {
    const maturity = pesosToCentavos(new Decimal(input.principalCentavos).div(100).mul(rate.plus(1).pow(input.termMonths)));
    return [{
      installmentNumber: 1,
      dueDate: dueDate(input.firstPaymentDate, input.termMonths - 1),
      openingPrincipalCentavos: input.principalCentavos,
      scheduledPaymentCentavos: maturity,
      interestCentavos: maturity - input.principalCentavos,
      principalCentavos: input.principalCentavos,
      closingPrincipalCentavos: 0,
    }];
  }

  const principalPesos = new Decimal(input.principalCentavos).div(100);
  const paymentPesos = rate.isZero()
    ? principalPesos.div(input.termMonths)
    : principalPesos.mul(rate.mul(rate.plus(1).pow(input.termMonths))).div(rate.plus(1).pow(input.termMonths).minus(1));
  const regularPayment = pesosToCentavos(paymentPesos);
  let balance = input.principalCentavos;
  const rows: ContractInstallment[] = [];

  for (let i = 1; i <= input.termMonths; i++) {
    const opening = balance;
    const interest = rate.isZero() ? 0 : pesosToCentavos(new Decimal(opening).div(100).mul(rate));
    const principal = i === input.termMonths ? opening : Math.min(opening, regularPayment - interest);
    const payment = principal + interest;
    balance = opening - principal;
    rows.push({
      installmentNumber: i,
      dueDate: dueDate(input.firstPaymentDate, i - 1),
      openingPrincipalCentavos: opening,
      scheduledPaymentCentavos: payment,
      interestCentavos: interest,
      principalCentavos: principal,
      closingPrincipalCentavos: balance,
    });
  }
  return rows;
}

export function summarizeSchedule(rows: ContractInstallment[]) {
  return rows.reduce((total, row) => ({
    totalPrincipalCentavos: total.totalPrincipalCentavos + row.principalCentavos,
    totalInterestCentavos: total.totalInterestCentavos + row.interestCentavos,
    totalRepaymentCentavos: total.totalRepaymentCentavos + row.scheduledPaymentCentavos,
  }), { totalPrincipalCentavos: 0, totalInterestCentavos: 0, totalRepaymentCentavos: 0 });
}
