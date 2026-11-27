"use client";
import { getProviders, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
export default function SignIn() {
  const [providers, setProviders] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const params = useSearchParams();
  useEffect(() => {
    void getProviders().then((value) => setProviders(Object.keys(value ?? {})));
  }, []);
  return (
    <main className="mx-auto max-w-md space-y-6 p-6 pt-16">
      <h1 className="text-3xl font-bold">Welcome to Dashboard</h1>
      <p>Sign in to your account. New accounts need an invitation.</p>
      {params.get("error") && (
        <p role="alert" className="rounded-lg border border-rose-500/40 p-3 text-rose-300">
          Sign-in was not completed. Use your existing sign-in method, or open a valid invitation.
          To link another method, sign in first and use My account.
        </p>
      )}
      {providers.map((provider) => (
        <button
          key={provider}
          disabled={busy}
          className="w-full rounded-xl border border-blue-500/40 bg-card-bg p-4 font-semibold hover:bg-blue-500/10 disabled:opacity-50"
          onClick={() => {
            setBusy(true);
            void signIn(provider, { callbackUrl: params.get("callbackUrl") || "/" });
          }}
        >
          Continue with {provider === "github" ? "GitHub" : "Google"}
        </button>
      ))}
      {!providers.length && <p role="status">Loading sign-in methods…</p>}
      <Link className="text-sm text-blue-300" href="/privacy">
        Account privacy
      </Link>
    </main>
  );
}
