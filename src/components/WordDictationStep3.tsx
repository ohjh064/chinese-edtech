"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { submitQuizScore, getQuizLeaderboard, type Leaderboard } from "@/app/actions/quiz";
import { logStudyAttempts, type StudyAttempt } from "@/app/actions/study";
import { speakOnce, cancelSpeech } from "@/lib/tts";
import { toDisplayWord } from "@/grading/pinyin.js";
import type { StudyCard } from "@/components/WordStudyStep1";

// 성조 선택 버튼(경성=0)
const TONE_LABELS: { value: number; label: string }[] = [
  { value: 1, label: "1성" },
  { value: 2, label: "2성" },
  { value: 3, label: "3성" },
  { value: 4, label: "4성" },
  { value: 0, label: "경성" },
];

interface Slot {
  syl: number; // 음절 index
  char: string; // 정답 글자(소문자, ü→v)
}

interface Target {
  wordId: string;
  term: string;
  meanings: string[];
  syllables: string[]; // ["ni", "hao"]
  tones: number[]; // [3, 3] (경성=0)
  hasToneData: boolean; // tones 길이가 음절 수와 일치할 때만 성조 채점
  display: string; // "nǐ hǎo"
  slots: Slot[]; // 전체 글자 칸(평탄)
  sylSlots: number[][]; // 음절별 slots 전역 index 묶음
}

/** 입력/정답 글자 정규화: 소문자, ü→v, 알파벳 외 제거 */
function normChar(ch: string): string {
  return ch
    .toLowerCase()
    .replace(/ü/g, "v")
    .replace(/[^a-z]/g, "");
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** 음절마다 최소 1칸은 빈칸으로 남기고, 전체 약 40%를 힌트로 노출 */
function buildRevealMask(slots: Slot[]): boolean[] {
  const mask = new Array<boolean>(slots.length).fill(false);
  const blanksLeft = new Map<number, number>();
  for (const s of slots) blanksLeft.set(s.syl, (blanksLeft.get(s.syl) ?? 0) + 1);
  const wantReveal = Math.round(slots.length * 0.4);
  let revealed = 0;
  for (const i of shuffle(slots.map((_, k) => k))) {
    if (revealed >= wantReveal) break;
    const syl = slots[i]!.syl;
    if ((blanksLeft.get(syl) ?? 0) <= 1) continue; // 마지막 빈칸은 남긴다
    mask[i] = true;
    blanksLeft.set(syl, blanksLeft.get(syl)! - 1);
    revealed++;
  }
  return mask;
}

export function WordDictationStep3({
  assessmentId,
  cards,
}: {
  assessmentId: string;
  cards: StudyCard[];
}) {
  const targets = useMemo<Target[]>(() => {
    return cards
      .filter((c) => c.pinyinRaw.trim().length > 0)
      .map((c) => {
        const syllables = c.pinyinRaw.trim().split(/\s+/).map((s) => s.toLowerCase());
        const slots: Slot[] = [];
        const sylSlots: number[][] = syllables.map(() => []);
        syllables.forEach((syl, si) => {
          for (const ch of syl) {
            const nc = normChar(ch);
            if (!nc) continue;
            sylSlots[si]!.push(slots.length);
            slots.push({ syl: si, char: nc });
          }
        });
        const hasToneData = c.tones.length === syllables.length;
        return {
          wordId: c.wordId,
          term: c.term,
          meanings: c.meanings,
          syllables,
          tones: c.tones,
          hasToneData,
          display: toDisplayWord(c.pinyinRaw, hasToneData ? c.tones : undefined),
          slots,
          sylSlots,
        };
      })
      .filter((t) => t.slots.length > 0);
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
        await submitQuizScore(assessmentId, "dictation", score, correctWords, total);
        const b = await getQuizLeaderboard(assessmentId, "dictation", "best");
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
    return <div className="card muted">병음이 있는 단어가 없어 딕테이션을 만들 수 없습니다.</div>;
  }

  function handleComplete(gained: number, fullyCorrect: boolean) {
    cancelSpeech();
    const cur = targets[idx];
    if (cur) attemptsRef.current.push({ wordId: cur.wordId, correct: fullyCorrect });
    setScore((s) => s + gained);
    if (fullyCorrect) setCorrectWords((n) => n + 1);
    if (idx + 1 < total) setIdx(idx + 1);
    else {
      void logStudyAttempts(assessmentId, 3, attemptsRef.current);
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
        <b style={{ fontSize: 20 }}>딕테이션 완료</b>
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
        <span className="badge">3단계 · 딕테이션</span>
        <span className="muted" style={{ fontSize: 13 }}>{idx + 1} / {total}</span>
        <span>SCORE <b>{score}</b></span>
      </div>
      <DictationWord
        key={`${roundKey}-${idx}-${target.wordId}`}
        target={target}
        index={idx}
        total={total}
        onComplete={handleComplete}
      />
    </div>
  );
}

function DictationWord({
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
  const [reveal] = useState<boolean[]>(() => buildRevealMask(target.slots));
  const [letters, setLetters] = useState<string[]>(() =>
    target.slots.map((s, i) => (reveal[i] ? s.char : "")),
  );
  const [selTones, setSelTones] = useState<(number | null)[]>(() =>
    new Array(target.syllables.length).fill(null),
  );
  const [checked, setChecked] = useState(false);
  const [result, setResult] = useState<{ gained: number; pinyinOk: boolean; tonesOk: boolean } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // 마운트(단어 진입) 시 자동 재생 + 첫 빈칸 포커스. key 교체로 단어마다 remount됨.
  useEffect(() => {
    void speakOnce(target.term);
    const first = reveal.findIndex((r) => !r);
    if (first >= 0) setTimeout(() => inputRefs.current[first]?.focus(), 0);
    return () => cancelSpeech();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lettersComplete = target.slots.every((_, i) => reveal[i] || (letters[i] ?? "").length > 0);
  const tonesComplete = !target.hasToneData || selTones.every((t) => t !== null);

  function focusBlank(from: number, dir: 1 | -1) {
    for (let i = from + dir; i >= 0 && i < reveal.length; i += dir) {
      if (!reveal[i]) {
        const el = inputRefs.current[i];
        el?.focus();
        el?.select();
        return;
      }
    }
  }

  function onInput(i: number, v: string) {
    if (checked || reveal[i]) return;
    const ch = normChar(v.slice(-1));
    setLetters((prev) => {
      const c = [...prev];
      c[i] = ch;
      return c;
    });
    if (ch) focusBlank(i, 1);
  }

  function onKey(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !(letters[i] ?? "")) {
      e.preventDefault();
      focusBlank(i, -1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusBlank(i, -1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      focusBlank(i, 1);
    } else if (e.key === "Enter" && lettersComplete && tonesComplete && !checked) {
      check();
    }
  }

  function check() {
    if (checked) return;
    const pinyinOk = target.slots.every((s, i) => (letters[i] ?? "").toLowerCase() === s.char);
    let toneCorrect = 0;
    if (target.hasToneData) {
      target.tones.forEach((t, i) => {
        if (selTones[i] === t) toneCorrect++;
      });
    }
    const tonesOk = !target.hasToneData || toneCorrect === target.tones.length;
    const gained = (pinyinOk ? 100 : 0) + toneCorrect * 20;
    setResult({ gained, pinyinOk, tonesOk });
    setChecked(true);
  }

  const fullyCorrect = !!result && result.pinyinOk && result.tonesOk;

  return (
    <>
      <div className="card" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>{target.term}</div>
        <button className="btn secondary" type="button" onClick={() => void speakOnce(target.term)} style={{ marginTop: 10 }}>
          🔊 다시듣기
        </button>
        <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>발음을 듣고 병음 철자를 채운 뒤 성조를 골라요.</p>
      </div>

      <div className="card">
        <div className="row" style={{ gap: 20, justifyContent: "center", alignItems: "flex-start" }}>
          {target.sylSlots.map((slotIdxs, si) => (
            <div key={si} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", gap: 6 }}>
                {slotIdxs.map((slotIdx) => {
                  const revealed = reveal[slotIdx];
                  const correct = target.slots[slotIdx]!.char;
                  const val = revealed ? correct : (letters[slotIdx] ?? "");
                  const wrong = checked && !revealed && val.toLowerCase() !== correct;
                  const okCell = checked && !revealed && !wrong;
                  const border = wrong ? "var(--warn)" : okCell ? "var(--ok)" : "var(--border)";
                  return (
                    <input
                      key={slotIdx}
                      ref={(el) => {
                        inputRefs.current[slotIdx] = el;
                      }}
                      value={val}
                      maxLength={1}
                      readOnly={revealed || checked}
                      inputMode="text"
                      autoCapitalize="none"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => onInput(slotIdx, e.target.value)}
                      onKeyDown={(e) => onKey(slotIdx, e)}
                      aria-label={`${si + 1}번째 음절 ${slotIdxs.indexOf(slotIdx) + 1}번째 글자`}
                      style={{
                        width: 40,
                        height: 48,
                        padding: 0,
                        textAlign: "center",
                        fontSize: 22,
                        fontWeight: 700,
                        background: revealed ? "#f1f5f9" : "#fff",
                        borderColor: border,
                        color: wrong ? "var(--warn)" : "var(--text)",
                      }}
                    />
                  );
                })}
              </div>
              {target.hasToneData && (
                <div style={{ display: "flex", gap: 3 }}>
                  {TONE_LABELS.map(({ value, label }) => {
                    const selected = selTones[si] === value;
                    const isAnswer = checked && value === target.tones[si];
                    const isWrongSel = checked && selected && value !== target.tones[si];
                    const bg = isAnswer ? "#e6f6ec" : isWrongSel ? "#fde8e8" : selected ? "var(--primary-weak)" : "#fff";
                    const bc = isAnswer ? "var(--ok)" : isWrongSel ? "var(--warn)" : selected ? "var(--primary)" : "var(--border)";
                    const disabled = !lettersComplete || checked;
                    return (
                      <button
                        key={value}
                        type="button"
                        disabled={disabled}
                        title={label}
                        onClick={() =>
                          setSelTones((prev) => {
                            const c = [...prev];
                            c[si] = value;
                            return c;
                          })
                        }
                        style={{
                          minWidth: 26,
                          height: 30,
                          padding: "0 4px",
                          borderRadius: 6,
                          border: `1px solid ${bc}`,
                          background: bg,
                          cursor: disabled ? "not-allowed" : "pointer",
                          fontSize: 12,
                          fontWeight: 600,
                          opacity: disabled && !checked ? 0.45 : 1,
                        }}
                      >
                        {value === 0 ? "경" : value}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
          {!checked ? (
            <button className="btn" type="button" onClick={check} disabled={!lettersComplete || !tonesComplete}>
              확인
            </button>
          ) : (
            <button className="btn" type="button" onClick={() => onComplete(result!.gained, fullyCorrect)}>
              {index + 1 < total ? "다음 →" : "결과 보기"}
            </button>
          )}
        </div>

        {checked && (
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
            <div style={{ marginTop: 6 }}>
              <span className="pill-preview" style={{ fontWeight: 700 }}>{target.display}</span>
              {target.meanings.length > 0 && <span className="muted"> — {target.meanings.join(", ")}</span>}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>+{result!.gained}점</div>
          </div>
        )}
      </div>
    </>
  );
}
