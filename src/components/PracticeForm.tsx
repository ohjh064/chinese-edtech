"use client";

import { useState } from "react";
import { splitSyllables, normalizeSyllable, toDisplayWord } from "@/grading/pinyin.js";
import {
  gradePracticeAttempt,
  type PracticeAnswerInput,
  type PracticeResult,
} from "@/app/actions/practice";

export interface PracticeWord {
  id: string;
  hanzi: string;
}

function convertPinyin(raw: string): { pinyin: string; tones: number[] } {
  const plains: string[] = [];
  const tones: number[] = [];
  for (const tok of splitSyllables(raw)) {
    const { plain, tone } = normalizeSyllable(tok);
    plains.push(plain);
    tones.push(tone ?? 0);
  }
  return { pinyin: plains.join(" "), tones };
}

export function PracticeForm({
  assessmentId,
  words,
}: {
  assessmentId: string;
  words: PracticeWord[];
}) {
  const [inputs, setInputs] = useState<Record<string, { pinyin: string; meaning: string }>>(
    () => Object.fromEntries(words.map((w) => [w.id, { pinyin: "", meaning: "" }])),
  );
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<{ pinyin: string; meaning: string }>) {
    setInputs((s) => ({ ...s, [id]: { ...s[id]!, ...patch } }));
  }

  async function grade(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const payload: PracticeAnswerInput[] = words.map((w) => {
      const raw = inputs[w.id]!;
      const { pinyin, tones } = convertPinyin(raw.pinyin);
      return {
        wordId: w.id,
        studentPinyin: pinyin,
        studentTones: tones,
        studentMeaning: raw.meaning,
      };
    });
    try {
      const r = await gradePracticeAttempt(assessmentId, payload);
      setResult(r);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "채점 실패");
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    setResult(null);
  }

  const fbByWord = result
    ? new Map(result.words.map((w) => [w.wordId, w]))
    : null;

  return (
    <form onSubmit={grade}>
      {result && (
        <div className="card" style={{ background: "var(--primary-weak)" }}>
          <b>연습 결과</b> — 병음 {result.pinyinScore}/25 · 성조 {result.toneScore}/25
          <div className="muted" style={{ fontSize: 13 }}>
            {result.reveal ? "정답이 함께 표시됩니다." : "정답은 비공개(교사 설정)입니다."} 무제한
            연습 가능 — 틀린 부분을 고쳐 다시 풀어보세요.
          </div>
          <button type="button" className="btn" style={{ marginTop: 8 }} onClick={retry}>
            다시 풀기
          </button>
        </div>
      )}

      <div className="card row" style={{ justifyContent: "space-between" }}>
        <span className="muted">
          성조는 숫자로 — 예: <code>ni3 hao3</code> → nǐ hǎo
        </span>
        <span className="badge">연습 모드</span>
      </div>

      {words.map((w, i) => {
        const raw = inputs[w.id]!;
        const fb = fbByWord?.get(w.id);
        const preview = raw.pinyin ? toDisplayWord(raw.pinyin) : "";
        return (
          <div className="card" key={w.id}>
            <div className="row" style={{ alignItems: "baseline", justifyContent: "space-between" }}>
              <div className="row" style={{ alignItems: "baseline" }}>
                <span className="muted">{i + 1}.</span>
                <span style={{ fontSize: 26, fontWeight: 700 }}>{w.hanzi}</span>
              </div>
              {fb && (
                <div className="row">
                  <Mark ok={fb.pinyinOk} label="병음" />
                  <Mark ok={fb.toneOk} label="성조" />
                  <Mark ok={fb.meaningOk} label="의미" />
                </div>
              )}
            </div>

            <div className="row">
              <div className="field grow">
                <label>병음 + 성조(숫자)</label>
                <input
                  value={raw.pinyin}
                  onChange={(e) => update(w.id, { pinyin: e.target.value })}
                  placeholder="ni3 hao3"
                  autoComplete="off"
                />
                <span className="pill-preview" style={{ color: "var(--primary)" }}>
                  {preview || " "}
                </span>
              </div>
              <div className="field grow">
                <label>의미(한국어)</label>
                <input value={raw.meaning} onChange={(e) => update(w.id, { meaning: e.target.value })} />
              </div>
            </div>

            {fb && fb.issues.length > 0 && (
              <ul className="error" style={{ fontSize: 13, marginTop: 4 }}>
                {fb.issues.map((iss, idx) => (
                  <li key={idx}>{iss.message}</li>
                ))}
              </ul>
            )}
            {fb?.correctDisplay && (
              <p className="ok" style={{ fontSize: 13 }}>
                정답: {fb.correctDisplay}
                {fb.acceptableMeanings?.length ? ` · 의미: ${fb.acceptableMeanings.join(", ")}` : ""}
              </p>
            )}
          </div>
        );
      })}

      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={busy}>
        {busy ? "채점 중…" : "채점하기"}
      </button>
    </form>
  );
}

function Mark({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        background: ok ? "#e6f4ea" : "#fae6e3",
        color: ok ? "var(--ok)" : "var(--primary)",
      }}
    >
      {label} {ok ? "✓" : "✗"}
    </span>
  );
}
