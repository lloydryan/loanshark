import { requireAdmin, authError } from "@/lib/auth";
import { initializeCashAccount } from "@/server/financial-service";

export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const { openingBalanceCentavos } = await request.json() as { openingBalanceCentavos: number };
    await initializeCashAccount(openingBalanceCentavos, admin.uid);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && /Opening balance/.test(error.message)) return Response.json({ error: error.message }, { status: 400 });
    return authError(error);
  }
}
