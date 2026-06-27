import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "핀마스터 — 중국어 어휘 수행평가",
  description: "중국어 어휘 병음·성조·의미·문장 자동채점 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      {/* 일부 브라우저 확장(예: cz-shortcut-listen)이 <body>에 속성을 주입해
          하이드레이션 불일치 경고를 유발 → suppressHydrationWarning로 무시(해당 요소 한정) */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
