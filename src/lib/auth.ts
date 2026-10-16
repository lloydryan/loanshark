import "server-only";
import { cookies } from "next/headers";
import { adminAuth } from "./firebase-admin";

export function isAuthorizedAdmin(user: { uid: string; email?: string }) {
  const configuredUid = process.env.ADMIN_UID?.trim();
  const configuredEmail = process.env.ADMIN_EMAIL?.trim().toLocaleLowerCase("en-US");
  return Boolean(
    configuredUid &&
    configuredEmail &&
    user.uid === configuredUid &&
    user.email?.toLocaleLowerCase("en-US") === configuredEmail,
  );
}

export async function requireAdmin() {
  const token = (await cookies()).get("__session")?.value;
  if (!token) throw new Error("UNAUTHENTICATED");
  const decoded = await adminAuth().verifySessionCookie(token, true);
  if (!isAuthorizedAdmin(decoded)) throw new Error("UNAUTHORIZED");
  return decoded;
}

export function authError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown error";
  if (message === "UNAUTHENTICATED") return Response.json({ error: "Authentication required." }, { status: 401 });
  if (message === "UNAUTHORIZED") return Response.json({ error: "Administrator access required." }, { status: 403 });
  console.error(error);
  return Response.json({ error: "The operation could not be completed." }, { status: 500 });
}
