export function fmtPrice(p: number): string {
  if (!Number.isFinite(p)) return "—";
  return p >= 1 ? p.toFixed(2) : p.toFixed(4);
}

export function fmtVol(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(v >= 1e7 ? 0 : 1) + "M";
  if (v >= 1e3) return Math.round(v / 1e3) + "K";
  return String(Math.round(v));
}

export function fmtPct(p: number, d = 1): string {
  if (!Number.isFinite(p)) return "—";
  return (p >= 0 ? "+" : "") + p.toFixed(d) + "%";
}

export function fmtFloat(m: number): string {
  if (!Number.isFinite(m)) return "—";
  return m >= 1 ? m.toFixed(m < 10 ? 1 : 0) + "M" : Math.round(m * 1000) + "K";
}

// صافي تدفّق السيولة (ريال) → مختصر بإشارة (مليون/مليار)
export function fmtFlow(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e9) return sign + (a / 1e9).toFixed(1) + "ب";
  if (a >= 1e6) return sign + (a / 1e6).toFixed(a >= 1e7 ? 0 : 1) + "م";
  if (a >= 1e3) return sign + Math.round(a / 1e3) + "ألف";
  return sign + Math.round(a);
}

export function fmtClockLocal(t: number): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function fmtCountdown(ms: number): string {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
}
