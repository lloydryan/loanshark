import { requireAdmin, authError } from "@/lib/auth";
import { adminDb } from "@/lib/firebase-admin";

const configs = {
  transactions: { collection: "journalEntries", order: "occurredAt" },
  ledger: { collection: "journalLines", order: "occurredAt" },
  audit: { collection: "auditLogs", order: "createdAt" },
} as const;

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const type = url.searchParams.get("type") as keyof typeof configs;
    const config = configs[type];
    if (!config) {
      return Response.json({ error: "Invalid history type." }, { status: 400 });
    }

    const limit = Math.min(Number(url.searchParams.get("limit") ?? 100), 250);
    let query: FirebaseFirestore.Query = adminDb().collection(config.collection);
    if (type === "ledger") query = query.where("account", "==", "cash");
    const snapshot = await query.orderBy(config.order, "desc").limit(limit).get();

    return Response.json({
      data: snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    });
  } catch (error) {
    return authError(error);
  }
}
