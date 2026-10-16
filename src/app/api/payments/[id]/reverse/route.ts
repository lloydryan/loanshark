import { requireAdmin, authError } from "@/lib/auth";
import { reversePayment } from "@/server/financial-service";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const { reason, confirmed } = await request.json() as { reason?: string; confirmed?: boolean };
    if (!confirmed) return Response.json({ error: "Explicit administrator confirmation is required." }, { status: 400 });
    return Response.json(await reversePayment(id, reason ?? "", admin.uid));
  } catch (error) {
    if (error instanceof Error && /revers|Payment|cash|allocation|installment/.test(error.message)) return Response.json({ error: error.message }, { status: 400 });
    return authError(error);
  }
}
