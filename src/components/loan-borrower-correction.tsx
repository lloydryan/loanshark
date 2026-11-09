"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";

type Borrower = {
  id: string;
  fullName: string;
  status: string;
};

export function LoanBorrowerCorrection({
  open,
  onOpenChange,
  loanId,
  borrowerId,
  borrowers,
  onCorrected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loanId: string;
  borrowerId: string;
  borrowers: Borrower[];
  onCorrected: () => void | Promise<void>;
}) {
  const [nextBorrowerId, setNextBorrowerId] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const currentBorrower = borrowers.find((item) => item.id === borrowerId);
  const nextBorrower = borrowers.find((item) => item.id === nextBorrowerId);

  function close(next: boolean) {
    if (saving) return;
    onOpenChange(next);
    if (!next) {
      setNextBorrowerId("");
      setReason("");
    }
  }

  async function correct() {
    if (!nextBorrowerId || reason.trim().length < 10) {
      toast.error("Select the correct borrower and enter a specific reason.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(`/api/loans/${loanId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ borrowerId: nextBorrowerId, reason }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "The loan borrower could not be corrected.");
        return;
      }
      toast.success("Loan borrower corrected.");
      onOpenChange(false);
      setNextBorrowerId("");
      setReason("");
      await onCorrected();
    } catch {
      toast.error("The loan borrower could not be corrected.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/55" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-panel p-6 shadow-2xl focus:outline-none"
          onPointerDownOutside={(event) => saving && event.preventDefault()}
          onEscapeKeyDown={(event) => saving && event.preventDefault()}
        >
          <div className="flex items-start gap-4">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-warning dark:bg-amber-950/40">
              <AlertTriangle size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold">
                Correct loan borrower
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted">
                Move this loan and its related payments to the borrower who
                actually received it. Monetary balances will not change.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close borrower correction"
                disabled={saving}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>

          <dl className="mt-5 rounded-lg border bg-slate-50 px-4 text-sm dark:bg-slate-900/40">
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-muted">Current borrower</dt>
              <dd className="text-right font-medium">
                {currentBorrower?.fullName ?? borrowerId}
              </dd>
            </div>
            {nextBorrower && (
              <div className="flex justify-between gap-4 border-t py-3">
                <dt className="text-muted">Correct borrower</dt>
                <dd className="text-right font-medium">
                  {nextBorrower.fullName}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-5 grid gap-4">
            <Field label="Correct borrower">
              <select
                className={inputClass}
                value={nextBorrowerId}
                onChange={(event) => setNextBorrowerId(event.target.value)}
                disabled={saving}
              >
                <option value="">Select active borrower</option>
                {borrowers
                  .filter(
                    (borrower) =>
                      borrower.status === "active" && borrower.id !== borrowerId,
                  )
                  .sort((a, b) => a.fullName.localeCompare(b.fullName))
                  .map((borrower) => (
                    <option key={borrower.id} value={borrower.id}>
                      {borrower.fullName} · {borrower.id}
                    </option>
                  ))}
              </select>
            </Field>
            <Field
              label="Reason for correction"
              hint="Required for the audit log; use at least 10 characters."
            >
              <textarea
                className={`${inputClass} h-24 py-2`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                disabled={saving}
                placeholder="Example: Wrong borrower selected during loan release"
              />
            </Field>
          </div>

          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={saving}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              disabled={
                saving || !nextBorrowerId || reason.trim().length < 10
              }
              onClick={() => void correct()}
            >
              {saving ? "Correcting…" : "Correct borrower"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
