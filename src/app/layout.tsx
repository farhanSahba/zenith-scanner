import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zenith — ماسح الضاربة اللحظي",
  description:
    "ماسح أسهم لحظي للضاربة اليومية مع طبقة ذكاء Claude العربية — gappers، زخم، low-float.",
};

// تجاوب الجوال: العرض بعرض الجهاز (بدونه يعرض الجوال بعرض سطح المكتب مصغّراً)
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#05070a",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
