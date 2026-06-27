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
  errorPrompt?: string | null;
}

type SentenceTaskType = "compose" | "find_error" | "judge";

interface RawInput {
  pinyin: string;
  meaning: string;
  sentence: string;
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
  sentenceTaskType,
}: {
  assessmentId: string;
  words: PracticeWord[];
  sentenceTaskType: SentenceTaskType;
}) {
  const [inputs, setInputs] = useState<Record<string, RawInput>>(() =>
    Object.fromEntries(words.map((w) => [w.id, { pinyin: "", meaning: "", sentence: "" }])),
  );
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(id: string, patch: Partial<RawInput>) {
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
        studentSentence: raw.sentence,
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

  const fbByWord = result ? new Map(result.words.map((w) => [w.wordId, w])) : null;

  return (
    <form onSubmit={grade}>
      {result && (
        <div className="card" style={{ background: "var(--primary-weak)" }}>
          <b>연습 결과</b> — 병음 {result.pinyinScore}/25 · 성조 {result.toneScore}/25 · 의미{" "}
          {result.meaningScore}/25 · 문장 {result.sentenceScore}/25
          <div className="muted" style={{ fontSize: 13 }}>
            {result.aiUsed
              ? "AI 코칭이 적용되었습니다(의미·문장)."
              : "AI 미적용 — 교사가 설정에서 API 키를 넣으면 의미·문장 코칭이 제공됩니다."}{" "}
            {result.reveal ? "정답이 함께 표시됩니다." : "정답은 비공개입니다."} 무제한 연습 —
            틀린 부분을 고쳐 다시 풀어보세요.
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
                  <Mark ok={fb.sentenceOk} label="문장" />
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

            {sentenceTaskType === "find_error" && w.errorPrompt && (
              <p className="muted" style={{ fontSize: 13 }}>제시 문장(오류 포함): {w.errorPrompt}</p>
            )}
            {sentenceTaskType === "judge" ? (
              <div className="field">
                {w.errorPrompt && (
                  <p style={{ fontSize: 17, margin: "4px 0 8px" }}>제시 문장: {w.errorPrompt}</p>
                )}
                <label>이 문장이 어법에 맞습니까?</label>
                <div className="row">
                  <label style={{ display: "flex", gap: 6, alignItems: "center", width: "auto" }}>
                    <input
                      type="radio"
                      name={`pjudge-${w.id}`}
                      style={{ width: "auto" }}
                      checked={raw.sentence === "O"}
                      onChange={() => update(w.id, { sentence: "O" })}
                    />
                    맞음 (O)
                  </label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", width: "auto" }}>
                    <input
                      type="radio"
                      name={`pjudge-${w.id}`}
                      style={{ width: "auto" }}
                      checked={raw.sentence === "X"}
                      onChange={() => update(w.id, { sentence: "X" })}
                    />
                    안 맞음 (X)
                  </label>
                </div>
              </div>
            ) : (
              <div className="field">
                <label>
                  {sentenceTaskType === "find_error"
                    ? "오류를 고친 문장"
                    : `이 단어(${w.hanzi})로 어법에 맞는 문장 작성`}
                </label>
                <textarea
                  rows={2}
                  value={raw.sentence}
                  onChange={(e) => update(w.id, { sentence: e.target.value })}
                />
              </div>
            )}

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

function Mark({ ok, label }: { ok: boolean | null; label: string }) {
  const neutral = ok === null;
  return (
    <span
      style={{
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 999,
        background: neutral ? "#eee" : ok ? "#e6f4ea" : "#fae6e3",
        color: neutral ? "var(--muted)" : ok ? "var(--ok)" : "var(--primary)",
      }}
    >
      {label} {neutral ? "—" : ok ? "✓" : "✗"}
    </span>
  );
}
