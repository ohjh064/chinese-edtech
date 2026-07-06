"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { submitQuizScore, getQuizLeaderboard, type Leaderboard } from "@/app/actions/quiz";
import { logStudyAttempts, type StudyAttempt } from "@/app/actions/study";
import { speakOnce, cancelSpeech } from "@/lib/tts";
import { convertPinyin } from "@/lib/pinyin-input";
import { toDisplayWord, splitSyllables } from "@/grading/pinyin.js";
import { gradePinyin } from "@/grading/pinyinGrader.js";
import { gradeTones } from "@/grading/toneGrader.js";
import { DEFAULT_CONFIG } from "@/grading/scale.js";
import type { StudentAnswer, WordKey } from "@/grading/types.js";
import type { StudyCard } from "@/components/WordStudyStep1";

interface Target {
  wordId: string;
  term: string;
  meanings: string[];
  pinyinRaw: string;
  tones: number[];
  syllableCount: number;
  hasToneData: boolean; // tones 길이가 음절 수와 일치할 때만 성조 채점
  display: string; // "lín jū" (성조부호 정답)
}

export function WordWritingStep5({
  assessmentId,
  cards,
}: {
  assessmentId: string;
  cards: StudyCard[];
}) {
  const targets = useMemo<Target[]>(() => {
    return cards
      .filter((c) => c.pinyinRaw.trim().length > 0 && c.meanings.length > 0)
      .map((c) => {
        const syls = splitSyllables(c.pinyinRaw);
        const hasToneData = c.tones.length === syls.length;
        return {
          wordId: c.wordId,
          term: c.term,
          meanings: c.meanings,
          pinyinRaw: c.pinyinRaw,
          tones: c.tones,
          syllableCount: syls.length,
          hasToneData,
          display: toDisplayWord(c.pinyinRaw, hasToneData ? c.tones : undefined),
        };
      });
  }, [cards]);

  const total = targets.length;

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [correctWords, setCorrectWords] = useState(0);
  const [phase, setPhase] = useState<"playing" | "done">("playing");
  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [roundKey, setRoundKey] = useState(0);
  const attemptsRef = useRef<StudyAttempt[]>([]); // 학습 기록 누적(단어별 정오답)

  useEffect(() => () => cancelSpeech(), []);

  // 종료 시 점수 제출 + 리더보드
  useEffect(() => {
    if (phase !== "done") return;
    let alive = true;
    (async () => {
      try {
        await submitQuizScore(assessmentId, "writing", score, correctWords, total);
        const b = await getQuizLeaderboard(assessmentId, "writing", "best");
        if (alive) setBoard(b);
      } catch {
        /* 무시 */
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (total === 0) {
    return <div className="card muted">병음과 뜻이 모두 있는 단어가 없어 Writing을 만들 수 없습니다.</div>;
  }

  function handleComplete(gained: number, fullyCorrect: boolean) {
    cancelSpeech();
    const cur = targets[idx];
    if (cur) attemptsRef.current.push({ wordId: cur.wordId, correct: fullyCorrect });
    setScore((s) => s + gained);
    if (fullyCorrect) setCorrectWords((n) => n + 1);
    if (idx + 1 < total) setIdx(idx + 1);
    else {
      void logStudyAttempts(assessmentId, 5, attemptsRef.current);
      setPhase("done");
    }
  }

  function restart() {
    cancelSpeech();
    attemptsRef.current = [];
    setIdx(0);
    setScore(0);
    setCorrectWords(0);
    setBoard(null);
    setRoundKey((k) => k + 1);
    setPhase("playing");
  }

  if (phase === "done") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <b style={{ fontSize: 20 }}>Writing 완료</b>
        <p style={{ fontSize: 32, fontWeight: 800, margin: "6px 0" }}>{score}점</p>
        <p className="muted" style={{ fontSize: 13 }}>완전 정답 {correctWords} / {total}</p>
        {board?.myBest != null && <p className="muted" style={{ fontSize: 13 }}>내 최고점 {board.myBest}</p>}
        {board && board.overall.length > 0 && (
          <div style={{ maxWidth: 320, margin: "10px auto", textAlign: "left" }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>리더보드(전체)</div>
            {board.overall.slice(0, 5).map((e) => (
              <div
                key={e.rank}
                className="row"
                style={{ justifyContent: "space-between", fontSize: 13, fontWeight: e.isMe ? 700 : 400 }}
              >
                <span>{e.rank}. {e.maskedName}{e.isMe ? " (나)" : ""}</span>
                <span>{e.score}</span>
              </div>
            ))}
          </div>
        )}
        <button className="btn" type="button" onClick={restart}>다시 하기</button>
      </div>
    );
  }

  const target = targets[idx]!;
  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="badge">5단계 · Writing</span>
        <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {total}</span>
        <span>SCORE <b>{score}</b></span>
      </div>
      <WritingWord
        key={`${roundKey}-${idx}-${target.wordId}`}
        target={target}
        index={idx}
        total={total}
        onComplete={handleComplete}
      />
    </div>
  );
}

interface Result {
  gained: number;
  pinyinOk: boolean;
  toneOk: boolean;
  issues: string[];
}

function WritingWord({
  target,
  index,
  total,
  onComplete,
}: {
  target: Target;
  index: number;
  total: number;
  onComplete: (gained: number, fullyCorrect: boolean) => void;
}) {
  const [typed, setTyped] = useState("");
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const preview = typed.trim() ? toDisplayWord(typed) : "";

  function check() {
    if (checked || !typed.trim()) return;
    const { pinyin, tones } = convertPinyin(typed);
    const answer: StudentAnswer = { wordId: target.wordId, studentPinyin: pinyin, studentTones: tones };
    const key: WordKey = {
      id: target.wordId,
      hanzi: target.term,
      correctPinyin: target.pinyinRaw,
      correctTones: target.tones,
      acceptableMeanings: target.meanings,
    };
    const pRes = gradePinyin([answer], [key], DEFAULT_CONFIG);
    const pinyinOk = (pRes.details[0]?.errors ?? 0) === 0;
    const pIssues = pRes.details[0]?.issues ?? [];

    let toneOk = true;
    let toneErrors = 0;
    let tIssues: typeof pIssues = [];
    if (target.hasToneData) {
      const tRes = gradeTones([answer], [key]);
      toneErrors = tRes.details[0]?.errors ?? 0;
      toneOk = toneErrors === 0;
      tIssues = tRes.details[0]?.issues ?? [];
    }

    const correctTones = target.hasToneData ? Math.max(0, target.tones.length - toneErrors) : 0;
    const gained = (pinyinOk ? 100 : 0) + correctTones * 20;
    const issues = [...pIssues, ...tIssues].map((i) => i.message);

    setResult({ gained, pinyinOk, toneOk, issues });
    setChecked(true);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !checked && typed.trim()) {
      e.preventDefault();
      check();
    }
  }

  const fullyCorrect = !!result && result.pinyinOk && result.toneOk;

  return (
    <>
      <div className="card" style={{ textAlign: "center", padding: "22px 16px" }}>
        <div className="muted" style={{ fontSize: 13 }}>이 뜻의 중국어 병음을 성조까지 써보세요</div>
        <div style={{ fontSize: 34, fontWeight: 800, margin: "6px 0 2px" }}>{target.meanings.join(", ")}</div>
        <div className="muted" style={{ fontSize: 13 }}>총 {target.syllableCount}음절</div>
      </div>

      <div className="card">
        <label htmlFor="writing-input">병음 + 성조(숫자)</label>
        <input
          id="writing-input"
          ref={inputRef}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          onKeyDown={onKey}
          readOnly={checked}
          placeholder="lin2 ju1"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
        />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <span className="muted" style={{ fontSize: 12 }}>성조는 숫자로, 음절은 띄어쓰기 — 예: lin2 ju1</span>
          {preview && <span className="pill-preview" style={{ color: "var(--primary)" }}>{preview}</span>}
        </div>

        <div className="row" style={{ justifyContent: "center", marginTop: 14 }}>
          {!checked ? (
            <button className="btn" type="button" onClick={check} disabled={!typed.trim()}>확인</button>
          ) : (
            <button className="btn" type="button" onClick={() => onComplete(result!.gained, fullyCorrect)}>
              {index + 1 < total ? "다음 →" : "결과 보기"}
            </button>
          )}
        </div>

        {checked && result && (
          <div
            className="card"
            style={{
              marginTop: 12,
              marginBottom: 0,
              background: fullyCorrect ? "#e6f6ec" : "#fff6ed",
              textAlign: "center",
            }}
          >
            <div style={{ fontWeight: 700, color: fullyCorrect ? "var(--ok)" : "var(--warn)" }}>
              {fullyCorrect ? "정답이에요! 🎉" : "정답을 확인해요"}
            </div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              병음 {result.pinyinOk ? "✓" : "✗"}
              {target.hasToneData ? ` · 성조 ${result.toneOk ? "✓" : "✗"}` : ""}
            </div>
            {result.issues.length > 0 && (
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{result.issues.join(" · ")}</div>
            )}
            <div className="row" style={{ justifyContent: "center", alignItems: "center", gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 22, fontWeight: 800 }}>{target.term}</span>
              <span className="pill-preview" style={{ fontWeight: 700 }}>{target.display}</span>
              <button className="btn secondary" type="button" onClick={() => void speakOnce(target.term)} style={{ padding: "4px 10px" }}>🔊</button>
            </div>
            <div style={{ fontSize: 14, marginTop: 2 }}>{target.meanings.join(", ")}</div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>+{result.gained}점</div>
          </div>
        )}
      </div>
    </>
  );
}
