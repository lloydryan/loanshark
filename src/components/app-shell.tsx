"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BarChart3,
  BellRing,
  BookOpen,
  Calculator,
  ChevronLeft,
  CircleDollarSign,
  ClipboardCheck,
  HandCoins,
  Landmark,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ReceiptText,
  Settings,
  Sun,
  Users,
  X,
} from "lucide-react";
import { useTheme } from "next-themes";
import { signOut } from "firebase/auth";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";
import { clientAuth } from "@/lib/firebase-client";
import { BrandMark } from "./brand-mark";
const nav = [
  ["Dashboard", "/dashboard", LayoutDashboard],
  ["Due reminders", "/reminders", BellRing],
  ["Borrowers", "/borrowers", Users],
  ["Loans", "/loans", HandCoins],
  ["Calculator", "/calculator", Calculator],
  ["Payments", "/payments", CircleDollarSign],
  ["Cash ledger", "/ledger", Landmark],
  ["Transactions", "/transactions", ReceiptText],
  ["Reports", "/reports", BarChart3],
  ["Reconciliation", "/reconciliation", ClipboardCheck],
  ["Audit logs", "/audit", BookOpen],
  ["Settings", "/settings", Settings],
] as const;
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  async function logout() {
    await signOut(clientAuth());
    router.replace("/");
    router.refresh();
  }
  return (
    <div
      className="min-h-screen lg:grid"
      style={{ gridTemplateColumns: collapsed ? "76px 1fr" : "248px 1fr" }}
    >
      {mobile && (
        <button
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          aria-label="Close navigation"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-[#0c2139] text-slate-100 transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-auto lg:translate-x-0",
          mobile ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
          <BrandMark className="size-9" />
          {!collapsed && (
            <div>
              <div className="font-semibold">Pautang Ledger</div>
              <div className="text-xs text-slate-400">Financial control</div>
            </div>
          )}
          <button
            className="ml-auto lg:hidden"
            onClick={() => setMobile(false)}
          >
            <X />
          </button>
        </div>
        <nav
          className="flex-1 space-y-1 overflow-y-auto p-3"
          aria-label="Primary navigation"
        >
          {nav.map(([label, href, Icon]) => (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              onClick={() => setMobile(false)}
              className={cn(
                "flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm text-slate-300 hover:bg-white/8 hover:text-white",
                pathname.startsWith(href) &&
                  "bg-white/10 font-medium text-white",
              )}
            >
              <Icon size={18} />
              {!collapsed && label}
            </Link>
          ))}
        </nav>
        <button
          className="m-3 hidden h-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 hover:bg-white/8 lg:flex"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft
            className={cn("transition-transform", collapsed && "rotate-180")}
          />
        </button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-panel/95 px-4 backdrop-blur sm:px-6">
          <Button
            variant="ghost"
            className="px-2 lg:hidden"
            onClick={() => setMobile(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <div className="hidden text-sm text-muted sm:block">
            Asia/Manila · Philippine Peso
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              className="px-3"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <Sun size={18} />
              ) : (
                <Moon size={18} />
              )}
            </Button>
            <Button variant="ghost" className="px-3" onClick={logout}>
              <LogOut size={17} />
              <span className="hidden sm:inline">Log out</span>
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
