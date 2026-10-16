import { z } from "zod";

export const borrowerSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  contactNumber: z.string().trim().max(30).default(""),
  address: z.string().trim().max(300).default(""),
  email: z.email().optional().or(z.literal("")),
  notes: z.string().trim().max(2000).default(""),
  status: z.enum(["active", "archived"]).default("active"),
});

export const loanSchema = z.object({
  borrowerId: z.string().min(1),
  principalCentavos: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  monthlyRatePercent: z.string().regex(/^\d+(\.\d{1,6})?$/).refine((v) => Number(v) <= 100, "Rate cannot exceed 100% monthly."),
  termMonths: z.union([z.literal(3), z.literal(6), z.literal(9), z.literal(12)]),
  releaseDate: z.iso.date(),
  firstPaymentDate: z.iso.date(),
  method: z.enum(["equal_amortization", "lump_sum"]).default("equal_amortization"),
  notes: z.string().max(2000).default(""),
  idempotencyKey: z.string().uuid(),
});

export const paymentSchema = z.object({
  loanId: z.string().min(1),
  amountCentavos: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  paymentDate: z.iso.date(),
  method: z.enum(["cash", "gcash", "maya", "bank_transfer", "other"]),
  referenceNumber: z.string().trim().max(100).default(""),
  notes: z.string().trim().max(1000).default(""),
  idempotencyKey: z.string().uuid(),
});
