"use client";

import { useEffect, useRef, useState } from "react";
import {
  sendTurn,
  evaluateBoss,
  type HistoryItem,
  type TurnFeedback,
  type BossEvaluation,
} from "@/app/actions/roleplay";
import { SpeakButton } from "@/components/SpeakButton";

interface Bubble {
  role: "student" | "ai";
  zh: string;
  ko: string | null;
  feedback: TurnFeedback | null;
}

export function RolePlayChat({
  conversationId,
  initialHistory,
  initialTurnsLeft,
  initialDone,
  boss,
}: {
  conversationId: string;
  initialHistory: HistoryItem[];
  initialTurnsLeft: number;
  initialDone: boolean;
  boss?: { description: string | null; steps: string[] };
}) {
  const [bubbles, setBubbles] = useState<Bubble[]>(initialHistory);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnsLeft, setTurnsLeft] = useState(initialTurnsLeft);
  const [done, setDone] = useState(initialDone);
  const [hintLevel, setHintLevel] = useState(0);
  const [evalResult, setEvalResult] = useState<BossEvaluation | null>(null);
  const [evaluating, setEvaluating] = useState(false);
  const greeted = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function evaluate() {
    setEvaluating(true);
    setError(null);
    try {
      setEvalResult(await evaluateBoss(conversationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "평가 실패");
    } finally {
      setEvaluating(false);
    }
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles]);

  // 대화가 비어 있으면 AI 인사로 시작
  useEffect(() => {
    if (greeted.current) return;
    greeted.current = true;
    if (initialHistory.length === 0 && !initialDone) {
      void run("", undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(text: string, hint?: number) {
    setBusy(true);
    setError(null);
    if (text.trim() && hint === undefined) {
      setBubbles((b) => [...b, { role: "student", zh: text, ko: null, feedback: null }]);
    }
    try {
      const r = await sendTurn(conversationId, text, hint);
      if (r.done && !r.ai.zh) {
        // 서버가 종료/상한으로 거절 — 낙관적 학생 버블 롤백 + 카운터 동기화
        if (text.trim() && hint === undefined) {
          setBubbles((b) => (b[b.length - 1]?.role === "student" ? b.slice(0, -1) : b));
        }
        setTurnsLeft(0);
        setDone(true);
        setError("대화가 종료되었습니다. 새로고침해 다시 시작하세요.");
        return;
      }
      setBubbles((b) => [...b, { role: "ai", zh: r.ai.zh, ko: r.ai.ko, feedback: r.feedback }]);
      setTurnsLeft(r.turnsLeft);
      setDone(r.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const t = input.trim();
    if (!t || busy || done) return;
    setInput("");
    setHintLevel(0);
    await run(t, undefined);
  }
  async function askHint() {
    if (busy || done) return;
    const next = Math.min(hintLevel + 1, 5);
    setHintLevel(next);
    await run("", next);
  }

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="badge">{boss ? "보스 미션" : "롤플레이 대화"}</span>
        <span className="muted" style={{ fontSize: 13 }}>남은 대화 {turnsLeft}턴</span>
      </div>

      {boss && (
        <div className="card" style={{ background: "var(--primary-weak)" }}>
          <b>미션</b>
          {boss.description && <p className="muted" style={{ fontSize: 14, margin: "4px 0" }}>{boss.description}</p>}
          {boss.steps.length > 0 && (
            <ol style={{ margin: "4px 0 0", paddingLeft: 18 }}>
              {boss.steps.map((s, i) => (<li key={i} style={{ fontSize: 14 }}>{s}</li>))}
            </ol>
          )}
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>힌트 없이 미션을 수행한 뒤 평가를 받으세요.</p>
        </div>
      )}

      {evalResult && (
        <div className="card" style={{ borderColor: evalResult.passed ? "var(--ok)" : "var(--warn)" }}>
          <b className={evalResult.passed ? "ok" : "error"}>{evalResult.passed ? "미션 성공!" : "미션 미완료"}</b>
          <p style={{ fontSize: 14, margin: "4px 0" }}>{evalResult.summary}</p>
          <ul className="muted" style={{ fontSize: 13, margin: 0, paddingLeft: 18 }}>
            {evalResult.steps.map((s, i) => (<li key={i}>{s.done ? "✓" : "✗"} {s.label}</li>))}
          </ul>
        </div>
      )}

      <div className="card" style={{ minHeight: 280, display: "flex", flexDirection: "column", gap: 12 }}>
        {bubbles.length === 0 && <p className="muted">대화를 시작합니다…</p>}
        {bubbles.map((b, i) => (
          <div key={i} style={{ alignSelf: b.role === "student" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
            <div
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                background: b.role === "student" ? "var(--primary)" : "#f1f1f4",
                color: b.role === "student" ? "#fff" : "var(--text)",
              }}
            >
              <div style={{ fontSize: 17 }}>{b.zh}</div>
              {b.role === "ai" && b.ko && (
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{b.ko}</div>
              )}
            </div>
            {b.role === "ai" && (
              <div style={{ marginTop: 4 }}>
                <SpeakButton hanzi={b.zh} />
              </div>
            )}
            {b.role === "ai" && b.feedback && hasFeedback(b.feedback) && (
              <div className="card" style={{ marginTop: 6, background: "var(--primary-weak)", padding: 10 }}>
                {b.feedback.goodPoint && <p style={{ margin: "2px 0", fontSize: 13 }}><b className="ok">잘한 점</b> · {b.feedback.goodPoint}</p>}
                {b.feedback.correction && <p style={{ margin: "2px 0", fontSize: 13 }}><b className="error">고칠 점</b> · {b.feedback.correction}</p>}
                {b.feedback.natural && <p style={{ margin: "2px 0", fontSize: 13 }}><b>더 자연스럽게</b> · {b.feedback.natural}</p>}
                {b.feedback.encourage && <p className="muted" style={{ margin: "2px 0", fontSize: 13 }}>{b.feedback.encourage}</p>}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error">{error}</p>}

      {boss && (
        <button className="btn" type="button" onClick={evaluate} disabled={evaluating} style={{ marginBottom: 12 }}>
          {evaluating ? "평가 중…" : "미션 평가받기"}
        </button>
      )}

      {done ? (
        <div className="card" style={{ textAlign: "center" }}>
          <b>대화를 마쳤습니다.</b>
          <p className="muted" style={{ fontSize: 13 }}>잘했어요! 더 연습하려면 새로고침해 다시 시작하세요.</p>
        </div>
      ) : (
        <div className="card">
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field grow" style={{ marginBottom: 0 }}>
              <label>중국어로 답하기</label>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                placeholder="여기에 중국어로 입력…"
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <button className="btn" type="button" onClick={send} disabled={busy || !input.trim()}>전송</button>
            {!boss && (
              <button className="btn secondary" type="button" onClick={askHint} disabled={busy} title="단계별 힌트(정답은 알려주지 않아요)">
                힌트 {hintLevel > 0 ? `(${hintLevel}/5)` : ""}
              </button>
            )}
          </div>
          <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
            {boss
              ? "힌트·교정 없이 미션을 수행한 뒤 '미션 평가받기'를 누르세요."
              : "AI는 정답을 통째로 알려주지 않고, 한 번에 한 가지만 고쳐줘요."}
          </p>
        </div>
      )}
    </div>
  );
}

function hasFeedback(f: TurnFeedback): boolean {
  return !!(f.goodPoint || f.correction || f.natural || f.encourage);
}
