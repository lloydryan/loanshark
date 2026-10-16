"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Button } from "./button";

type Detail = { label: string; value: React.ReactNode };

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  details = [],
  confirmLabel,
  busyLabel,
  busy = false,
  tone = "default",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  details?: Detail[];
  confirmLabel: string;
  busyLabel: string;
  busy?: boolean;
  tone?: "default" | "danger";
  onConfirm: () => unknown | Promise<unknown>;
}) {
  const Icon = tone === "danger" ? AlertTriangle : ShieldCheck;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => !busy && onOpenChange(next)}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/55" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border bg-panel p-6 shadow-2xl focus:outline-none"
          onPointerDownOutside={(event) => busy && event.preventDefault()}
          onEscapeKeyDown={(event) => busy && event.preventDefault()}
        >
          <div className="flex items-start gap-4">
            <div
              className={`grid size-10 shrink-0 place-items-center rounded-lg ${tone === "danger" ? "bg-red-50 text-danger dark:bg-red-950/40" : "bg-emerald-50 text-success dark:bg-emerald-950/40"}`}
            >
              <Icon size={20} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-lg font-semibold tracking-tight">
                {title}
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm leading-6 text-muted">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-foreground disabled:opacity-50 dark:hover:bg-slate-800"
                aria-label="Close confirmation"
                disabled={busy}
              >
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {details.length > 0 && (
            <dl className="mt-5 divide-y rounded-lg border bg-slate-50 px-4 dark:bg-slate-900/40">
              {details.map((detail) => (
                <div
                  className="flex items-start justify-between gap-6 py-3 text-sm"
                  key={detail.label}
                >
                  <dt className="text-muted">{detail.label}</dt>
                  <dd className="numeric break-words text-right font-medium capitalize">
                    {detail.value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-4 text-xs leading-5 text-muted">
            This action creates permanent accounting records and cannot be
            edited afterward.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Dialog.Close asChild>
              <Button variant="secondary" disabled={busy}>
                Cancel
              </Button>
            </Dialog.Close>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? busyLabel : confirmLabel}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
