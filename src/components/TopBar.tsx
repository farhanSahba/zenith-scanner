"use client";
import clsx from "clsx";
import type { Snapshot, SessionPhase } from "@/engine/types";
import { fmtCountdown, fmtPct } from "@/lib/format";
import { useLang } from "@/lib/i18n";

export default function TopBar({
  snap,
  connected,
  tts,
  onToggleTts,
}: {
  snap: Snapshot | null;
  connected: boolean;
  tts: boolean;
  onToggleTts: () => void;
}) {
  const { t, toggle, lang } = useLang();
  const fut = snap?.futures ?? { dj: 0, sp: 0 };

  const phaseKey: Record<SessionPhase, string> = {
    pre: "phasePre",
    regular: "phaseRegular",
    after: "phaseAfter",
    overnight: "phaseOvernight",
    closed: "phaseClosed",
  };
  const phaseLabel = t((phaseKey[snap?.phase ?? "regular"] ?? "phaseRegular") as never);

  return (
    <header className="flex items-center gap-4 px-4 h-14 bg-base-850 border-b border-base-700 shrink-0">
      {/* الهوية */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded bg-gradient-to-br from-neon-green to-neon-cyan flex items-center justify-center text-base-900 font-black text-sm">
          Z
        </div>
        <div className="leading-none">
          <div className="font-black text-slate-100 text-sm tracking-wide">ZENITH</div>
          <div className="text-[10px] text-slate-500">{t("subtitle")}</div>
        </div>
      </div>

      {/* مصدر الداتا + حالة الاتصال */}
      <div className="flex items-center gap-2">
        <span
          className={clsx(
            "text-[10px] px-2 py-[2px] rounded border font-bold uppercase",
            snap?.dataSource === "alpaca"
              ? "text-neon-green border-neon-green/40 bg-neon-green/10"
              : "text-neon-amber border-neon-amber/40 bg-neon-amber/10"
          )}
        >
          {snap?.dataSource === "alpaca" ? "LIVE · Alpaca" : t("sim")}
        </span>
        <span className="flex items-center gap-1 text-[10px] text-slate-500">
          <span
            className={clsx(
              "w-2 h-2 rounded-full",
              connected ? "bg-neon-green animate-pulseDot" : "bg-neon-red"
            )}
          />
          {connected ? t("connected") : t("disconnected")}
        </span>
        <span className="text-[10px] text-slate-600">
          · {snap?.universeCount ?? 0} {t("symbols")}
        </span>
      </div>

      {snap?.note && (
        <span className="text-[10px] px-2 py-[2px] rounded border text-neon-amber border-neon-amber/40 bg-neon-amber/10">
          ⚠ {snap.note}
        </span>
      )}

      {/* مفتاح القاعدة الذهبية */}
      <div className="hidden lg:flex items-center gap-3 text-[10px] text-slate-500 border-s border-base-700 ps-4">
        <Legend color="#1cff9b" label={t("legendNeon")} glow />
        <Legend color="#1cff9b" label={t("legendGreen")} />
        <Legend color="#94a3b8" label={t("legendNeutral")} />
        <Legend color="#ff2d55" label={t("legendRed")} />
        <span className="text-slate-600">{t("legendRule")}</span>
      </div>

      {/* يمين: عقود + ساعة + عدّاد + صوت + لغة */}
      <div className="ms-auto flex items-center gap-4" dir="ltr">
        <Fut label="DJ" v={fut.dj} />
        <Fut label="S&P" v={fut.sp} />
        <div className="text-center leading-none">
          <div className="text-[10px] text-slate-500">{phaseLabel}</div>
          <div className="tnum text-slate-200 text-sm">{snap?.marketClock ?? "--:--:--"}</div>
        </div>
        <div className="text-center leading-none">
          <div className="text-[10px] text-slate-500">{t("ahClose")}</div>
          <div className="tnum text-neon-cyan text-sm">{fmtCountdown(snap?.toAhCloseMs ?? 0)}</div>
        </div>
        <button
          onClick={onToggleTts}
          className={clsx(
            "text-[11px] px-2.5 py-1 rounded border",
            tts
              ? "text-neon-green border-neon-green/40 bg-neon-green/10"
              : "text-slate-400 border-base-700 hover:bg-base-700/40"
          )}
          title={t("sound")}
        >
          {tts ? "🔊" : "🔇"} {t("sound")}
        </button>
        <button
          onClick={toggle}
          className="text-[11px] px-2.5 py-1 rounded border border-base-700 text-slate-300 hover:bg-base-700/40 font-bold"
          title={lang === "ar" ? "English" : "العربية"}
        >
          {t("langBtn")}
        </button>
      </div>
    </header>
  );
}

function Legend({ color, label, glow }: { color: string; label: string; glow?: boolean }) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="w-2.5 h-2.5 rounded-sm"
        style={{ background: color, boxShadow: glow ? `0 0 6px ${color}` : undefined }}
      />
      {label}
    </span>
  );
}

function Fut({ label, v }: { label: string; v: number }) {
  return (
    <div className="text-center leading-none">
      <div className="text-[10px] text-slate-500">{label} Fut</div>
      <div className={clsx("tnum text-sm", v >= 0 ? "text-neon-green" : "text-neon-red")}>
        {fmtPct(v, 2)}
      </div>
    </div>
  );
}
