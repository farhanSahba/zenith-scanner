// نطق صوتي عربي عبر SpeechSynthesis المضمّن في المتصفح (بدون أي خدمة خارجية).

let enabled = false;

export function setTtsEnabled(v: boolean) {
  enabled = v;
  if (!v && typeof window !== "undefined") window.speechSynthesis?.cancel();
}

export function isTtsEnabled() {
  return enabled;
}

export function speakAr(text: string) {
  if (!enabled || typeof window === "undefined" || !window.speechSynthesis) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "ar-SA";
  u.rate = 1.05;
  u.pitch = 1;
  const voices = window.speechSynthesis.getVoices();
  const ar = voices.find((v) => v.lang?.toLowerCase().startsWith("ar"));
  if (ar) u.voice = ar;
  window.speechSynthesis.speak(u);
}
