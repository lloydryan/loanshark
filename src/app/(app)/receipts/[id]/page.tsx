"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { formatPHP } from "@/domain/money";
import { PrintButton } from "@/components/print-button";

type Receipt = {
  id: string;
  borrowerName: string;
  loanId: string;
  receiptNumber: string;
  paymentDate: string;
  method: string;
  principalCentavos: number;
  interestCentavos: number;
  amountCentavos: number;
  referenceNumber?: string;
  journalEntryId: string;
  business: {
    businessName?: string;
    businessAddress?: string;
    receiptFooter?: string;
  };
};

export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [payment, setPayment] = useState<Receipt | null>(null);

  useEffect(() => {
    fetch(`/api/payments/${id}`)
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then(setPayment)
      .catch((error) => toast.error(error.message));
  }, [id]);

  if (!payment) return <p className="text-sm text-muted">Loading receipt…</p>;
  const business = payment.business;
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex justify-end">
        <PrintButton />
      </div>
      <article className="rounded-xl border bg-white p-8 text-slate-950 print:border-0 print:p-0">
        <header className="flex justify-between border-b pb-6">
          <div>
            <h1 className="text-2xl font-semibold">
              {business.businessName || "Payment receipt"}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              {business.businessAddress || "Official borrower payment record"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Receipt number
            </p>
            <p className="mt-1 font-mono font-semibold">
              {payment.receiptNumber}
            </p>
          </div>
        </header>
        <dl className="mt-7 grid gap-5 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Borrower</dt>
            <dd className="mt-1 font-semibold">{payment.borrowerName}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Loan ID</dt>
            <dd className="mt-1 font-mono">{payment.loanId}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Payment date</dt>
            <dd className="mt-1">{payment.paymentDate}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Payment method</dt>
            <dd className="mt-1 capitalize">
              {payment.method.replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Principal paid</dt>
            <dd className="numeric mt-1">
              {formatPHP(payment.principalCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-slate-500">Interest paid</dt>
            <dd className="numeric mt-1">
              {formatPHP(payment.interestCentavos)}
            </dd>
          </div>
        </dl>
        <div className="mt-8 flex items-center justify-between border-y py-5">
          <span className="font-semibold">Total payment</span>
          <strong className="numeric text-2xl">
            {formatPHP(payment.amountCentavos)}
          </strong>
        </div>
        <div className="mt-6 text-sm">
          <p>
            <span className="text-slate-500">Reference:</span>{" "}
            {payment.referenceNumber || "—"}
          </p>
          <p className="mt-2">
            <span className="text-slate-500">Transaction ID:</span>{" "}
            <span className="font-mono">{payment.id}</span>
          </p>
          <p className="mt-2">
            <span className="text-slate-500">Journal entry:</span>{" "}
            <span className="font-mono">{payment.journalEntryId}</span>
          </p>
        </div>
        <footer className="mt-10 border-t pt-5 text-center text-xs text-slate-500">
          {business.receiptFooter || "Thank you for your payment."}
        </footer>
      </article>
    </div>
  );
}
