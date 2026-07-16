import { useMemo, useState } from "react";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { TIER_BY_ID, TIERS, type TierId } from "./tiers";
import { changePlan, useCredits } from "./credits-store";

const FAQS: { q: string; a: string }[] = [
  {
    q: "Can I cancel my subscription any time?",
    a: "Yes, you can cancel your subscription any time here. If you're on the monthly plan and cancel, your subscription will end after the current month. If you're on the annual plan and cancel, your subscription will end after the current year.",
  },
  {
    q: "How do I cancel my subscription?",
    a: "You can cancel/manage/upgrade/downgrade your subscription any time here. To avoid future charges, you want to cancel your subscription at least five days before the billing period renewal date.",
  },
  {
    q: "Do my monthly credits roll over?",
    a: "Subscription credits do not carry over to the next month, but we provide plenty of credits so hopefully you will find more than enough to use each month. After your plan expires, you will lose access to the paid credits.\n\ne.g. John has an annual Advanced subscription that started in March 7. He gets 10,000 credits and uses 6,000 of them. On April 1, he would see 4,000 credits left. On April 7, his credits are reset to 10,000 because it's 30 days from the start of his subscription.",
  },
  {
    q: "What's the difference between the monthly and annual plans?",
    a: "The features you get are the same, the only difference is in pricing. The annual plan gives a much better price per month, while the monthly plan offers a higher flexibility.\n\nFor example, for the Basic Plan, if you select \"monthly\" billing, the price is $12/mo and you will be billed $12 for the month. If you select \"annual\" billing, the price is $9.6/mo and you will be billed $115.2 for the year.\n\nIf your usage is more long-term and deterministic, the annual plan fits you better. If you're testing things out, we recommend starting with monthly — you can still switch to the annual plan any time.",
  },
  {
    q: "What are add-ons?",
    a: "Add-ons are monthly extra credits that you can purchase in addition to your subscription plan. They work just like your subscription credits — only more of them! Add-ons are available in increments of 5,000 credits and can be added to your plan at any time.",
  },
  {
    q: "What happens when I upgrade?",
    a: "When you upgrade, you immediately gain access to all corresponding features, including the new amount of credits. You are billed by the pro-rated difference between your new and old plan.",
  },
  {
    q: "What happens when I downgrade/cancel?",
    a: "The change takes effect in the next billing cycle. You lose the paid credits when your current cycle expires. If you are on the Advanced/Infinite plan with add-ons, your add-ons will be cancelled as well.",
  },
  {
    q: "How does unlimited generation work?",
    a: "Unlimited generation is available for Infinite and Wonder plan users, and applies only to select models — the specific models and promotion periods are listed on the pricing page.\n\nTo maintain a smooth and fair experience for everyone, we may temporarily place high-activity accounts in a slower queue, but you can still enjoy unlimited generation. You may turn off Unlimited anytime to get back to a faster queue.\n\nIf unusual or automated activity is detected, your unlimited generation may be paused or temporarily disabled for review.\n\nThis policy is in place to ensure speed, reliability, and fair access for all our users.",
  },
];


type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  requiredCredits?: number;
  reason?: string;
};

type Deal = {
  badge: string;
  headline: string;
  sub: string;
  hue: "red" | "yellow" | "pink";
};

const DEALS: Deal[] = [
  { badge: "70% OFF", headline: "FLASH SALE!", sub: "Ends in 14 min — today only!", hue: "red" },
  { badge: "2-FOR-1", headline: "DOUBLE CREDITS!", sub: "Hurry — only 23 spots left!", hue: "yellow" },
  { badge: "50% OFF", headline: "MEGA DEAL!", sub: "Expires at midnight — act fast!", hue: "red" },
  { badge: "FREE MONTH", headline: "LIMITED TIME!", sub: "Sign up now — won't last!", hue: "pink" },
  { badge: "BLACK FRIDAY", headline: "BIGGEST SALE EVER!", sub: "Doors closing soon — grab it!", hue: "red" },
  { badge: "FLASH 60% OFF", headline: "FINAL HOURS!", sub: "47 creators bought in the last hour!", hue: "yellow" },
  { badge: "VIP PRICE", headline: "INSIDER ACCESS!", sub: "You've been hand-picked — expires today!", hue: "pink" },
  { badge: "BOGO", headline: "BUY 1 GET 1!", sub: "Last call — stock running out!", hue: "red" },
  { badge: "EXTRA 5,000 CREDITS", headline: "BONUS DROP!", sub: "Tonight only — don't miss out!", hue: "yellow" },
];

function SaleBadge({ deal }: { deal: Deal }) {
  const hueClasses: Record<Deal["hue"], { bg: string; ring: string; text: string }> = {
    red:    { bg: "bg-red-600",    ring: "ring-yellow-300", text: "text-white" },
    yellow: { bg: "bg-yellow-400", ring: "ring-red-600",    text: "text-red-900" },
    pink:   { bg: "bg-pink-500",   ring: "ring-yellow-200", text: "text-white" },
  };
  const c = hueClasses[deal.hue];
  return (
    <div className="pointer-events-none absolute -left-4 -top-4 z-20 sm:-left-6 sm:-top-6">
      <div className="relative animate-[wiggle_2.5s_ease-in-out_infinite] [transform:rotate(-14deg)]">
        {/* starburst silhouette */}
        <div className={cn("absolute inset-0 m-auto h-32 w-32 sm:h-36 sm:w-36", c.bg)}
          style={{
            clipPath:
              "polygon(50% 0%, 58% 18%, 75% 9%, 72% 28%, 92% 24%, 80% 42%, 100% 50%, 80% 58%, 92% 76%, 72% 72%, 75% 91%, 58% 82%, 50% 100%, 42% 82%, 25% 91%, 28% 72%, 8% 76%, 20% 58%, 0% 50%, 20% 42%, 8% 24%, 28% 28%, 25% 9%, 42% 18%)",
          }}
        />
        <div className={cn("relative grid h-32 w-32 place-items-center sm:h-36 sm:w-36 ring-4 ring-offset-0", c.bg, c.ring)}
          style={{
            clipPath:
              "polygon(50% 0%, 58% 18%, 75% 9%, 72% 28%, 92% 24%, 80% 42%, 100% 50%, 80% 58%, 92% 76%, 72% 72%, 75% 91%, 58% 82%, 50% 100%, 42% 82%, 25% 91%, 28% 72%, 8% 76%, 20% 58%, 0% 50%, 20% 42%, 8% 24%, 28% 28%, 25% 9%, 42% 18%)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
          }}
        >
          <div className={cn("px-2 text-center font-display leading-none", c.text)}>
            <div className="text-[10px] font-black uppercase tracking-wider opacity-90">{deal.headline}</div>
            <div className="mt-1 text-xl font-black uppercase sm:text-2xl">{deal.badge}</div>
            <div className="mt-1 text-[8px] font-semibold uppercase tracking-tight opacity-95 sm:text-[9px]">
              {deal.sub}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function UpgradeDialog({ open, onOpenChange, requiredCredits, reason }: Props) {
  const { balance, tier, billing: currentBilling } = useCredits();
  const [billing, setBilling] = useState<"yearly" | "monthly">(currentBilling);
  const deal = useMemo(() => DEALS[Math.floor(Math.random() * DEALS.length)], [open]);

  const onPick = (id: TierId) => {
    const result = changePlan(id, billing);
    const name = TIER_BY_ID[id].name;
    if (result.kind === "activated") {
      toast.success(`Activated ${name}`);
    } else if (result.kind === "upgraded") {
      toast.success(`Upgraded to ${name} — credits added now`);
    } else if (result.kind === "scheduled") {
      toast.success(
        `Scheduled change to ${name} on ${new Date(result.effectiveAt).toLocaleDateString()}`,
      );
    } else if (result.kind === "canceled-pending") {
      toast.success(`Staying on ${name} — scheduled change canceled`);
    } else {
      toast(`Already on ${name}`);
    }
    onOpenChange(false);
  };

  const headerTitle =
    typeof requiredCredits === "number"
      ? `Just ${balance.toLocaleString()} credits left — this action needs ${requiredCredits.toLocaleString()}.`
      : "Choose a plan";
  const headerSub =
    reason ?? "Upgrade to get more monthly credits. This is a demo — no charges.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl border-border bg-card p-0 max-h-[90vh] overflow-y-auto">
        <div className="relative p-8">
          


          <div className="text-center">
            <h2 className="font-display text-2xl">{headerTitle}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{headerSub}</p>

            <div className="mt-6 inline-flex items-center rounded-full border border-border bg-background p-1 text-sm">
              {(["monthly", "yearly"] as const).map((b) => (
                <button
                  key={b}
                  onClick={() => setBilling(b)}
                  className={cn(
                    "rounded-full px-4 py-1.5 transition",
                    billing === b
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {b === "yearly" ? "Annually — up to 27% off" : "Monthly"}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((p) => {
              const price = billing === "yearly" ? p.yearly : p.monthly;
              const isCurrent = tier === p.id && billing === currentBilling;
              const currentDef = tier ? TIER_BY_ID[tier] : null;
              const isUpgrade =
                !!currentDef && p.monthlyCredits > currentDef.monthlyCredits;
              const isDowngrade =
                !!currentDef && p.monthlyCredits < currentDef.monthlyCredits;
              const isBillingSwitch =
                !!currentDef && tier === p.id && billing !== currentBilling;
              let cta = `Choose ${p.name}`;
              if (!currentDef) cta = `Choose ${p.name}`;
              else if (isCurrent) cta = "Current plan";
              else if (isUpgrade) cta = `Upgrade to ${p.name}`;
              else if (isDowngrade) cta = `Downgrade to ${p.name}`;
              else if (isBillingSwitch)
                cta = `Switch to ${billing} billing`;
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => onPick(p.id)}
                  className={cn(
                    "group relative flex flex-col rounded-2xl border bg-background p-5 text-left transition-transform duration-200",
                    p.highlight ? "border-foreground shadow-lg" : "border-border",
                    isCurrent
                      ? "cursor-default opacity-90"
                      : "hover:scale-[1.03] hover:shadow-elegant",
                  )}
                >
                  {p.highlight && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-background">
                      Most popular
                    </span>
                  )}
                  <h3 className="font-display text-xl">{p.name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{p.tagline}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="font-display text-3xl">${price}</span>
                    <span className="text-xs text-muted-foreground">
                      {price === 0 ? "free" : billing === "yearly" ? "/mo billed yearly" : "/month"}
                    </span>
                  </div>
                  <p className="mt-3 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                    {p.monthlyCredits.toLocaleString()} credits / month
                  </p>
                  {isDowngrade && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Takes effect at next renewal.
                    </p>
                  )}
                  {isUpgrade && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Effective immediately, prorated credits added.
                    </p>
                  )}
                  <ul className="mt-3 flex-1 space-y-1.5 text-xs">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-foreground" />
                        <span className="text-muted-foreground">{f}</span>
                      </li>
                    ))}
                  </ul>
                  <span
                    className={cn(
                      "mt-5 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition",
                      isCurrent
                        ? "border border-border text-muted-foreground"
                        : p.highlight
                          ? "bg-foreground text-background group-hover:opacity-90"
                          : "border border-border group-hover:bg-secondary",
                    )}
                  >
                    {isCurrent ? (
                      "Current plan"
                    ) : (
                      <>
                        <Sparkles className="h-3.5 w-3.5" />
                        {cta}
                      </>
                    )}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-6 text-center text-[11px] text-muted-foreground">
            Prototype only — selecting a plan does not charge you.
          </p>

          <div className="mt-10 border-t border-hairline pt-6">
            <h3 className="font-display text-lg text-center">FAQs</h3>
            <Accordion type="single" collapsible className="mt-4 mx-auto max-w-3xl">
              {FAQS.map((f, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-sm">{f.q}</AccordionTrigger>
                  <AccordionContent className="whitespace-pre-line text-sm text-muted-foreground">
                    {f.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
