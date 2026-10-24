import Link from "next/link";

// شاشة اختيار السوق — نفس المحرّك، سوقان.
export default function Home() {
  return (
    <div className="h-screen flex flex-col items-center justify-center bg-base-900 text-slate-200 gap-10 p-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-10 h-10 rounded bg-gradient-to-br from-neon-green to-neon-cyan flex items-center justify-center text-base-900 font-black text-xl">
            Z
          </div>
          <div className="font-black text-3xl tracking-wide">ZENITH</div>
        </div>
        <div className="text-slate-500 text-sm">ماسح الضاربة اللحظي · اختر السوق</div>
      </div>

      <div className="flex flex-col sm:flex-row gap-5">
        <MarketCard href="/us" flag="🇺🇸" title="السوق الأمريكي" sub="US Market" accent="#1cff9b" />
        <MarketCard href="/sa" flag="🇸🇦" title="السوق السعودي" sub="تداول · Tadawul" accent="#22d3ee" />
      </div>

      <div className="text-slate-600 text-[11px]">كلا السوقين على نفس المحرّك · تطوير واحد</div>
    </div>
  );
}

function MarketCard({
  href,
  flag,
  title,
  sub,
  accent,
}: {
  href: string;
  flag: string;
  title: string;
  sub: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="w-64 rounded-xl border border-base-700 bg-base-850 p-6 flex flex-col items-center gap-3 hover:bg-base-800 transition"
    >
      <div className="text-5xl">{flag}</div>
      <div className="font-bold text-lg text-slate-100">{title}</div>
      <div className="text-slate-500 text-xs">{sub}</div>
      <div
        className="mt-1 text-[12px] px-3 py-1 rounded border"
        style={{ borderColor: `${accent}55`, color: accent }}
      >
        ادخل ←
      </div>
    </Link>
  );
}
