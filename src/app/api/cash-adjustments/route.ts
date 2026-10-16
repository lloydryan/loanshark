import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { newId } from "@/lib/ids";
import { assertBalanced } from "@/domain/ledger";
import type { JournalLine } from "@/domain/types";

const schema = z.object({
  type: z.enum(["capital_addition", "capital_withdrawal", "adjustment_in", "adjustment_out"]),
  amountCentavos: z.number().int().positive(), date: z.iso.date(), notes: z.string().trim().min(5).max(500), idempotencyKey: z.string().uuid(),
});

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin(); const input = schema.parse(await request.json()); const db = adminDb();
    const accountRef = db.collection("financialAccounts").doc("cash"); const keyRef = db.collection("idempotencyKeys").doc(input.idempotencyKey); const journalId = newId("JE");
    const result = await db.runTransaction(async (transaction) => {
      const [account, key] = await Promise.all([transaction.get(accountRef), transaction.get(keyRef)]);
      if (key.exists) return key.data()!.result;
      if (!account.exists) throw new Error("Opening cash balance must be configured first.");
      const outflow = input.type === "capital_withdrawal" || input.type === "adjustment_out"; const balance = Number(account.data()!.balanceCentavos);
      if (outflow && balance < input.amountCentavos) throw new Error("Available cash is insufficient.");
      const offset = input.type.startsWith("capital") ? "capital" : "adjustment";
      const lines: JournalLine[] = outflow
        ? [{ account: offset, debitCentavos: input.amountCentavos, creditCentavos: 0 }, { account: "cash", debitCentavos: 0, creditCentavos: input.amountCentavos }]
        : [{ account: "cash", debitCentavos: input.amountCentavos, creditCentavos: 0 }, { account: offset, debitCentavos: 0, creditCentavos: input.amountCentavos }];
      assertBalanced(lines);
      transaction.update(accountRef, { balanceCentavos: balance + (outflow ? -input.amountCentavos : input.amountCentavos), updatedAt: FieldValue.serverTimestamp() });
      transaction.create(db.collection("journalEntries").doc(journalId), { eventType: input.type, occurredAt: `${input.date}T00:00:00+08:00`, referenceType: "cash_adjustment", referenceId: journalId, description: input.notes, lineCount: 2, status: "posted", schemaVersion: 1, postedAt: FieldValue.serverTimestamp() });
      lines.forEach((line, index) => transaction.create(db.collection("journalLines").doc(`${journalId}_${index + 1}`), { ...line, journalEntryId: journalId, lineNumber: index + 1, occurredAt: `${input.date}T00:00:00+08:00`, eventType: input.type, referenceId: journalId }));
      transaction.create(db.collection("auditLogs").doc(), { action: `cash.${input.type}`, entityType: "journal_entry", entityId: journalId, adminUid: admin.uid, notes: input.notes, createdAt: FieldValue.serverTimestamp() });
      const value = { journalId }; transaction.create(keyRef, { operation: input.type, result: value, createdAt: FieldValue.serverTimestamp() }); return value;
    });
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.name === "ZodError" || /cash|balance|configured/.test(error.message))) return Response.json({ error: error.message }, { status: 400 });
    return authError(error);
  }
}
