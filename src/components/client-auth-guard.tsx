"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { clientAuth, clientDb } from "@/lib/firebase-client";
import { installClientApi, syncDailyAccruals } from "@/lib/client-api";

export function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installClientApi();
    return onAuthStateChanged(clientAuth(), async (user) => {
      if (!user) {
        router.replace("/");
        return;
      }
      try {
        const admin = await getDoc(doc(clientDb(), "admins", user.uid));
        if (!admin.exists() || admin.data().active !== true) {
          await signOut(clientAuth());
          toast.error("This Firebase account is not an active administrator.");
          router.replace("/");
          return;
        }
        await syncDailyAccruals();
        setReady(true);
      } catch {
        await signOut(clientAuth());
        toast.error("Administrator access could not be verified.");
        router.replace("/");
      }
    });
  }, [router]);

  if (!ready) {
    return (
      <div className="grid min-h-screen place-items-center bg-background text-sm text-muted">
        Verifying Firebase access…
      </div>
    );
  }
  return children;
}
