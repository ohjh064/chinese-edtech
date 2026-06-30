"use client";

import { useState } from "react";
import { classifyTone, toneName } from "@/lib/tone";
import { SpeakButton } from "@/components/SpeakButton";

export interface ToneTarget {
  hanzi: string;
  pinyin: string;
  tones: number[];
}

interface Analysis {
  detected: number[];
  ok: boolean[];
}

const REC_MS = 2200;

export function TonePractice({ targets }: { targets: ToneTarget[] }) {
  const [idx, setIdx] = useState(0);
  const [recording, setRecording] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const maybeCur = targets[idx];
  if (!maybeCur) {
    return <div className="card muted">발음 연습할 표현이 없습니다.</div>;
  }
  const cur: ToneTarget = maybeCur;

  function reset() {
    setAnalysis(null);
    setError(null);
  }

  async function record() {
    reset();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("마이크 권한이 필요합니다. 브라우저 설정을 확인하세요.");
      return;
    }
    setRecording(true);
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const srcNode = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    srcNode.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const sr = ctx.sampleRate;
    const f0s: number[] = [];
    const start = performance.now();

    await new Promise<void>((resolve) => {
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        f0s.push(detectPitch(buf, sr));
        if (performance.now() - start < REC_MS) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });

    stream.getTracks().forEach((t) => t.stop());
    void ctx.close();
    setRecording(false);
    analyze(f0s);
  }

  function analyze(f0s: number[]) {
    // 유성 구간만(70~500Hz), 앞뒤 무음 트림
    const voiced = f0s.map((f) => (f >= 70 && f <= 500 ? f : NaN));
    let lo = 0;
    let hi = voiced.length - 1;
    while (lo < voiced.length && !Number.isFinite(voiced[lo])) lo++;
    while (hi > lo && !Number.isFinite(voiced[hi])) hi--;
    const seg = voiced.slice(lo, hi + 1);
    const present = seg.filter((f) => Number.isFinite(f)) as number[];
    if (present.length < 6) {
      setError("소리가 충분히 감지되지 않았어요. 마이크에 가까이 또렷하게 말해보세요.");
      return;
    }
    const median = present.slice().sort((a, b) => a - b)[Math.floor(present.length / 2)] as number;
    // 반음 윤곽(중앙값 기준)
    const semis = seg.map((f) => (Number.isFinite(f) ? 12 * Math.log2(f / median) : NaN));

    const k = Math.max(1, cur.tones.length);
    const size = Math.floor(semis.length / k) || semis.length;
    const detected: number[] = [];
    for (let i = 0; i < k; i++) {
      const part = semis.slice(i * size, i === k - 1 ? semis.length : (i + 1) * size);
      detected.push(classifyTone(part));
    }
    const ok = cur.tones.map((t, i) => detected[i] === t || (t === 0 && detected[i] === 0));
    setAnalysis({ detected, ok });
  }

  function next() {
    reset();
    setIdx((i) => Math.min(targets.length - 1, i + 1));
  }
  function prev() {
    reset();
    setIdx((i) => Math.max(0, i - 1));
  }

  const chars = [...cur.hanzi];

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="badge">성조 발음 코칭</span>
        <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {targets.length}</span>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>
        브라우저 마이크로 성조 윤곽을 근사 분석합니다(참고용). 조용한 곳에서 또박또박 발음해 보세요.
      </p>

      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 40, fontWeight: 700 }}>{cur.hanzi}</div>
        <div className="muted" style={{ fontSize: 18, margin: "4px 0" }}>{cur.pinyin}</div>
        <div className="row" style={{ justifyContent: "center", gap: 6, flexWrap: "wrap", margin: "6px 0" }}>
          {cur.tones.map((t, i) => (
            <span key={i} className="badge">{chars[i] ?? "·"} {toneName(t)}</span>
          ))}
        </div>
        <div className="row" style={{ justifyContent: "center", gap: 8 }}>
          <SpeakButton hanzi={cur.hanzi} />
          <button className="btn" type="button" onClick={record} disabled={recording}>
            {recording ? "녹음 중…" : "🎙 녹음해서 비교"}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {analysis && (
        <div className="card" style={{ background: "var(--primary-weak)" }}>
          <b>내 성조 (근사)</b>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", margin: "8px 0" }}>
            {cur.tones.map((t, i) => (
              <span
                key={i}
                className="badge"
                style={{ background: analysis.ok[i] ? "var(--ok, #16a34a)" : "var(--warn, #dc2626)", color: "#fff" }}
              >
                {chars[i] ?? "·"} {analysis.ok[i] ? "✓" : `${toneName(analysis.detected[i] ?? 0)} → 목표 ${toneName(t)}`}
              </span>
            ))}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: 0 }}>
            {analysis.ok.every(Boolean) ? "성조 윤곽이 잘 맞아요!" : "표시된 음절의 성조를 다시 연습해 보세요."}
          </p>
        </div>
      )}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
        <button className="btn secondary" type="button" onClick={prev} disabled={idx === 0}>← 이전</button>
        <button className="btn secondary" type="button" onClick={next} disabled={idx >= targets.length - 1}>다음 →</button>
      </div>
    </div>
  );
}

/** 자기상관(autocorrelation) 기반 기본주파수 추정. 무성/무음이면 NaN. */
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) {
    const v = buf[i] as number;
    rms += v * v;
  }
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return NaN; // 너무 조용함

  const minLag = Math.floor(sampleRate / 500);
  const maxLag = Math.floor(sampleRate / 70);
  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < SIZE - lag; i++) corr += (buf[i] as number) * (buf[i + lag] as number);
    corr /= SIZE - lag;
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag <= 0 || bestCorr < 0.0008) return NaN;
  return sampleRate / bestLag;
}
