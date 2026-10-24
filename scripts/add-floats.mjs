// ===== دمج قيم الفلوت في ALPACA_FLOATS =====
// تقرأ الفلوت من TradingView Premium (عمود Float) أو Finviz، ثم:
//   node scripts/add-floats.mjs NIVF:0.5,BOLT:1.64,CLRO:0.71
// تدمج الجديد مع الموجود (تحدّث المكرّر، تضيف الجديد) بلا مساس بالمفاتيح.

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parsePairs(str) {
  const out = {};
  for (const part of (str || "").split(",")) {
    const [s, f] = part.split(":");
    const n = parseFloat(f);
    if (s && Number.isFinite(n)) out[s.trim().toUpperCase()] = n;
  }
  return out;
}

async function main() {
  const arg = process.argv.slice(2).filter((a) => !a.startsWith("--")).join(",");
  const incoming = parsePairs(arg);
  if (!Object.keys(incoming).length) {
    console.error("الاستخدام: node scripts/add-floats.mjs SYM:float,SYM:float  (الفلوت بالملايين)");
    process.exit(1);
  }

  const p = path.join(process.cwd(), ".env.local");
  let t = await readFile(p, "utf8");

  const m = t.match(/^ALPACA_FLOATS=(.*)$/m);
  const merged = { ...parsePairs(m?.[1]), ...incoming };
  const line =
    "ALPACA_FLOATS=" +
    Object.entries(merged)
      .map(([s, f]) => `${s}:${f}`)
      .join(",");

  t = m
    ? t.replace(/^ALPACA_FLOATS=.*$/m, line)
    : t.replace(/^(ALPACA_SYMBOLS=.*)$/m, `$1\n${line}`);

  await writeFile(p, t);
  console.log(
    `✅ دُمج ${Object.keys(incoming).length} فلوت (الإجمالي ${Object.keys(merged).length} رمز). أعد تشغيل الخادم.`
  );
}

main().catch((e) => {
  console.error("✗ خطأ:", e.message);
  process.exit(1);
});
