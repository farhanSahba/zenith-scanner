// ثوابت زمنية ومعايير عامة للمحرّك
export const MIN = 60_000;
export const SEC = 1_000;

// إيقاع المحرّك (كم مرة نحدّث الحالة ونبني snapshot)
export const TICK_MS = 250; // استقبال/توليد ticks
export const SNAPSHOT_MS = 600; // بث للواجهة

// أطوال النوافذ
export const ATR_PERIOD = 14;
export const TWO_MIN = 2 * MIN;
export const VWAP_SLOPE_LOOKBACK = 3; // بارات لحساب ميل الـ VWAP

// حدود عامة للكون (فلاتر القائمة المركّزة)
export const UNIVERSE = {
  maxPrice: 50,
  minPrice: 0.2,
};
