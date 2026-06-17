"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    setLoading(false);

    if (!res.ok) {
      setError("Incorrect password. Try again.");
      return;
    }

    const from = searchParams.get("from") || "/";
    router.replace(from);
    router.refresh();
  }

  return (
    <main className="loginScreen">
      <form className="loginCard" onSubmit={onSubmit}>
        <h1>ALX TV</h1>
        <p className="loginSub">
          Enter the view password to open this board in a browser. TelemetryTV
          uses a separate kiosk URL and does not need this each time.
        </p>
        <label className="loginLabel" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="loginInput"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? <p className="loginError">{error}</p> : null}
        <button className="loginButton" type="submit" disabled={loading}>
          {loading ? "Checking…" : "View board"}
        </button>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
