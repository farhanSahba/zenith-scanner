import { ScannerEngine } from "./engine";

// محرّك واحد مشترك يبقى حيّاً عبر إعادة تحميل الوحدات في التطوير.
const g = globalThis as unknown as { __zenithEngine?: ScannerEngine };

export function getEngine(): ScannerEngine {
  if (!g.__zenithEngine) {
    g.__zenithEngine = new ScannerEngine();
  }
  return g.__zenithEngine;
}
