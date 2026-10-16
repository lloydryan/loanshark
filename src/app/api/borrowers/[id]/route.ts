import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { borrowerSchema } from "@/lib/validation";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    const { id } = await context.params;
    const [borrower, loans, payments] = await Promise.all([
      adminDb().collection("borrowers").doc(id).get(),
      adminDb().collection("loans").where("borrowerId", "==", id).get(),
      adminDb().collection("payments").where("borrowerId", "==", id).orderBy("paymentDate", "desc").limit(100).get(),
    ]);
    if (!borrower.exists) return Response.json({ error: "Borrower not found." }, { status: 404 });
    return Response.json({ id, ...borrower.data(), loans: loans.docs.map((d) => ({ id: d.id, ...d.data() })), payments: payments.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (error) { return authError(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const parsed = borrowerSchema.partial().safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid borrower details.", issues: parsed.error.flatten() }, { status: 400 });
    const ref = adminDb().collection("borrowers").doc(id);
    const before = await ref.get();
    if (!before.exists) return Response.json({ error: "Borrower not found." }, { status: 404 });
    const changes = { ...parsed.data, ...(parsed.data.fullName ? { fullNameSearch: parsed.data.fullName.toLocaleLowerCase("en-PH") } : {}), updatedAt: FieldValue.serverTimestamp() };
    const batch = adminDb().batch();
    batch.update(ref, changes);
    batch.create(adminDb().collection("auditLogs").doc(), { action: "borrower.updated", entityType: "borrower", entityId: id, adminUid: admin.uid, createdAt: FieldValue.serverTimestamp(), before: before.data(), changes });
    await batch.commit();
    return Response.json({ ok: true });
  } catch (error) { return authError(error); }
}
