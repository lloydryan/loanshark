import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { reconcileJournals, type ReconciliationIssue } from "@/domain/reconciliation";
import type { JournalEntry, JournalLine } from "@/domain/types";

export async function POST() {
  try {
    const admin = await requireAdmin(); const db = adminDb();
    const [entriesSnapshot, linesSnapshot, paymentsSnapshot, loansSnapshot, installmentsSnapshot, borrowersSnapshot, cashAccount] = await Promise.all([
      db.collection("journalEntries").get(), db.collection("journalLines").get(), db.collection("payments").where("status", "==", "posted").get(),
      db.collection("loans").get(), db.collection("loanInstallments").get(), db.collection("borrowers").get(), db.collection("financialAccounts").doc("cash").get(),
    ]);
    const byEntry = new Map<string, JournalLine[]>();
    for (const doc of linesSnapshot.docs) { const line = doc.data() as JournalLine & { journalEntryId: string }; byEntry.set(line.journalEntryId, [...(byEntry.get(line.journalEntryId) ?? []), line]); }
    const entries = entriesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data(), lines: byEntry.get(doc.id) ?? [] }) as JournalEntry);
    const issues: ReconciliationIssue[] = reconcileJournals(entries);

    for (const payment of paymentsSnapshot.docs) {
      const allocations = await db.collection("paymentAllocations").where("paymentId", "==", payment.id).get();
      const allocated = allocations.docs.reduce((sum, doc) => sum + Number(doc.data().principalCentavos) + Number(doc.data().interestCentavos), 0);
      if (allocated !== Number(payment.data().amountCentavos)) issues.push({ code: "PAYMENT_ALLOCATION_MISMATCH", reference: payment.id, message: `Payment is ${payment.data().amountCentavos} but allocations total ${allocated}.` });
      if (!loansSnapshot.docs.some((loan) => loan.id === payment.data().loanId)) issues.push({ code: "MISSING_PAYMENT_LOAN", reference: payment.id, message: "Payment references a missing loan." });
    }
    const borrowerIds = new Set(borrowersSnapshot.docs.map((doc) => doc.id));
    for (const loan of loansSnapshot.docs) {
      const data = loan.data();
      if (!borrowerIds.has(data.borrowerId)) issues.push({ code: "MISSING_LOAN_BORROWER", reference: loan.id, message: "Loan references a missing borrower." });
      if (data.status === "fully_paid" && (Number(data.remainingPrincipalCentavos) !== 0 || Number(data.accruedInterestCentavos) !== 0)) issues.push({ code: "INVALID_PAID_LOAN_BALANCE", reference: loan.id, message: "Fully paid loan has a non-zero principal or accrued-interest balance." });
    }
    for (const installment of installmentsSnapshot.docs) {
      const data = installment.data();
      if (Number(data.outstandingInterestCentavos) < 0 || Number(data.outstandingPrincipalCentavos) < 0) issues.push({ code: "NEGATIVE_INSTALLMENT_BALANCE", reference: installment.id, message: "Installment has a negative outstanding balance." });
    }
    const cashFromLedger = linesSnapshot.docs.reduce((sum, doc) => doc.data().account === "cash" ? sum + Number(doc.data().debitCentavos) - Number(doc.data().creditCentavos) : sum, 0);
    if (cashAccount.exists && cashFromLedger !== Number(cashAccount.data()!.balanceCentavos)) issues.push({ code: "CASH_LEDGER_MISMATCH", reference: "cash", message: `Cash account is ${cashAccount.data()!.balanceCentavos}; ledger is ${cashFromLedger}.` });
    const principalReceivableFromLedger = linesSnapshot.docs.reduce((sum, doc) => doc.data().account === "loan_principal_receivable" ? sum + Number(doc.data().debitCentavos) - Number(doc.data().creditCentavos) : sum, 0);
    const principalFromLoans = loansSnapshot.docs.reduce((sum, doc) => sum + Number(doc.data().remainingPrincipalCentavos), 0);
    if (principalReceivableFromLedger !== principalFromLoans) issues.push({ code: "PRINCIPAL_LEDGER_MISMATCH", reference: "loan_principal_receivable", message: `Loan balances are ${principalFromLoans}; ledger is ${principalReceivableFromLedger}.` });

    const ref = db.collection("reconciliations").doc();
    await ref.create({ status: issues.length ? "discrepancies" : "passed", issues, transactionsChecked: entries.length, paymentsChecked: paymentsSnapshot.size, loansChecked: loansSnapshot.size, createdBy: admin.uid, createdAt: FieldValue.serverTimestamp() });
    return Response.json({ id: ref.id, status: issues.length ? "discrepancies" : "passed", issues, transactionsChecked: entries.length, paymentsChecked: paymentsSnapshot.size, loansChecked: loansSnapshot.size });
  } catch (error) { return authError(error); }
}

export async function GET() {
  try { await requireAdmin(); const snapshot = await adminDb().collection("reconciliations").orderBy("createdAt", "desc").limit(1).get(); return Response.json(snapshot.empty ? null : { id: snapshot.docs[0].id, ...snapshot.docs[0].data() }); }
  catch (error) { return authError(error); }
}
