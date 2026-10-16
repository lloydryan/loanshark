import { LoginForm } from "@/components/login-form";
import { BrandMark } from "@/components/brand-mark";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_.9fr]">
      <section className="hidden bg-[#0c2139] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3 text-lg font-semibold">
          <BrandMark className="size-10" />
          Pautang Ledger
        </div>
        <div className="max-w-xl">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[.18em] text-emerald-300">
            Financial clarity, by design
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Every peso traceable.
            <br />
            Every balance reconciled.
          </h1>
          <p className="mt-6 text-lg leading-8 text-slate-300">
            A private lending workspace built around immutable journals,
            deterministic payments, and clear portfolio visibility.
          </p>
        </div>
        <p className="text-sm text-slate-400">
          Single-administrator access · PHP · Asia/Manila
        </p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-12">
        <LoginForm />
      </section>
    </main>
  );
}
