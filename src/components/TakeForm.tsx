"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { splitSyllables, toDisplayWord } from "@/grading/pinyin.js";
import { convertPinyin } from "@/lib/pinyin-input";
import {
  startSubmission,
  submitAnswers,
  saveDraft,
  getDraft,
  type AnswerInput,
} from "@/app/actions/student";

export interface TakeWord {
  id: string;
  ord: number;
  hanzi: string;
  errorPrompt: string | null;
}

interface RawAnswer {
  pinyin: string; // "ni3 hao3" 형식 입력
  meaning: string;
  sentence: string;
}

/** 저장된 plain 병음 + 성조배열 → 입력 표시용 "ni3 hao3" (경성은 숫자 생략) */
function buildRawPinyin(pinyin: string, tones: number[]): string {
  return splitSyllables(pinyin)
    .map((syl, i) => {
      const t = tones[i] ?? 0;
      return t > 0 ? `${syl}${t}` : syl;
    })
    .join(" ");
}

export function TakeForm({
  assessmentId,
  words,
  sentenceTaskType,
  timeLimitSec,
  proctoring,
}: {
  assessmentId: string;
  words: TakeWord[];
  sentenceTaskType: "compose" | "find_error" | "judge";
  timeLimitSec: number | null;
  proctoring: boolean;
}) {
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, RawAnswer>>(() =>
    Object.fromEntries(words.map((w) => [w.id, { pinyin: "", meaning: "", sentence: "" }])),
  );
  const [remaining, setRemaining] = useState<number | null>(timeLimitSec);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tabSwitches, setTabSwitches] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // 자동저장이 최신 답안을 읽도록 ref 동기화(인터벌 클로저 신선도)
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const submissionRef = useRef<string | null>(null);

  function buildPayload(): AnswerInput[] {
    const cur = answersRef.current;
    return words.map((w) => {
      const raw = cur[w.id] ?? { pinyin: "", meaning: "", sentence: "" };
      const { pinyin, tones } = convertPinyin(raw.pinyin);
      return {
        wordId: w.id,
        studentPinyin: pinyin,
        studentTones: tones,
        studentMeaning: raw.meaning,
        studentSentence: raw.sentence,
      };
    });
  }

  // 응시 시작 + 임시 답안 복원(이어서 응시)
  useEffect(() => {
    let cancelled = false;
    startSubmission(assessmentId)
      .then(async (sid) => {
        if (cancelled) return;
        setSubmissionId(sid);
        submissionRef.current = sid;
        try {
          const draft = await getDraft(sid);
          if (cancelled || draft.length === 0) return;
          setAnswers((prev) => {
            const next = { ...prev };
            for (const d of draft) {
              if (!next[d.wordId]) continue;
              next[d.wordId] = {
                pinyin: buildRawPinyin(d.studentPinyin, d.studentTones),
                meaning: d.studentMeaning,
                sentence: d.studentSentence,
              };
            }
            return next;
          });
        } catch {
          /* 복원 실패 무시 */
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "응시 시작 실패"));
    return () => {
      cancelled = true;
    };
  }, [assessmentId]);

  // 자동 임시저장(12초 주기) — PRD §12
  useEffect(() => {
    const timer = setInterval(() => {
      const sid = submissionRef.current;
      if (!sid) return;
      saveDraft(sid, buildPayload())
        .then(() =>
          setSavedAt(
            new Date().toLocaleTimeString("ko-KR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          ),
        )
        .catch(() => {});
    }, 12000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 타이머
  useEffect(() => {
    if (remaining === null) return;
    if (remaining <= 0) {
      void handleSubmit();
      return;
    }
    const t = setTimeout(() => setRemaining((r) => (r === null ? null : r - 1)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  // 부정행위 방지(탭 이탈 감지)
  useEffect(() => {
    if (!proctoring) return;
    const onHide = () => {
      if (document.visibilityState === "hidden") setTabSwitches((n) => n + 1);
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [proctoring]);

  function update(wordId: string, patch: Partial<RawAnswer>) {
    setAnswers((a) => ({ ...a, [wordId]: { ...a[wordId]!, ...patch } }));
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!submissionId || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitAnswers(submissionId, buildPayload());
    } catch (err) {
      if (err && typeof err === "object" && "digest" in err) return; // redirect
      setError(err instanceof Error ? err.message : "제출 실패");
      setSubmitting(false);
    }
  }

  const mmss = useMemo(() => {
    if (remaining === null) return null;
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }, [remaining]);

  return (
    <form onSubmit={handleSubmit}>
      <div className="card row" style={{ justifyContent: "space-between", position: "sticky", top: 0, zIndex: 1 }}>
        <span className="muted">성조는 숫자로 입력하세요 — 예: <code>ni3 hao3</code> → 미리보기 nǐ hǎo</span>
        <span className="row" style={{ alignItems: "center" }}>
          {savedAt && <span className="muted" style={{ fontSize: 12 }}>임시저장 {savedAt}</span>}
          {mmss && <span className="badge">남은 시간 {mmss}</span>}
        </span>
      </div>

      {proctoring && tabSwitches > 0 && (
        <p className="error">⚠ 화면 이탈 {tabSwitches}회 감지됨 (교사에게 기록될 수 있습니다)</p>
      )}

      {words.map((w, i) => {
        const raw = answers[w.id]!;
        const preview = raw.pinyin ? toDisplayWord(raw.pinyin) : "";
        return (
          <div className="card" key={w.id}>
            <div className="row" style={{ alignItems: "baseline" }}>
              <span className="muted">{i + 1}.</span>
              <span style={{ fontSize: 26, fontWeight: 700 }}>{w.hanzi}</span>
              {(sentenceTaskType === "compose" || sentenceTaskType === "judge") && (
                <span className="badge">제시 단어</span>
              )}
            </div>
            {sentenceTaskType === "find_error" && w.errorPrompt && (
              <p className="muted">제시 문장(오류 포함): {w.errorPrompt}</p>
            )}
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
                  {preview || " "}
                </span>
              </div>
              <div className="field grow">
                <label>의미(한국어)</label>
                <input value={raw.meaning} onChange={(e) => update(w.id, { meaning: e.target.value })} />
              </div>
            </div>
            {sentenceTaskType === "judge" ? (
              <div className="field">
                {w.errorPrompt && (
                  <p style={{ fontSize: 18, margin: "4px 0 8px" }}>
                    제시 문장: {w.errorPrompt}
                  </p>
                )}
                <label>이 문장이 어법에 맞습니까?</label>
                <div className="row">
                  <label style={{ display: "flex", gap: 6, alignItems: "center", width: "auto" }}>
                    <input
                      type="radio"
                      name={`judge-${w.id}`}
                      style={{ width: "auto" }}
                      checked={raw.sentence === "O"}
                      onChange={() => update(w.id, { sentence: "O" })}
                    />
                    맞음 (O)
                  </label>
                  <label style={{ display: "flex", gap: 6, alignItems: "center", width: "auto" }}>
                    <input
                      type="radio"
                      name={`judge-${w.id}`}
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
                    : `이 단어(${w.hanzi})를 활용하여 어법에 맞는 문장을 작성하세요`}
                </label>
                <textarea
                  rows={2}
                  value={raw.sentence}
                  onChange={(e) => update(w.id, { sentence: e.target.value })}
                  placeholder={
                    sentenceTaskType === "compose"
                      ? `${w.hanzi}(을)를 넣어 문장을 만들어 보세요`
                      : undefined
                  }
                />
                {sentenceTaskType === "compose" && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {raw.sentence.length}자 · 어법(어순·양사·시제 등) 오류 수로 채점됩니다
                  </span>
                )}
              </div>
            )}
          </div>
        );
      })}

      {error && <p className="error">{error}</p>}
      <button className="btn" type="submit" disabled={!submissionId || submitting}>
        {submitting ? "제출 중…" : "제출하기"}
      </button>
      <p className="muted" style={{ fontSize: 12 }}>
        제출 후에는 수정할 수 없습니다. 병음·성조는 즉시 자동채점됩니다.
      </p>
    </form>
  );
}
