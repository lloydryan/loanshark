import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { createAndDisburseLoan } from "@/server/financial-service";

export async function GET() {
  try {
    await requireAdmin();
    const snapshot = await adminDb().collection("loans").orderBy("createdAt", "desc").limit(100).get();
    return Response.json({ data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { return authError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const result = await createAndDisburseLoan(await request.json(), admin.uid);
    return Response.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.name === "ZodError" || /Borrower|cash|Principal|Interest|configured|insufficient/.test(error.message))) return Response.json({ error: error.message }, { status: 400 });
    return authError(error);
  }
}
