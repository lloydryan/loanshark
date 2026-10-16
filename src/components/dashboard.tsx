"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  HandCoins,
  Plus,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatPHP } from "@/domain/money";
import { Button } from "./ui/button";
import { Panel, PageHeader } from "./ui/panel";
type Data = {
  metrics: Record<string, number | null>;
  monthly: {
    month: string;
    disbursed: number;
    collected: number;
    principal: number;
    interest: number;
  }[];
};
const ranges = ["This month", "Last 3 months", "Last 6 months", "This year"];
export function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("This month");
  useEffect(() => {
    setData(null);
    const now = new Date();
    const start = new Date(now);
    if (range === "This month") start.setDate(1);
    else if (range === "Last 3 months") start.setMonth(now.getMonth() - 2, 1);
    else if (range === "Last 6 months") start.setMonth(now.getMonth() - 5, 1);
    else start.setMonth(0, 1);
    const q = new URLSearchParams({
      start: start.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    });
    fetch(`/api/dashboard?${q}`)
      .then(async (r) => {
        const x = await r.json();
        if (!r.ok) throw new Error(x.error);
        return x;
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [range]);
  const money = (key: string) =>
    data?.metrics[key] == null ? "—" : formatPHP(data.metrics[key]!);
  return (
    <div className="space-y-8">
      <PageHeader
        title="Portfolio overview"
        description="Cash, receivables, and collections from the authoritative ledger."
        actions={
          <div className="flex gap-2">
            <select
              aria-label="Reporting range"
              className="h-10 rounded-lg border bg-panel px-3 text-sm"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              {ranges.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <Button asChild>
              <Link href="/loans/new">
                <Plus size={17} />
                New loan
              </Link>
            </Button>
          </div>
        }
      />
      {error && (
        <Panel className="border-red-300 p-4 text-sm text-danger">
          {error}
        </Panel>
      )}
      {!data ? (
        <div className="grid animate-pulse gap-4 md:grid-cols-3">
          <div className="h-44 rounded-xl bg-slate-200/70 dark:bg-slate-800" />
          <div className="h-44 rounded-xl bg-slate-200/70 dark:bg-slate-800" />
          <div className="h-44 rounded-xl bg-slate-200/70 dark:bg-slate-800" />
        </div>
      ) : (
        <>
          <section className="grid gap-4 lg:grid-cols-[1.35fr_.8fr_.8fr]">
            <Panel className="bg-[#0f2744] p-6 text-white dark:bg-slate-100 dark:text-slate-950">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-300 dark:text-slate-600">
                    Available cash
                  </p>
                  <p className="numeric mt-3 text-4xl font-semibold tracking-tight">
                    {money("availableCashCentavos")}
                  </p>
                </div>
                <WalletCards className="text-emerald-300" />
              </div>
              <div className="mt-8 flex items-center justify-between border-t border-white/15 pt-4 text-sm">
                <span>Collected in range</span>
                <span className="numeric font-semibold">
                  {money("paymentsCollectedCentavos")}
                </span>
              </div>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-muted">Outstanding principal</p>
              <p className="numeric mt-3 text-2xl font-semibold">
                {money("outstandingPrincipalCentavos")}
              </p>
              <p className="mt-6 flex items-center gap-2 text-sm text-muted">
                <ArrowUpRight size={16} className="text-warning" />
                Receivable, not cash
              </p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-muted">Accrued interest</p>
              <p className="numeric mt-3 text-2xl font-semibold">
                {money("outstandingInterestCentavos")}
              </p>
              <p className="mt-6 flex items-center gap-2 text-sm text-muted">
                <ArrowDownRight size={16} className="text-success" />
                {money("interestEarnedCentavos")} collected
              </p>
            </Panel>
          </section>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Principal disbursed", "principalDisbursedCentavos"],
              ["Principal recovered", "principalRecoveredCentavos"],
              ["Active loans", "activeLoans"],
              ["Overdue loans", "overdueLoans"],
            ].map(([label, key]) => (
              <Panel className="p-5" key={key}>
                <p className="text-sm text-muted">{label}</p>
                <p className="numeric mt-2 text-xl font-semibold">
                  {key.endsWith("Loans") ? data.metrics[key] : money(key)}
                </p>
              </Panel>
            ))}
          </section>
          <section className="grid gap-4 xl:grid-cols-2">
            <Panel className="p-5">
              <h2 className="font-semibold">Cash flow</h2>
              <p className="mt-1 text-sm text-muted">
                Disbursements and collected payments by month
              </p>
              <div className="mt-6 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis
                      tickFormatter={(v) => `₱${Math.round(v / 100000)}k`}
                    />
                    <Tooltip formatter={(v) => formatPHP(Number(v))} />
                    <Area
                      dataKey="collected"
                      name="Collected"
                      stroke="#07845c"
                      fill="#07845c22"
                    />
                    <Area
                      dataKey="disbursed"
                      name="Disbursed"
                      stroke="#d97706"
                      fill="#d9770622"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
            <Panel className="p-5">
              <h2 className="font-semibold">Collection mix</h2>
              <p className="mt-1 text-sm text-muted">
                Principal and earned interest actually collected
              </p>
              <div className="mt-6 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data.monthly}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="month" />
                    <YAxis
                      tickFormatter={(v) => `₱${Math.round(v / 100000)}k`}
                    />
                    <Tooltip formatter={(v) => formatPHP(Number(v))} />
                    <Bar
                      dataKey="principal"
                      name="Principal"
                      fill="#183e66"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="interest"
                      name="Interest"
                      fill="#0b9368"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          </section>
          {data.metrics.availableCashCentavos == null && (
            <Panel className="flex flex-col gap-4 border-amber-300 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950/20 dark:text-amber-100 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex gap-3">
                <HandCoins />
                <div>
                  <p className="font-semibold">Opening cash balance required</p>
                  <p className="text-sm opacity-80">
                    Configure the cash account before releasing the first loan.
                  </p>
                </div>
              </div>
              <Button asChild>
                <Link href="/settings">Open settings</Link>
              </Button>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
