"use client";
import { useState } from "react";
import type { SymbolSnapshot } from "@/engine/types";
import type { ScanFilter } from "@/engine/ai/nlquery";
import ScannerTable from "./ScannerTable";
import { useLang } from "@/lib/i18n";

export default function AiConsole({ onSelect, market }: { onSelect: (s: string) => void; market: string }) {
  const { t } = useLang();
  const examples = [t("ex1"), t("ex2"), t("ex3")];
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{
    filter: ScanFilter;
    results: SymbolSnapshot[];
    ai: boolean;
  } | null>(null);

  async function run(q?: string) {
    const query = (q ?? text).trim();
    if (!query) return;
    if (q) setText(q);
    setLoading(true);
    try {
      const r = await fetch(`/api/ai?market=${market}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "nlquery", text: query }),
      });
      const d = await r.json();
      setRes({ filter: d.filter, results: d.results, ai: d.ai });
    } catch {
      setRes(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 border-b border-base-700">
        <div className="flex gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
            placeholder={t("aiPlaceholder")}
            className="flex-1 bg-base-900 border border-base-700 rounded px-2.5 py-1.5 text-[12px] text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-neon-cyan/50"
          />
          <button
            onClick={() => run()}
            disabled={loading}
            className="text-[12px] px-3 py-1.5 rounded bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 hover:bg-neon-cyan/30 disabled:opacity-50"
          >
            {loading ? "..." : t("aiSearch")}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {examples.map((ex) => (
            <button
              key={ex}
              onClick={() => run(ex)}
              className="text-[10px] px-2 py-[2px] rounded bg-base-800 text-slate-400 border border-base-700 hover:text-neon-cyan hover:border-neon-cyan/30"
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      {res && (
        <div className="px-2 py-1.5 text-[11px] text-slate-400 border-b border-base-800 flex items-center gap-2">
          <span className="text-neon-cyan">{t("aiUnderstood")}</span>
          <span>{res.filter.label ?? describeFilter(res.filter)}</span>
          <span className="ms-auto text-slate-600">
            {res.results.length} {t("aiResults")} · {res.ai ? "Claude" : t("aiByRule")}
          </span>
        </div>
      )}

      <div className="flex-1 min-h-0">
        {res ? (
          <ScannerTable
            rows={res.results}
            cols={["name", "price", "gap", "twoMin", "zenP", "float"]}
            onSelect={onSelect}
          />
        ) : (
          <div className="p-4 text-center text-slate-600 text-[12px]">{t("aiHint")}</div>
        )}
      </div>
    </div>
  );
}

function describeFilter(f: ScanFilter): string {
  const p: string[] = [];
  if (f.priceMax != null) p.push(`≤ ${f.priceMax}$`);
  if (f.floatMaxM != null) p.push(`float ≤ ${f.floatMaxM}M`);
  if (f.gapMinPct != null) p.push(`gap ≥ ${f.gapMinPct}%`);
  if (f.twoMinMinPct != null) p.push(`2min ≥ ${f.twoMinMinPct}%`);
  if (f.zenPMin != null) p.push(`ZenP ≥ ${f.zenPMin}`);
  if (f.needsNews) p.push("news");
  if (f.allGreen) p.push("all green");
  return p.join(" · ") || "—";
}
