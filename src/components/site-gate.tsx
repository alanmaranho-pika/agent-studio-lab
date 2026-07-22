// Site-wide password gate. Wraps ALL user-facing routes (see __root.tsx) and
// blocks content behind a password form until unlocked.
//
// Security model — this is a soft "don't share the URL publicly" barrier, not
// a hard boundary (real data access stays gated by requireSupabaseAuth on the
// server functions). The password is checked SERVER-SIDE (verifySitePassword)
// so it never ships in the client bundle. The accepted password is stored in
// localStorage and re-verified on every load, so rotating SITE_GATE_PASSWORD
// locks everyone back out.

import { useEffect, useState } from "react";
import { verifySitePassword } from "@/lib/gate.functions";
import { PikaWordmark } from "@/components/pika-wordmark";

const STORAGE_KEY = "pika-site-gate";
const TELKA = '"Telka", system-ui, sans-serif';

type Status = "checking" | "locked" | "open";

export function SiteGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // On mount, re-verify any stored password (and detect "no gate configured").
  useEffect(() => {
    let cancelled = false;
    const stored =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) ?? "" : "";
    void verifySitePassword({ data: { password: stored } })
      .then((res) => {
        if (cancelled) return;
        if (!res.configured || res.ok) {
          setStatus("open");
        } else {
          // Stored password no longer valid (unset/rotated) — clear + lock.
          if (stored) window.localStorage.removeItem(STORAGE_KEY);
          setStatus("locked");
        }
      })
      .catch(() => {
        // If the check itself errors, fail closed to the form.
        if (!cancelled) setStatus("locked");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(false);
    try {
      const res = await verifySitePassword({ data: { password: value } });
      if (!res.configured || res.ok) {
        window.localStorage.setItem(STORAGE_KEY, value);
        setStatus("open");
      } else {
        setError(true);
        setValue("");
      }
    } catch {
      setError(true);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "open") return <>{children}</>;

  // "checking" and "locked" both render the gate surface (no flash of content
  // before the check resolves). While checking, the form is hidden.
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center"
      style={{ fontFamily: TELKA }}
    >
      {status === "locked" && (
        <div className="flex w-full max-w-[360px] flex-col items-center gap-8">
          <PikaWordmark className="h-7 w-auto text-foreground" />
          <div className="flex flex-col items-center gap-2">
            <h1
              className="font-display text-[22px] font-medium leading-none tracking-normal"
              style={{ color: "var(--content-dark-primary)" }}
            >
              Enter password
            </h1>
            <p className="text-[15px] leading-[18px]" style={{ color: "var(--content-dark-tertiary)" }}>
              This preview is password-protected.
            </p>
          </div>
          <form onSubmit={submit} className="flex w-full flex-col gap-3">
            <input
              type="password"
              autoFocus
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(false);
              }}
              placeholder="Password"
              aria-label="Password"
              aria-invalid={error}
              className="h-12 w-full rounded-[var(--radius-lg,18px)] border bg-[var(--surface-light-1)] px-4 text-[15px] outline-none transition focus:border-[color:var(--content-accent-darkened)]"
              style={{
                borderColor: error ? "#e5484d" : "var(--surface-dark-5)",
                color: "var(--content-dark-primary)",
              }}
            />
            {error && (
              <p className="text-[13px]" style={{ color: "#e5484d" }}>
                Incorrect password. Try again.
              </p>
            )}
            <button
              type="submit"
              disabled={submitting || !value}
              className="flex h-12 items-center justify-center rounded-[var(--radius-lg,18px)] text-[15px] font-medium text-white transition hover:opacity-90 disabled:opacity-40"
              style={{ background: "var(--surface-dark-1)" }}
            >
              {submitting ? "Checking…" : "Continue"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
