import "server-only";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { generateSchedule, summarizeSchedule } from "@/domain/amortization";
import { allocatePayment } from "@/domain/payments";
import { assertBalanced, paymentJournal } from "@/domain/ledger";
import type { InstallmentBalance, JournalLine } from "@/domain/types";
import { adminDb } from "@/lib/firebase-admin";
import { newId, receiptNumber } from "@/lib/ids";
import { loanSchema, paymentSchema } from "@/lib/validation";

type LoanInput = ReturnType<typeof loanSchema.parse>;
type PaymentInput = ReturnType<typeof paymentSchema.parse>;

function writeJournal(transaction: FirebaseFirestore.Transaction, entry: { id: string; eventType: string; occurredAt: string; referenceType: string; referenceId: string; description: string; lines: JournalLine[]; reversalOf?: string }) {
  assertBalanced(entry.lines);
  const db = adminDb();
  const entryRef = db.collection("journalEntries").doc(entry.id);
  transaction.create(entryRef, { ...entry, lines: undefined, lineCount: entry.lines.length, schemaVersion: 1, postedAt: FieldValue.serverTimestamp(), status: "posted" });
  entry.lines.forEach((line, index) => transaction.create(db.collection("journalLines").doc(`${entry.id}_${index + 1}`), { ...line, journalEntryId: entry.id, lineNumber: index + 1, occurredAt: entry.occurredAt, eventType: entry.eventType, referenceId: entry.referenceId }));
}

export async function createAndDisburseLoan(raw: unknown, adminUid: string) {
  const input = loanSchema.parse(raw) as LoanInput;
  const schedule = generateSchedule(input);
  const totals = summarizeSchedule(schedule);
  const db = adminDb();
  const loanId = newId("LOAN");
  const journalId = newId("JE");
  const operationRef = db.collection("idempotencyKeys").doc(input.idempotencyKey);

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(operationRef);
    if (existing.exists) return existing.data()!.result as { loanId: string; journalId: string };
    const borrowerRef = db.collection("borrowers").doc(input.borrowerId);
    const accountRef = db.collection("financialAccounts").doc("cash");
    const [borrower, account] = await Promise.all([transaction.get(borrowerRef), transaction.get(accountRef)]);
    if (!borrower.exists || borrower.data()?.status === "archived") throw new Error("Borrower is unavailable.");
    if (!account.exists) throw new Error("Opening cash balance must be configured before releasing loans.");
    const cashBalance = Number(account.data()?.balanceCentavos ?? 0);
    if (cashBalance < input.principalCentavos) throw new Error("Available cash is insufficient for this disbursement.");

    const loanRef = db.collection("loans").doc(loanId);
    transaction.create(loanRef, {
      borrowerId: input.borrowerId,
      principalCentavos: input.principalCentavos,
      monthlyRatePercent: input.monthlyRatePercent,
      method: input.method,
      termMonths: input.termMonths,
      releaseDate: input.releaseDate,
      firstPaymentDate: input.firstPaymentDate,
      finalPaymentDate: schedule.at(-1)!.dueDate,
      scheduledInstallmentCentavos: schedule[0]!.scheduledPaymentCentavos,
      totalScheduledInterestCentavos: totals.totalInterestCentavos,
      totalScheduledRepaymentCentavos: totals.totalRepaymentCentavos,
      remainingPrincipalCentavos: input.principalCentavos,
      accruedInterestCentavos: 0,
      scheduledFutureInterestCentavos: totals.totalInterestCentavos,
      principalPaidCentavos: 0,
      interestPaidCentavos: 0,
      status: "active",
      notes: input.notes,
      schemaVersion: 1,
      createdBy: adminUid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    schedule.forEach((row) => transaction.create(db.collection("loanInstallments").doc(`${loanId}_${String(row.installmentNumber).padStart(3, "0")}`), {
      ...row,
      loanId,
      borrowerId: input.borrowerId,
      interestPaidCentavos: 0,
      principalPaidCentavos: 0,
      outstandingInterestCentavos: row.interestCentavos,
      outstandingPrincipalCentavos: row.principalCentavos,
      status: "upcoming",
      contractVersion: 1,
    }));
    transaction.update(accountRef, { balanceCentavos: cashBalance - input.principalCentavos, updatedAt: FieldValue.serverTimestamp() });
    writeJournal(transaction, {
      id: journalId, eventType: "loan_disbursement", occurredAt: `${input.releaseDate}T00:00:00+08:00`, referenceType: "loan", referenceId: loanId, description: `Loan disbursement ${loanId}`,
      lines: [
        { account: "loan_principal_receivable", debitCentavos: input.principalCentavos, creditCentavos: 0, borrowerId: input.borrowerId, loanId },
        { account: "cash", debitCentavos: 0, creditCentavos: input.principalCentavos, borrowerId: input.borrowerId, loanId },
      ],
    });
    transaction.create(db.collection("auditLogs").doc(), { action: "loan.disbursed", entityType: "loan", entityId: loanId, adminUid, createdAt: FieldValue.serverTimestamp(), idempotencyKey: input.idempotencyKey });
    const result = { loanId, journalId };
    transaction.create(operationRef, { operation: "loan.disbursement", result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

export async function recordPayment(raw: unknown, adminUid: string) {
  const input = paymentSchema.parse(raw) as PaymentInput;
  const db = adminDb();
  const paymentId = newId("PAY");
  const journalId = newId("JE");
  const receipt = receiptNumber();
  const operationRef = db.collection("idempotencyKeys").doc(input.idempotencyKey);
  const loanRef = db.collection("loans").doc(input.loanId);
  const accountRef = db.collection("financialAccounts").doc("cash");
  const installmentsQuery = db.collection("loanInstallments").where("loanId", "==", input.loanId).orderBy("installmentNumber");

  return db.runTransaction(async (transaction) => {
    const existing = await transaction.get(operationRef);
    if (existing.exists) return existing.data()!.result as { paymentId: string; journalId: string; receiptNumber: string };
    const [loan, account, installmentsSnapshot] = await Promise.all([transaction.get(loanRef), transaction.get(accountRef), transaction.get(installmentsQuery)]);
    if (!loan.exists) throw new Error("Loan not found.");
    const loanData = loan.data()!;
    if (!["active", "overdue"].includes(loanData.status)) throw new Error("This loan is not payable.");
    if (!account.exists) throw new Error("Cash account is not configured.");
    const settlementAmount = Number(loanData.remainingPrincipalCentavos) + Number(loanData.accruedInterestCentavos);
    const isFullSettlement = input.amountCentavos === settlementAmount;
    const payable = installmentsSnapshot.docs
      .filter((doc) => isFullSettlement || doc.data().dueDate <= input.paymentDate)
      .map((doc) => {
        const row = doc.data() as InstallmentBalance;
        // Early settlement pays unearned periods' principal only. Contractual interest
        // remains on the immutable schedule but is explicitly waived, never collected.
        return isFullSettlement && row.dueDate > input.paymentDate ? { ...row, outstandingInterestCentavos: 0 } : row;
      });
    const allocation = allocatePayment(input.amountCentavos, payable);
    if (allocation.unappliedCentavos) throw new Error("Payment contains an unapplied amount.");
    const principal = allocation.allocations.reduce((sum, item) => sum + item.principalCentavos, 0);
    const interest = allocation.allocations.reduce((sum, item) => sum + item.interestCentavos, 0);
    if (interest > Number(loanData.accruedInterestCentavos ?? 0)) throw new Error("Payment would collect interest that has not accrued.");

    const paymentRef = db.collection("payments").doc(paymentId);
    transaction.create(paymentRef, { loanId: input.loanId, borrowerId: loanData.borrowerId, amountCentavos: input.amountCentavos, principalCentavos: principal, interestCentavos: interest, isFullSettlement, futureInterestWaivedCentavos: isFullSettlement ? Number(loanData.scheduledFutureInterestCentavos) : 0, paymentDate: input.paymentDate, method: input.method, referenceNumber: input.referenceNumber, notes: input.notes, receiptNumber: receipt, status: "posted", journalEntryId: journalId, createdBy: adminUid, createdAt: FieldValue.serverTimestamp(), schemaVersion: 1 });
    allocation.allocations.forEach((item, index) => {
      const installmentRef = db.collection("loanInstallments").doc(`${input.loanId}_${String(item.installmentNumber).padStart(3, "0")}`);
      const original = installmentsSnapshot.docs.find((doc) => doc.data().installmentNumber === item.installmentNumber)!.data() as InstallmentBalance;
      const interestPaid = original.interestPaidCentavos + item.interestCentavos;
      const principalPaid = original.principalPaidCentavos + item.principalCentavos;
      const futureInterestWaived = isFullSettlement && original.dueDate > input.paymentDate ? original.interestCentavos - interestPaid : 0;
      const outstandingInterest = original.interestCentavos - interestPaid - futureInterestWaived;
      const outstandingPrincipal = original.principalCentavos - principalPaid;
      transaction.update(installmentRef, { interestPaidCentavos: interestPaid, principalPaidCentavos: principalPaid, waivedInterestCentavos: futureInterestWaived, outstandingInterestCentavos: outstandingInterest, outstandingPrincipalCentavos: outstandingPrincipal, status: outstandingInterest + outstandingPrincipal === 0 ? "paid" : "partial" });
      transaction.create(db.collection("paymentAllocations").doc(`${paymentId}_${index + 1}`), { paymentId, loanId: input.loanId, ...item, createdAt: FieldValue.serverTimestamp() });
    });
    const remainingPrincipal = Number(loanData.remainingPrincipalCentavos) - principal;
    const remainingAccruedInterest = Number(loanData.accruedInterestCentavos) - interest;
    transaction.update(loanRef, { remainingPrincipalCentavos: remainingPrincipal, accruedInterestCentavos: remainingAccruedInterest, ...(isFullSettlement ? { scheduledFutureInterestCentavos: 0, settledEarly: input.paymentDate < loanData.finalPaymentDate } : {}), principalPaidCentavos: FieldValue.increment(principal), interestPaidCentavos: FieldValue.increment(interest), status: remainingPrincipal === 0 && remainingAccruedInterest === 0 ? "fully_paid" : loanData.status, updatedAt: FieldValue.serverTimestamp() });
    transaction.update(accountRef, { balanceCentavos: FieldValue.increment(input.amountCentavos), updatedAt: FieldValue.serverTimestamp() });
    const journal = paymentJournal({ id: journalId, occurredAt: `${input.paymentDate}T00:00:00+08:00`, paymentId, loanId: input.loanId, borrowerId: loanData.borrowerId, principalCentavos: principal, interestCentavos: interest });
    writeJournal(transaction, journal);
    transaction.create(db.collection("auditLogs").doc(), { action: "payment.posted", entityType: "payment", entityId: paymentId, adminUid, createdAt: FieldValue.serverTimestamp(), idempotencyKey: input.idempotencyKey });
    const result = { paymentId, journalId, receiptNumber: receipt };
    transaction.create(operationRef, { operation: "payment.posting", result, createdAt: FieldValue.serverTimestamp() });
    return result;
  });
}

export async function initializeCashAccount(openingBalanceCentavos: number, adminUid: string) {
  if (!Number.isSafeInteger(openingBalanceCentavos) || openingBalanceCentavos < 0) throw new Error("Opening balance must be non-negative integer centavos.");
  const db = adminDb();
  const ref = db.collection("financialAccounts").doc("cash");
  const journalId = newId("JE");
  await db.runTransaction(async (transaction) => {
    if ((await transaction.get(ref)).exists) throw new Error("Opening balance has already been configured.");
    transaction.create(ref, { name: "Operating Cash", currency: "PHP", balanceCentavos: openingBalanceCentavos, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (openingBalanceCentavos) writeJournal(transaction, { id: journalId, eventType: "opening_balance", occurredAt: Timestamp.now().toDate().toISOString(), referenceType: "financial_account", referenceId: "cash", description: "Opening cash balance", lines: [{ account: "cash", debitCentavos: openingBalanceCentavos, creditCentavos: 0 }, { account: "capital", debitCentavos: 0, creditCentavos: openingBalanceCentavos }] });
    transaction.create(db.collection("auditLogs").doc(), { action: "cash.opening_balance_set", entityType: "financial_account", entityId: "cash", adminUid, createdAt: FieldValue.serverTimestamp(), openingBalanceCentavos });
  });
}

export async function reversePayment(paymentId: string, reason: string, adminUid: string) {
  if (reason.trim().length < 10) throw new Error("A reversal reason of at least 10 characters is required.");
  const db = adminDb();
  const paymentRef = db.collection("payments").doc(paymentId);
  const reversalKeyRef = db.collection("idempotencyKeys").doc(`payment_reversal_${paymentId}`);
  const accountRef = db.collection("financialAccounts").doc("cash");
  const reversalJournalId = newId("JE");

  return db.runTransaction(async (transaction) => {
    const [payment, reversalKey, account] = await Promise.all([
      transaction.get(paymentRef), transaction.get(reversalKeyRef), transaction.get(accountRef),
    ]);
    if (!payment.exists) throw new Error("Payment not found.");
    if (reversalKey.exists || payment.data()!.status === "reversed") throw new Error("This payment has already been reversed.");
    if (!account.exists) throw new Error("Cash account is not configured.");
    const paymentData = payment.data()!;
    const [loan, allocations, originalLines] = await Promise.all([
      transaction.get(db.collection("loans").doc(paymentData.loanId)),
      transaction.get(db.collection("paymentAllocations").where("paymentId", "==", paymentId)),
      transaction.get(db.collection("journalLines").where("journalEntryId", "==", paymentData.journalEntryId)),
    ]);
    if (!loan.exists) throw new Error("The payment loan no longer exists.");
    const installmentRefs = allocations.docs.map((allocation) => db.collection("loanInstallments").doc(`${paymentData.loanId}_${String(allocation.data().installmentNumber).padStart(3, "0")}`));
    const installments = await Promise.all(installmentRefs.map((ref) => transaction.get(ref)));
    const cashBalance = Number(account.data()!.balanceCentavos);
    if (cashBalance < Number(paymentData.amountCentavos)) throw new Error("Cash balance is insufficient to reverse this payment.");

    allocations.docs.forEach((allocation, index) => {
      const values = allocation.data();
      const installment = installments[index];
      if (!installment.exists) throw new Error("A payment allocation references a missing installment.");
      const current = installment.data()!;
      const interestPaid = Number(current.interestPaidCentavos) - Number(values.interestCentavos);
      const principalPaid = Number(current.principalPaidCentavos) - Number(values.principalCentavos);
      if (interestPaid < 0 || principalPaid < 0) throw new Error("Reversal would create a negative paid balance.");
      const outstandingInterest = Number(current.interestCentavos) - interestPaid;
      const outstandingPrincipal = Number(current.principalCentavos) - principalPaid;
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const status = current.dueDate < today ? (interestPaid + principalPaid ? "partial" : "overdue") : (interestPaid + principalPaid ? "partial" : "upcoming");
      transaction.update(installment.ref, { interestPaidCentavos: interestPaid, principalPaidCentavos: principalPaid, waivedInterestCentavos: 0, outstandingInterestCentavos: outstandingInterest, outstandingPrincipalCentavos: outstandingPrincipal, status });
      transaction.update(allocation.ref, { status: "reversed", reversedAt: FieldValue.serverTimestamp(), reversalJournalId });
    });

    const loanData = loan.data()!;
    transaction.update(loan.ref, {
      remainingPrincipalCentavos: FieldValue.increment(Number(paymentData.principalCentavos)),
      accruedInterestCentavos: FieldValue.increment(Number(paymentData.interestCentavos)),
      principalPaidCentavos: FieldValue.increment(-Number(paymentData.principalCentavos)),
      interestPaidCentavos: FieldValue.increment(-Number(paymentData.interestCentavos)),
      scheduledFutureInterestCentavos: FieldValue.increment(Number(paymentData.futureInterestWaivedCentavos ?? 0)),
      status: loanData.finalPaymentDate < new Date().toISOString().slice(0, 10) ? "overdue" : "active",
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.update(accountRef, { balanceCentavos: cashBalance - Number(paymentData.amountCentavos), updatedAt: FieldValue.serverTimestamp() });
    transaction.update(paymentRef, { status: "reversed", reversalReason: reason.trim(), reversalJournalId, reversedAt: FieldValue.serverTimestamp(), reversedBy: adminUid });
    writeJournal(transaction, {
      id: reversalJournalId,
      eventType: "reversal",
      occurredAt: new Date().toISOString(),
      referenceType: "payment",
      referenceId: paymentId,
      description: `Reversal of payment ${paymentId}: ${reason.trim()}`,
      reversalOf: paymentData.journalEntryId,
      lines: originalLines.docs.map((line) => ({
        account: line.data().account,
        debitCentavos: Number(line.data().creditCentavos),
        creditCentavos: Number(line.data().debitCentavos),
        borrowerId: line.data().borrowerId,
        loanId: line.data().loanId,
      })),
    });
    transaction.create(reversalKeyRef, { operation: "payment.reversal", paymentId, reversalJournalId, createdAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection("auditLogs").doc(), { action: "payment.reversed", entityType: "payment", entityId: paymentId, adminUid, reason: reason.trim(), reversalJournalId, createdAt: FieldValue.serverTimestamp() });
    return { paymentId, reversalJournalId };
  });
}
