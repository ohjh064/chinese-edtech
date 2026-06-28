"use client";

import { useState } from "react";

/**
 * 단어 발음 듣기 — 브라우저 내장 TTS(Web Speech API, zh-CN).
 * 무료·키 불필요. 기기/브라우저에 중국어 음성이 있어야 정확히 재생된다.
 */
export function SpeakButton({
  hanzi,
  size = "sm",
}: {
  hanzi: string;
  size?: "sm" | "md";
}) {
  const [unsupported, setUnsupported] = useState(false);

  function speak() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setUnsupported(true);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(hanzi);
      u.lang = "zh-CN";
      u.rate = 0.9;
      const zh = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang?.toLowerCase().startsWith("zh"));
      if (zh) u.voice = zh;
      window.speechSynthesis.speak(u);
    } catch {
      setUnsupported(true);
    }
  }

  const pad = size === "md" ? "6px 12px" : "2px 8px";
  const fontSize = size === "md" ? 14 : 12;

  return (
    <button
      type="button"
      className="btn secondary"
      onClick={speak}
      disabled={unsupported}
      style={{ padding: pad, fontSize }}
      title={
        unsupported
          ? "이 브라우저/기기는 음성 합성을 지원하지 않습니다"
          : "발음 듣기 (중국어 음성 필요)"
      }
      aria-label="발음 듣기"
    >
      🔊 듣기
    </button>
  );
}
