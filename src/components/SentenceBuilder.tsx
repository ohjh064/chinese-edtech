"use client";

import { useState } from "react";
import {
  gradeSentence,
  sentenceHint,
  type BuilderItem,
} from "@/app/actions/sentence-builder";
import { SpeakButton } from "@/components/SpeakButton";

interface Tok {
  t: string;
  k: number;
}
const DIFF: Record<string, string> = { easy: "Easy", normal: "Normal", hard: "Hard" };

export function SentenceBuilder({ items }: { items: BuilderItem[] }) {
  const [idx, setIdx] = useState(0);
  const item = items[idx];
  const [pool, setPool] = useState<Tok[]>(() => toToks(items[0]?.tokens ?? []));
  const [arranged, setArranged] = useState<Tok[]>([]);
  const [result, setResult] = useState<null | { correct: boolean; targetZh?: string; targetKo?: string }>(null);
  const [hint, setHint] = useState<string[] | null>(null);
  const [hintCount, setHintCount] = useState(0);
  const [solved, setSolved] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const r = await gradeSentence(item.id, arranged.map((x) => x.t));
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
      const r = await sentenceHint(item.id, hintCount + 1);
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

        <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
          {!result?.correct ? (
            <>
              <button className="btn" type="button" onClick={check} disabled={busy || !arranged.length}>확인</button>
              <button className="btn secondary" type="button" onClick={getHint} disabled={busy}>힌트</button>
            </>
          ) : (
            <button className="btn" type="button" onClick={next}>다음 →</button>
          )}
        </div>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

const chip: React.CSSProperties = { padding: "8px 12px", fontSize: 18 };

function toToks(tokens: string[]): Tok[] {
  return tokens.map((t, k) => ({ t, k }));
}
