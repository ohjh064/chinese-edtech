/**
 * 브라우저 TTS 시퀀싱 유틸 (성조 자동 재생 학습용).
 * speakOnce는 발화 종료(onend) 시 resolve되는 Promise → "2회 발음 후 자동 넘김" 같은 순차 제어에 사용.
 * 브라우저 미지원/에러 시 즉시 resolve(학습 흐름을 막지 않음).
 */
export function speakOnce(
  text: string,
  opts?: { lang?: string; rate?: number },
): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window) || !text.trim()) {
      resolve();
      return;
    }
    const lang = opts?.lang ?? "zh-CN";
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    // 일부 브라우저에서 onend가 누락될 수 있어 안전 타임아웃(길이 기반)
    const timer = setTimeout(done, Math.max(4000, text.length * 700));
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = opts?.rate ?? 0.9;
      const voice = window.speechSynthesis
        .getVoices()
        .find((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      if (voice) u.voice = voice;
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    } catch {
      done();
    }
  });
}

export function cancelSpeech(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
