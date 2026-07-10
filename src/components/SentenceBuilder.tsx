"use client";

import { useRef, useState } from "react";
import type { BuilderItem, GradeResult } from "@/app/actions/sentence-builder";
import type { OrderTutorTurn, OrderTutorReply } from "@/lib/order-tutor";
import { SpeakButton } from "@/components/SpeakButton";
import { SentenceOrderTutor } from "@/components/SentenceOrderTutor";

interface Tok {
  t: string;
  k: number;
}
const DIFF: Record<string, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

/**
 * 문장 배열 게임(회화 학습·대본 미션 공용). 채점/힌트/튜터는 백엔드별로 다르므로 props로 주입한다.
 * 정답 토큰 순서는 서버(onGrade/onHint/tutorAsk)에서만 다뤄 클라이언트로 오지 않는다.
 */
export function SentenceBuilder({
  items,
  onGrade,
  onHint,
  tutorAsk,
}: {
  items: BuilderItem[];
  onGrade: (itemId: string, ordered: string[]) => Promise<GradeResult>;
  onHint: (itemId: string, count: number) => Promise<string[]>;
  tutorAsk?: (
    itemId: string,
    tokens: string[],
    arranged: string[],
    history: OrderTutorTurn[],
    message: string,
  ) => Promise<OrderTutorReply>;
}) {
  const [idx, setIdx] = useState(0);
  const item = items[idx];
  const [pool, setPool] = useState<Tok[]>(() => toToks(items[0]?.tokens ?? []));
  const [arranged, setArranged] = useState<Tok[]>([]);
  const [result, setResult] = useState<null | { correct: boolean; targetZh?: string; targetKo?: string }>(null);
  const [hint, setHint] = useState<string[] | null>(null);
  const [hintCount, setHintCount] = useState(0);
  const [solved, setSolved] = useState(0);
  const [showTutor, setShowTutor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const arrangedRef = useRef<Tok[]>(arranged);
  arrangedRef.current = arranged;

  function toToksFor(i: number) {
    setPool(toToks(items[i]?.tokens ?? []));
    setArranged([]);
    setResult(null);
    setHint(null);
    setHintCount(0);
  }

  function add(tok: Tok) {
    if (result?.correct) return;
    setPool((p) => p.filter((x) => x.k !== tok.k));
    setArranged((a) => [...a, tok]);
  }
  function remove(tok: Tok) {
    if (result?.correct) return;
    setArranged((a) => a.filter((x) => x.k !== tok.k));
    setPool((p) => [...p, tok]);
  }

  async function check() {
    if (!item || !arranged.length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await onGrade(item.id, arranged.map((x) => x.t));
      setResult(r);
      if (r.correct) setSolved((s) => s + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "확인 실패");
    } finally {
      setBusy(false);
    }
  }
  async function getHint() {
    if (!item) return;
    setBusy(true);
    try {
      const r = await onHint(item.id, hintCount + 1);
      setHint(r);
      setHintCount((c) => c + 1);
    } catch {
      /* 무시 */
    } finally {
      setBusy(false);
    }
  }
  function next() {
    const ni = idx + 1;
    if (ni >= items.length) {
      setIdx(items.length); // done
      return;
    }
    setIdx(ni);
    toToksFor(ni);
  }

  if (items.length === 0) {
    return <div className="card muted">이 상황에는 문장 배열 문제가 아직 없습니다.</div>;
  }
  if (idx >= items.length || !item) {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <b>문장 배열 완료!</b>
        <p className="muted">맞춘 문장 {solved} / {items.length}</p>
        <button className="btn" type="button" onClick={() => { setIdx(0); toToksFor(0); setSolved(0); }}>다시 하기</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <span className="muted">{idx + 1} / {items.length}</span>
        <span className="badge">{DIFF[item.difficulty] ?? item.difficulty} · {item.count}단어</span>
      </div>

      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>다음 뜻이 되도록 단어를 배열하세요</p>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>{item.promptKo || "(문장 배열)"}</div>

        <div
          style={{
            minHeight: 48, border: "1px dashed var(--border)", borderRadius: 8, padding: 8,
            display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12,
          }}
        >
          {arranged.length === 0 && <span className="muted" style={{ fontSize: 13 }}>여기에 단어를 놓으세요</span>}
          {arranged.map((tok) => (
            <button key={tok.k} type="button" className="btn" style={chip} onClick={() => remove(tok)}>{tok.t}</button>
          ))}
          {item.ending && (
            <span
              style={{ marginLeft: "auto", fontSize: 18, fontWeight: 700 }}
              title="문장 끝 부호(고정)"
            >
              {item.ending}
            </span>
          )}
        </div>

        <div className="row" style={{ gap: 6 }}>
          {pool.map((tok) => (
            <button key={tok.k} type="button" className="btn secondary" style={chip} onClick={() => add(tok)}>{tok.t}</button>
          ))}
        </div>

        {hint && (
          <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>힌트(앞부분): {hint.join(" · ")}</p>
        )}
        {result && !result.correct && <p className="error">아직 맞지 않아요. 다시 배열해 보세요.</p>}
        {result?.correct && (
          <div className="ok" style={{ marginTop: 8 }}>
            정답! <b>{result.targetZh}</b>{result.targetKo ? ` · ${result.targetKo}` : ""}
            {result.targetZh && <span style={{ marginLeft: 8 }}><SpeakButton hanzi={result.targetZh} /></span>}
          </div>
        )}

        <div className="row" style={{ marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
          {!result?.correct ? (
            <>
              <button className="btn" type="button" onClick={check} disabled={busy || !arranged.length}>확인</button>
              <button className="btn secondary" type="button" onClick={getHint} disabled={busy}>힌트</button>
              {tutorAsk && (
                <button
                  className={`btn ${showTutor ? "secondary" : ""}`}
                  type="button"
                  onClick={() => setShowTutor((v) => !v)}
                >
                  {showTutor ? "튜터 닫기" : "🧑‍🏫 어순 튜터"}
                </button>
              )}
            </>
          ) : (
            <button className="btn" type="button" onClick={next}>다음 →</button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </div>

      {tutorAsk && showTutor && (
        <SentenceOrderTutor
          key={item.id}
          ask={(history, message) =>
            tutorAsk(item.id, item.tokens, arrangedRef.current.map((x) => x.t), history, message)
          }
        />
      )}
    </div>
  );
}

const chip: React.CSSProperties = { padding: "8px 12px", fontSize: 18 };

function toToks(tokens: string[]): Tok[] {
  return tokens.map((t, k) => ({ t, k }));
}
