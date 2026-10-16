"use client";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type Transaction,
} from "firebase/firestore";
import { generateSchedule, summarizeSchedule } from "@/domain/amortization";
import { assertBalanced, paymentJournal } from "@/domain/ledger";
import { allocatePayment } from "@/domain/payments";
import {
  reconcileJournals,
  type ReconciliationIssue,
} from "@/domain/reconciliation";
import type {
  InstallmentBalance,
  JournalEntry,
  JournalLine,
} from "@/domain/types";
import { borrowerSchema, loanSchema, paymentSchema } from "@/lib/validation";
import { clientAuth, clientDb } from "@/lib/firebase-client";

const nativeFetch =
  typeof window === "undefined" ? null : window.fetch.bind(window);
let installed = false;

export async function syncDailyAccruals() {
  const db = clientDb();
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const snapshot = await getDocs(collection(db, "loanInstallments"));
  const due = snapshot.docs.filter((item) => {
    const value = item.data();
    return (
      value.dueDate <= today && ["upcoming", "partial"].includes(value.status)
    );
  });
  for (const installment of due) {
    await runTransaction(db, async (tx) => {
      const current = await tx.get(installment.ref);
      if (!current.exists()) return;
      const row = current.data();
      const keyRef = doc(
        db,
        "idempotencyKeys",
        `accrual_${row.loanId}_${row.installmentNumber}`,
      );
      const loanRef = doc(db, "loans", String(row.loanId));
      const [key, loan] = await Promise.all([tx.get(keyRef), tx.get(loanRef)]);
      if (key.exists() || !loan.exists()) return;
      const amount = Number(row.outstandingInterestCentavos ?? 0);
      if (amount > 0) {
        const journalId = id("JE");
        writeJournal(tx, db, {
          id: journalId,
          eventType: "interest_accrual",
          occurredAt: `${row.dueDate}T00:00:00+08:00`,
          referenceType: "installment",
          referenceId: current.id,
          description: `Interest accrual for installment ${row.installmentNumber}`,
          lines: [
            {
              account: "interest_receivable",
              debitCentavos: amount,
              creditCentavos: 0,
              loanId: row.loanId,
              borrowerId: row.borrowerId,
            },
            {
              account: "interest_income",
              debitCentavos: 0,
              creditCentavos: amount,
              loanId: row.loanId,
              borrowerId: row.borrowerId,
            },
          ],
        });
        const loanData = loan.data();
        tx.update(loanRef, {
          accruedInterestCentavos:
            Number(loanData.accruedInterestCentavos) + amount,
          scheduledFutureInterestCentavos:
            Number(loanData.scheduledFutureInterestCentavos) - amount,
          status: row.dueDate < today ? "overdue" : loanData.status,
          updatedAt: serverTimestamp(),
        });
      }
      const outstanding =
        Number(row.outstandingInterestCentavos) +
        Number(row.outstandingPrincipalCentavos);
      const paid =
        Number(row.interestPaidCentavos) + Number(row.principalPaidCentavos);
      tx.update(current.ref, {
        status:
          outstanding === 0
            ? "paid"
            : row.dueDate < today
              ? paid
                ? "partial"
                : "overdue"
              : "due_today",
        accruedAt: serverTimestamp(),
      });
      tx.set(keyRef, {
        operation: "interest.accrual",
        installmentId: current.id,
        createdAt: serverTimestamp(),
      });
    });
  }
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;
}

function receiptNumber() {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .replaceAll("-", "");
  return `OR-${date}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

function normalize(value: unknown): unknown {
  if (value && typeof value === "object") {
    if (
      "seconds" in value &&
      typeof (value as { seconds: unknown }).seconds === "number"
    ) {
      return { _seconds: (value as { seconds: number }).seconds };
    }
    if (Array.isArray(value)) return value.map(normalize);
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalize(item)]),
    );
  }
  return value;
}

function json(data: unknown, status = 200) {
  return Response.json(normalize(data), { status });
}

function currentUid() {
  const uid = clientAuth().currentUser?.uid;
  if (!uid)
    throw new Error("Your Firebase session has expired. Sign in again.");
  return uid;
}

async function rows(name: string): Promise<DocumentData[]> {
  const snapshot = await getDocs(collection(clientDb(), name));
  return snapshot.docs.map((item): DocumentData => ({
    id: item.id,
    ...item.data(),
  }));
}

function sortDate(
  data: DocumentData[],
  field: string,
  direction: "asc" | "desc" = "desc",
) {
  return data.sort((a, b) => {
    const result = String(a[field] ?? "").localeCompare(String(b[field] ?? ""));
    return direction === "asc" ? result : -result;
  });
}

function writeJournal(
  tx: Transaction,
  db: Firestore,
  entry: {
    id: string;
    eventType: string;
    occurredAt: string;
    referenceType: string;
    referenceId: string;
    description: string;
    lines: JournalLine[];
    reversalOf?: string;
  },
) {
  assertBalanced(entry.lines);
  const { lines, ...header } = entry;
  tx.set(doc(db, "journalEntries", entry.id), {
    ...header,
    lineCount: lines.length,
    schemaVersion: 1,
    postedAt: serverTimestamp(),
    status: "posted",
  });
  lines.forEach((line, index) =>
    tx.set(doc(db, "journalLines", `${entry.id}_${index + 1}`), {
      ...line,
      journalEntryId: entry.id,
      lineNumber: index + 1,
      occurredAt: entry.occurredAt,
      eventType: entry.eventType,
      referenceId: entry.referenceId,
    }),
  );
}

async function listBorrowers() {
  return json({
    data: sortDate(await rows("borrowers"), "fullNameSearch", "asc").slice(
      0,
      100,
    ),
  });
}

async function createBorrower(body: unknown) {
  const parsed = borrowerSchema.safeParse(body);
  if (!parsed.success)
    return json(
      { error: "Invalid borrower details.", issues: parsed.error.flatten() },
      400,
    );
  const db = clientDb();
  const borrowerId = id("BOR");
  const data = {
    ...parsed.data,
    fullNameSearch: parsed.data.fullName.toLocaleLowerCase("en-PH"),
    schemaVersion: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(doc(db, "borrowers", borrowerId), data);
  batch.set(doc(collection(db, "auditLogs")), {
    action: "borrower.created",
    entityType: "borrower",
    entityId: borrowerId,
    adminUid: currentUid(),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return json({ id: borrowerId }, 201);
}

async function borrowerDetail(borrowerId: string) {
  const db = clientDb();
  const [borrower, loans, payments] = await Promise.all([
    getDoc(doc(db, "borrowers", borrowerId)),
    getDocs(
      query(collection(db, "loans"), where("borrowerId", "==", borrowerId)),
    ),
    getDocs(
      query(collection(db, "payments"), where("borrowerId", "==", borrowerId)),
    ),
  ]);
  if (!borrower.exists()) return json({ error: "Borrower not found." }, 404);
  return json({
    id: borrowerId,
    ...borrower.data(),
    loans: loans.docs.map((item) => ({ id: item.id, ...item.data() })),
    payments: sortDate(
      payments.docs.map((item) => ({ id: item.id, ...item.data() })),
      "paymentDate",
    ),
  });
}

async function updateBorrower(borrowerId: string, body: unknown) {
  const parsed = borrowerSchema.partial().safeParse(body);
  if (!parsed.success)
    return json(
      { error: "Invalid borrower details.", issues: parsed.error.flatten() },
      400,
    );
  const db = clientDb();
  const ref = doc(db, "borrowers", borrowerId);
  const before = await getDoc(ref);
  if (!before.exists()) return json({ error: "Borrower not found." }, 404);
  const changes = {
    ...parsed.data,
    ...(parsed.data.fullName
      ? { fullNameSearch: parsed.data.fullName.toLocaleLowerCase("en-PH") }
      : {}),
    updatedAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.update(ref, changes);
  batch.set(doc(collection(db, "auditLogs")), {
    action: "borrower.updated",
    entityType: "borrower",
    entityId: borrowerId,
    adminUid: currentUid(),
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return json({ ok: true });
}

async function listLoans() {
  return json({
    data: sortDate(await rows("loans"), "createdAt").slice(0, 100),
  });
}

async function createLoan(body: unknown) {
  const input = loanSchema.parse(body);
  const schedule = generateSchedule(input);
  const totals = summarizeSchedule(schedule);
  const db = clientDb();
  const uid = currentUid();
  const loanId = id("LOAN");
  const journalId = id("JE");
  const result = await runTransaction(db, async (tx) => {
    const keyRef = doc(db, "idempotencyKeys", input.idempotencyKey);
    const borrowerRef = doc(db, "borrowers", input.borrowerId);
    const accountRef = doc(db, "financialAccounts", "cash");
    const [existing, borrower, account] = await Promise.all([
      tx.get(keyRef),
      tx.get(borrowerRef),
      tx.get(accountRef),
    ]);
    if (existing.exists()) return existing.data().result;
    if (!borrower.exists() || borrower.data().status === "archived")
      throw new Error("Borrower is unavailable.");
    if (!account.exists())
      throw new Error(
        "Opening cash balance must be configured before releasing loans.",
      );
    const cashBalance = Number(account.data().balanceCentavos ?? 0);
    if (cashBalance < input.principalCentavos)
      throw new Error("Available cash is insufficient for this disbursement.");
    tx.set(doc(db, "loans", loanId), {
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
      createdBy: uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    schedule.forEach((row) =>
      tx.set(
        doc(
          db,
          "loanInstallments",
          `${loanId}_${String(row.installmentNumber).padStart(3, "0")}`,
        ),
        {
          ...row,
          loanId,
          borrowerId: input.borrowerId,
          interestPaidCentavos: 0,
          principalPaidCentavos: 0,
          outstandingInterestCentavos: row.interestCentavos,
          outstandingPrincipalCentavos: row.principalCentavos,
          status: "upcoming",
          contractVersion: 1,
        },
      ),
    );
    tx.update(accountRef, {
      balanceCentavos: cashBalance - input.principalCentavos,
      updatedAt: serverTimestamp(),
    });
    writeJournal(tx, db, {
      id: journalId,
      eventType: "loan_disbursement",
      occurredAt: `${input.releaseDate}T00:00:00+08:00`,
      referenceType: "loan",
      referenceId: loanId,
      description: `Loan disbursement ${loanId}`,
      lines: [
        {
          account: "loan_principal_receivable",
          debitCentavos: input.principalCentavos,
          creditCentavos: 0,
          borrowerId: input.borrowerId,
          loanId,
        },
        {
          account: "cash",
          debitCentavos: 0,
          creditCentavos: input.principalCentavos,
          borrowerId: input.borrowerId,
          loanId,
        },
      ],
    });
    tx.set(doc(collection(db, "auditLogs")), {
      action: "loan.disbursed",
      entityType: "loan",
      entityId: loanId,
      adminUid: uid,
      createdAt: serverTimestamp(),
    });
    const value = { loanId, journalId };
    tx.set(keyRef, {
      operation: "loan.disbursement",
      result: value,
      createdAt: serverTimestamp(),
    });
    return value;
  });
  return json(result, 201);
}

async function loanDetail(loanId: string) {
  const db = clientDb();
  const [loan, installments, payments, lines] = await Promise.all([
    getDoc(doc(db, "loans", loanId)),
    getDocs(
      query(collection(db, "loanInstallments"), where("loanId", "==", loanId)),
    ),
    getDocs(query(collection(db, "payments"), where("loanId", "==", loanId))),
    getDocs(
      query(collection(db, "journalLines"), where("loanId", "==", loanId)),
    ),
  ]);
  if (!loan.exists()) return json({ error: "Loan not found." }, 404);
  return json({
    id: loanId,
    ...loan.data(),
    installments: installments.docs
      .map((item) => item.data())
      .sort((a, b) => a.installmentNumber - b.installmentNumber),
    payments: sortDate(
      payments.docs.map((item) => ({ id: item.id, ...item.data() })),
      "paymentDate",
    ),
    journalLines: sortDate(
      lines.docs.map((item) => ({ id: item.id, ...item.data() })),
      "occurredAt",
    ),
  });
}

async function listPayments() {
  return json({
    data: sortDate(await rows("payments"), "paymentDate").slice(0, 100),
  });
}

async function paymentDetail(paymentId: string) {
  const db = clientDb();
  const payment = await getDoc(doc(db, "payments", paymentId));
  if (!payment.exists()) return json({ error: "Payment not found." }, 404);
  const data = payment.data();
  const [borrower, business] = await Promise.all([
    getDoc(doc(db, "borrowers", String(data.borrowerId))),
    getDoc(doc(db, "settings", "business")),
  ]);
  return json({
    id: paymentId,
    ...data,
    borrowerName: borrower.data()?.fullName ?? data.borrowerId,
    business: business.data() ?? {},
  });
}

async function createPayment(body: unknown) {
  const input = paymentSchema.parse(body);
  const db = clientDb();
  const uid = currentUid();
  const paymentId = id("PAY");
  const journalId = id("JE");
  const receipt = receiptNumber();
  const installmentSnapshot = await getDocs(
    query(
      collection(db, "loanInstallments"),
      where("loanId", "==", input.loanId),
    ),
  );
  const installmentRefs = installmentSnapshot.docs.map((item) => item.ref);
  const result = await runTransaction(db, async (tx) => {
    const keyRef = doc(db, "idempotencyKeys", input.idempotencyKey);
    const loanRef = doc(db, "loans", input.loanId);
    const accountRef = doc(db, "financialAccounts", "cash");
    const [key, loan, account, ...installments] = await Promise.all([
      tx.get(keyRef),
      tx.get(loanRef),
      tx.get(accountRef),
      ...installmentRefs.map((ref) => tx.get(ref)),
    ]);
    if (key.exists()) return key.data().result;
    if (!loan.exists()) throw new Error("Loan not found.");
    const loanData = loan.data();
    if (!["active", "overdue"].includes(loanData.status))
      throw new Error("This loan is not payable.");
    if (!account.exists()) throw new Error("Cash account is not configured.");
    const settlementAmount =
      Number(loanData.remainingPrincipalCentavos) +
      Number(loanData.accruedInterestCentavos);
    const isFullSettlement = input.amountCentavos === settlementAmount;
    const payable = installments
      .map((item) => item.data() as InstallmentBalance)
      .filter((item) => isFullSettlement || item.dueDate <= input.paymentDate)
      .map((item) =>
        isFullSettlement && item.dueDate > input.paymentDate
          ? { ...item, outstandingInterestCentavos: 0 }
          : item,
      );
    const allocation = allocatePayment(input.amountCentavos, payable);
    if (allocation.unappliedCentavos)
      throw new Error("Payment contains an unapplied amount.");
    const principal = allocation.allocations.reduce(
      (sum, item) => sum + item.principalCentavos,
      0,
    );
    const interest = allocation.allocations.reduce(
      (sum, item) => sum + item.interestCentavos,
      0,
    );
    if (interest > Number(loanData.accruedInterestCentavos ?? 0))
      throw new Error("Payment would collect interest that has not accrued.");
    tx.set(doc(db, "payments", paymentId), {
      loanId: input.loanId,
      borrowerId: loanData.borrowerId,
      amountCentavos: input.amountCentavos,
      principalCentavos: principal,
      interestCentavos: interest,
      isFullSettlement,
      futureInterestWaivedCentavos: isFullSettlement
        ? Number(loanData.scheduledFutureInterestCentavos)
        : 0,
      paymentDate: input.paymentDate,
      method: input.method,
      referenceNumber: input.referenceNumber,
      notes: input.notes,
      receiptNumber: receipt,
      status: "posted",
      journalEntryId: journalId,
      createdBy: uid,
      createdAt: serverTimestamp(),
      schemaVersion: 1,
    });
    allocation.allocations.forEach((item, index) => {
      const installment = installments.find(
        (row) => row.data()?.installmentNumber === item.installmentNumber,
      );
      if (!installment?.exists())
        throw new Error("Payment installment is missing.");
      const original = installment.data() as InstallmentBalance;
      const interestPaid =
        original.interestPaidCentavos + item.interestCentavos;
      const principalPaid =
        original.principalPaidCentavos + item.principalCentavos;
      const waived =
        isFullSettlement && original.dueDate > input.paymentDate
          ? original.interestCentavos - interestPaid
          : 0;
      const outstandingInterest =
        original.interestCentavos - interestPaid - waived;
      const outstandingPrincipal = original.principalCentavos - principalPaid;
      tx.update(
        doc(
          db,
          "loanInstallments",
          `${input.loanId}_${String(item.installmentNumber).padStart(3, "0")}`,
        ),
        {
          interestPaidCentavos: interestPaid,
          principalPaidCentavos: principalPaid,
          waivedInterestCentavos: waived,
          outstandingInterestCentavos: outstandingInterest,
          outstandingPrincipalCentavos: outstandingPrincipal,
          status:
            outstandingInterest + outstandingPrincipal === 0
              ? "paid"
              : "partial",
        },
      );
      tx.set(doc(db, "paymentAllocations", `${paymentId}_${index + 1}`), {
        paymentId,
        loanId: input.loanId,
        ...item,
        createdAt: serverTimestamp(),
      });
    });
    const remainingPrincipal =
      Number(loanData.remainingPrincipalCentavos) - principal;
    const remainingInterest =
      Number(loanData.accruedInterestCentavos) - interest;
    tx.update(loanRef, {
      remainingPrincipalCentavos: remainingPrincipal,
      accruedInterestCentavos: remainingInterest,
      ...(isFullSettlement
        ? {
            scheduledFutureInterestCentavos: 0,
            settledEarly: input.paymentDate < loanData.finalPaymentDate,
          }
        : {}),
      principalPaidCentavos: Number(loanData.principalPaidCentavos) + principal,
      interestPaidCentavos: Number(loanData.interestPaidCentavos) + interest,
      status:
        remainingPrincipal === 0 && remainingInterest === 0
          ? "fully_paid"
          : loanData.status,
      updatedAt: serverTimestamp(),
    });
    tx.update(accountRef, {
      balanceCentavos:
        Number(account.data().balanceCentavos) + input.amountCentavos,
      updatedAt: serverTimestamp(),
    });
    writeJournal(
      tx,
      db,
      paymentJournal({
        id: journalId,
        occurredAt: `${input.paymentDate}T00:00:00+08:00`,
        paymentId,
        loanId: input.loanId,
        borrowerId: loanData.borrowerId,
        principalCentavos: principal,
        interestCentavos: interest,
      }),
    );
    tx.set(doc(collection(db, "auditLogs")), {
      action: "payment.posted",
      entityType: "payment",
      entityId: paymentId,
      adminUid: uid,
      createdAt: serverTimestamp(),
    });
    const value = { paymentId, journalId, receiptNumber: receipt };
    tx.set(keyRef, {
      operation: "payment.posting",
      result: value,
      createdAt: serverTimestamp(),
    });
    return value;
  });
  return json(result, 201);
}

async function reversePayment(paymentId: string, body: DocumentData) {
  const reason = String(body.reason ?? "").trim();
  if (body.confirmed !== true || reason.length < 10) {
    return json(
      {
        error:
          "Confirm the reversal and enter a reason of at least 10 characters.",
      },
      400,
    );
  }
  const db = clientDb();
  const paymentRef = doc(db, "payments", paymentId);
  const paymentBefore = await getDoc(paymentRef);
  if (!paymentBefore.exists())
    return json({ error: "Payment not found." }, 404);
  const paymentData = paymentBefore.data();
  const [allocationQuery, lineQuery] = await Promise.all([
    getDocs(
      query(
        collection(db, "paymentAllocations"),
        where("paymentId", "==", paymentId),
      ),
    ),
    getDocs(
      query(
        collection(db, "journalLines"),
        where("journalEntryId", "==", paymentData.journalEntryId),
      ),
    ),
  ]);
  const installmentRefs = allocationQuery.docs.map((allocation) =>
    doc(
      db,
      "loanInstallments",
      `${paymentData.loanId}_${String(allocation.data().installmentNumber).padStart(3, "0")}`,
    ),
  );
  const reversalJournalId = id("JE");
  const value = await runTransaction(db, async (tx) => {
    const keyRef = doc(db, "idempotencyKeys", `payment_reversal_${paymentId}`);
    const loanRef = doc(db, "loans", String(paymentData.loanId));
    const accountRef = doc(db, "financialAccounts", "cash");
    const [payment, key, loan, account, ...installments] = await Promise.all([
      tx.get(paymentRef),
      tx.get(keyRef),
      tx.get(loanRef),
      tx.get(accountRef),
      ...installmentRefs.map((ref) => tx.get(ref)),
    ]);
    if (!payment.exists()) throw new Error("Payment not found.");
    if (key.exists() || payment.data().status === "reversed")
      throw new Error("This payment has already been reversed.");
    if (!loan.exists() || !account.exists())
      throw new Error("The payment loan or cash account is missing.");
    const currentPayment = payment.data();
    const cashBalance = Number(account.data().balanceCentavos);
    if (cashBalance < Number(currentPayment.amountCentavos))
      throw new Error("Cash balance is insufficient to reverse this payment.");
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    allocationQuery.docs.forEach((allocation, index) => {
      const current = installments[index];
      if (!current?.exists())
        throw new Error(
          "A payment allocation references a missing installment.",
        );
      const allocated = allocation.data();
      const installment = current.data();
      const interestPaid =
        Number(installment.interestPaidCentavos) -
        Number(allocated.interestCentavos);
      const principalPaid =
        Number(installment.principalPaidCentavos) -
        Number(allocated.principalCentavos);
      if (interestPaid < 0 || principalPaid < 0)
        throw new Error("Reversal would create a negative paid balance.");
      const outstandingInterest =
        Number(installment.interestCentavos) - interestPaid;
      const outstandingPrincipal =
        Number(installment.principalCentavos) - principalPaid;
      tx.update(current.ref, {
        interestPaidCentavos: interestPaid,
        principalPaidCentavos: principalPaid,
        waivedInterestCentavos: 0,
        outstandingInterestCentavos: outstandingInterest,
        outstandingPrincipalCentavos: outstandingPrincipal,
        status:
          installment.dueDate < today
            ? interestPaid + principalPaid
              ? "partial"
              : "overdue"
            : interestPaid + principalPaid
              ? "partial"
              : "upcoming",
      });
      tx.update(allocation.ref, {
        status: "reversed",
        reversedAt: serverTimestamp(),
        reversalJournalId,
      });
    });
    const loanData = loan.data();
    tx.update(loanRef, {
      remainingPrincipalCentavos:
        Number(loanData.remainingPrincipalCentavos) +
        Number(currentPayment.principalCentavos),
      accruedInterestCentavos:
        Number(loanData.accruedInterestCentavos) +
        Number(currentPayment.interestCentavos),
      principalPaidCentavos:
        Number(loanData.principalPaidCentavos) -
        Number(currentPayment.principalCentavos),
      interestPaidCentavos:
        Number(loanData.interestPaidCentavos) -
        Number(currentPayment.interestCentavos),
      scheduledFutureInterestCentavos:
        Number(loanData.scheduledFutureInterestCentavos) +
        Number(currentPayment.futureInterestWaivedCentavos ?? 0),
      status: loanData.finalPaymentDate < today ? "overdue" : "active",
      updatedAt: serverTimestamp(),
    });
    tx.update(accountRef, {
      balanceCentavos: cashBalance - Number(currentPayment.amountCentavos),
      updatedAt: serverTimestamp(),
    });
    tx.update(paymentRef, {
      status: "reversed",
      reversalReason: reason,
      reversalJournalId,
      reversedAt: serverTimestamp(),
      reversedBy: currentUid(),
    });
    writeJournal(tx, db, {
      id: reversalJournalId,
      eventType: "reversal",
      occurredAt: new Date().toISOString(),
      referenceType: "payment",
      referenceId: paymentId,
      description: `Reversal of payment ${paymentId}: ${reason}`,
      reversalOf: currentPayment.journalEntryId,
      lines: lineQuery.docs.map((line) => ({
        account: line.data().account,
        debitCentavos: Number(line.data().creditCentavos),
        creditCentavos: Number(line.data().debitCentavos),
        borrowerId: line.data().borrowerId,
        loanId: line.data().loanId,
      })),
    });
    tx.set(keyRef, {
      operation: "payment.reversal",
      paymentId,
      reversalJournalId,
      createdAt: serverTimestamp(),
    });
    tx.set(doc(collection(db, "auditLogs")), {
      action: "payment.reversed",
      entityType: "payment",
      entityId: paymentId,
      adminUid: currentUid(),
      reason,
      reversalJournalId,
      createdAt: serverTimestamp(),
    });
    return { paymentId, reversalJournalId };
  });
  return json(value);
}

async function settings(method: string, body?: unknown) {
  const db = clientDb();
  const ref = doc(db, "settings", "business");
  if (method === "GET") {
    const value = await getDoc(ref);
    return json(
      value.exists()
        ? value.data()
        : {
            defaultMonthlyRatePercent: "5",
            defaultMethod: "equal_amortization",
            earlyPaymentPolicy: "advance_installments",
            businessName: "",
            businessAddress: "",
            receiptFooter: "Thank you for your payment.",
          },
    );
  }
  await setDoc(
    ref,
    {
      ...(body as object),
      currency: "PHP",
      businessTimezone: "Asia/Manila",
      roundingPolicy: "ROUND_HALF_UP",
      updatedAt: serverTimestamp(),
      updatedBy: currentUid(),
    },
    { merge: true },
  );
  return json({ ok: true });
}

async function openCash(body: unknown) {
  const amount = Number(
    (body as { openingBalanceCentavos?: number }).openingBalanceCentavos,
  );
  if (!Number.isSafeInteger(amount) || amount < 0)
    return json(
      { error: "Opening balance must be a non-negative centavo amount." },
      400,
    );
  const db = clientDb();
  const uid = currentUid();
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "financialAccounts", "cash");
    if ((await tx.get(ref)).exists())
      throw new Error("Opening balance has already been configured.");
    tx.set(ref, {
      name: "Operating Cash",
      currency: "PHP",
      balanceCentavos: amount,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (amount) {
      writeJournal(tx, db, {
        id: id("JE"),
        eventType: "opening_balance",
        occurredAt: new Date().toISOString(),
        referenceType: "financial_account",
        referenceId: "cash",
        description: "Opening cash balance",
        lines: [
          { account: "cash", debitCentavos: amount, creditCentavos: 0 },
          { account: "capital", debitCentavos: 0, creditCentavos: amount },
        ],
      });
    }
    tx.set(doc(collection(db, "auditLogs")), {
      action: "cash.opening_balance_set",
      entityType: "financial_account",
      entityId: "cash",
      adminUid: uid,
      createdAt: serverTimestamp(),
      openingBalanceCentavos: amount,
    });
  });
  return json({ ok: true }, 201);
}

async function cashAdjustment(body: DocumentData) {
  const amount = Number(body.amountCentavos);
  if (
    !Number.isSafeInteger(amount) ||
    amount <= 0 ||
    String(body.notes ?? "").trim().length < 5
  )
    return json(
      { error: "Enter a valid amount and a reason of at least 5 characters." },
      400,
    );
  const db = clientDb();
  const journalId = id("JE");
  const value = await runTransaction(db, async (tx) => {
    const accountRef = doc(db, "financialAccounts", "cash");
    const keyRef = doc(db, "idempotencyKeys", String(body.idempotencyKey));
    const [account, key] = await Promise.all([
      tx.get(accountRef),
      tx.get(keyRef),
    ]);
    if (key.exists()) return key.data().result;
    if (!account.exists())
      throw new Error("Opening cash balance must be configured first.");
    const outflow =
      body.type === "capital_withdrawal" || body.type === "adjustment_out";
    const balance = Number(account.data().balanceCentavos);
    if (outflow && balance < amount)
      throw new Error("Available cash is insufficient.");
    const offset = String(body.type).startsWith("capital")
      ? "capital"
      : "adjustment";
    const lines = (
      outflow
        ? [
            { account: offset, debitCentavos: amount, creditCentavos: 0 },
            { account: "cash", debitCentavos: 0, creditCentavos: amount },
          ]
        : [
            { account: "cash", debitCentavos: amount, creditCentavos: 0 },
            { account: offset, debitCentavos: 0, creditCentavos: amount },
          ]
    ) as JournalLine[];
    tx.update(accountRef, {
      balanceCentavos: balance + (outflow ? -amount : amount),
      updatedAt: serverTimestamp(),
    });
    writeJournal(tx, db, {
      id: journalId,
      eventType: String(body.type),
      occurredAt: `${body.date}T00:00:00+08:00`,
      referenceType: "cash_adjustment",
      referenceId: journalId,
      description: String(body.notes),
      lines,
    });
    tx.set(doc(collection(db, "auditLogs")), {
      action: `cash.${body.type}`,
      entityType: "journal_entry",
      entityId: journalId,
      adminUid: currentUid(),
      createdAt: serverTimestamp(),
    });
    const result = { journalId };
    tx.set(keyRef, {
      operation: body.type,
      result,
      createdAt: serverTimestamp(),
    });
    return result;
  });
  return json(value, 201);
}

async function dueReminders(url: URL) {
  const requestedDays = Number(url.searchParams.get("days") ?? 7);
  const days = Math.min(
    Math.max(Number.isFinite(requestedDays) ? requestedDays : 7, 1),
    30,
  );
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const end = new Date(`${today}T12:00:00+08:00`);
  end.setDate(end.getDate() + days);
  const endDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(end);
  const [installments, loans, borrowers] = await Promise.all([
    rows("loanInstallments"),
    rows("loans"),
    rows("borrowers"),
  ]);
  const loanById = new Map(loans.map((item) => [item.id, item]));
  const borrowerById = new Map(borrowers.map((item) => [item.id, item]));
  const data = installments
    .filter((item) => {
      const amount =
        Number(item.outstandingInterestCentavos ?? 0) +
        Number(item.outstandingPrincipalCentavos ?? 0);
      const loan = loanById.get(item.loanId);
      return (
        amount > 0 &&
        item.dueDate <= endDate &&
        loan &&
        ["active", "overdue"].includes(String(loan.status))
      );
    })
    .map((item) => {
      const borrower = borrowerById.get(item.borrowerId) ?? {};
      const amountDueCentavos =
        Number(item.outstandingInterestCentavos ?? 0) +
        Number(item.outstandingPrincipalCentavos ?? 0);
      const reminderStatus =
        item.dueDate < today
          ? "overdue"
          : item.dueDate === today
            ? "due_today"
            : "upcoming";
      return {
        id: item.id,
        loanId: item.loanId,
        borrowerId: item.borrowerId,
        borrowerName: borrower.fullName ?? item.borrowerId,
        contactNumber: borrower.contactNumber ?? "",
        installmentNumber: item.installmentNumber,
        dueDate: item.dueDate,
        amountDueCentavos,
        reminderStatus,
      };
    })
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return json({
    today,
    endDate,
    days,
    data,
    summary: {
      overdue: data.filter((item) => item.reminderStatus === "overdue").length,
      dueToday: data.filter((item) => item.reminderStatus === "due_today")
        .length,
      upcoming: data.filter((item) => item.reminderStatus === "upcoming")
        .length,
      totalDueCentavos: data.reduce(
        (sum, item) => sum + item.amountDueCentavos,
        0,
      ),
    },
  });
}

async function dashboard(url: URL) {
  const start = url.searchParams.get("start") ?? "1900-01-01";
  const end = url.searchParams.get("end") ?? "9999-12-31";
  const db = clientDb();
  const [loanRows, allPayments, account, lineRows] = await Promise.all([
    rows("loans"),
    rows("payments"),
    getDoc(doc(db, "financialAccounts", "cash")),
    rows("journalLines"),
  ]);
  const payments = allPayments.filter(
    (item) =>
      item.paymentDate >= start &&
      item.paymentDate <= end &&
      item.status !== "reversed",
  );
  const lines = lineRows.filter(
    (item) =>
      item.occurredAt >= `${start}T00:00:00+08:00` &&
      item.occurredAt <= `${end}T23:59:59+08:00`,
  );
  const sum = (items: DocumentData[], key: string) =>
    items.reduce((total, item) => total + Number(item[key] ?? 0), 0);
  const monthly = new Map<
    string,
    {
      month: string;
      disbursed: number;
      collected: number;
      principal: number;
      interest: number;
    }
  >();
  for (const item of lines) {
    const month = String(item.occurredAt).slice(0, 7);
    const row = monthly.get(month) ?? {
      month,
      disbursed: 0,
      collected: 0,
      principal: 0,
      interest: 0,
    };
    if (item.eventType === "loan_disbursement" && item.account === "cash")
      row.disbursed += Number(item.creditCentavos);
    if (item.eventType === "payment" && item.account === "cash")
      row.collected += Number(item.debitCentavos);
    if (
      item.eventType === "payment" &&
      item.account === "loan_principal_receivable"
    )
      row.principal += Number(item.creditCentavos);
    if (item.eventType === "payment" && item.account === "interest_receivable")
      row.interest += Number(item.creditCentavos);
    monthly.set(month, row);
  }
  return json({
    metrics: {
      principalDisbursedCentavos: sum(loanRows, "principalCentavos"),
      outstandingPrincipalCentavos: sum(loanRows, "remainingPrincipalCentavos"),
      outstandingInterestCentavos: sum(loanRows, "accruedInterestCentavos"),
      scheduledFutureInterestCentavos: sum(
        loanRows,
        "scheduledFutureInterestCentavos",
      ),
      paymentsCollectedCentavos: sum(payments, "amountCentavos"),
      principalRecoveredCentavos: sum(payments, "principalCentavos"),
      interestEarnedCentavos: sum(payments, "interestCentavos"),
      availableCashCentavos: account.exists()
        ? Number(account.data().balanceCentavos ?? 0)
        : null,
      activeLoans: loanRows.filter((item) => item.status === "active").length,
      overdueLoans: loanRows.filter((item) => item.status === "overdue").length,
      paidLoans: loanRows.filter((item) => item.status === "fully_paid").length,
    },
    monthly: [...monthly.values()].sort((a, b) =>
      a.month.localeCompare(b.month),
    ),
  });
}

async function history(url: URL) {
  const config = {
    transactions: ["journalEntries", "occurredAt"],
    ledger: ["journalLines", "occurredAt"],
    audit: ["auditLogs", "createdAt"],
  } as const;
  const type = url.searchParams.get("type") as keyof typeof config;
  if (!config[type]) return json({ error: "Invalid history type." }, 400);
  const [name, field] = config[type];
  return json({
    data: sortDate(await rows(name), field).slice(
      0,
      Math.min(Number(url.searchParams.get("limit") ?? 100), 250),
    ),
  });
}

async function reconciliation(method: string) {
  if (method === "GET") {
    const values = sortDate(await rows("reconciliations"), "createdAt");
    return json(values[0] ?? null);
  }
  const db = clientDb();
  const [headers, lines, payments, loans, installments, borrowers, cash] =
    await Promise.all([
      rows("journalEntries"),
      rows("journalLines"),
      rows("payments"),
      rows("loans"),
      rows("loanInstallments"),
      rows("borrowers"),
      getDoc(doc(db, "financialAccounts", "cash")),
    ]);
  const byEntry = new Map<string, JournalLine[]>();
  for (const line of lines)
    byEntry.set(line.journalEntryId, [
      ...(byEntry.get(line.journalEntryId) ?? []),
      line as unknown as JournalLine,
    ]);
  const entries = headers.map(
    (item) =>
      ({
        ...item,
        lines: byEntry.get(item.id) ?? [],
      }) as unknown as JournalEntry,
  );
  const issues: ReconciliationIssue[] = reconcileJournals(entries);
  for (const payment of payments.filter((item) => item.status === "posted")) {
    const allocations = await getDocs(
      query(
        collection(db, "paymentAllocations"),
        where("paymentId", "==", payment.id),
      ),
    );
    const allocated = allocations.docs.reduce(
      (sum, item) =>
        sum +
        Number(item.data().principalCentavos) +
        Number(item.data().interestCentavos),
      0,
    );
    if (allocated !== Number(payment.amountCentavos))
      issues.push({
        code: "PAYMENT_ALLOCATION_MISMATCH",
        reference: payment.id,
        message: `Payment is ${payment.amountCentavos} but allocations total ${allocated}.`,
      });
  }
  const cashFromLedger = lines.reduce(
    (sum, item) =>
      item.account === "cash"
        ? sum + Number(item.debitCentavos) - Number(item.creditCentavos)
        : sum,
    0,
  );
  if (cash.exists() && cashFromLedger !== Number(cash.data().balanceCentavos))
    issues.push({
      code: "CASH_LEDGER_MISMATCH",
      reference: "cash",
      message: `Cash account is ${cash.data().balanceCentavos}; ledger is ${cashFromLedger}.`,
    });
  const borrowerIds = new Set(borrowers.map((item) => item.id));
  loans.forEach((item) => {
    if (!borrowerIds.has(item.borrowerId))
      issues.push({
        code: "MISSING_LOAN_BORROWER",
        reference: item.id,
        message: "Loan references a missing borrower.",
      });
  });
  installments.forEach((item) => {
    if (
      Number(item.outstandingInterestCentavos) < 0 ||
      Number(item.outstandingPrincipalCentavos) < 0
    )
      issues.push({
        code: "NEGATIVE_INSTALLMENT_BALANCE",
        reference: item.id,
        message: "Installment has a negative outstanding balance.",
      });
  });
  const value = {
    status: issues.length ? "discrepancies" : "passed",
    issues,
    transactionsChecked: entries.length,
    paymentsChecked: payments.length,
    loansChecked: loans.length,
    createdBy: currentUid(),
    createdAt: serverTimestamp(),
  };
  const ref = doc(collection(db, "reconciliations"));
  await setDoc(ref, value);
  return json({ id: ref.id, ...value });
}

async function route(url: URL, init?: RequestInit) {
  const method = (init?.method ?? "GET").toUpperCase();
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  const path = url.pathname;
  if (path === "/api/borrowers")
    return method === "POST" ? createBorrower(body) : listBorrowers();
  const borrower = path.match(/^\/api\/borrowers\/([^/]+)$/);
  if (borrower)
    return method === "PATCH"
      ? updateBorrower(borrower[1], body)
      : borrowerDetail(borrower[1]);
  if (path === "/api/loans")
    return method === "POST" ? createLoan(body) : listLoans();
  const loan = path.match(/^\/api\/loans\/([^/]+)$/);
  if (loan) return loanDetail(loan[1]);
  if (path === "/api/payments")
    return method === "POST" ? createPayment(body) : listPayments();
  const reversal = path.match(/^\/api\/payments\/([^/]+)\/reverse$/);
  if (reversal) return reversePayment(reversal[1], body);
  const payment = path.match(/^\/api\/payments\/([^/]+)$/);
  if (payment) return paymentDetail(payment[1]);
  if (path === "/api/settings") return settings(method, body);
  if (path === "/api/settings/cash") return openCash(body);
  if (path === "/api/cash-adjustments") return cashAdjustment(body);
  if (path === "/api/reminders") return dueReminders(url);
  if (path === "/api/dashboard") return dashboard(url);
  if (path === "/api/history") return history(url);
  if (path === "/api/reconciliation") return reconciliation(method);
  throw new Error(`Client Firestore route is not implemented: ${path}`);
}

export function installClientApi() {
  if (installed || !nativeFetch) return;
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(raw, window.location.origin);
    if (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/api/") &&
      !url.pathname.startsWith("/api/cron/")
    ) {
      try {
        return await route(url, init);
      } catch (error) {
        console.error("Client Firestore request failed", error);
        return json(
          {
            error:
              error instanceof Error
                ? error.message
                : "Firebase operation failed.",
          },
          400,
        );
      }
    }
    return nativeFetch(input, init);
  };
  installed = true;
}
