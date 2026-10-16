"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { formatPHP } from "@/domain/money";
import { Button } from "./ui/button";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
import { Field, inputClass } from "./ui/field";
import { Panel } from "./ui/panel";

type Payment = {
  id: string;
  receiptNumber: string;
  amountCentavos: number;
  status: string;
};

export function ReversePayment() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentId, setPaymentId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    fetch("/api/payments")
      .then((response) => response.json())
      .then((result) =>
        setPayments(
          (result.data ?? []).filter(
            (payment: Payment) => payment.status === "posted",
          ),
        ),
      );
  }, []);

  async function reverse() {
    if (!paymentId || reason.trim().length < 10) {
      return toast.error("Select a payment and provide a specific reason.");
    }
    setBusy(true);
    const response = await fetch(`/api/payments/${paymentId}/reverse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason, confirmed: true }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return toast.error(result.error);
    setConfirming(false);
    toast.success(`Payment reversed with journal ${result.reversalJournalId}.`);
    setPayments((current) => current.filter((item) => item.id !== paymentId));
    setPaymentId("");
    setReason("");
  }

  const selected = payments.find((payment) => payment.id === paymentId);
  return (
    <Panel className="p-5">
      <h2 className="font-semibold">Controlled payment reversal</h2>
      <p className="mt-1 text-sm text-muted">
        Never deletes a payment; posts a compensating journal and restores
        allocations.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <Field label="Posted payment">
          <select
            className={inputClass}
            value={paymentId}
            onChange={(event) => setPaymentId(event.target.value)}
          >
            <option value="">Select receipt</option>
            {payments.map((payment) => (
              <option key={payment.id} value={payment.id}>
                {payment.receiptNumber} · {formatPHP(payment.amountCentavos)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Reason">
          <input
            className={inputClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Required audit reason"
          />
        </Field>
        <Button
          variant="danger"
          disabled={busy || !paymentId || reason.trim().length < 10}
          onClick={() => setConfirming(true)}
        >
          {busy ? "Reversing…" : "Reverse payment"}
        </Button>
      </div>
      <ConfirmationDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Reverse this payment?"
        description="This restores the loan balances and posts a compensating journal entry."
        details={[
          { label: "Receipt", value: selected?.receiptNumber ?? "—" },
          {
            label: "Amount",
            value: selected ? formatPHP(selected.amountCentavos) : "—",
          },
          { label: "Reason", value: reason },
        ]}
        confirmLabel="Reverse payment"
        busyLabel="Reversing payment…"
        busy={busy}
        tone="danger"
        onConfirm={reverse}
      />
    </Panel>
  );
}
