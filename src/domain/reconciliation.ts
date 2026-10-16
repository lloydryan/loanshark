import { assertBalanced } from "./ledger";
import type { JournalEntry } from "./types";

export interface ReconciliationIssue { code: string; reference: string; message: string }

export function reconcileJournals(entries: JournalEntry[]): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const reversed = new Set<string>();
  for (const entry of entries) {
    try { assertBalanced(entry.lines); } catch (error) {
      issues.push({ code: "UNBALANCED_JOURNAL", reference: entry.id, message: error instanceof Error ? error.message : "Invalid journal" });
    }
    if (entry.reversalOf) {
      if (reversed.has(entry.reversalOf)) issues.push({ code: "DUPLICATE_REVERSAL", reference: entry.id, message: `${entry.reversalOf} was reversed more than once.` });
      reversed.add(entry.reversalOf);
    }
  }
  return issues;
}
