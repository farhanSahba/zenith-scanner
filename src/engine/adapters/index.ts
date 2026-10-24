import { SimAdapter } from "./simAdapter";
import { AlpacaAdapter } from "./alpacaAdapter";
import type { MarketAdapter } from "./types";

// المصنع: يختار المزوّد حسب متغيّر البيئة DATA_PROVIDER.
// هذا هو السطر الوحيد الذي يفصل المحاكاة عن الـ real-time.
export function createAdapter(): MarketAdapter {
  const provider = (process.env.DATA_PROVIDER ?? "sim").toLowerCase();
  if (provider === "alpaca") {
    try {
      return new AlpacaAdapter();
    } catch (e) {
      // مفاتيح ناقصة/إعداد خاطئ → لا نُعطّل التطبيق، نرجع للمحاكاة
      console.error(
        "[createAdapter] تعذّر تهيئة Alpaca — رجوع للمحاكاة:",
        (e as Error).message
      );
      return new SimAdapter(Number(process.env.SIM_COUNT ?? 60));
    }
  }
  return new SimAdapter(Number(process.env.SIM_COUNT ?? 60));
}
