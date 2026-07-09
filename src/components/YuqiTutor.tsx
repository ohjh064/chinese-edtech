"use client";

import { useEffect, useRef, useState } from "react";
import { askYuqi, type YuqiTurn, type YuqiStep } from "@/app/actions/script-mission";
import type { ScriptWordCard } from "@/lib/database.types";

/** 대본 미션 작성 도우미 챗봇 'Yǔqí' — 힌트·예문으로 단계별 안내(대본 전체는 대신 쓰지 않음). */
export function YuqiTutor({
  assessmentId,
  situation,
  words,
  draft,
}: {
  assessmentId: string;
  situation: string;
  words: ScriptWordCard[];
  draft: string;
}) {
  const [history, setHistory] = useState<YuqiTurn[]>([]);
  const [steps, setSteps] = useState<YuqiStep[]>([]);
  const [ready, setReady] = useState(false);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history]);

  async function greet() {
    setBusy(true);
    setError(null);
    try {
      const r = await askYuqi({ assessmentId, situation, words, draft: draftRef.current, history: [], message: "" });
      setHistory([{ role: "tutor", text: r.message }]);
      setSteps(r.steps);
      setReady(r.readyToSubmit);
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
      const r = await askYuqi({ assessmentId, situation, words, draft: draftRef.current, history: prior, message: text });
      setHistory([...prior, { role: "student", text }, { role: "tutor", text: r.message }]);
      setSteps(r.steps);
      setReady(r.readyToSubmit);
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
        <b>👩‍🏫 Yǔqí 튜터</b>
        {turnsLeft != null && <span className="muted" style={{ fontSize: 12 }}>남은 도움 {turnsLeft}회</span>}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>단계별로 힌트와 예문을 받아 대본을 완성해요. (대본은 스스로 써야 점수가 올라가요)</p>

      {/* 단계 체크리스트 */}
      {steps.length > 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {steps.map((s, i) => (
            <span
              key={i}
              className="badge"
              style={{
                background: s.done ? "var(--ok)" : "#eef1f4",
                color: s.done ? "#fff" : "var(--muted)",
              }}
            >
              {s.done ? "✓" : "○"} {i + 1}. {s.label}
            </span>
          ))}
        </div>
      )}

      {/* 대화 */}
      <div
        ref={scrollRef}
        style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 2px" }}
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

      {ready && (
        <p className="ok" style={{ fontSize: 13, margin: "8px 0 0" }}>이제 대본을 채점해도 좋아요! ✅ 위 ‘채점하기’를 눌러보세요.</p>
      )}
      {error && <p className="error" style={{ margin: "8px 0 0" }}>{error}</p>}

      {/* 빠른 버튼 + 입력 */}
      {!locked ? (
        <>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => void send("지금 내 대본을 봐줘. 어때?")}>내 대본 봐줘</button>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => void send("다음엔 뭘 하면 좋을까?")}>다음 단계</button>
            <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 12 }} disabled={busy} onClick={() => void send("이 단어들로 쓸 수 있는 예문을 보여줘.")}>예문 보여줘</button>
          </div>
          <div className="row" style={{ gap: 6, alignItems: "flex-start", marginTop: 8 }}>
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              placeholder="Yǔqí에게 물어보기 (예: ‘今天’은 어떻게 써?)"
              style={{ flex: 1 }}
              disabled={busy}
            />
            <button type="button" className="btn" style={{ whiteSpace: "nowrap" }} disabled={busy || !input.trim()} onClick={() => void send(input)}>보내기</button>
          </div>
        </>
      ) : (
        <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>오늘 도움 횟수를 다 썼어요. 스스로 대본을 마무리해보세요!</p>
      )}
    </div>
  );
}
