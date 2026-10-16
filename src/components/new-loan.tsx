"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { generateSchedule, summarizeSchedule } from "@/domain/amortization";
import { formatPHP, pesosToCentavos } from "@/domain/money";
import type { InterestMethod, LoanTerm } from "@/domain/types";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";
import { PageHeader, Panel } from "./ui/panel";
type Borrower = { id: string; fullName: string };
export function NewLoan() {
  const router = useRouter();
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [borrowerId, setBorrowerId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("5");
  const [term, setTerm] = useState<LoanTerm>(3);
  const [method, setMethod] = useState<InterestMethod>("equal_amortization");
  const [release, setRelease] = useState(new Date().toISOString().slice(0, 10));
  const [first, setFirst] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    fetch("/api/borrowers")
      .then((r) => r.json())
      .then((x) => {
        setBorrowers(x.data ?? []);
        if (x.data?.[0]) setBorrowerId(x.data[0].id);
      });
  }, []);
  const schedule = useMemo(() => {
    try {
      return generateSchedule({
        principalCentavos: pesosToCentavos(principal),
        monthlyRatePercent: rate,
        termMonths: term,
        firstPaymentDate: first,
        method,
      });
    } catch {
      return [];
    }
  }, [principal, rate, term, first, method]);
  const total = summarizeSchedule(schedule);
  async function submit() {
    if (!confirmed)
      return toast.error("Confirm that you reviewed the contractual schedule.");
    setSaving(true);
    const response = await fetch("/api/loans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        borrowerId,
        principalCentavos: pesosToCentavos(principal),
        monthlyRatePercent: rate,
        termMonths: term,
        releaseDate: release,
        firstPaymentDate: first,
        method,
        notes,
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) return toast.error(result.error);
    toast.success(`Loan ${result.loanId} released.`);
    idempotencyKey.current = crypto.randomUUID();
    router.push("/loans");
  }
  return (
    <div className="space-y-7">
      <PageHeader
        title="Create & release loan"
        description="Review the immutable contract schedule before funds leave the cash account."
      />
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <Panel className="h-fit p-5">
          <div className="grid gap-4">
            <Field label="Borrower">
              <select
                className={inputClass}
                value={borrowerId}
                onChange={(e) => setBorrowerId(e.target.value)}
                required
              >
                <option value="">Select borrower</option>
                {borrowers.map((x) => (
                  <option value={x.id} key={x.id}>
                    {x.fullName}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Principal (PHP)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={principal}
                onChange={(e) => {
                  setPrincipal(e.target.value);
                  setConfirmed(false);
                }}
                required
              />
            </Field>
            <Field label="Monthly interest rate (%)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={rate}
                onChange={(e) => {
                  setRate(e.target.value);
                  setConfirmed(false);
                }}
              />
            </Field>
            <Field label="Method">
              <select
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value as InterestMethod)}
              >
                <option value="equal_amortization">Equal amortization</option>
                <option value="lump_sum">Lump-sum maturity</option>
              </select>
            </Field>
            <Field label="Term">
              <select
                className={inputClass}
                value={term}
                onChange={(e) => setTerm(Number(e.target.value) as LoanTerm)}
              >
                {[3, 6, 9, 12].map((x) => (
                  <option key={x} value={x}>
                    {x} months
                  </option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Release date">
                <input
                  type="date"
                  className={inputClass}
                  value={release}
                  onChange={(e) => setRelease(e.target.value)}
                />
              </Field>
              <Field label="First payment">
                <input
                  type="date"
                  className={inputClass}
                  value={first}
                  onChange={(e) => setFirst(e.target.value)}
                  required
                />
              </Field>
            </div>
            <Field label="Notes">
              <textarea
                className={`${inputClass} h-20 py-2`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
          </div>
        </Panel>
        <div className="space-y-4">
          <section className="grid gap-3 sm:grid-cols-3">
            <Panel className="p-4">
              <p className="text-xs text-muted">Installment</p>
              <p className="numeric mt-2 text-xl font-semibold">
                {schedule[0]
                  ? formatPHP(schedule[0].scheduledPaymentCentavos)
                  : "—"}
              </p>
            </Panel>
            <Panel className="p-4">
              <p className="text-xs text-muted">Scheduled interest</p>
              <p className="numeric mt-2 text-xl font-semibold">
                {formatPHP(total.totalInterestCentavos)}
              </p>
            </Panel>
            <Panel className="p-4">
              <p className="text-xs text-muted">Total repayment</p>
              <p className="numeric mt-2 text-xl font-semibold">
                {formatPHP(total.totalRepaymentCentavos)}
              </p>
            </Panel>
          </section>
          <Panel className="overflow-hidden">
            <div className="border-b p-4">
              <h2 className="font-semibold">Schedule preview</h2>
              <p className="text-sm text-muted">
                This original schedule is retained for audit.
              </p>
            </div>
            <div className="max-h-[420px] overflow-auto">
              <table className="w-full min-w-[650px] text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs text-muted dark:bg-slate-900">
                  <tr>
                    {[
                      "#",
                      "Due",
                      "Payment",
                      "Interest",
                      "Principal",
                      "Balance",
                    ].map((x) => (
                      <th
                        className="px-4 py-3 text-right first:text-left"
                        key={x}
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {schedule.map((x) => (
                    <tr key={x.installmentNumber}>
                      <td className="px-4 py-3">{x.installmentNumber}</td>
                      <td className="px-4 py-3 text-right">{x.dueDate}</td>
                      {[
                        x.scheduledPaymentCentavos,
                        x.interestCentavos,
                        x.principalCentavos,
                        x.closingPrincipalCentavos,
                      ].map((v, i) => (
                        <td className="numeric px-4 py-3 text-right" key={i}>
                          {formatPHP(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I reviewed the borrower, terms, dates, and full contractual
                schedule. Releasing creates a posted disbursement.
              </span>
            </label>
            <Button
              className="shrink-0"
              disabled={saving || !schedule.length || !borrowerId}
              onClick={submit}
            >
              {saving ? "Posting…" : "Confirm & release"}
            </Button>
          </Panel>
        </div>
      </div>
    </div>
  );
}
