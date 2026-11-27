"use client";
import { useEffect, useState, useRef } from "react";
import Link from "next/link";
export default function Page() {
  const [state, setState] = useState("Checking your invitation…"),
    [ready, setReady] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(location.hash.slice(1)).get("token");
    history.replaceState(null, "", location.pathname);
    if (!token) {
      setState("Open the complete invitation link shared with you.");
      return;
    }
    void fetch("/api/registration/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setState("Your invitation is ready. Sign in to create your Japanese learning account.");
        setReady(true);
      })
      .catch((error) => setState(error.message));
  }, []);
  return (
    <main className="mx-auto max-w-lg space-y-5 p-6 pt-16">
      <h1 className="text-3xl font-bold">You’re invited</h1>
      <p role="status">{state}</p>
      {ready && (
        <Link className="inline-flex rounded-lg border border-blue-500/50 px-4 py-3" href="/signin">
          Continue to sign in
        </Link>
      )}
    </main>
  );
}
