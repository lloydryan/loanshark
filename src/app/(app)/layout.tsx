import { AppShell } from "@/components/app-shell";
import { ClientAuthGuard } from "@/components/client-auth-guard";
export default function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClientAuthGuard>
      <AppShell>{children}</AppShell>
    </ClientAuthGuard>
  );
}
