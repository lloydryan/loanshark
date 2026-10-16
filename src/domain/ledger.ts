import type { JournalEntry, JournalLine } from "./types";

export function assertBalanced(lines: JournalLine[]): void {
  if (lines.length < 2) throw new Error("A journal entry requires at least two lines.");
  const debit = lines.reduce((sum, line) => sum + line.debitCentavos, 0);
  const credit = lines.reduce((sum, line) => sum + line.creditCentavos, 0);
  if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit !== credit) {
    throw new Error(`Unbalanced journal entry: debits ${debit}, credits ${credit}.`);
  }
  if (lines.some((line) => line.debitCentavos < 0 || line.creditCentavos < 0 || (line.debitCentavos && line.creditCentavos))) {
    throw new Error("Journal lines require non-negative, one-sided debit or credit amounts.");
  }
}

export function paymentJournal(input: { id: string; occurredAt: string; paymentId: string; loanId: string; borrowerId: string; principalCentavos: number; interestCentavos: number }): JournalEntry {
  const total = input.principalCentavos + input.interestCentavos;
  const lines: JournalLine[] = [
    { account: "cash", debitCentavos: total, creditCentavos: 0, loanId: input.loanId, borrowerId: input.borrowerId },
    ...(input.principalCentavos ? [{ account: "loan_principal_receivable" as const, debitCentavos: 0, creditCentavos: input.principalCentavos, loanId: input.loanId, borrowerId: input.borrowerId }] : []),
    ...(input.interestCentavos ? [{ account: "interest_receivable" as const, debitCentavos: 0, creditCentavos: input.interestCentavos, loanId: input.loanId, borrowerId: input.borrowerId }] : []),
  ];
  assertBalanced(lines);
  return { id: input.id, eventType: "payment", occurredAt: input.occurredAt, referenceType: "payment", referenceId: input.paymentId, description: `Payment ${input.paymentId}`, lines };
}

export function reverseJournal(original: JournalEntry, id: string, occurredAt: string): JournalEntry {
  if (original.eventType === "reversal") throw new Error("A reversal cannot itself be reversed by this operation.");
  const lines = original.lines.map((line) => ({ ...line, debitCentavos: line.creditCentavos, creditCentavos: line.debitCentavos }));
  assertBalanced(lines);
  return { id, eventType: "reversal", occurredAt, referenceType: "journal_entry", referenceId: original.id, reversalOf: original.id, description: `Reversal of ${original.id}`, lines };
}
