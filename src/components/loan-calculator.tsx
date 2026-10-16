"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Info, RotateCcw, WalletCards } from "lucide-react";
import {
  effectiveAnnualRatePercent,
  generateSchedule,
  summarizeSchedule,
} from "@/domain/amortization";
import { formatPHP, pesosToCentavos } from "@/domain/money";
import type { InterestMethod, LoanTerm } from "@/domain/types";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";
import { PageHeader, Panel } from "./ui/panel";
import { cn } from "@/lib/utils";

const defaultDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());

const methods: Array<{
  value: InterestMethod;
  label: string;
  description: string;
}> = [
  {
    value: "equal_amortization",
    label: "Equal monthly",
    description: "Declining balance with regular payments",
  },
  {
    value: "lump_sum",
    label: "Lump-sum",
    description: "One payment at contract maturity",
  },
];

export function LoanCalculator() {
  const [principal, setPrincipal] = useState("100000");
  const [rate, setRate] = useState("7");
  const [term, setTerm] = useState<LoanTerm>(3);
  const [method, setMethod] = useState<InterestMethod>("equal_amortization");
  const [firstPaymentDate, setFirstPaymentDate] = useState(defaultDate);

  const calculation = useMemo(() => {
    try {
      const principalCentavos = pesosToCentavos(principal);
      if (principalCentavos <= 0) throw new Error();
      const schedule = generateSchedule({
        principalCentavos,
        monthlyRatePercent: rate,
        termMonths: term,
        firstPaymentDate,
        method,
      });
      return {
        schedule,
        totals: summarizeSchedule(schedule),
        principalCentavos,
        error: "",
      };
    } catch {
      return {
        schedule: [],
        totals: {
          totalPrincipalCentavos: 0,
          totalInterestCentavos: 0,
          totalRepaymentCentavos: 0,
        },
        principalCentavos: 0,
        error: "Enter a valid principal, rate, and payment date.",
      };
    }
  }, [principal, rate, term, firstPaymentDate, method]);

  const annualRate = useMemo(() => {
    try {
      return Number(effectiveAnnualRatePercent(rate)).toFixed(2);
    } catch {
      return "—";
    }
  }, [rate]);

  function reset() {
    setPrincipal("100000");
    setRate("7");
    setTerm(3);
    setMethod("equal_amortization");
    setFirstPaymentDate(defaultDate);
  }

  const installment = calculation.schedule[0]?.scheduledPaymentCentavos;
  const interestShare = calculation.principalCentavos
    ? (
        (calculation.totals.totalInterestCentavos /
          calculation.principalCentavos) *
        100
      ).toFixed(2)
    : "0.00";

  return (
    <div className="min-w-0 space-y-7">
      <PageHeader
        title="Loan calculator"
        description="Model repayment terms and review the full contract schedule before creating a loan."
        actions={
          <Button variant="secondary" onClick={reset}>
            <RotateCcw size={16} /> Reset assumptions
          </Button>
        }
      />

      <div className="grid min-w-0 gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Panel className="h-fit p-5 xl:sticky xl:top-20">
          <div className="border-b pb-4">
            <h2 className="font-semibold">Loan assumptions</h2>
            <p className="mt-1 text-sm leading-5 text-muted">
              Adjust the terms to recalculate instantly.
            </p>
          </div>

          <div className="mt-5 grid gap-5">
            <Field
              label="Principal amount"
              error={calculation.error || undefined}
              hint="Amount the borrower will receive"
            >
              <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-medium text-muted">
                  ₱
                </span>
                <input
                  className={`${inputClass} numeric pl-8`}
                  inputMode="decimal"
                  aria-label="Principal amount in Philippine pesos"
                  value={principal}
                  onChange={(event) => setPrincipal(event.target.value)}
                />
              </div>
            </Field>

            <Field
              label="Monthly interest rate"
              hint="Applied to the outstanding principal"
            >
              <div className="relative">
                <input
                  className={`${inputClass} numeric pr-9`}
                  inputMode="decimal"
                  aria-label="Monthly interest rate percent"
                  value={rate}
                  onChange={(event) => setRate(event.target.value)}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted">
                  %
                </span>
              </div>
            </Field>

            <fieldset>
              <legend className="text-sm font-medium">
                Calculation method
              </legend>
              <div className="mt-2 grid gap-2">
                {methods.map((option) => (
                  <button
                    type="button"
                    key={option.value}
                    aria-pressed={method === option.value}
                    onClick={() => setMethod(option.value)}
                    className={cn(
                      "rounded-lg border p-3 text-left transition-colors",
                      method === option.value
                        ? "border-[#245a8d] bg-blue-50/70 dark:border-blue-400 dark:bg-blue-950/30"
                        : "hover:bg-slate-50 dark:hover:bg-slate-900/40",
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <span
                        className={cn(
                          "size-2 rounded-full border",
                          method === option.value
                            ? "border-[#245a8d] bg-[#245a8d] dark:border-blue-300 dark:bg-blue-300"
                            : "border-slate-400",
                        )}
                      />
                      {option.label}
                    </span>
                    <span className="mt-1 block pl-4 text-xs leading-5 text-muted">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium">Term</legend>
              <div className="mt-2 grid grid-cols-4 rounded-lg border bg-slate-50 p-1 dark:bg-slate-900/40">
                {([3, 6, 9, 12] as LoanTerm[]).map((months) => (
                  <button
                    type="button"
                    key={months}
                    aria-pressed={term === months}
                    onClick={() => setTerm(months)}
                    className={cn(
                      "h-9 rounded-md text-sm font-medium transition-colors",
                      term === months
                        ? "bg-panel text-foreground shadow-sm"
                        : "text-muted hover:text-foreground",
                    )}
                  >
                    {months}m
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              label="First payment date"
              hint="Following dates repeat monthly"
            >
              <div className="relative">
                <CalendarDays
                  size={16}
                  className="pointer-events-none absolute left-3 top-3 text-muted"
                />
                <input
                  className={`${inputClass} pl-9`}
                  type="date"
                  value={firstPaymentDate}
                  onChange={(event) => setFirstPaymentDate(event.target.value)}
                />
              </div>
            </Field>
          </div>

          <div className="mt-5 flex gap-2 border-t pt-4 text-xs leading-5 text-muted">
            <Info size={15} className="mt-0.5 shrink-0" />
            This is a planning preview only. No loan or ledger entry is created.
          </div>
        </Panel>

        <div className="min-w-0 space-y-5">
          <section className="grid gap-3 lg:grid-cols-[1.35fr_.65fr]">
            <Panel className="bg-[#0f2744] p-6 text-white dark:bg-slate-100 dark:text-slate-950">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-300 dark:text-slate-600">
                    {method === "lump_sum"
                      ? "Payment at maturity"
                      : "Estimated monthly payment"}
                  </p>
                  <p className="numeric mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
                    {installment === undefined ? "—" : formatPHP(installment)}
                  </p>
                </div>
                <WalletCards className="text-emerald-300 dark:text-emerald-700" />
              </div>
              <div className="mt-8 grid grid-cols-2 gap-4 border-t border-white/15 pt-4 text-sm dark:border-slate-300">
                <div>
                  <p className="text-slate-300 dark:text-slate-600">
                    Total repayment
                  </p>
                  <p className="numeric mt-1 font-semibold">
                    {formatPHP(calculation.totals.totalRepaymentCentavos)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-slate-300 dark:text-slate-600">
                    Number of payments
                  </p>
                  <p className="numeric mt-1 font-semibold">
                    {calculation.schedule.length}
                  </p>
                </div>
              </div>
            </Panel>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-1">
              <Panel className="p-4">
                <p className="text-xs text-muted">Scheduled interest</p>
                <p className="numeric mt-2 text-xl font-semibold">
                  {formatPHP(calculation.totals.totalInterestCentavos)}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {interestShare}% of principal
                </p>
              </Panel>
              <Panel className="p-4">
                <p className="text-xs text-muted">Effective annual rate</p>
                <p className="numeric mt-2 text-xl font-semibold">
                  {annualRate}%
                </p>
                <p className="mt-1 text-xs text-muted">
                  Monthly rate compounded
                </p>
              </Panel>
            </div>
          </section>

          <Panel className="min-w-0 overflow-hidden">
            <div className="flex flex-col gap-3 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-semibold">Repayment schedule</h2>
                <p className="mt-1 text-sm text-muted">
                  Values use half-up rounding; the final payment absorbs
                  residual principal.
                </p>
              </div>
              <span className="w-fit rounded-full border px-2.5 py-1 text-xs font-medium text-muted">
                {calculation.schedule.length} payment
                {calculation.schedule.length === 1 ? "" : "s"}
              </span>
            </div>

            {calculation.schedule.length === 0 ? (
              <div className="p-10 text-center">
                <p className="font-medium">Schedule unavailable</p>
                <p className="mt-1 text-sm text-muted">
                  Correct the assumptions to generate repayment dates.
                </p>
              </div>
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead className="bg-slate-50 text-xs text-muted dark:bg-slate-900/40">
                      <tr>
                        <th className="px-4 py-3 text-left">Payment</th>
                        <th className="px-4 py-3 text-left">Due date</th>
                        {[
                          "Opening balance",
                          "Payment",
                          "Interest",
                          "Principal",
                          "Closing balance",
                        ].map((heading) => (
                          <th key={heading} className="px-4 py-3 text-right">
                            {heading}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {calculation.schedule.map((row) => (
                        <tr
                          key={row.installmentNumber}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-900/30"
                        >
                          <td className="px-4 py-3 font-medium">
                            #{row.installmentNumber}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {row.dueDate}
                          </td>
                          {[
                            row.openingPrincipalCentavos,
                            row.scheduledPaymentCentavos,
                            row.interestCentavos,
                            row.principalCentavos,
                            row.closingPrincipalCentavos,
                          ].map((value, index) => (
                            <td
                              key={index}
                              className={cn(
                                "numeric whitespace-nowrap px-4 py-3 text-right",
                                index === 1 && "font-semibold",
                              )}
                            >
                              {formatPHP(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="divide-y md:hidden">
                  {calculation.schedule.map((row) => (
                    <article className="p-4" key={row.installmentNumber}>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-xs text-muted">
                            Payment {row.installmentNumber}
                          </p>
                          <p className="mt-1 text-sm font-medium">
                            {row.dueDate}
                          </p>
                        </div>
                        <p className="numeric text-right font-semibold">
                          {formatPHP(row.scheduledPaymentCentavos)}
                        </p>
                      </div>
                      <dl className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3 border-t pt-3 text-sm">
                        <div>
                          <dt className="text-xs text-muted">Principal</dt>
                          <dd className="numeric mt-1">
                            {formatPHP(row.principalCentavos)}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs text-muted">Interest</dt>
                          <dd className="numeric mt-1">
                            {formatPHP(row.interestCentavos)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted">Opening</dt>
                          <dd className="numeric mt-1">
                            {formatPHP(row.openingPrincipalCentavos)}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs text-muted">Closing</dt>
                          <dd className="numeric mt-1">
                            {formatPHP(row.closingPrincipalCentavos)}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
