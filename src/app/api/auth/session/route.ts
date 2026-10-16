import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase-admin";
import { isAuthorizedAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_UID) {
      return Response.json({ error: "ADMIN_EMAIL and ADMIN_UID are not configured on the server." }, { status: 503 });
    }
    const { idToken } = await request.json() as { idToken?: string };
    if (!idToken) return Response.json({ error: "ID token is required." }, { status: 400 });
    const decoded = await adminAuth().verifyIdToken(idToken, true);
    if (!isAuthorizedAdmin(decoded)) return Response.json({ error: "This email account is not authorized as the administrator." }, { status: 403 });
    const expiresIn = 5 * 24 * 60 * 60 * 1000;
    const session = await adminAuth().createSessionCookie(idToken, { expiresIn });
    (await cookies()).set("__session", session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: expiresIn / 1000 });
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Firebase session creation failed", error);
    if (!process.env.FIREBASE_CLIENT_EMAIL || !process.env.FIREBASE_PRIVATE_KEY) {
      return Response.json({ error: "Firebase Admin credentials are missing. Configure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY, then restart the server." }, { status: 503 });
    }
    return Response.json({ error: "Sign-in could not be verified." }, { status: 401 });
  }
}

export async function DELETE() {
  (await cookies()).delete("__session");
  return Response.json({ ok: true });
}
