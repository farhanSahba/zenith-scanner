import type { SessionPhase } from "./types";
import {
  phaseFor,
  phaseForSA,
  sessionFraction,
  sessionFractionSA,
  marketClock,
  marketClockSA,
  msToAhClose,
  msToSaClose,
} from "./clock";
import { PRESETS_US, PRESETS_SA, type Preset } from "./scanner";
import { ALERTS_US, ALERTS_SA, type AlertThresholds } from "./alerts";
import type { SimProfile } from "./adapters/simAdapter";

// إعداد كل سوق: ما يميّزه (المزوّد، الساعة، العتبات، العرض).
export type MarketId = "us" | "sa";

export interface MarketConfig {
  id: MarketId;
  nameAr: string;
  flag: string;
  currency: string;
  providerEnv: string; // متغيّر البيئة لمزوّد هذا السوق
  simProfile: SimProfile;
  presets: Preset;
  alerts: AlertThresholds;
  phaseFor: (provider: string, now: number) => SessionPhase;
  sessionFraction: (now: number) => number;
  marketClock: (now: number) => string;
  toCloseMs: (now: number) => number;
}

export const MARKETS: Record<MarketId, MarketConfig> = {
  us: {
    id: "us",
    nameAr: "السوق الأمريكي",
    flag: "🇺🇸",
    currency: "$",
    providerEnv: "DATA_PROVIDER",
    simProfile: "us",
    presets: PRESETS_US,
    alerts: ALERTS_US,
    phaseFor,
    sessionFraction,
    marketClock,
    toCloseMs: msToAhClose,
  },
  sa: {
    id: "sa",
    nameAr: "السوق السعودي",
    flag: "🇸🇦",
    currency: "﷼",
    providerEnv: "SA_DATA_PROVIDER",
    simProfile: "sa",
    presets: PRESETS_SA,
    alerts: ALERTS_SA,
    phaseFor: phaseForSA,
    sessionFraction: sessionFractionSA,
    marketClock: marketClockSA,
    toCloseMs: msToSaClose,
  },
};

export function getMarket(id?: string | null): MarketConfig {
  return id === "sa" ? MARKETS.sa : MARKETS.us;
}
