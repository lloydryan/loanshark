"use client";

import { useCallback, useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/domain/money";
import {
  BorrowerFormDialog,
  type BorrowerFormValues,
} from "./borrower-form-dialog";
import { Button } from "./ui/button";
import { PageHeader, Panel } from "./ui/panel";

type Data = BorrowerFormValues & {
  loans: (Record<string, unknown> & { id: string })[];
  payments: (Record<string, unknown> & { id: string })[];
};

export function BorrowerDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/borrowers/${id}`);
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Borrower could not be loaded.");
        return;
      }
      setData(result);
    } catch {
      toast.error("Borrower could not be loaded.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data) return <p className="text-sm text-muted">Loading borrower…</p>;

  const totalPrincipal = data.loans.reduce(
    (total, loan) => total + Number(loan.principalCentavos ?? 0),
    0,
  );
  const outstanding = data.loans.reduce(
    (total, loan) =>
      total +
      Number(loan.remainingPrincipalCentavos ?? 0) +
      Number(loan.accruedInterestCentavos ?? 0),
    0,
  );
  const paid = data.payments.reduce(
    (total, payment) =>
      payment.status === "posted"
        ? total + Number(payment.amountCentavos ?? 0)
        : total,
    0,
  );

  return (
    <div className="space-y-7">
      <PageHeader
        title={data.fullName}
        description={`${data.contactNumber || "No contact"} · ${data.email || "No email"} · ${data.status}`}
        actions={
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil size={16} />
            Edit borrower
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <Panel className="p-4">
          <p className="text-xs text-muted">Total borrowed</p>
          <p className="numeric mt-2 text-xl font-semibold">
            {formatPHP(totalPrincipal)}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Outstanding receivables</p>
          <p className="numeric mt-2 text-xl font-semibold">
            {formatPHP(outstanding)}
          </p>
        </Panel>
        <Panel className="p-4">
          <p className="text-xs text-muted">Total paid</p>
          <p className="numeric mt-2 text-xl font-semibold">
            {formatPHP(paid)}
          </p>
        </Panel>
      </section>

      <Panel className="p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold">Borrower information</h2>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-primary hover:underline"
          >
            Edit
          </button>
        </div>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Address</dt>
            <dd className="mt-1">{data.address || "—"}</dd>
          </div>
          <div>
            <dt className="text-muted">Borrower ID</dt>
            <dd className="mt-1 font-mono">{data.id}</dd>
          </div>
          <div>
            <dt className="text-muted">Notes</dt>
            <dd className="mt-1 whitespace-pre-wrap">{data.notes || "—"}</dd>
          </div>
        </dl>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">Loan history</h2>
        </div>
        {data.loans.length === 0 ? (
          <p className="p-8 text-sm text-muted">No loans.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <tbody className="divide-y">
                {data.loans.map((loan) => (
                  <tr key={loan.id}>
                    <td className="px-5 py-4">
                      <a
                        className="font-mono text-xs font-semibold hover:underline"
                        href={`/loans/${loan.id}`}
                      >
                        {loan.id}
                      </a>
                    </td>
                    <td className="numeric px-5 py-4 text-right">
                      {formatPHP(Number(loan.principalCentavos))}
                    </td>
                    <td className="px-5 py-4 text-right capitalize">
                      {String(loan.status).replaceAll("_", " ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {editing && (
        <BorrowerFormDialog
          borrower={data}
          onClose={() => setEditing(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
