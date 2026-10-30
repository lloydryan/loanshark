"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { formatPHP, pesosToCentavos } from "@/domain/money";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";
import { PageHeader, Panel } from "./ui/panel";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
type Loan = {
  id: string;
  borrowerId: string;
  remainingPrincipalCentavos: number;
  accruedInterestCentavos: number;
  status: string;
};
type Borrower = {
  id: string;
  fullName: string;
};
type Payment = {
  id: string;
  receiptNumber: string;
  loanId: string;
  paymentDate: string;
  amountCentavos: number;
  principalCentavos: number;
  interestCentavos: number;
  method: string;
};
export function Payments() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [history, setHistory] = useState<Payment[]>([]);
  const [loanId, setLoanId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());
  async function load() {
    const [a, b, c] = await Promise.all([
      fetch("/api/loans").then((r) => r.json()),
      fetch("/api/payments").then((r) => r.json()),
      fetch("/api/borrowers?limit=100").then((r) => r.json()),
    ]);
    setLoans(
      (a.data ?? []).filter((x: Loan) =>
        ["active", "overdue"].includes(x.status),
      ),
    );
    setHistory(b.data ?? []);
    setBorrowers(c.data ?? []);
  }
  useEffect(() => {
    load();
  }, []);
  const selected = useMemo(
    () => loans.find((x) => x.id === loanId),
    [loans, loanId],
  );
  const borrowerNames = useMemo(
    () => new Map(borrowers.map((borrower) => [borrower.id, borrower.fullName])),
    [borrowers],
  );
  const loanLabel = (loan: Loan) =>
    `${borrowerNames.get(loan.borrowerId) ?? "Unknown borrower"} · ${loan.id}`;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      pesosToCentavos(amount);
      setConfirming(true);
    } catch {
      toast.error("Enter a valid payment amount.");
    }
  }
  async function postPayment() {
    setPosting(true);
    const r = await fetch("/api/payments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        loanId,
        amountCentavos: pesosToCentavos(amount),
        paymentDate: date,
        method,
        referenceNumber: reference,
        notes,
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const x = await r.json();
    setPosting(false);
    if (!r.ok) return toast.error(x.error);
    setConfirming(false);
    toast.success(`Payment posted. Receipt ${x.receiptNumber}`);
    idempotencyKey.current = crypto.randomUUID();
    setAmount("");
    setReference("");
    setNotes("");
    load();
  }
  return (
    <div className="space-y-7">
      <PageHeader
        title="Payments"
        description="Post borrower collections with deterministic interest-first allocation."
      />
      <div className="grid gap-5 xl:grid-cols-[400px_1fr]">
        <Panel className="h-fit p-5">
          <h2 className="font-semibold">Record payment</h2>
          <p className="mt-1 text-sm text-muted">
            Amounts update only after the server transaction commits.
          </p>
          <form className="mt-5 grid gap-4" onSubmit={submit}>
            <Field label="Loan">
              <select
                className={inputClass}
                value={loanId}
                onChange={(e) => setLoanId(e.target.value)}
                required
              >
                <option value="">Select active loan</option>
                {[...loans]
                  .sort((a, b) => loanLabel(a).localeCompare(loanLabel(b)))
                  .map((x) => (
                  <option key={x.id} value={x.id}>
                    {loanLabel(x)}
                  </option>
                  ))}
              </select>
            </Field>
            {selected && (
              <div className="rounded-lg border bg-slate-50 p-3 text-sm dark:bg-slate-900/40">
                <div className="flex justify-between">
                  <span className="text-muted">Principal balance</span>
                  <strong className="numeric">
                    {formatPHP(selected.remainingPrincipalCentavos)}
                  </strong>
                </div>
                <div className="mt-2 flex justify-between">
                  <span className="text-muted">Accrued interest</span>
                  <strong className="numeric">
                    {formatPHP(selected.accruedInterestCentavos)}
                  </strong>
                </div>
              </div>
            )}
            <Field label="Amount (PHP)">
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label="Payment date">
              <input
                className={inputClass}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </Field>
            <Field label="Method">
              <select
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                {[
                  ["cash", "Cash"],
                  ["gcash", "GCash"],
                  ["maya", "Maya"],
                  ["bank_transfer", "Bank transfer"],
                  ["other", "Other"],
                ].map(([v, l]) => (
                  <option value={v} key={v}>
                    {l}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference number">
              <input
                className={inputClass}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </Field>
            <Field label="Notes">
              <textarea
                className={`${inputClass} h-20 py-2`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <Button disabled={posting}>
              {posting ? "Posting securely…" : "Post payment"}
            </Button>
          </form>
        </Panel>
        <Panel className="overflow-hidden">
          <div className="border-b p-5">
            <h2 className="font-semibold">Recent payments</h2>
          </div>
          {history.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted">
              No posted payments.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[750px] text-sm">
                <thead className="bg-slate-50 text-xs text-muted dark:bg-slate-900/40">
                  <tr>
                    {[
                      "Receipt",
                      "Date",
                      "Loan",
                      "Method",
                      "Principal",
                      "Interest",
                      "Total",
                    ].map((x, i) => (
                      <th
                        key={x}
                        className={`px-4 py-3 ${i > 3 ? "text-right" : "text-left"}`}
                      >
                        {x}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((x) => (
                    <tr key={x.id}>
                      <td className="px-4 py-3 font-mono text-xs">
                        {x.receiptNumber}
                      </td>
                      <td className="px-4 py-3">{x.paymentDate}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {x.loanId}
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {x.method.replaceAll("_", " ")}
                      </td>
                      <td className="numeric px-4 py-3 text-right">
                        {formatPHP(x.principalCentavos)}
                      </td>
                      <td className="numeric px-4 py-3 text-right">
                        {formatPHP(x.interestCentavos)}
                      </td>
                      <td className="numeric px-4 py-3 text-right font-semibold">
                        {formatPHP(x.amountCentavos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
      <ConfirmationDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Post this borrower payment?"
        description="Confirm the collection details before updating the loan and cash ledger."
        details={[
          {
            label: "Amount",
            value: amount ? formatPHP(pesosToCentavos(amount)) : "—",
          },
          {
            label: "Loan",
            value: selected ? loanLabel(selected) : loanId,
          },
          { label: "Payment date", value: date },
          { label: "Method", value: method.replaceAll("_", " ") },
        ]}
        confirmLabel="Post payment"
        busyLabel="Posting payment…"
        busy={posting}
        onConfirm={postPayment}
      />
    </div>
  );
}
