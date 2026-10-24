// ===== أداة الفلتر الليلي: تبني ALPACA_SYMBOLS من مرشّحي اليوم =====
// تستخدم نقاط Alpaca المرخّصة (movers + most-actives) — لا سحب من TradingView.
// التشغيل:  node scripts/build-watchlist.mjs [أقصى سعر=20] [عدد=25]
//
// تقرأ المفاتيح من .env.local تلقائياً. ثم تطبع سطر ALPACA_SYMBOLS جاهزاً للّصق.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const nums = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const MAX_PRICE = Number(nums[0] ?? 20);
const LIMIT = Math.min(Number(nums[1] ?? 50), 150);
const WRITE = process.argv.includes("--write"); // يكتب في .env.local مباشرة

async function readEnv() {
  try {
    const raw = await readFile(path.join(ROOT, ".env.local"), "utf8");
    const env = {};
    for (const line of raw.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}

async function alpaca(url, headers) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const env = await readEnv();
  const keyId = env.ALPACA_KEY_ID?.trim();
  const secret = env.ALPACA_SECRET_KEY?.trim();
  const feed = (env.ALPACA_FEED || "iex").trim();
  if (!keyId || !secret) {
    console.error("✗ ناقص ALPACA_KEY_ID / ALPACA_SECRET_KEY في .env.local");
    process.exit(1);
  }
  const headers = { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secret };

  console.log(`\n⏳ أجلب مرشّحي اليوم من Alpaca (سعر ≤ ${MAX_PRICE}$)...\n`);

  // 1) الرابحون (زخم) + الأكثر نشاطاً (حجم)
  const [movers, actives] = await Promise.all([
    alpaca("https://data.alpaca.markets/v1beta1/screener/stocks/movers?top=50", headers),
    alpaca("https://data.alpaca.markets/v1beta1/screener/stocks/most-actives?by=volume&top=50", headers),
  ]);

  const cand = new Set();
  for (const g of movers.gainers ?? []) if ((g.price ?? 1e9) <= MAX_PRICE) cand.add(g.symbol);
  for (const a of actives.most_actives ?? []) cand.add(a.symbol);

  const symbols = [...cand];
  if (!symbols.length) {
    console.error("✗ لا مرشّحين (قد تكون السوق مغلقة أو الباقة لا تدعم الـ screener).");
    process.exit(1);
  }

  // 2) لقطة لتصفية السعر وعرض التفاصيل
  const snap = await alpaca(
    `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${encodeURIComponent(
      symbols.join(",")
    )}&feed=${feed}`,
    headers
  );

  const rows = [];
  for (const sym of symbols) {
    const s = snap[sym];
    const price = s?.latestTrade?.p ?? s?.dailyBar?.c;
    if (!Number.isFinite(price) || price > MAX_PRICE || price < 0.2) continue;
    const prev = s?.prevDailyBar?.c ?? price;
    const chg = ((price - prev) / prev) * 100;
    const vol = s?.dailyBar?.v ?? 0;
    rows.push({ sym, price, chg, vol });
  }

  rows.sort((a, b) => b.chg - a.chg);
  const top = rows.slice(0, LIMIT);

  console.log("=== مرشّحو اليوم ===");
  console.log("الرمز    السعر     التغيّر%    الحجم");
  for (const r of top) {
    console.log(
      `${r.sym.padEnd(7)} ${r.price.toFixed(2).padStart(8)} ${(r.chg >= 0 ? "+" : "") + r.chg.toFixed(1)}%`.padEnd(
        30
      ) + fmtVol(r.vol)
    );
  }

  const line = `ALPACA_SYMBOLS=${top.map((r) => r.sym).join(",")}`;

  if (WRITE) {
    const raw = await readFile(path.join(ROOT, ".env.local"), "utf8");
    const out = /^ALPACA_SYMBOLS=.*$/m.test(raw)
      ? raw.replace(/^ALPACA_SYMBOLS=.*$/m, line)
      : raw.trimEnd() + "\n" + line + "\n";
    await writeFile(path.join(ROOT, ".env.local"), out);
    console.log(`\n✅ حُدّث ALPACA_SYMBOLS في .env.local (${top.length} رمز). أعد تشغيل الخادم.`);
  } else {
    console.log("\n📋 انسخ هذا السطر إلى .env.local (أو أضف --write للكتابة تلقائياً):\n");
    console.log(line);
  }
  console.log(
    "\nℹ️ الفلوت غير متوفّر من Alpaca — أضف ALPACA_FLOATS يدوياً من شاشة TradingView Premium (عمود Float)."
  );
}

function fmtVol(v) {
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return Math.round(v / 1e3) + "K";
  return String(v);
}

main().catch((e) => {
  console.error("✗ خطأ:", e.message);
  process.exit(1);
});
