"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { formatPHP } from "@/domain/money";
import { Button } from "./ui/button";
import { PageHeader, Panel } from "./ui/panel";
import { cn } from "@/lib/utils";

type ReminderStatus = "overdue" | "due_today" | "upcoming";

type Reminder = {
  id: string;
  loanId: string;
  borrowerId: string;
  borrowerName: string;
  contactNumber: string;
  installmentNumber: number;
  dueDate: string;
  amountDueCentavos: number;
  reminderStatus: ReminderStatus;
};

type ReminderResponse = {
  today: string;
  endDate: string;
  days: number;
  data: Reminder[];
  summary: {
    overdue: number;
    dueToday: number;
    upcoming: number;
    totalDueCentavos: number;
  };
};

function formatDate(date: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+08:00`));
}

function dayLabel(dueDate: string, today: string) {
  const due = new Date(`${dueDate}T12:00:00+08:00`).getTime();
  const now = new Date(`${today}T12:00:00+08:00`).getTime();
  const days = Math.round((due - now) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

function messageFor(reminder: Reminder) {
  const timing = reminder.reminderStatus === "overdue" ? "was due" : "is due";
  return `Hi ${reminder.borrowerName}, this is a friendly reminder that your loan payment of ${formatPHP(reminder.amountDueCentavos)} ${timing} on ${formatDate(reminder.dueDate)}. Please let me know when you can settle it. Thank you.`;
}

function whatsappNumber(contact: string) {
  let digits = contact.replace(/\D/g, "");
  if (digits.startsWith("0")) digits = `63${digits.slice(1)}`;
  else if (digits.length === 10 && digits.startsWith("9"))
    digits = `63${digits}`;
  return digits;
}

function StatusBadge({ status }: { status: ReminderStatus }) {
  const label =
    status === "overdue"
      ? "Overdue"
      : status === "due_today"
        ? "Due today"
        : "Upcoming";
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
        status === "overdue" &&
          "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
        status === "due_today" &&
          "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300",
        status === "upcoming" &&
          "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
      )}
    >
      {label}
    </span>
  );
}

function ReminderRow({
  reminder,
  today,
}: {
  reminder: Reminder;
  today: string;
}) {
  const message = messageFor(reminder);
  const phone = whatsappNumber(reminder.contactNumber);

  async function copyMessage() {
    await navigator.clipboard.writeText(message);
    toast.success("Reminder message copied.");
  }

  return (
    <article className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_180px_180px_auto] lg:items-center">
      <div className="flex min-w-0 items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
          {reminder.borrowerName
            .split(" ")
            .slice(0, 2)
            .map((part) => part[0])
            .join("")
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate font-semibold">{reminder.borrowerName}</h3>
            <StatusBadge status={reminder.reminderStatus} />
          </div>
          <p className="mt-1 text-sm text-muted">
            Installment {reminder.installmentNumber} · Loan {reminder.loanId}
          </p>
          <p className="mt-1 text-xs text-muted">
            {reminder.contactNumber || "No contact number saved"}
          </p>
        </div>
      </div>
      <div>
        <p className="text-xs text-muted">Due date</p>
        <p className="mt-1 text-sm font-medium">
          {formatDate(reminder.dueDate)}
        </p>
        <p
          className={cn(
            "mt-1 text-xs",
            reminder.reminderStatus === "overdue"
              ? "text-danger"
              : "text-muted",
          )}
        >
          {dayLabel(reminder.dueDate, today)}
        </p>
      </div>
      <div className="lg:text-right">
        <p className="text-xs text-muted">Amount due</p>
        <p className="numeric mt-1 text-lg font-semibold">
          {formatPHP(reminder.amountDueCentavos)}
        </p>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <Button variant="secondary" className="px-3" onClick={copyMessage}>
          <Clipboard size={16} /> Copy
        </Button>
        {phone ? (
          <Button asChild className="px-3">
            <a
              href={`https://wa.me/${phone}?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={16} /> Chat
            </a>
          </Button>
        ) : (
          <Button disabled className="px-3">
            <MessageCircle size={16} /> Chat
          </Button>
        )}
        <Button asChild variant="ghost" className="px-3">
          <Link
            href={`/loans/${reminder.loanId}`}
            aria-label="Open loan details"
          >
            <ExternalLink size={16} />
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function DueReminders() {
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<ReminderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/reminders?days=${days}`);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error);
      setResult(value);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Reminders could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Due reminders"
        description="See payments that need attention and contact borrowers with a prepared message."
        actions={
          <div className="flex gap-2">
            <select
              aria-label="Upcoming reminder window"
              className="h-10 rounded-lg border bg-panel px-3 text-sm"
              value={days}
              onChange={(event) => setDays(Number(event.target.value))}
            >
              <option value={7}>Next 7 days</option>
              <option value={14}>Next 14 days</option>
              <option value={30}>Next 30 days</option>
            </select>
            <Button variant="secondary" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          </div>
        }
      />

      {error && (
        <Panel className="border-red-300 p-4 text-sm text-danger">
          {error}
        </Panel>
      )}

      {loading && !result ? (
        <div className="grid animate-pulse gap-3 sm:grid-cols-3">
          <div className="h-28 rounded-xl bg-slate-200/70 dark:bg-slate-800" />
          <div className="h-28 rounded-xl bg-slate-200/70 dark:bg-slate-800" />
          <div className="h-28 rounded-xl bg-slate-200/70 dark:bg-slate-800" />
        </div>
      ) : result ? (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_.7fr_.7fr]">
            <Panel className="bg-[#0f2744] p-5 text-white dark:bg-slate-100 dark:text-slate-950">
              <p className="text-sm text-slate-300 dark:text-slate-600">
                Total needing attention
              </p>
              <p className="numeric mt-2 text-3xl font-semibold">
                {formatPHP(result.summary.totalDueCentavos)}
              </p>
              <p className="mt-3 text-xs text-slate-300 dark:text-slate-600">
                Overdue plus payments due through {formatDate(result.endDate)}
              </p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-muted">Overdue</p>
              <p className="numeric mt-2 text-2xl font-semibold text-danger">
                {result.summary.overdue}
              </p>
              <p className="mt-2 text-xs text-muted">Require follow-up now</p>
            </Panel>
            <Panel className="p-5">
              <p className="text-sm text-muted">Due soon</p>
              <p className="numeric mt-2 text-2xl font-semibold">
                {result.summary.dueToday + result.summary.upcoming}
              </p>
              <p className="mt-2 text-xs text-muted">
                Today and next {result.days} days
              </p>
            </Panel>
          </section>

          <Panel className="overflow-hidden">
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="font-semibold">Borrowers to contact</h2>
                <p className="mt-1 text-sm text-muted">
                  Overdue items appear first, followed by the nearest due date.
                </p>
              </div>
              <BellRing size={20} className="text-muted" />
            </div>
            {result.data.length === 0 ? (
              <div className="p-10 text-center">
                <CheckCircle2 className="mx-auto text-success" />
                <p className="mt-3 font-medium">No payments need attention</p>
                <p className="mt-1 text-sm text-muted">
                  There are no overdue payments or dues in the next{" "}
                  {result.days} days.
                </p>
              </div>
            ) : (
              <div className="divide-y">
                {result.data.map((reminder) => (
                  <ReminderRow
                    key={reminder.id}
                    reminder={reminder}
                    today={result.today}
                  />
                ))}
              </div>
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}

export function DueReminderPreview() {
  const [result, setResult] = useState<ReminderResponse | null>(null);

  useEffect(() => {
    fetch("/api/reminders?days=7")
      .then(async (response) => {
        const value = await response.json();
        if (!response.ok) throw new Error(value.error);
        return value;
      })
      .then(setResult)
      .catch(() => undefined);
  }, []);

  if (!result) return null;
  const count = result.data.length;
  return (
    <Panel className={cn("overflow-hidden", count > 0 && "border-amber-300")}>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {count > 0 ? (
            <BellRing className="mt-0.5 shrink-0 text-warning" size={20} />
          ) : (
            <CheckCircle2 className="mt-0.5 shrink-0 text-success" size={20} />
          )}
          <div>
            <h2 className="font-semibold">
              {count > 0
                ? `${count} payment${count === 1 ? "" : "s"} need attention`
                : "No upcoming payment reminders"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {count > 0
                ? `${result.summary.overdue} overdue · ${result.summary.dueToday + result.summary.upcoming} due within 7 days`
                : "Nothing is overdue or due within the next 7 days."}
            </p>
          </div>
        </div>
        <Button asChild variant={count > 0 ? "primary" : "secondary"}>
          <Link href="/reminders">
            {count > 0 ? "Review and message" : "View reminders"}
          </Link>
        </Button>
      </div>
    </Panel>
  );
}
