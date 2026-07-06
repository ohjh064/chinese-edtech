"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { submitQuizScore, getQuizLeaderboard, type Leaderboard } from "@/app/actions/quiz";
import { logStudyAttempts } from "@/app/actions/study";
import { speakOnce, cancelSpeech } from "@/lib/tts";
import type { StudyCard } from "@/components/WordStudyStep1";

const BATCH = 4;
const START = 180; // 초
const HINTS = 3;

interface Pair {
  wordId: string;
  term: string;
  meaning: string;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type Sel = { side: "L" | "R"; wordId: string } | null;

export function MatchGame({ assessmentId, cards }: { assessmentId: string; title: string; cards: StudyCard[] }) {
  const allPairs = useMemo<Pair[]>(
    () =>
      cards
        .filter((c) => c.meanings.length > 0)
        .map((c) => ({ wordId: c.wordId, term: c.term, meaning: c.meanings.join(", ") })),
    [cards],
  );
  const total = allPairs.length;

  const poolRef = useRef<Pair[]>([]);
  const matchedRef = useRef<Set<string>>(new Set()); // 학습 기록: 등장(매칭)한 단어
  const wrongRef = useRef<Set<string>>(new Set()); // 학습 기록: 오답 시도가 있던 단어
  const [batch, setBatch] = useState<Pair[]>([]);
  const [right, setRight] = useState<Pair[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [hintId, setHintId] = useState<string | null>(null);
  const [matched, setMatched] = useState(0);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(START);
  const [hintsLeft, setHintsLeft] = useState(HINTS);
  const [phase, setPhase] = useState<"playing" | "done">("playing");
  const [board, setBoard] = useState<Leaderboard | null>(null);

  const elapsed = START - timeLeft;
  const nextPoints = Math.max(50, 200 - elapsed);
  const remaining = poolRef.current.length + batch.length;

  // 초기화
  useEffect(() => {
    const s = shuffle(allPairs);
    const b = s.slice(0, BATCH);
    poolRef.current = s.slice(BATCH);
    setBatch(b);
    setRight(shuffle(b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 타이머
  useEffect(() => {
    if (phase !== "playing") return;
    if (timeLeft <= 0) { setPhase("done"); return; }
    const t = setTimeout(() => setTimeLeft((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, timeLeft]);

  // 종료 시 점수 제출 + 리더보드
  useEffect(() => {
    if (phase !== "done") return;
    let alive = true;
    // 학습 기록(교사 추적용): 등장한 단어를 오답 여부와 함께 전송
    const engaged = new Set<string>([...matchedRef.current, ...wrongRef.current]);
    void logStudyAttempts(
      assessmentId,
      2,
      [...engaged].map((wordId) => ({ wordId, correct: !wrongRef.current.has(wordId) })),
    );
    (async () => {
      try {
        await submitQuizScore(assessmentId, "match", score, matched, total);
        const b = await getQuizLeaderboard(assessmentId, "match", "best");
        if (alive) setBoard(b);
      } catch {
        /* 무시 */
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => () => cancelSpeech(), []);

  function doMatch(wordId: string) {
    const remainingBefore = poolRef.current.length + batch.length;
    const newCard = poolRef.current.length ? poolRef.current[0] : undefined;
    if (newCard) poolRef.current = poolRef.current.slice(1);

    setBatch((prev) => {
      const i = prev.findIndex((c) => c.wordId === wordId);
      if (i < 0) return prev;
      const copy = [...prev];
      if (newCard) copy[i] = newCard;
      else copy.splice(i, 1);
      return copy;
    });
    setRight((prev) => {
      const i = prev.findIndex((c) => c.wordId === wordId);
      if (i < 0) return prev;
      const copy = [...prev];
      if (newCard) copy[i] = newCard;
      else copy.splice(i, 1);
      return copy;
    });

    matchedRef.current.add(wordId);
    setMatched((m) => m + 1);
    setScore((s) => s + nextPoints);
    const term = batch.find((c) => c.wordId === wordId)?.term;
    if (term) void speakOnce(term);
    setSel(null);
    if (remainingBefore - 1 <= 0) setPhase("done");
  }

  function flashWrong(a: string, b: string) {
    setWrong(new Set([a, b]));
    setSel(null);
    setTimeout(() => setWrong(new Set()), 450);
  }

  function pick(side: "L" | "R", wordId: string) {
    if (phase !== "playing") return;
    if (!sel) { setSel({ side, wordId }); return; }
    if (sel.side === side) { setSel({ side, wordId }); return; } // 같은 열 재선택
    // 서로 다른 열 → 짝 판정(wordId 동일성)
    if (sel.wordId === wordId) doMatch(wordId);
    else {
      wrongRef.current.add(sel.wordId);
      wrongRef.current.add(wordId);
      flashWrong(sel.wordId + sel.side, wordId + side);
    }
  }

  function shuffleRight() {
    if (phase !== "playing") return;
    setRight((r) => shuffle(r));
    setSel(null);
    setTimeLeft((v) => Math.max(0, v - 10));
  }

  function useHint() {
    if (phase !== "playing" || hintsLeft <= 0 || batch.length === 0) return;
    const target = (sel && batch.find((c) => c.wordId === sel.wordId)) || batch[0]!;
    setHintId(target.wordId);
    setHintsLeft((h) => h - 1);
    setTimeout(() => setHintId(null), 1300);
  }

  function restart() {
    cancelSpeech();
    matchedRef.current = new Set();
    wrongRef.current = new Set();
    const s = shuffle(allPairs);
    const b = s.slice(0, BATCH);
    poolRef.current = s.slice(BATCH);
    setBatch(b);
    setRight(shuffle(b));
    setSel(null);
    setWrong(new Set());
    setHintId(null);
    setMatched(0);
    setScore(0);
    setTimeLeft(START);
    setHintsLeft(HINTS);
    setBoard(null);
    setPhase("playing");
  }

  if (total === 0) return <div className="card muted">뜻이 있는 단어가 없어 매칭 게임을 만들 수 없습니다.</div>;

  if (phase === "done") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <b style={{ fontSize: 20 }}>게임 종료</b>
        <p style={{ fontSize: 32, fontWeight: 800, margin: "6px 0" }}>{score}점</p>
        <p className="muted" style={{ fontSize: 13 }}>맞춘 짝 {matched} / {total}</p>
        {board?.myBest != null && <p className="muted" style={{ fontSize: 13 }}>내 최고점 {board.myBest}</p>}
        {board && board.overall.length > 0 && (
          <div style={{ maxWidth: 320, margin: "10px auto", textAlign: "left" }}>
            <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>리더보드(전체)</div>
            {board.overall.slice(0, 5).map((e) => (
              <div key={e.rank} className="row" style={{ justifyContent: "space-between", fontSize: 13, fontWeight: e.isMe ? 700 : 400 }}>
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

  const pct = Math.round((timeLeft / START) * 100);
  const mm = String(Math.floor(timeLeft / 60)).padStart(2, "0");
  const ss = String(timeLeft % 60).padStart(2, "0");

  return (
    <div>
      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 22, fontWeight: 800 }}>{mm}:{ss}</span>
          <span className="muted">다음 매칭 성공 <b className="ok">+{nextPoints}점</b></span>
          <span>SCORE <b>{score}</b></span>
        </div>
        <div style={{ height: 8, background: "#e5e7eb", borderRadius: 8, overflow: "hidden", margin: "8px 0" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: "var(--primary)", transition: "width .3s" }} />
        </div>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>✓ {matched}쌍 · 남은 {remaining}개</span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn secondary" type="button" onClick={shuffleRight}>🔀 카드 섞기 (-10초)</button>
            <button className="btn secondary" type="button" onClick={useHint} disabled={hintsLeft <= 0}>💡 힌트 ({hintsLeft})</button>
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ display: "grid", gap: 10 }}>
          {batch.map((c) => (
            <MatchCell
              key={`L-${c.wordId}`}
              text={c.term}
              onClick={() => pick("L", c.wordId)}
              selected={sel?.side === "L" && sel.wordId === c.wordId}
              wrong={wrong.has(c.wordId + "L")}
              hint={hintId === c.wordId}
            />
          ))}
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {right.map((c) => (
            <MatchCell
              key={`R-${c.wordId}`}
              text={c.meaning}
              onClick={() => pick("R", c.wordId)}
              selected={sel?.side === "R" && sel.wordId === c.wordId}
              wrong={wrong.has(c.wordId + "R")}
              hint={hintId === c.wordId}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchCell({
  text, onClick, selected, wrong, hint,
}: {
  text: string;
  onClick: () => void;
  selected: boolean;
  wrong: boolean;
  hint: boolean;
}) {
  const border = wrong ? "var(--warn, #dc2626)" : hint ? "var(--ok, #16a34a)" : selected ? "var(--primary)" : "var(--border, #e5e7eb)";
  const bg = wrong ? "#fde8e8" : hint ? "#e6f6ec" : selected ? "var(--primary-weak)" : "var(--card, #fff)";
  return (
    <button
      type="button"
      onClick={onClick}
      className="card"
      style={{
        margin: 0, textAlign: "center", cursor: "pointer", minHeight: 64,
        display: "flex", alignItems: "center", justifyContent: "center",
        border: `2px solid ${border}`, background: bg, fontSize: 15, fontWeight: 600, transition: "background .15s, border-color .15s",
      }}
    >
      {text}
    </button>
  );
}
