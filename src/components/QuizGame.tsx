"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getQuizQuestions,
  submitQuizScore,
  getQuizLeaderboard,
  type Leaderboard,
} from "@/app/actions/quiz";
import type { QuizMode, QuizDirection, QuizQuestion } from "@/lib/quiz-gen";
import { SpeakButton } from "@/components/SpeakButton";

const MODES: { key: QuizMode; label: string }[] = [
  { key: "meaning", label: "의미" },
  { key: "pinyin", label: "병음" },
  { key: "tone", label: "성조" },
  { key: "sentence", label: "문장" },
];

const TOTAL_OPTIONS = [60, 120, 180, 240, 300, 0]; // 0 = 무제한

function shuffleIdx(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

type Phase = "setup" | "playing" | "done";

export function QuizGame({ assessmentId, title }: { assessmentId: string; title: string }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [mode, setMode] = useState<QuizMode>("meaning");
  const [direction, setDirection] = useState<QuizDirection>("forward");
  const [perQLimit, setPerQLimit] = useState(8);
  const [totalLimit, setTotalLimit] = useState(180); // 초, 0=무제한
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 게임 상태
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const queueRef = useRef<number[]>([]);
  const [current, setCurrent] = useState<QuizQuestion | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const answeredRef = useRef(false);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [perQLeft, setPerQLeft] = useState(8);
  const [totalLeft, setTotalLeft] = useState<number | null>(null);

  const [board, setBoard] = useState<Leaderboard | null>(null);
  const [boardScope, setBoardScope] = useState<"best" | "today">("best");
  const [boardTab, setBoardTab] = useState<"overall" | "klass">("overall");

  const usesDirection = mode === "meaning" || mode === "pinyin";

  const loadBoard = useCallback(
    async (m: QuizMode, scope: "best" | "today") => {
      try {
        setBoard(await getQuizLeaderboard(assessmentId, m, scope));
      } catch {
        /* 무시 */
      }
    },
    [assessmentId],
  );

  useEffect(() => {
    void loadBoard(mode, boardScope);
  }, [mode, boardScope, loadBoard]);

  function nextQuestion() {
    if (queueRef.current.length === 0) queueRef.current = shuffleIdx(questions.length);
    const idx = queueRef.current.shift()!;
    setCurrent(questions[idx] ?? null);
    setPicked(null);
    setAnswered(false);
    answeredRef.current = false;
    setPerQLeft(perQLimit);
  }

  async function startGame() {
    setError(null);
    setLoading(true);
    try {
      const { questions: qs } = await getQuizQuestions(assessmentId, mode, usesDirection ? direction : "forward");
      if (!qs.length) {
        setError("이 세트에는 해당 영역의 퀴즈 문제가 없습니다. (예: 문장 데이터 부족)");
        setLoading(false);
        return;
      }
      setQuestions(qs);
      queueRef.current = shuffleIdx(qs.length);
      setScore(0);
      setStreak(0);
      setCorrectCount(0);
      setTotalCount(0);
      setTotalLeft(totalLimit > 0 ? totalLimit : null);
      // 첫 문제
      const idx = queueRef.current.shift()!;
      setCurrent(qs[idx] ?? null);
      setPicked(null);
      setAnswered(false);
      answeredRef.current = false;
      setPerQLeft(perQLimit);
      setPhase("playing");
    } catch (err) {
      setError(err instanceof Error ? err.message : "퀴즈 시작 실패");
    } finally {
      setLoading(false);
    }
  }

  const endGame = useCallback(async () => {
    setPhase("done");
    try {
      await submitQuizScore(assessmentId, mode, score, correctCount, totalCount);
    } catch {
      /* 무시 */
    }
    void loadBoard(mode, boardScope);
  }, [assessmentId, mode, score, correctCount, totalCount, boardScope, loadBoard]);

  // 1초 틱: 문항 타이머 + 게임 타이머
  useEffect(() => {
    if (phase !== "playing") return;
    const t = setInterval(() => {
      if (!answeredRef.current) setPerQLeft((p) => p - 1);
      setTotalLeft((tl) => (tl === null ? null : tl - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  // 게임 시간 종료
  useEffect(() => {
    if (phase === "playing" && totalLeft !== null && totalLeft <= 0) void endGame();
  }, [phase, totalLeft, endGame]);

  function answer(i: number) {
    if (answered || !current) return;
    setAnswered(true);
    answeredRef.current = true;
    setPicked(i);
    setTotalCount((c) => c + 1);
    const correct = i === current.correctIndex;
    if (correct) {
      const ratio = Math.max(0, perQLeft) / perQLimit;
      const mult = 1 + Math.min(streak, 5) * 0.1;
      const pts = Math.round(1000 * (0.5 + 0.5 * ratio) * mult);
      setScore((s) => s + pts);
      setStreak((s) => s + 1);
      setCorrectCount((c) => c + 1);
    } else {
      setStreak(0);
    }
  }

  const skip = useCallback(() => {
    if (answered || !current) return;
    setAnswered(true);
    answeredRef.current = true;
    setPicked(null);
    setStreak(0);
    setTotalCount((c) => c + 1);
  }, [answered, current]);

  // 문항 시간 초과 → 오답 처리
  useEffect(() => {
    if (phase === "playing" && !answeredRef.current && perQLeft <= 0) skip();
  }, [phase, perQLeft, skip]);

  // 키보드: 1~4 선택, Space 모르겠어요, Enter 다음
  useEffect(() => {
    if (phase !== "playing") return;
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        if (!answeredRef.current) skip();
        return;
      }
      if (e.code === "Enter") {
        e.preventDefault();
        if (answeredRef.current) nextQuestion();
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= (current?.options.length ?? 0) && !answeredRef.current) {
        answer(n - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current, answered, perQLeft, streak]);

  // ── 렌더 ──
  if (phase === "setup") {
    return (
      <div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>단어 퀴즈 · {title}</h2>
          <div className="field">
            <label>연습 영역</label>
            <div className="row" style={{ gap: 6 }}>
              {MODES.map((m) => (
                <button
                  key={m.key}
                  type="button"
                  className={mode === m.key ? "btn" : "btn secondary"}
                  onClick={() => setMode(m.key)}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {usesDirection && (
            <div className="field">
              <label>출제 방향</label>
              <div className="row" style={{ gap: 6 }}>
                <button type="button" className={direction === "forward" ? "btn" : "btn secondary"} onClick={() => setDirection("forward")}>
                  {mode === "meaning" ? "단어 → 뜻" : "한자 → 병음"}
                </button>
                <button type="button" className={direction === "reverse" ? "btn" : "btn secondary"} onClick={() => setDirection("reverse")}>
                  {mode === "meaning" ? "뜻 → 단어" : "병음 → 한자"}
                </button>
              </div>
            </div>
          )}

          <div className="field">
            <label>문항 제한 시간: {perQLimit}초</label>
            <input type="range" min={4} max={20} value={perQLimit} onChange={(e) => setPerQLimit(Number(e.target.value))} />
          </div>

          <div className="field">
            <label>게임 시간</label>
            <div className="row" style={{ gap: 6 }}>
              {TOTAL_OPTIONS.map((sec) => (
                <button
                  key={sec}
                  type="button"
                  className={totalLimit === sec ? "btn" : "btn secondary"}
                  onClick={() => setTotalLimit(sec)}
                >
                  {sec === 0 ? "무제한" : `${sec / 60}분`}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="error">{error}</p>}
          <button className="btn" type="button" onClick={startGame} disabled={loading} style={{ marginTop: 8 }}>
            {loading ? "준비 중…" : "게임 시작"}
          </button>
        </div>

        <LeaderboardCard board={board} boardScope={boardScope} setBoardScope={setBoardScope} boardTab={boardTab} setBoardTab={setBoardTab} />
      </div>
    );
  }

  if (phase === "playing" && current) {
    return (
      <div>
        <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="badge">{MODES.find((m) => m.key === mode)?.label} 퀴즈</span>
          <div className="row" style={{ alignItems: "center", gap: 14 }}>
            <span className="muted">연속 {streak} · {correctCount}/{totalCount}</span>
            <b style={{ color: "var(--primary)" }}>{score.toLocaleString()}점</b>
            {totalLeft !== null && <span className="badge">남은 {Math.floor(totalLeft / 60)}:{String(totalLeft % 60).padStart(2, "0")}</span>}
          </div>
        </div>

        <div className="card">
          <div
            style={{
              height: 6,
              background: "#eee",
              borderRadius: 999,
              overflow: "hidden",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${(Math.max(0, perQLeft) / perQLimit) * 100}%`,
                background: perQLeft <= 2 ? "var(--primary)" : "var(--ok)",
                transition: "width 1s linear",
              }}
            />
          </div>

          {current.promptHint && <p className="muted" style={{ margin: "0 0 6px" }}>{current.promptHint}</p>}
          <div style={{ fontSize: 30, fontWeight: 700, textAlign: "center", whiteSpace: "pre-wrap", margin: "8px 0 18px" }}>
            {current.prompt}
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {current.options.map((opt, i) => {
              const isCorrect = i === current.correctIndex;
              const isPicked = picked === i;
              let bg = "#fff";
              let border = "var(--border)";
              if (answered) {
                if (isCorrect) {
                  bg = "#e6f4ea";
                  border = "var(--ok)";
                } else if (isPicked) {
                  bg = "#fae6e3";
                  border = "var(--primary)";
                }
              }
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => answer(i)}
                  disabled={answered}
                  style={{
                    textAlign: "left",
                    padding: "12px 14px",
                    borderRadius: 8,
                    border: `1px solid ${border}`,
                    background: bg,
                    cursor: answered ? "default" : "pointer",
                    fontSize: 16,
                  }}
                >
                  <span className="muted" style={{ marginRight: 8 }}>{i + 1}</span>
                  {opt}
                </button>
              );
            })}
          </div>

          {answered && (
            <div style={{ marginTop: 12 }}>
              <p className={picked === current.correctIndex ? "ok" : "error"} style={{ fontWeight: 600 }}>
                {picked === current.correctIndex ? "정답!" : picked === null ? "시간 초과/모름" : "오답"}
                {current.explain ? ` · ${current.explain}` : ""}
              </p>
              <div className="row" style={{ alignItems: "center", gap: 8 }}>
                <span className="muted" style={{ fontSize: 14 }}>{current.hanzi}</span>
                <SpeakButton hanzi={current.hanzi} />
                <button className="btn" type="button" onClick={nextQuestion}>다음 (Enter)</button>
              </div>
            </div>
          )}

          {!answered && (
            <button className="btn secondary" type="button" onClick={skip} style={{ marginTop: 12 }}>
              모르겠어요 (Space)
            </button>
          )}
        </div>
        <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
          키보드: 1~4 선택 · Space 모르겠어요 · Enter 다음
        </p>
        <button className="btn secondary" type="button" onClick={() => void endGame()}>게임 종료</button>
      </div>
    );
  }

  // done
  return (
    <div>
      <div className="card" style={{ textAlign: "center", background: "var(--primary-weak)" }}>
        <div className="muted">최종 점수</div>
        <div className="score-big">{score.toLocaleString()}</div>
        <div className="muted">정답 {correctCount} / {totalCount}문항</div>
        <div className="row" style={{ justifyContent: "center", marginTop: 10 }}>
          <button className="btn" type="button" onClick={() => setPhase("setup")}>다시 하기</button>
        </div>
      </div>
      <LeaderboardCard board={board} boardScope={boardScope} setBoardScope={setBoardScope} boardTab={boardTab} setBoardTab={setBoardTab} />
    </div>
  );
}

function LeaderboardCard({
  board,
  boardScope,
  setBoardScope,
  boardTab,
  setBoardTab,
}: {
  board: Leaderboard | null;
  boardScope: "best" | "today";
  setBoardScope: (s: "best" | "today") => void;
  boardTab: "overall" | "klass";
  setBoardTab: (t: "overall" | "klass") => void;
}) {
  const list = board ? (boardTab === "overall" ? board.overall : board.klass) : [];
  const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank);
  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b>스코어보드</b>
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className={boardTab === "klass" ? "btn" : "btn secondary"} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setBoardTab("klass")}>반 순위</button>
          <button type="button" className={boardTab === "overall" ? "btn" : "btn secondary"} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setBoardTab("overall")}>전체 순위</button>
          <span style={{ width: 8 }} />
          <button type="button" className={boardScope === "today" ? "btn" : "btn secondary"} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setBoardScope("today")}>오늘</button>
          <button type="button" className={boardScope === "best" ? "btn" : "btn secondary"} style={{ padding: "4px 10px", fontSize: 13 }} onClick={() => setBoardScope("best")}>최고</button>
        </div>
      </div>
      {board && (board.myBest !== null || board.myToday !== null) && (
        <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>
          내 기록 — 최고 {board.myBest ?? 0}점 · 오늘 {board.myToday ?? 0}점
        </p>
      )}
      {list.length === 0 ? (
        <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>아직 기록이 없습니다. 첫 기록의 주인공이 되어보세요!</p>
      ) : (
        <table style={{ marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ width: 50 }}>순위</th>
              <th>이름</th>
              <th style={{ textAlign: "right" }}>점수</th>
            </tr>
          </thead>
          <tbody>
            {list.map((e) => (
              <tr key={`${e.rank}-${e.maskedName}`} style={e.isMe ? { background: "var(--primary-weak)" } : undefined}>
                <td>{medal(e.rank)}</td>
                <td>{e.maskedName}{e.isMe && <span className="badge" style={{ marginLeft: 6 }}>나</span>}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{e.score.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
