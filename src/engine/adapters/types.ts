import type { Tick } from "../types";

// بذرة تهيئة رمز في الكون
export interface SymbolSeed {
  symbol: string;
  float: number; // بالملايين من الأسهم
  avgDailyVol: number; // أسهم
  prevClose: number;
  open: number; // سعر الافتتاح (يحدّد الـ Gap)
  dayHighSeed: number;
  premktHigh: number;
}

export interface NewsEvent {
  symbol: string;
  headline: string;
  source: string;
  time: number;
  kind: "contract" | "earnings" | "fda" | "offering" | "analyst" | "pr";
  url?: string;
  sentiment?: "bull" | "bear" | "neutral" | "dilution"; // من سنتمنت AV
}

export type TickHandler = (tick: Tick) => void;
export type NewsHandler = (news: NewsEvent) => void;

// الواجهة الموحّدة لأي مزوّد داتا (محاكاة أو حقيقي).
// تبديل المزوّد = تنفيذ هذه الواجهة فقط؛ بقية النظام لا يتغيّر.
export interface MarketAdapter {
  readonly name: string;
  // تهيئة الكون (قد تكون async: المزوّد الحقيقي يجلب اللقطات هنا)
  prepare(): Promise<SymbolSeed[]>;
  start(onTick: TickHandler, onNews?: NewsHandler): Promise<void> | void;
  stop(): void;
  // فرز تلقائي: يرجع مرشّحي السوق الحاليين (للتحديث الحي بلا إعادة تشغيل)
  screen?(maxPrice: number, limit: number): Promise<SymbolSeed[]>;
  // إضافة رموز جديدة للبثّ الحي (دون قطع الاتصال)
  subscribe?(symbols: string[]): void;
}
