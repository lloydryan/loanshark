# Pautang Ledger

A single-administrator money-lending system built with Next.js, TypeScript, Firebase Authentication, and Cloud Firestore. Monetary values are persisted as integer centavos; contractual calculations use Decimal.js.

## Implemented architecture

- Client-side Firebase email/password sign-in, password reset, Firestore-backed administrator authorization, and protected routes.
- Borrower registration/edit API with archival status and audit logs.
- Equal-amortization and lump-sum contract calculators for 3/6/9/12-month terms.
- Atomic loan release: immutable contract installments, cash update, balanced journal, audit event, and idempotency record.
- Atomic payment posting with due-interest-first allocation, receipt numbers, installment allocation records, cash update, balanced journal, audit event, and retry-safe idempotency.
- Retry-safe due-date/interest accrual processing in Asia/Manila when the administrator opens the app.
- Dashboard, borrower/loan details, payments, cash ledger, transactions, reports, settings, audit logs, and reconciliation.
- CSV exports and browser print/PDF output.
- Firestore rules allow the active administrator to use the browser SDK while denying all unauthenticated access and document deletion.

## Financial model

All stored amounts end in `Centavos` and must be safe integers. Decimal.js uses 40-digit precision and `ROUND_HALF_UP`. For equal amortization, interest is calculated on each period's opening principal. The last installment absorbs residual principal rounding, so principal portions always equal original principal and ending principal is exactly zero.

The original installment schedule is immutable. Actual payment allocations live in `paymentAllocations`; mutable loan/installment balance fields are caches that are reconciled against the immutable ledger and allocations. Scheduled future interest, accrued unpaid interest, and collected interest are kept separate.

Every financial event produces a balanced `journalEntries` header and two or more `journalLines`. The cash account cached balance is updated in the same Firestore transaction and is not the sole source of truth.

## Firestore collections

`admins`, `borrowers`, `loans`, `loanInstallments`, `payments`, `paymentAllocations`, `financialAccounts`, `journalEntries`, `journalLines`, `idempotencyKeys`, `interestAccruals`, `reconciliations`, `settings`, and `auditLogs`.

## Local setup

1. Use Node.js 22. Copy `.env.example` to `.env.local` and supply the Firebase web-app values.
2. Enable Email/Password under Firebase Authentication and create the administrator user. The password stays in Firebase Authentication and must never be added to an environment file.
3. In Firestore create `admins/{AUTH_USER_UID}` with the boolean field `{ "active": true }`. The document ID must exactly match the user's Firebase Authentication UID.
4. Copy `.firebaserc.example` to `.firebaserc` and set the project ID.
5. Run `npm run dev`.
6. Sign in and set the one-time opening cash balance under Settings before releasing a loan.

For emulator use, set `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080` and `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` for the Next.js process. Use a dedicated non-production Firebase project ID.

## Validation commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The authenticated financial E2E workflow requires emulator seeding with an administrator user and is intentionally not run against production. Unit tests cover all required rates and terms, final rounding, zero interest, compound growth, interest-first allocation, and overpayment rejection.

## Deployment

### Firebase

Deploy the client authorization rules and indexes with `firebase deploy --only firestore`.

### Vercel

Import the repository, use Node.js 22, and configure the public Firebase web-app values from `.env.example`. Deploy only after `npm run verify` passes against the intended commit.

## Backup and recovery

- Enable scheduled Firestore managed exports to a versioned, retention-protected Cloud Storage bucket.
- Restrict export/import and service-account IAM roles to operators who perform recovery.
- Test restore into a separate Firebase project quarterly.
- Never repair posted records by deleting or editing journal documents. Post documented compensating entries, then rerun reconciliation.
- Rotate leaked Admin keys immediately and invalidate administrator sessions after account compromise.

## Security notes

App Check should be enabled for the Firebase web app before production traffic. In this client-side architecture, Firestore Security Rules are the authorization boundary; App Check complements rather than replaces Firebase Authentication, the active-admin document, idempotency, and transactions. Configure error reporting/alerts in the hosting and Firebase projects; do not log tokens or full sensitive borrower payloads.

## Configuration-dependent checks

Authentication, Firestore emulator integration, production rules evaluation, and the fully authenticated Playwright loan lifecycle must be run after the target Firebase project and administrator account are provisioned. Do not claim a production launch until those environment-specific checks pass.
