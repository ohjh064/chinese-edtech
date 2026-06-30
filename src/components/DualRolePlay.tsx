"use client";

import { useEffect, useRef, useState } from "react";
import {
  nextDualTurn,
  studentDualSay,
  type DualMsg,
} from "@/app/actions/dual";
import { SpeakButton } from "@/components/SpeakButton";

export function DualRolePlay({
  conversationId,
  roleA,
  roleB,
  initialHistory,
  initialTurnsLeft,
  initialDone,
}: {
  conversationId: string;
  roleA: string;
  roleB: string;
  initialHistory: DualMsg[];
  initialTurnsLeft: number;
  initialDone: boolean;
}) {
  const [history, setHistory] = useState<DualMsg[]>(initialHistory);
  const [turnsLeft, setTurnsLeft] = useState(initialTurnsLeft);
  const [done, setDone] = useState(initialDone);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  // 첫 진입 시 시연 한 턴 자동 시작
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (history.length === 0 && !done) void advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyTurn(line: DualMsg, tl: number, d: boolean) {
    if (line.zh) setHistory((h) => [...h, line]);
    setTurnsLeft(tl);
    setDone(d);
  }

  async function advance() {
    setBusy(true);
    setError(null);
    try {
      const r = await nextDualTurn(conversationId);
      applyTurn(r.line, r.turnsLeft, r.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "진행 실패");
    } finally {
      setBusy(false);
    }
  }

  async function say() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    setHistory((h) => [...h, { speaker: "student", zh: text, ko: null }]);
    setInput("");
    try {
      const r = await studentDualSay(conversationId, text);
      applyTurn(r.line, r.turnsLeft, r.done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
      setHistory((h) => h.filter((m) => !(m.speaker === "student" && m.zh === text)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="badge">AI 듀얼 롤플레이</span>
        <span className="muted" style={{ fontSize: 13 }}>남은 대화 {turnsLeft}턴</span>
      </div>
      <p className="muted" style={{ fontSize: 13, margin: "4px 0 10px" }}>
        AI가 <b>{roleA}</b>와 <b>{roleB}</b>를 번갈아 연기합니다. 원하면 <b>{roleB}</b>로 직접 끼어들어 보세요.
      </p>

      <div className="card" style={{ minHeight: 220, display: "flex", flexDirection: "column", gap: 10 }}>
        {history.length === 0 && <p className="muted" style={{ textAlign: "center" }}>대화를 불러오는 중…</p>}
        {history.map((m, i) => {
          const mine = m.speaker !== "a";
          const label = m.speaker === "a" ? roleA : m.speaker === "b" ? roleB : `${roleB} (나)`;
          const bg = m.speaker === "a" ? "var(--card-2, #f1f5f9)" : m.speaker === "student" ? "var(--primary)" : "var(--primary-weak)";
          const color = m.speaker === "student" ? "#fff" : "var(--text)";
          return (
            <div key={i} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "85%" }}>
              <div className="muted" style={{ fontSize: 11, margin: mine ? "0 2px 2px auto" : "0 0 2px 2px", textAlign: mine ? "right" : "left" }}>{label}</div>
              <div style={{ background: bg, color, padding: "8px 12px", borderRadius: 12 }}>
                <div style={{ fontSize: 17 }}>{m.zh}</div>
                {m.ko && <div className="muted" style={{ fontSize: 13, marginTop: 2, color: m.speaker === "student" ? "rgba(255,255,255,.85)" : undefined }}>{m.ko}</div>}
              </div>
              {m.speaker !== "student" && (
                <div style={{ marginTop: 4 }}>
                  <SpeakButton hanzi={m.zh} />
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="error">{error}</p>}

      {done ? (
        <div className="card" style={{ textAlign: "center" }}>
          <b>시연을 마쳤습니다.</b>
          <p className="muted" style={{ fontSize: 13 }}>충분히 들었어요! 다시 연습하려면 새로고침하세요.</p>
        </div>
      ) : (
        <div className="card">
          <button className="btn" type="button" onClick={advance} disabled={busy} style={{ width: "100%", marginBottom: 8 }}>
            {busy ? "진행 중…" : "▶ 다음 대사 보기"}
          </button>
          <div className="row" style={{ alignItems: "flex-end" }}>
            <div className="field grow" style={{ marginBottom: 0 }}>
              <label>{roleB}로 직접 말하기</label>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") say(); }}
                placeholder="중국어로 입력…"
                disabled={busy}
                autoComplete="off"
              />
            </div>
            <button className="btn secondary" type="button" onClick={say} disabled={busy || !input.trim()}>끼어들기</button>
          </div>
        </div>
      )}
    </div>
  );
}
