import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zenith — ماسح الضاربة اللحظي",
  description:
    "ماسح أسهم لحظي للضاربة اليومية مع طبقة ذكاء Claude العربية — gappers، زخم، low-float.",
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
