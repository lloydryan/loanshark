"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { toast } from "sonner";
import {
  BorrowerFormDialog,
  type BorrowerFormValues,
} from "./borrower-form-dialog";
import { Button } from "./ui/button";
import { PageHeader, Panel } from "./ui/panel";

type Borrower = BorrowerFormValues;

export function Borrowers() {
  const [rows, setRows] = useState<Borrower[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Borrower | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/borrowers");
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error ?? "Borrowers could not be loaded.");
        return;
      }
      setRows(result.data);
    } catch {
      toast.error("Borrowers could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("en-PH");
    if (!search) return rows;
    return rows.filter((borrower) =>
      `${borrower.fullName} ${borrower.contactNumber} ${borrower.email ?? ""}`
        .toLocaleLowerCase("en-PH")
        .includes(search),
    );
  }, [rows, query]);

  return (
    <div className="space-y-7">
      <PageHeader
        title="Borrowers"
        description="People, borrowing history, and portfolio exposure."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus size={17} />
            Add borrower
          </Button>
        }
      />

      <Panel>
        <div className="flex items-center gap-2 border-b p-4">
          <Search size={18} className="text-muted" />
          <input
            className="w-full bg-transparent text-sm outline-none"
            placeholder="Search by name, contact number, or email"
            aria-label="Search borrowers"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {loading ? (
          <div className="p-8 text-sm text-muted">Loading borrowers…</div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center px-6 py-16 text-center">
            <Users className="mb-4 text-muted" />
            <p className="font-medium">No borrowers found</p>
            <p className="mt-1 text-sm text-muted">
              {query
                ? "Try a different name, contact number, or email."
                : "Register a borrower before creating a loan."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-muted dark:bg-slate-900/40">
                <tr>
                  <th className="px-5 py-3">Borrower</th>
                  <th className="px-5 py-3">Contact</th>
                  <th className="px-5 py-3">Address</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((borrower) => (
                  <tr
                    key={borrower.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-4">
                      <a
                        href={`/borrowers/${borrower.id}`}
                        className="font-semibold hover:underline"
                      >
                        {borrower.fullName}
                      </a>
                      <div className="mt-1 font-mono text-xs text-muted">
                        {borrower.id}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {borrower.contactNumber || "—"}
                      <div className="text-xs text-muted">
                        {borrower.email || "No email"}
                      </div>
                    </td>
                    <td className="max-w-xs truncate px-5 py-4 text-muted">
                      {borrower.address || "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs capitalize">
                        <span
                          className={`size-1.5 rounded-full ${
                            borrower.status === "active"
                              ? "bg-emerald-500"
                              : "bg-slate-400"
                          }`}
                        />
                        {borrower.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-9 px-3"
                        onClick={() => setEditing(borrower)}
                        aria-label={`Edit ${borrower.fullName}`}
                      >
                        <Pencil size={15} />
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {creating && (
        <BorrowerFormDialog
          onClose={() => setCreating(false)}
          onSaved={load}
        />
      )}
      {editing && (
        <BorrowerFormDialog
          borrower={editing}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      )}
    </div>
  );
}
