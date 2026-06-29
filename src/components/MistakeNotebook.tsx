"use client";

import { useState } from "react";
import {
  generateMistakeDrill,
  resolveMistake,
  type DrillItem,
  type MistakeRow,
  type MistakeSummary,
} from "@/app/actions/mistakes";

export function MistakeNotebook({ initial }: { initial: MistakeSummary }) {
  const [items, setItems] = useState<MistakeRow[]>(initial.items);
  const [resolvedCount, setResolvedCount] = useState(initial.resolvedCount);
  const [drills, setDrills] = useState<DrillItem[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byKind = aggregate(items);

  async function markResolved(id: string) {
    setItems((xs) => xs.filter((m) => m.id !== id));
    setResolvedCount((n) => n + 1);
    try {
      await resolveMistake(id);
    } catch {
      /* UI는 이미 반영; 실패해도 다음 로드 때 복구 */
    }
  }

  async function makeDrills() {
    setBusy(true);
    setError(null);
    try {
      const d = await generateMistakeDrill();
      if (!d.length) setError("출제할 오답이 없습니다.");
      setDrills(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "맞춤 연습 생성 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="card row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {byKind.length === 0 ? (
            <span className="muted">미해결 오답 없음</span>
          ) : (
            byKind.map((k) => (
              <span key={k.kind} className="badge">{k.ko} {k.count}</span>
            ))
          )}
        </div>
        <span className="muted" style={{ fontSize: 13 }}>해결한 오답 {resolvedCount}개</span>
      </div>

      {items.length > 0 && (
        <button className="btn" type="button" onClick={makeDrills} disabled={busy} style={{ margin: "4px 0 12px" }}>
          {busy ? "생성 중…" : "AI 맞춤 연습 만들기"}
        </button>
      )}
      {error && <p className="error">{error}</p>}

      {drills && drills.length > 0 && (
        <div className="card" style={{ background: "var(--primary-weak)" }}>
          <b>맞춤 연습 ({drills.length}문항)</b>
          <p className="muted" style={{ fontSize: 12, margin: "2px 0 8px" }}>정답을 맞히면 해당 오답이 해결 처리됩니다.</p>
          {drills.map((d, i) => (
            <DrillCard key={`${d.mistakeId}-${i}`} drill={d} onCorrect={() => markResolved(d.mistakeId)} />
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <div className="card muted" style={{ textAlign: "center" }}>
          오답이 없습니다. 연습 모드에서 문제를 풀면 틀린 부분이 여기에 모여요.
        </div>
      ) : (
        items.map((m) => (
          <div className="card" key={m.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <span className="badge" style={{ marginRight: 8 }}>{kindKo(m.kind)}</span>
                <span style={{ fontSize: 20, fontWeight: 700 }}>{m.label}</span>
                {m.count > 1 && <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{m.count}회 틀림</span>}
                {m.detail && <div className="muted" style={{ fontSize: 13 }}>{m.detail}</div>}
              </div>
              <button className="btn secondary" type="button" onClick={() => markResolved(m.id)}>해결</button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DrillCard({ drill, onCorrect }: { drill: DrillItem; onCorrect: () => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const correct = picked === drill.answerIndex;

  function pick(idx: number) {
    if (answered) return;
    setPicked(idx);
    if (idx === drill.answerIndex) onCorrect();
  }

  return (
    <div className="card" style={{ marginTop: 8 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>
        <span className="badge" style={{ marginRight: 6 }}>{kindKo(drill.kind)}</span>
        {drill.prompt}
      </div>
      <div style={{ display: "grid", gap: 6 }}>
        {drill.choices.map((c, idx) => {
          const isAnswer = idx === drill.answerIndex;
          const bg = answered && isAnswer ? "var(--ok-weak, #e6f6ec)" : answered && idx === picked ? "#fde8e8" : "transparent";
          return (
            <button
              key={idx}
              type="button"
              className="btn secondary"
              onClick={() => pick(idx)}
              disabled={answered}
              style={{ justifyContent: "flex-start", textAlign: "left", background: bg }}
            >
              {c}
            </button>
          );
        })}
      </div>
      {answered && (
        <p style={{ fontSize: 13, margin: "8px 0 0" }}>
          <b className={correct ? "ok" : "error"}>{correct ? "정답!" : "오답"}</b> · {drill.explanation}
        </p>
      )}
    </div>
  );
}

function aggregate(items: MistakeRow[]): { kind: string; ko: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) m.set(it.kind, (m.get(it.kind) ?? 0) + 1);
  return [...m.entries()].map(([kind, count]) => ({ kind, ko: kindKo(kind), count }));
}

function kindKo(kind: string): string {
  switch (kind) {
    case "pinyin":
      return "병음";
    case "tone":
      return "성조";
    case "meaning":
      return "의미";
    case "grammar":
      return "어법";
    case "expression":
      return "표현";
    default:
      return kind;
  }
}
