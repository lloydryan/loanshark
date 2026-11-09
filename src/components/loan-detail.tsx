"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, UserRoundPen } from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/domain/money";
import { LoanBorrowerCorrection } from "./loan-borrower-correction";
import { Button } from "./ui/button";
import { PageHeader, Panel } from "./ui/panel";

type Loan = Record<string, unknown> & {
  id: string;
  principalCentavos: number;
  remainingPrincipalCentavos: number;
  accruedInterestCentavos: number;
  principalPaidCentavos: number;
  interestPaidCentavos: number;
  totalScheduledRepaymentCentavos: number;
  monthlyRatePercent: string;
  termMonths: number;
  status: string;
  borrowerId: string;
  installments: Record<string, unknown>[];
  payments: Record<string, unknown>[];
};

type Borrower = {
  id: string;
  fullName: string;
  status: string;
};

export function LoanDetail({ id }: { id: string }) {
  const [data, setData] = useState<Loan | null>(null);
  const [borrowers, setBorrowers] = useState<Borrower[]>([]);
  const [correctingBorrower, setCorrectingBorrower] = useState(false);

  const load = useCallback(async () => {
    try {
      const [loanResponse, borrowersResponse] = await Promise.all([
        fetch(`/api/loans/${id}`),
        fetch("/api/borrowers?limit=100"),
      ]);
      const [loanResult, borrowersResult] = await Promise.all([
        loanResponse.json(),
        borrowersResponse.json(),
      ]);
      if (!loanResponse.ok) {
        toast.error(loanResult.error ?? "Loan could not be loaded.");
        return;
      }
      setData(loanResult);
      if (borrowersResponse.ok) setBorrowers(borrowersResult.data ?? []);
    } catch {
      toast.error("Loan could not be loaded.");
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const borrowerName = useMemo(
    () => borrowers.find((item) => item.id === data?.borrowerId)?.fullName,
    [borrowers, data?.borrowerId],
  );

  if (!data) return <p className="text-sm text-muted">Loading loan…</p>;

  const cards = [
    ["Original principal", data.principalCentavos],
    ["Remaining principal", data.remainingPrincipalCentavos],
    ["Accrued interest", data.accruedInterestCentavos],
    ["Principal paid", data.principalPaidCentavos],
    ["Interest paid", data.interestPaidCentavos],
    ["Contract repayment", data.totalScheduledRepaymentCentavos],
  ] as const;

  return (
    <div className="space-y-7">
      <PageHeader
        title={`Loan ${id}`}
        description={`${data.monthlyRatePercent}% monthly · ${data.termMonths} months · ${data.status.replaceAll("_", " ")}`}
        actions={
          <div className="flex flex-wrap gap-2 no-print">
            <Button
              variant="secondary"
              onClick={() => setCorrectingBorrower(true)}
            >
              <UserRoundPen size={17} />
              Correct borrower
            </Button>
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer size={17} />
              Print / Save PDF
            </Button>
            <Button asChild>
              <Link href={`/payments?loan=${id}`}>Record payment</Link>
            </Button>
          </div>
        }
      />

      <Panel className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-muted">Borrower</p>
          <p className="mt-1 font-semibold">
            {borrowerName ?? data.borrowerId}
          </p>
          <p className="mt-0.5 font-mono text-xs text-muted">
            {data.borrowerId}
          </p>
        </div>
        <Button
          variant="ghost"
          className="self-start sm:self-auto"
          onClick={() => setCorrectingBorrower(true)}
        >
          <UserRoundPen size={16} />
          Change incorrect borrower
        </Button>
      </Panel>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, value]) => (
          <Panel className="p-4" key={label}>
            <p className="text-xs text-muted">{label}</p>
            <p className="numeric mt-2 text-xl font-semibold">
              {formatPHP(Number(value))}
            </p>
          </Panel>
        ))}
      </section>

      <Panel className="overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">Amortization schedule</h2>
          <p className="text-sm text-muted">
            Original contract and actual allocation balances.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs text-muted dark:bg-slate-900/40">
              <tr>
                {[
                  "#",
                  "Due date",
                  "Scheduled",
                  "Interest",
                  "Principal",
                  "Paid",
                  "Outstanding",
                  "Status",
                ].map((label, index) => (
                  <th
                    className={`px-4 py-3 ${index > 1 && index < 7 ? "text-right" : "text-left"}`}
                    key={label}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.installments.map((row, index) => {
                const installment = row as Record<string, number | string>;
                const paid =
                  Number(installment.interestPaidCentavos) +
                  Number(installment.principalPaidCentavos);
                const due =
                  Number(installment.outstandingInterestCentavos) +
                  Number(installment.outstandingPrincipalCentavos);
                return (
                  <tr key={index}>
                    <td className="px-4 py-3">
                      {String(installment.installmentNumber)}
                    </td>
                    <td className="px-4 py-3">
                      {String(installment.dueDate)}
                    </td>
                    {[
                      installment.scheduledPaymentCentavos,
                      installment.interestCentavos,
                      installment.principalCentavos,
                      paid,
                      due,
                    ].map((value, valueIndex) => (
                      <td
                        className="numeric px-4 py-3 text-right"
                        key={valueIndex}
                      >
                        {formatPHP(Number(value))}
                      </td>
                    ))}
                    <td className="px-4 py-3 capitalize">
                      {String(installment.status).replaceAll("_", " ")}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <LoanBorrowerCorrection
        open={correctingBorrower}
        onOpenChange={setCorrectingBorrower}
        loanId={id}
        borrowerId={data.borrowerId}
        borrowers={borrowers}
        onCorrected={load}
      />
    </div>
  );
}
