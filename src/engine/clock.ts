import type { SessionPhase } from "./types";

// ساعة الجلسة: تحسب مرحلة السوق والعدّاد بتوقيت نيويورك.
// في وضع المحاكاة نُبقي الحالة "regular" دائماً حتى يبقى الماسح حيّاً في أي وقت.

function etParts(now: number): { h: number; m: number; s: number; dow: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(now));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "0";
  const wd = get("weekday");
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  let h = parseInt(get("hour"), 10);
  if (h === 24) h = 0;
  return { h, m: parseInt(get("minute"), 10), s: parseInt(get("second"), 10), dow: dowMap[wd] ?? 1 };
}

export function marketClock(now: number): string {
  const { h, m, s } = etParts(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

// ms حتى إغلاق ما بعد السوق (20:00 بتوقيت نيويورك)
export function msToAhClose(now: number): number {
  const { h, m, s } = etParts(now);
  const secOfDay = h * 3600 + m * 60 + s;
  const target = 20 * 3600;
  let rem = target - secOfDay;
  if (rem < 0) rem += 24 * 3600;
  return rem * 1000;
}

// جلسات 24 ساعة بتوقيت نيويورك (شاملة الجلسة الليلية Blue Ocean 8م–4ص).
export function realPhase(now: number): SessionPhase {
  const { h, m, dow } = etParts(now);
  const t = h * 60 + m;

  if (dow === 6) return "closed"; // السبت مغلق
  // الأحد: الليلي يبدأ 8 مساءً (افتتاح الجلسة الليلية)
  if (dow === 0) return t >= 20 * 60 ? "overnight" : "closed";

  // الإثنين–الجمعة
  if (t < 4 * 60) return "overnight"; // الصباح الباكر = امتداد الجلسة الليلية
  if (t < 9 * 60 + 30) return "pre";
  if (t < 16 * 60) return "regular";
  if (t < 20 * 60) return "after";
  // بعد 8 مساءً: ليلي، إلا ليلة الجمعة (بداية العطلة)
  return dow === 5 ? "closed" : "overnight";
}

export function phaseFor(provider: string, now: number): SessionPhase {
  // المحاكاة دائماً نشطة (regular) ليبقى العرض حيّاً في أي وقت
  return provider === "sim" ? "regular" : realPhase(now);
}
