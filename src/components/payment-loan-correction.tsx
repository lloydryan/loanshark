"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRightLeft, X } from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/domain/money";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";

type Loan = {
  id: string;
  borrowerId: string;
  status: string;
};

type Payment = {
  id: string;
  receiptNumber: string;
  loanId: string;
  amountCentavos: number;
};

export function PaymentLoanCorrection({
  payment,
  loans,
  borrowerNames,
  onClose,
  onCorrected,
}: {
  payment: Payment | null;
  loans: Loan[];
  borrowerNames: Map<string, string>;
  onClose: () => void;
  onCorrected: () => void | Promise<void>;
}) {
  const [loanId, setLoanId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const selectedLoan = loans.find((loan) => loan.id === loanId);
  const loanLabel = (loan: Loan) =>
    `${borrowerNames.get(loan.borrowerId) ?? "Unknown borrower"} · ${loan.id}`;

  function close() {
    if (saving) return;
    setLoanId("");
    setReason("");
    onClose();
  }

  async function correct() {
    if (!payment || !loanId || reason.trim().length < 10) {
      toast.error("Select the correct loan and enter a specific reason.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        `/api/payments/${payment.id}/correct-loan`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            loanId,
            reason,
            idempotencyKey: crypto.randomUUID(),
          }),
        },
      );
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "The payment could not be corrected.");
        return;
      }
      toast.success(
        `Payment moved to the correct loan. New receipt ${result.correctedReceiptNumber}.`,
      );
      setLoanId("");
      setReason("");
      onClose();
      await onCorrected();
    } catch {
      toast.error("The payment could not be corrected.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={Boolean(payment)} onOpenChange={(open) => !open && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/55" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-panel p-6 shadow-2xl focus:outline-none"
          onPointerDownOutside={(event) => saving && event.preventDefault()}
          onEscapeKeyDown={(event) => saving && event.preventDefault()}
        >
          <div className="flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-warning dark:bg-amber-950/40">
              <ArrowRightLeft size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Correct payment loan
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted">
                Reverse the incorrect allocation and repost this collection to
                the correct loan. Cash will not be added or removed again.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close payment correction"
                disabled={saving}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          {payment && (
            <dl className="mt-5 divide-y rounded-lg border bg-slate-50 px-4 text-sm dark:bg-slate-900/40">
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">Receipt</dt>
                <dd className="font-mono text-xs font-medium">
                  {payment.receiptNumber}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">Amount</dt>
                <dd className="numeric font-medium">
                  {formatPHP(payment.amountCentavos)}
                </dd>
              </div>
              <div className="flex justify-between gap-4 py-3">
                <dt className="text-muted">Incorrect loan</dt>
                <dd className="max-w-[70%] break-all text-right font-mono text-xs font-medium">
                  {payment.loanId}
                </dd>
              </div>
              {selectedLoan && (
                <div className="flex justify-between gap-4 py-3">
                  <dt className="text-muted">Correct loan</dt>
                  <dd className="max-w-[70%] text-right font-medium">
                    {loanLabel(selectedLoan)}
                  </dd>
                </div>
              )}
            </dl>
          )}

          <div className="mt-5 grid gap-4">
            <Field label="Correct loan">
              <select
                className={inputClass}
                value={loanId}
                onChange={(event) => setLoanId(event.target.value)}
                disabled={saving}
              >
                <option value="">Select active loan</option>
                {loans
                  .filter(
                    (loan) =>
                      loan.id !== payment?.loanId &&
                      ["active", "overdue"].includes(loan.status),
                  )
                  .sort((a, b) => loanLabel(a).localeCompare(loanLabel(b)))
                  .map((loan) => (
                    <option key={loan.id} value={loan.id}>
                      {loanLabel(loan)}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Reason for correction"
              hint="Required for the permanent audit record."
            >
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={saving}
                maxLength={500}
                placeholder="Example: Payment was posted to the wrong loan"
              />
            </Field>
          </div>

          <p className="mt-4 text-xs leading-5 text-muted">
            The original receipt remains in the audit history as corrected. A
            replacement receipt and balancing journal entries will be created.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={saving}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              disabled={saving || !loanId || reason.trim().length < 10}
              onClick={() => void correct()}
            >
              {saving ? "Correcting…" : "Correct payment"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
