"use client";

import { useState } from "react";
import { MarkedText, circled } from "@/components/questionbank/ExamPreview";
import { WordClipper } from "@/components/WordClipper";
import { gradeSharedQbank, type SharedQbank, type QbankGradeResult } from "@/app/actions/question-bank";

/** 공유된 시험지 풀기 + 자가채점. 정답/해설은 '채점' 후 서버가 돌려준다. */
export function QbankSolve({ setId, data }: { setId: string; data: SharedQbank }) {
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<{ score: number; total: number; byItem: Map<string, QbankGradeResult> } | null>(null);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const answeredCount = Object.keys(answers).length;

  async function grade() {
    setGrading(true);
    setError(null);
    try {
      const res = await gradeSharedQbank(
        setId,
        data.items.map((it) => ({ itemId: it.id, choiceIndex: answers[it.id] ?? -1 })),
      );
      setResult({ score: res.score, total: res.total, byItem: new Map(res.results.map((r) => [r.itemId, r])) });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "채점 실패");
    } finally {
      setGrading(false);
    }
  }

  function reset() {
    setAnswers({});
    setResult(null);
    setError(null);
  }

  if (data.items.length === 0) {
    return <div className="card muted">이 시험지에는 문항이 없습니다.</div>;
  }

  return (
    <div>
      {result && (
        <div className="card" style={{ textAlign: "center", borderColor: "var(--primary)" }}>
          <b style={{ fontSize: 20 }}>점수 {result.score} / {result.total}</b>
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>아래에서 문항별 정답과 해설을 확인하세요.</p>
          <button type="button" className="btn secondary" onClick={reset}>다시 풀기</button>
        </div>
      )}

      <WordClipper>
      {data.passage?.trim() && (
        <div className="card" style={{ whiteSpace: "pre-wrap", background: "#fbfbfc" }}>
          <MarkedText text={data.passage} />
        </div>
      )}

      <div className="card" style={{ background: "#fff", lineHeight: 1.75 }}>
        {data.items.map((it, i) => {
          const r = result?.byItem.get(it.id);
          const chosen = answers[it.id];
          return (
            <div key={it.id} style={{ marginBottom: 22, paddingBottom: 18, borderBottom: i < data.items.length - 1 ? "1px dashed var(--border)" : "none" }}>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                <span style={{ marginRight: 6 }}>{i + 1}.</span>
                <MarkedText text={it.stem} />
              </div>
              {it.passage?.trim() && (
                <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: "12px 14px", margin: "10px 0", whiteSpace: "pre-wrap", background: "#fbfbfc" }}>
                  <MarkedText text={it.passage} />
                </div>
              )}
              <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                {it.choices.map((c, k) => {
                  const isChosen = chosen === k;
                  const isCorrect = !!r && r.correctIndex === k;
                  const isWrongChosen = !!r && isChosen && !r.correct;
                  let border = "1px solid var(--border)";
                  let background = "#fff";
                  let numColor = "var(--muted)";
                  if (isCorrect) { border = "2px solid var(--ok)"; background = "#eef7ee"; numColor = "var(--ok)"; }
                  else if (isWrongChosen) { border = "2px solid #dc2626"; background = "#fdecec"; numColor = "#dc2626"; }
                  else if (isChosen) { border = "2px solid var(--primary)"; background = "var(--primary-weak)"; numColor = "var(--primary)"; }
                  return (
                    <button
                      key={k}
                      type="button"
                      aria-pressed={isChosen}
                      disabled={!!result}
                      onClick={() => setAnswers((a) => ({ ...a, [it.id]: k }))}
                      style={{
                        width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                        padding: "12px 14px", borderRadius: 10, border, background,
                        cursor: result ? "default" : "pointer", font: "inherit", color: "var(--text)", lineHeight: 1.5,
                      }}
                    >
                      <span style={{ fontSize: 20, fontWeight: 700, flexShrink: 0, color: numColor, minWidth: 24 }}>{circled(k)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}><MarkedText text={c} /></span>
                      {isCorrect ? <span style={{ fontSize: 12, fontWeight: 700, color: "var(--ok)", flexShrink: 0 }}>정답 ✓</span> : null}
                      {isWrongChosen ? <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", flexShrink: 0 }}>내 답 ✗</span> : null}
                    </button>
                  );
                })}
              </div>
              {r && r.explanation?.trim() && (
                <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>해설: {r.explanation}</div>
              )}
            </div>
          );
        })}
      </div>
      </WordClipper>

      {error && <p className="error">{error}</p>}
      {!result && (
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 13 }}>{answeredCount} / {data.items.length} 문항 응답</span>
          <button type="button" className="btn" onClick={grade} disabled={grading}>{grading ? "채점 중…" : "채점하기"}</button>
        </div>
      )}
    </div>
  );
}
