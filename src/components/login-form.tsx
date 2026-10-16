"use client";
import { useState } from "react";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clientAuth } from "@/lib/firebase-client";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";
import { BrandMark } from "./brand-mark";
export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await signInWithEmailAndPassword(clientAuth(), email, password);
      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setLoading(false);
    }
  }
  async function reset() {
    if (!email) return toast.error("Enter your administrator email first.");
    try {
      await sendPasswordResetEmail(clientAuth(), email);
      toast.success("Password reset email sent.");
    } catch {
      toast.error("The reset email could not be sent.");
    }
  }
  return (
    <div className="w-full max-w-md">
      <div className="mb-10 lg:hidden">
        <div className="mb-8 flex items-center gap-3 text-lg font-semibold">
          <BrandMark className="size-10" />
          Pautang Ledger
        </div>
      </div>
      <h2 className="text-3xl font-semibold tracking-tight">
        Administrator sign in
      </h2>
      <p className="mt-2 text-sm text-muted">
        Use the only account authorized for this ledger.
      </p>
      <form onSubmit={submit} className="mt-8 grid gap-5">
        <Field label="Email address">
          <input
            className={inputClass}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>
        <Field label="Password">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </Field>
        <Button className="mt-2 w-full" disabled={loading}>
          {loading ? "Verifying…" : "Sign in securely"}
        </Button>
        <button
          type="button"
          className="text-sm font-medium text-[#245a8d] hover:underline dark:text-blue-300"
          onClick={reset}
        >
          Forgot password?
        </button>
      </form>
      <p className="mt-8 border-t pt-5 text-xs leading-5 text-muted">
        Access is controlled by Firebase Authentication and Firestore Security
        Rules. No borrower accounts or public registration are available.
      </p>
    </div>
  );
}
