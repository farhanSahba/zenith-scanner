import { SimAdapter } from "./simAdapter";
import { AlpacaAdapter } from "./alpacaAdapter";
import type { MarketAdapter } from "./types";
import type { MarketConfig } from "../markets";

// المصنع: يختار مزوّد السوق حسب متغيّر البيئة الخاص به.
// الأمريكي: alpaca أو محاكاة. السعودي: محاكاة الآن (SAHMK في المرحلة 2).
export function createAdapter(market: MarketConfig): MarketAdapter {
  const count = Number(process.env.SIM_COUNT ?? 60);
  const provider = (process.env[market.providerEnv] ?? "sim").toLowerCase();

  if (market.id === "us" && provider === "alpaca") {
    try {
      return new AlpacaAdapter();
    } catch (e) {
      console.error(
        "[createAdapter] تعذّر تهيئة Alpaca — رجوع للمحاكاة:",
        (e as Error).message
      );
      return new SimAdapter(count, "us");
    }
  }

  // لاحقاً: if (market.id === "sa" && provider === "sahmk") return new SahmkAdapter();
  return new SimAdapter(count, market.simProfile);
}
