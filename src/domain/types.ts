export type Centavos = number;
export type LoanTerm = 3 | 6 | 9 | 12;
export type LoanStatus = "draft" | "active" | "overdue" | "fully_paid" | "cancelled" | "written_off";
export type InstallmentStatus = "upcoming" | "due_today" | "partial" | "paid" | "overdue";
export type InterestMethod = "equal_amortization" | "lump_sum";
export type PaymentMethod = "cash" | "gcash" | "maya" | "bank_transfer" | "other";

export interface ContractInstallment {
  installmentNumber: number;
  dueDate: string;
  openingPrincipalCentavos: Centavos;
  scheduledPaymentCentavos: Centavos;
  interestCentavos: Centavos;
  principalCentavos: Centavos;
  closingPrincipalCentavos: Centavos;
}

export interface InstallmentBalance extends ContractInstallment {
  interestPaidCentavos: Centavos;
  principalPaidCentavos: Centavos;
  outstandingInterestCentavos: Centavos;
  outstandingPrincipalCentavos: Centavos;
  status: InstallmentStatus;
}

export interface PaymentAllocation {
  installmentNumber: number;
  interestCentavos: Centavos;
  principalCentavos: Centavos;
}

export interface JournalLine {
  account: "cash" | "loan_principal_receivable" | "interest_receivable" | "interest_income" | "capital" | "adjustment";
  debitCentavos: Centavos;
  creditCentavos: Centavos;
  borrowerId?: string;
  loanId?: string;
}

export interface JournalEntry {
  id: string;
  eventType: "opening_balance" | "capital_addition" | "capital_withdrawal" | "loan_disbursement" | "interest_accrual" | "payment" | "reversal" | "adjustment";
  occurredAt: string;
  referenceType: string;
  referenceId: string;
  description: string;
  lines: JournalLine[];
  reversalOf?: string;
}
