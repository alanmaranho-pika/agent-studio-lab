// Demo-only tier definitions. No real billing — these mirror the public
// pricing page so engineers can later wire to real plans + a profile column.

export type TierId = "basic" | "standard" | "pro" | "fancy";

export type TierDef = {
  id: TierId;
  name: string;
  tagline: string;
  yearly: number; // USD / mo billed yearly
  monthly: number; // USD / month
  monthlyCredits: number;
  features: string[];
  highlight?: boolean;
};

export const TIERS: TierDef[] = [
  {
    id: "basic",
    name: "Basic",
    tagline: "A perfect taste for the creatively curious",
    yearly: 0,
    monthly: 0,
    monthlyCredits: 800,
    features: [
      "Access to Pika 2.5 (480p)",
      "Pikascenes, Pikadditions, Pikaswaps",
      "Download with no watermark",
    ],
  },
  {
    id: "standard",
    name: "Standard",
    tagline: "More videos meets more editing features",
    yearly: 8,
    monthly: 10,
    monthlyCredits: 7000,
    features: [
      "All resolutions",
      "All Pikaffects",
      "Fast generations",
      "Commercial use",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "More speed, more videos, more fun",
    yearly: 28,
    monthly: 35,
    monthlyCredits: 23000,
    features: [
      "All resolutions",
      "All Pikaffects",
      "Faster generations",
      "Priority queue",
    ],
    highlight: true,
  },
  {
    id: "fancy",
    name: "Fancy Plan",
    tagline: "The crème de la creativity",
    yearly: 76,
    monthly: 95,
    monthlyCredits: 60000,
    features: [
      "All resolutions",
      "All Pikaffects",
      "Fastest generations",
      "Priority support",
    ],
  },
];

export const TIER_BY_ID: Record<TierId, TierDef> = Object.fromEntries(
  TIERS.map((t) => [t.id, t]),
) as Record<TierId, TierDef>;
