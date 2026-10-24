// ===== أنواع المحرّك =====

// مستوى اللون لكل خلية (الأخضر النيون = الأعلى احتمالاً)
export type ColorLevel = "neon" | "green" | "neutral" | "amber" | "red";

export interface OHLCV {
  t: number; // بداية البار (epoch ms)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

export interface Tick {
  symbol: string;
  price: number;
  size: number; // حجم الصفقة (أسهم)
  bid: number;
  ask: number;
  t: number; // epoch ms
}

export type SessionPhase = "pre" | "regular" | "after" | "overnight" | "closed";

export interface NewsItem {
  id: string;
  symbol: string;
  time: number;
  headline: string;
  source: string;
  url?: string;
  // تُملأ من طبقة الذكاء العربية:
  catalystAr?: string;
  sentiment?: "bull" | "bear" | "neutral" | "dilution";
}

// قيمة عمود + مستوى لونه
export interface Cell {
  v: number | null;
  level: ColorLevel;
  text: string;
}

export interface SymbolSnapshot {
  symbol: string;
  price: number;
  prevClose: number;
  open: number;
  dayHigh: number;
  dayLow: number;
  premktHigh: number;
  float: number;
  volume: number;
  vwap: number;
  atr: number;
  gapPct: number;
  twoMinPct: number;
  changePct: number;
  zenVR: number; // الحجم النسبي
  zenP: number; // الاحتمالية المركّبة 0..100
  zenVUp: boolean; // ميل الـ VWAP صاعد؟
  atrVwap: number;
  atrHoD: number;
  atrSprd: number;
  floatRot: number;
  spread: number;
  bid: number;
  ask: number;
  // ألوان الأعمدة الجاهزة للعرض
  cells: Record<string, Cell>;
  allGreen: boolean; // القاعدة الذهبية: كل الأعمدة خضراء
  greenScore: number; // 0..1 كم نسبة الأعمدة الخضراء
  updatedAt: number;
}

export interface Alert {
  id: string;
  symbol: string;
  reason: string; // "To HoD" | "+11.6% /2Min" | ...
  price: number;
  warning?: string;
  time: number;
  tone: "bull" | "bear" | "info";
}

export type PanelKey =
  | "momoHod"
  | "gapUp"
  | "gapUpLowFloat"
  | "momo2mUp"
  | "momo2mDown";

export interface Futures {
  dj: number; // نسبة التغيّر %
  sp: number;
}

export interface Snapshot {
  phase: SessionPhase;
  clock: number;
  marketClock: string; // HH:MM:SS (توقيت السوق المحاكى)
  toAhCloseMs: number; // العدّاد حتى إغلاق After-Hours
  panels: Record<PanelKey, SymbolSnapshot[]>;
  alerts: Alert[]; // الأحدث أولاً
  news: NewsItem[];
  futures: Futures;
  universeCount: number;
  dataSource: string; // "sim" | "alpaca"
  note?: string; // تنبيه حالة (مثل الرجوع للمحاكاة)
}
