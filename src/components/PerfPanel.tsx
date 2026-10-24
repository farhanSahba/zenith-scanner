"use client";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { useLang, type TKey } from "@/lib/i18n";

interface Agg {
  count: number;
  settled: number;
  wins: number;
  winRate: number;
  avgMaxFav: number;
}
interface PerfEntry {
  id: string;
  symbol: string;
  kind: string;
  tone: "bull" | "bear";
  price: number;
  time: number;
  maxFav: number;
  maxAdv: number;
  settled: boolean;
  outcome: "win" | "loss" | null;
  settledMove: number | null;
}
interface PerfData {
  stats: { horizonMin: number; winPct: number; overall: Agg; byKind: Record<string, Agg> };
  recent: PerfEntry[];
}

// ترجمة نوع التنبيه لعرضه في الجدول
const KIND_KEY: Record<string, TKey> = {
  toHod: "reasonToHod",
  approachHod: "reasonApproachHod",
  surge: "reasonSurge",
  new: "reasonNewCand",
  dilution: "reasonDilution",
};

export default function PerfPanel() {
  const { t, lang } = useLang();
  const [data, setData] = useState<PerfData | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const d = (await fetch("/api/perf").then((r) => r.json())) as PerfData;
        if (active) setData(d);
      } catch {
        /* تجاهل */
      }
    };
    load();
    const id = setInterval(load, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  const kindLabel = (k: string) =>
    KIND_KEY[k] ? t(KIND_KEY[k]) : k === "up2m" ? "2Min ↑" : k === "down2m" ? "2Min ↓" : k;

  const s = data?.stats;
  const kinds = s ? Object.keys(s.byKind).sort((a, b) => s.byKind[b].count - s.byKind[a].count) : [];

  if (!s || s.overall.count === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-slate-600 text-[12px] p-4 text-center">
        {t("perfEmpty")}
      </div>
    );
  }

  return (
    <div className="overflow-auto flex-1 p-2 text-[12px]" dir={lang === "ar" ? "rtl" : "ltr"}>
      {/* ملخّص */}
      <div className="flex items-center gap-4 mb-3 px-1">
        <div>
          <div className="text-[10px] text-slate-500">{t("perfWinRate")}</div>
          <div
            className={clsx(
              "text-2xl font-black tnum",
              s.overall.winRate >= 50 ? "text-neon-green" : "text-neon-amber"
            )}
          >
            {s.overall.settled ? `${s.overall.winRate}%` : "—"}
          </div>
        </div>
        <div className="text-[10px] text-slate-500 leading-relaxed">
          <div>
            {t("perfSettled")}: {s.overall.settled}/{s.overall.count}
          </div>
          <div>
            {t("perfHorizon")}: {s.horizonMin}
            {t("perfMinUnit")} · {t("perfTarget")}: {s.winPct}%
          </div>
        </div>
      </div>

      {/* الأداء حسب نوع التنبيه */}
      <table className="w-full border-collapse tnum mb-3">
        <thead className="text-slate-500 text-[10px]">
          <tr>
            <th className="text-start px-1 py-1">{t("perfKind")}</th>
            <th className="text-end px-1 py-1">{t("perfCount")}</th>
            <th className="text-end px-1 py-1">{t("perfSettledShort")}</th>
            <th className="text-end px-1 py-1">{t("perfWin")}</th>
            <th className="text-end px-1 py-1">{t("perfWinRate")}</th>
            <th className="text-end px-1 py-1">{t("perfAvgMove")}</th>
          </tr>
        </thead>
        <tbody>
          {kinds.map((k) => {
            const g = s.byKind[k];
            return (
              <tr key={k} className="border-t border-base-800">
                <td className="px-1 py-1 text-start text-slate-200">{kindLabel(k)}</td>
                <td className="px-1 py-1 text-end text-slate-300">{g.count}</td>
                <td className="px-1 py-1 text-end text-slate-400">{g.settled}</td>
                <td className="px-1 py-1 text-end text-neon-green">{g.wins}</td>
                <td
                  className={clsx(
                    "px-1 py-1 text-end font-bold",
                    !g.settled ? "text-slate-500" : g.winRate >= 50 ? "text-neon-green" : "text-neon-amber"
                  )}
                >
                  {g.settled ? `${g.winRate}%` : "—"}
                </td>
                <td
                  className={clsx(
                    "px-1 py-1 text-end",
                    g.avgMaxFav >= 0 ? "text-neon-green/80" : "text-neon-red/80"
                  )}
                >
                  {g.avgMaxFav > 0 ? "+" : ""}
                  {g.avgMaxFav}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* آخر النتائج */}
      <div className="text-[10px] text-slate-500 px-1 mb-1">{t("perfRecent")}</div>
      <table className="w-full border-collapse tnum" dir="ltr">
        <tbody>
          {data!.recent.map((e) => (
            <tr key={e.id} className="border-t border-base-800">
              <td className="px-1 py-[3px] text-left font-bold text-slate-200">{e.symbol}</td>
              <td className="px-1 py-[3px] text-left text-slate-400">{kindLabel(e.kind)}</td>
              <td
                className={clsx(
                  "px-1 py-[3px] text-right",
                  e.maxFav >= 0 ? "text-neon-green/80" : "text-neon-red/80"
                )}
              >
                {e.maxFav > 0 ? "+" : ""}
                {e.maxFav.toFixed(1)}%
              </td>
              <td className="px-1 py-[3px] text-right">
                {!e.settled ? (
                  <span className="text-slate-500">{t("perfPending")}</span>
                ) : e.outcome === "win" ? (
                  <span className="text-neon-green">{t("perfWinBadge")}</span>
                ) : (
                  <span className="text-neon-red">{t("perfLossBadge")}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
