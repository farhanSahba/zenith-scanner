"use client";
import clsx from "clsx";
import type { SymbolSnapshot } from "@/engine/types";
import { levelText, levelBg } from "@/lib/levels";
import { fmtPrice, fmtVol } from "@/lib/format";
import { useLang, type TKey } from "@/lib/i18n";

// أعمدة قابلة للترجمة
const TRANS: Record<string, TKey> = {
  name: "colName",
  price: "colPrice",
  volume: "colVol",
  gap: "colGap",
  float: "colFloat",
  twoMin: "col2Min",
};
// مصطلحات الماسح المختصرة (تبقى كما هي في اللغتين)
const FIXED: Record<string, string> = {
  zenV: "ZenV",
  zenP: "ZenP",
  zenVR: "ZenVR",
  atrSprd: "AtrSprd",
  atrVwap: "AtrVwap",
  atrHoD: "AtrHoD",
  floatRot: "Rot",
};

// الأعمدة المحسوبة التي تُقرأ مباشرة من s.cells
const CELL_KEYS = new Set([
  "gap",
  "float",
  "zenV",
  "zenP",
  "zenVR",
  "atrSprd",
  "atrVwap",
  "atrHoD",
  "twoMin",
  "floatRot",
]);

export default function ScannerTable({
  rows,
  cols,
  selected,
  onSelect,
}: {
  rows: SymbolSnapshot[];
  cols: string[];
  selected?: string;
  onSelect: (sym: string) => void;
}) {
  const { t } = useLang();
  return (
    <div dir="ltr" className="overflow-auto flex-1">
      <table className="w-full border-collapse text-[11px] tnum">
        <thead className="sticky top-0 z-10">
          <tr className="bg-base-750 text-slate-400">
            {cols.map((c) => (
              <th
                key={c}
                className={clsx(
                  "px-1.5 py-1 font-semibold text-right first:text-left whitespace-nowrap",
                  c === "name" && "text-left"
                )}
              >
                {TRANS[c] ? t(TRANS[c]) : FIXED[c] ?? c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td
                colSpan={cols.length}
                className="px-2 py-3 text-center text-slate-600 text-[11px]"
              >
                {t("noCandidates")}
              </td>
            </tr>
          )}
          {rows.map((s) => (
            <tr
              key={s.symbol}
              onClick={() => onSelect(s.symbol)}
              className={clsx(
                "cursor-pointer border-b border-base-800 hover:bg-base-700/40",
                s.allGreen && "row-allgreen",
                selected === s.symbol && "ring-1 ring-inset ring-neon-cyan/60 bg-base-700/30"
              )}
            >
              {cols.map((c) => (
                <Cell key={c} col={c} s={s} />
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ col, s }: { col: string; s: SymbolSnapshot }) {
  if (col === "name") {
    return (
      <td className="px-1.5 py-[3px] text-left font-bold text-slate-100 whitespace-nowrap">
        {s.symbol}
      </td>
    );
  }
  if (col === "price") {
    return (
      <td
        className={clsx(
          "px-1.5 py-[3px] text-right",
          s.changePct >= 0 ? "text-neon-green" : "text-neon-red"
        )}
      >
        {fmtPrice(s.price)}
      </td>
    );
  }
  if (col === "volume") {
    return (
      <td className="px-1.5 py-[3px] text-right text-sky-300">
        {fmtVol(s.volume)}
      </td>
    );
  }
  if (CELL_KEYS.has(col)) {
    const cell = s.cells[col];
    return (
      <td
        className={clsx(
          "px-1.5 py-[3px] text-right",
          levelText(cell?.level ?? "neutral"),
          levelBg(cell?.level ?? "neutral")
        )}
      >
        {cell?.text ?? "—"}
      </td>
    );
  }
  return <td className="px-1.5 py-[3px] text-right text-slate-400">—</td>;
}
