"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Field, inputClass } from "./ui/field";

export type BorrowerFormValues = {
  id: string;
  fullName: string;
  contactNumber: string;
  email?: string;
  address: string;
  notes?: string;
  status: "active" | "archived";
};

type BorrowerFormDialogProps = {
  borrower?: BorrowerFormValues;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

export function BorrowerFormDialog({
  borrower,
  onClose,
  onSaved,
}: BorrowerFormDialogProps) {
  const [saving, setSaving] = useState(false);
  const isEditing = Boolean(borrower);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    try {
      const body = Object.fromEntries(new FormData(event.currentTarget));
      const response = await fetch(
        isEditing ? `/api/borrowers/${borrower!.id}` : "/api/borrowers",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error ?? "Borrower details could not be saved.");
        return;
      }

      toast.success(isEditing ? "Borrower updated." : "Borrower registered.");
      onClose();
      await onSaved();
    } catch {
      toast.error("Borrower details could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="borrower-form-title"
    >
      <form
        onSubmit={submit}
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-panel p-6 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="borrower-form-title" className="text-xl font-semibold">
              {isEditing ? "Edit borrower" : "Register borrower"}
            </h2>
            <p className="mt-1 text-sm text-muted">
              {isEditing
                ? "Correct the borrower’s profile details. Existing loans and payments stay linked."
                : "Borrowers do not receive login access."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 place-items-center rounded-lg text-muted hover:bg-slate-100 hover:text-foreground dark:hover:bg-slate-800"
            aria-label="Close borrower form"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <input
              name="fullName"
              className={inputClass}
              defaultValue={borrower?.fullName}
              autoComplete="name"
              required
              minLength={2}
              maxLength={120}
              autoFocus
            />
          </Field>
          <Field label="Contact number">
            <input
              name="contactNumber"
              className={inputClass}
              defaultValue={borrower?.contactNumber}
              autoComplete="tel"
              maxLength={30}
            />
          </Field>
          <Field label="Email">
            <input
              name="email"
              type="email"
              className={inputClass}
              defaultValue={borrower?.email}
              autoComplete="email"
            />
          </Field>
          <Field label="Address">
            <input
              name="address"
              className={inputClass}
              defaultValue={borrower?.address}
              autoComplete="street-address"
              maxLength={300}
            />
          </Field>
          {isEditing && (
            <Field
              label="Status"
              hint="Archived borrowers cannot be selected for a new loan."
            >
              <select
                name="status"
                className={inputClass}
                defaultValue={borrower?.status ?? "active"}
              >
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
          )}
          <div className="sm:col-span-2">
            <Field label="Notes">
              <textarea
                name="notes"
                className={`${inputClass} h-24 py-2`}
                defaultValue={borrower?.notes}
                maxLength={2000}
              />
            </Field>
          </div>
          {!isEditing && <input type="hidden" name="status" value="active" />}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving}>
            {saving
              ? "Saving…"
              : isEditing
                ? "Save changes"
                : "Register borrower"}
          </Button>
        </div>
      </form>
    </div>
  );
}
