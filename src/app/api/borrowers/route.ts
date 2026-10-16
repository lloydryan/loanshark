import { FieldValue } from "firebase-admin/firestore";
import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { newId } from "@/lib/ids";
import { borrowerSchema } from "@/lib/validation";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 25), 100);
    const snapshot = await adminDb().collection("borrowers").orderBy("fullNameSearch").limit(limit).get();
    return Response.json({ data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { return authError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const parsed = borrowerSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid borrower details.", issues: parsed.error.flatten() }, { status: 400 });
    const id = newId("BOR");
    const data = { ...parsed.data, fullNameSearch: parsed.data.fullName.toLocaleLowerCase("en-PH"), schemaVersion: 1, createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
    const batch = adminDb().batch();
    batch.create(adminDb().collection("borrowers").doc(id), data);
    batch.create(adminDb().collection("auditLogs").doc(), { action: "borrower.created", entityType: "borrower", entityId: id, adminUid: admin.uid, createdAt: FieldValue.serverTimestamp(), after: data });
    await batch.commit();
    return Response.json({ id }, { status: 201 });
  } catch (error) { return authError(error); }
}
