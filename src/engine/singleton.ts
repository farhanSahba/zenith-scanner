import { ScannerEngine } from "./engine";
import { getMarket, type MarketId } from "./markets";

// محرّك لكل سوق، يبقى حيّاً عبر إعادة تحميل الوحدات في التطوير.
const g = globalThis as unknown as { __zenithEngines?: Partial<Record<MarketId, ScannerEngine>> };

export function getEngine(market?: string | null): ScannerEngine {
  if (!g.__zenithEngines) g.__zenithEngines = {};
  const cfg = getMarket(market);
  let eng = g.__zenithEngines[cfg.id];
  if (!eng) {
    eng = new ScannerEngine(cfg);
    g.__zenithEngines[cfg.id] = eng;
  }
  return eng;
}
