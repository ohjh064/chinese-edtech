"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderTutorTurn, OrderTutorReply, OrderTutorStep } from "@/lib/order-tutor";

/**
 * 어순 튜터 챗봇 — 문장 배열(SentenceBuilder) 옆에서 중국어 어순을 기초부터 코칭한다.
 * 정답을 대신 배열해 주지 않고 원리·질문·부분 힌트로만 돕는다(서버 프롬프트로 강제).
 * `ask`는 부모가 현재 문항·배열을 바인딩해 넘긴다.
 */
export function SentenceOrderTutor({
  ask,
}: {
  ask: (history: OrderTutorTurn[], message: string) => Promise<OrderTutorReply>;
}) {
  const [history, setHistory] = useState<OrderTutorTurn[]>([]);
  const [steps, setSteps] = useState<OrderTutorStep[]>([]);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  async function greet() {
    setBusy(true);
    setError(null);
    try {
      const r = await ask([], "");
      setHistory([{ role: "tutor", text: r.message }]);
      setSteps(r.steps);
      setTurnsLeft(r.turnsLeft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "튜터를 불러오지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void greet();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function send(message: string) {
    const text = message.trim();
    if (!text || busy || (turnsLeft ?? 1) <= 0) return;
    setBusy(true);
    setError(null);
    const prior = history;
    setHistory([...prior, { role: "student", text }]);
    setInput("");
    try {
      const r = await ask(prior, text);
      setHistory([...prior, { role: "student", text }, { role: "tutor", text: r.message }]);
      setSteps(r.steps);
      setTurnsLeft(r.turnsLeft);
    } catch (e) {
      setHistory(prior);
      setError(e instanceof Error ? e.message : "답장을 받지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  const locked = (turnsLeft ?? 1) <= 0;

  return (
    <div className="card" style={{ borderColor: "var(--primary)" }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <b>🧑‍🏫 어순 튜터</b>
        {turnsLeft != null && <span className="muted" style={{ fontSize: 12 }}>남은 도움 {turnsLeft}회</span>}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>중국어 어순을 기초부터 알려줘요. 정답은 스스로 배열해야 실력이 늘어요.</p>

      {steps.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {steps.map((s, i) => (
            <span
              key={i}
              className="badge"
              style={{ background: s.done ? "var(--ok)" : "#eef1f4", color: s.done ? "#fff" : "var(--muted)" }}
            >
              {s.done ? "✓" : "○"} {i + 1}. {s.label}
            </span>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}
      >
        {history.map((t, i) => (
          <div
            key={i}
            style={{
              alignSelf: t.role === "tutor" ? "flex-start" : "flex-end",
              maxWidth: "85%",
              whiteSpace: "pre-wrap",
              lineHeight: 1.5,
              padding: "8px 12px",
              borderRadius: 12,
              fontSize: 14,
              background: t.role === "tutor" ? "var(--primary-weak)" : "#eef1f4",
            }}
          >
            {t.role === "tutor" && <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>Yǔqí</div>}
            {t.text}
          </div>
        ))}
        {busy && <div className="muted" style={{ fontSize: 13 }}>Yǔqí가 생각 중…</div>}
      </div>

      {error && <p className="error" style={{ margin: "8px 0 0" }}>{error}</p>}

      {!locked ? (
        <>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => void send("중국어 어순 기초를 알려줘.")}>어순 기초 알려줘</button>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => void send("어디부터 놓아야 할지 힌트를 줘.")}>힌트 줘</button>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => void send("지금 내 배열을 봐줘. 어때?")}>내 배열 봐줘</button>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "flex-start", marginTop: 8 }}>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder="튜터에게 물어보기 (예: 시간은 어디에 놓아?)"
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button type="button" className="btn" style={{ whiteSpace: "nowrap" }} disabled={busy || !input.trim()} onClick={() => void send(input)}>보내기</button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>오늘 도움 횟수를 다 썼어요. 스스로 배열해보세요!</p>
      )}
    </div>
  );
}
