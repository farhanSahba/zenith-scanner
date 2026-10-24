import Link from "next/link";

// شاشة اختيار السوق — نفس المحرّك، سوقان.
export default function Home() {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-base-900 text-slate-200 gap-8 sm:gap-10 p-6">
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-neon-green to-neon-cyan flex items-center justify-center text-base-900 font-black text-2xl shadow-neon-green">
            Z
          </div>
          <div className="font-black text-3xl sm:text-4xl tracking-wide">ZENITH</div>
        </div>
        <div className="text-slate-500 text-sm">ماسح الضاربة اللحظي · اختر السوق</div>
      </div>

      <div className="flex flex-col sm:flex-row gap-5 w-full sm:w-auto items-center">
        <MarketCard href="/us" flag="🇺🇸" title="السوق الأمريكي" sub="US Market" accent="#1cff9b" />
        <MarketCard href="/sa" flag="🇸🇦" title="السوق السعودي" sub="تداول · Tadawul" accent="#22d3ee" />
      </div>

      <div className="text-slate-600 text-[11px] text-center">كلا السوقين على نفس المحرّك · تطوير واحد</div>
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
      className="group relative w-full max-w-[18rem] sm:w-64 overflow-hidden rounded-xl border border-base-700 bg-base-850 p-6 flex flex-col items-center gap-3 transition-all duration-200 hover:bg-base-800 hover:-translate-y-0.5"
    >
      {/* شريط لون علوي */}
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="text-5xl transition-transform duration-200 group-hover:scale-110">{flag}</div>
      <div className="font-bold text-lg text-slate-100">{title}</div>
      <div className="text-slate-500 text-xs">{sub}</div>
      <div
        className="mt-1 text-[12px] px-3 py-1 rounded border transition-colors"
        style={{ borderColor: `${accent}55`, color: accent, background: `${accent}12` }}
      >
        ادخل ←
      </div>
    </Link>
  );
}
