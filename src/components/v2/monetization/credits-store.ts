// Demo-only credits store. Persists per-user to localStorage so engineers
// can later swap to a `profiles.tier` + `credits_ledger` schema without
// touching any callsites.
//
// Behavior mirrors real subscription billing:
//   • Upgrade: takes effect immediately, balance is topped up by the
//     difference in monthly allotment (prorated), renewal date unchanged.
//   • Downgrade: scheduled for the next renewal date. Current plan and
//     credits stay until then.
//   • Switching billing cycle (monthly ↔ yearly) on the same tier: applied
//     at next renewal, no immediate credit change.
//   • At/after renewal: pending plan change (if any) is applied and balance
//     is reset to the (new) plan's monthly allotment.
import { useSyncExternalStore } from "react";
import { getBrowserSupabase } from "@/lib/supabase-browser";
import { TIER_BY_ID, type TierId } from "./tiers";

export type BillingCycle = "monthly" | "yearly";

export type Transaction = {
  id: string;
  ts: number;
  label: string;
  delta: number; // negative = spend, positive = grant, 0 = informational
  balanceAfter: number;
  kind: "grant" | "spend" | "upgrade" | "downgrade" | "renewal" | "scheduled";
};

export type CreditsState = {
  tier: TierId | null;
  billing: BillingCycle;
  balance: number;
  renewsAt: number | null;          // unix ms when the current period ends
  pendingTier: TierId | null;       // scheduled downgrade / same-tier billing change
  pendingBilling: BillingCycle | null;
  transactions: Transaction[];
  ready: boolean;                   // true once we've loaded for the current user
};

const EMPTY: CreditsState = {
  tier: null,
  billing: "monthly",
  balance: 0,
  renewsAt: null,
  pendingTier: null,
  pendingBilling: null,
  transactions: [],
  ready: false,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function periodLength(billing: BillingCycle) {
  // Demo: monthly = 30d, yearly billing still renews credits monthly.
  // (Real Stripe: yearly subs renew credits monthly within the year.)
  return 30 * MS_PER_DAY;
  // billing arg kept for future use
  void billing;
}

let currentUserId: string | null = null;
let state: CreditsState = EMPTY;
const listeners = new Set<() => void>();

function storageKey(uid: string) {
  return `pika:credits:${uid}`;
}

function load(uid: string): CreditsState {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(storageKey(uid));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      return {
        tier: parsed.tier ?? null,
        billing: parsed.billing === "yearly" ? "yearly" : "monthly",
        balance: Number(parsed.balance) || 0,
        renewsAt:
          typeof parsed.renewsAt === "number" ? parsed.renewsAt : null,
        pendingTier: parsed.pendingTier ?? null,
        pendingBilling:
          parsed.pendingBilling === "yearly" || parsed.pendingBilling === "monthly"
            ? parsed.pendingBilling
            : null,
        transactions: Array.isArray(parsed.transactions)
          ? parsed.transactions
          : [],
        ready: true,
      };
    }
  } catch {
    /* ignore */
  }
  return EMPTY;
}

function persist() {
  if (typeof window === "undefined" || !currentUserId) return;
  try {
    window.localStorage.setItem(
      storageKey(currentUserId),
      JSON.stringify(state),
    );
  } catch {
    /* ignore */
  }
}

function emit() {
  for (const l of listeners) l();
}

function setState(next: CreditsState) {
  state = next;
  persist();
  emit();
}

function makeTxn(
  kind: Transaction["kind"],
  label: string,
  delta: number,
  balanceAfter: number,
): Transaction {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return { id, ts: Date.now(), label, delta, balanceAfter, kind };
}

function pushTxn(s: CreditsState, t: Transaction): CreditsState {
  return { ...s, transactions: [t, ...s.transactions].slice(0, 100) };
}

// Apply any past-due renewals: rolls forward renewsAt and resets balance to
// the active plan's allotment (after applying a pending plan change).
function applyRenewalsIfDue(s: CreditsState, now: number): CreditsState {
  if (!s.tier || !s.renewsAt) return s;
  let next = s;
  while (next.renewsAt && now >= next.renewsAt) {
    const appliedTier = next.pendingTier ?? next.tier!;
    const appliedBilling = next.pendingBilling ?? next.billing;
    const def = TIER_BY_ID[appliedTier];
    const newBalance = def.monthlyCredits;
    const label =
      next.pendingTier && next.pendingTier !== next.tier
        ? `Renewed — switched to ${def.name} (${newBalance.toLocaleString()} credits)`
        : `Renewed ${def.name} — ${newBalance.toLocaleString()} credits`;
    const txn = makeTxn("renewal", label, newBalance - next.balance, newBalance);
    next = pushTxn(
      {
        ...next,
        tier: appliedTier,
        billing: appliedBilling,
        balance: newBalance,
        renewsAt: next.renewsAt + periodLength(appliedBilling),
        pendingTier: null,
        pendingBilling: null,
      },
      txn,
    );
  }
  return next;
}

// ---- Public API ----

export function initCreditsForUser(userId: string | null) {
  if (userId === currentUserId && state.ready) return;
  currentUserId = userId;
  const loaded = userId ? load(userId) : EMPTY;
  const rolled = applyRenewalsIfDue(loaded, Date.now());
  state = userId ? { ...rolled, ready: true } : { ...EMPTY, ready: true };
  if (userId && rolled !== loaded) persist();
  emit();
}

/**
 * Change subscription plan with realistic billing semantics.
 * - First-time activation: balance = newTier credits, period starts now.
 * - Upgrade (more credits): immediate, balance topped up by the difference.
 * - Downgrade (fewer credits): scheduled for renewal date.
 * - Same tier, different billing: scheduled for renewal date.
 * - Same tier, same billing: no-op.
 */
export function changePlan(tier: TierId, billing: BillingCycle = state.billing) {
  const now = Date.now();
  const base = applyRenewalsIfDue(state, now);
  const newDef = TIER_BY_ID[tier];

  // First-time activation
  if (!base.tier) {
    const balance = newDef.monthlyCredits;
    const txn = makeTxn(
      "upgrade",
      `Activated ${newDef.name} — ${balance.toLocaleString()} credits`,
      balance,
      balance,
    );
    setState(
      pushTxn(
        {
          ...base,
          tier,
          billing,
          balance,
          renewsAt: now + periodLength(billing),
          pendingTier: null,
          pendingBilling: null,
        },
        txn,
      ),
    );
    return { kind: "activated" as const, effectiveAt: now };
  }

  const currentDef = TIER_BY_ID[base.tier];
  const sameTier = tier === base.tier;
  const sameBilling = billing === base.billing;

  // No-op
  if (sameTier && sameBilling && !base.pendingTier && !base.pendingBilling) {
    return { kind: "noop" as const, effectiveAt: now };
  }

  // Cancel a pending change by re-selecting current plan
  if (sameTier && sameBilling && (base.pendingTier || base.pendingBilling)) {
    const txn = makeTxn(
      "scheduled",
      `Canceled scheduled plan change — staying on ${currentDef.name}`,
      0,
      base.balance,
    );
    setState(
      pushTxn(
        { ...base, pendingTier: null, pendingBilling: null },
        txn,
      ),
    );
    return { kind: "canceled-pending" as const, effectiveAt: now };
  }

  // Upgrade — immediate, prorated top-up
  if (newDef.monthlyCredits > currentDef.monthlyCredits) {
    const topUp = newDef.monthlyCredits - currentDef.monthlyCredits;
    const balance = base.balance + topUp;
    const txn = makeTxn(
      "upgrade",
      `Upgraded to ${newDef.name} — +${topUp.toLocaleString()} prorated credits`,
      topUp,
      balance,
    );
    setState(
      pushTxn(
        {
          ...base,
          tier,
          billing, // billing change on upgrade applies now too
          balance,
          // renewsAt unchanged — same period
          pendingTier: null,
          pendingBilling: null,
        },
        txn,
      ),
    );
    return { kind: "upgraded" as const, effectiveAt: now };
  }

  // Downgrade or billing-only change — scheduled for renewal
  const renewsAt = base.renewsAt ?? now + periodLength(base.billing);
  const targetIsDifferent = !sameTier;
  const label = targetIsDifferent
    ? `Scheduled downgrade to ${newDef.name} on ${new Date(renewsAt).toLocaleDateString()}`
    : `Scheduled billing change to ${billing} on ${new Date(renewsAt).toLocaleDateString()}`;
  const txn = makeTxn("scheduled", label, 0, base.balance);
  setState(
    pushTxn(
      {
        ...base,
        renewsAt,
        pendingTier: targetIsDifferent ? tier : null,
        pendingBilling: sameBilling ? null : billing,
      },
      txn,
    ),
  );
  return { kind: "scheduled" as const, effectiveAt: renewsAt };
}

/** @deprecated use `changePlan`. Kept for any stale callers. */
export function setTier(tier: TierId) {
  changePlan(tier);
}

export function spend(amount: number, label: string): { ok: boolean; missing: number } {
  if (amount <= 0) return { ok: true, missing: 0 };
  const base = applyRenewalsIfDue(state, Date.now());
  if (base.balance < amount) {
    if (base !== state) setState(base);
    return { ok: false, missing: amount - base.balance };
  }
  const balance = base.balance - amount;
  const txn = makeTxn("spend", label, -amount, balance);
  setState(pushTxn({ ...base, balance }, txn));
  return { ok: true, missing: 0 };
}

export function grant(amount: number, label: string) {
  if (amount <= 0) return;
  const base = applyRenewalsIfDue(state, Date.now());
  const balance = base.balance + amount;
  const txn = makeTxn("grant", label, amount, balance);
  setState(pushTxn({ ...base, balance }, txn));
}

export function getCredits(): CreditsState {
  return state;
}

// React hook
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function getSnapshot() {
  return state;
}
function getServerSnapshot() {
  return EMPTY;
}

export function useCredits(): CreditsState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

// Wire to the browser auth session so the store rebinds per user.
if (typeof window !== "undefined") {
  const client = getBrowserSupabase();
  if (client) {
    void client.auth.getUser().then(({ data }) => {
      initCreditsForUser(data?.user?.id ?? null);
    }).catch(() => initCreditsForUser(null));
    client.auth.onAuthStateChange((_evt, session) => {
      initCreditsForUser(session?.user?.id ?? null);
    });
  } else {
    initCreditsForUser(null);
  }

  // Lightweight ticker: re-check renewals every minute while the tab is open.
  setInterval(() => {
    const next = applyRenewalsIfDue(state, Date.now());
    if (next !== state) setState(next);
  }, 60 * 1000);
}
