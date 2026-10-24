"use client";
import { useState } from "react";
import clsx from "clsx";
import type { NewsItem } from "@/engine/types";
import { fmtClockLocal } from "@/lib/format";
import { useLang } from "@/lib/i18n";

const SENT_COLOR: Record<string, string> = {
  bull: "text-neon-green border-neon-green/40",
  bear: "text-neon-red border-neon-red/40",
  dilution: "text-neon-amber border-neon-amber/40",
  neutral: "text-slate-400 border-slate-600/40",
};

export default function NewsPanel({
  news,
  onSelect,
  market,
}: {
  news: NewsItem[];
  onSelect: (sym: string) => void;
  market: string;
}) {
  const { t } = useLang();
  const [open, setOpen] = useState<Record<string, { loading: boolean; text?: string; ai?: boolean }>>(
    {}
  );

  async function analyze(item: NewsItem) {
    setOpen((o) => ({ ...o, [item.id]: { loading: true } }));
    try {
      const res = await fetch(`/api/ai?market=${market}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "catalyst", headline: item.headline }),
      });
      const data = await res.json();
      setOpen((o) => ({ ...o, [item.id]: { loading: false, text: data.text, ai: data.ai } }));
    } catch {
      setOpen((o) => ({ ...o, [item.id]: { loading: false, text: "تعذّر التحليل" } }));
    }
  }

  return (
    <div className="overflow-auto flex-1 divide-y divide-base-800">
      {news.length === 0 && (
        <div className="px-3 py-4 text-center text-slate-600 text-[12px]">{t("newsEmpty")}</div>
      )}
      {news.map((n) => {
        const st = open[n.id];
        return (
          <div key={n.id} className="px-2.5 py-2 text-[12px]">
            <div className="flex items-center gap-2 mb-1" dir="ltr">
              <button
                onClick={() => onSelect(n.symbol)}
                className="font-bold text-slate-100 hover:text-neon-cyan"
              >
                {n.symbol}
              </button>
              <span className="text-slate-600 text-[10px] tnum">{fmtClockLocal(n.time)}</span>
              <span className="text-slate-600 text-[10px]">· {n.source}</span>
              {n.sentiment && (
                <span
                  className={clsx(
                    "ms-auto text-[10px] px-1.5 py-[1px] rounded border",
                    SENT_COLOR[n.sentiment]
                  )}
                >
                  {n.catalystAr ?? n.sentiment}
                </span>
              )}
            </div>
            {n.url ? (
              <a
                dir="ltr"
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-slate-300 leading-snug hover:text-neon-cyan"
              >
                {n.headline}
              </a>
            ) : (
              <div dir="ltr" className="text-slate-300 leading-snug">
                {n.headline}
              </div>
            )}
            <div className="mt-1 flex items-center gap-2">
              <button
                onClick={() => analyze(n)}
                className="text-[10px] px-2 py-[2px] rounded bg-neon-purple/15 text-neon-purple border border-neon-purple/30 hover:bg-neon-purple/25"
              >
                {t("newsAnalyze")}
              </button>
              {st?.loading && <span className="text-[10px] text-slate-500">{t("newsAnalyzing")}</span>}
              {st?.ai === false && <span className="text-[10px] text-slate-600">{t("newsFallback")}</span>}
            </div>
            {st?.text && (
              <div className="mt-1 whitespace-pre-line text-[11px] text-slate-300 bg-base-850 border border-base-700 rounded p-2">
                {st.text}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
