"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { formatPHP, pesosToCentavos } from "@/domain/money";
import { Button } from "./ui/button";
import { ConfirmationDialog } from "./ui/confirmation-dialog";
import { Field, inputClass } from "./ui/field";
import { Panel } from "./ui/panel";

const typeLabels: Record<string, string> = {
  capital_addition: "Capital addition",
  capital_withdrawal: "Capital withdrawal",
  adjustment_in: "Approved cash inflow",
  adjustment_out: "Approved cash outflow",
};

function displayAmount(value: string) {
  if (!value) return "—";
  try {
    return formatPHP(pesosToCentavos(value));
  } catch {
    return "Invalid amount";
  }
}

export function CashAdjustment({ onPosted }: { onPosted?: () => void }) {
  const [type, setType] = useState("capital_addition");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  function requestPost() {
    try {
      if (pesosToCentavos(amount) <= 0) throw new Error();
      setConfirming(true);
    } catch {
      toast.error("Enter a valid cash amount greater than zero.");
    }
  }

  async function post() {
    setBusy(true);
    const response = await fetch("/api/cash-adjustments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        amountCentavos: pesosToCentavos(amount),
        date,
        notes,
        idempotencyKey: idempotencyKey.current,
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) return toast.error(result.error);
    setConfirming(false);
    toast.success(`Cash entry posted: ${result.journalId}`);
    idempotencyKey.current = crypto.randomUUID();
    setAmount("");
    setNotes("");
    onPosted?.();
  }

  return (
    <Panel className="p-5">
      <h2 className="font-semibold">Post cash movement</h2>
      <p className="mt-1 text-sm text-muted">
        Capital and approved adjustments require a documented, balanced entry.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
        <Field label="Type">
          <select
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            {Object.entries(typeLabels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Amount (PHP)">
          <input
            className={inputClass}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            inputMode="decimal"
          />
        </Field>
        <Field label="Date">
          <input
            className={inputClass}
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field label="Reason / notes">
          <input
            className={inputClass}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <Button
          disabled={busy || !amount || notes.length < 5}
          onClick={requestPost}
        >
          {busy ? "Posting…" : "Post entry"}
        </Button>
      </div>
      <ConfirmationDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Post this cash movement?"
        description="Review the details before adding this entry to the cash ledger."
        details={[
          { label: "Type", value: typeLabels[type] },
          { label: "Amount", value: displayAmount(amount) },
          { label: "Date", value: date },
          { label: "Reason", value: notes },
        ]}
        confirmLabel="Post cash movement"
        busyLabel="Posting…"
        busy={busy}
        onConfirm={post}
      />
    </Panel>
  );
}
