import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";
import { recordPayment } from "@/server/financial-service";

export async function GET() {
  try {
    await requireAdmin();
    const snapshot = await adminDb().collection("payments").orderBy("paymentDate", "desc").limit(100).get();
    return Response.json({ data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { return authError(error); }
}

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    return Response.json(await recordPayment(await request.json(), admin.uid), { status: 201 });
  } catch (error) {
    if (error instanceof Error && (/Payment|Loan|payable|accrued|unapplied|collectible|configured/.test(error.message) || error.name === "ZodError")) return Response.json({ error: error.message }, { status: 400 });
    return authError(error);
  }
}
