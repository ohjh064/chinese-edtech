"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeGrade, regradeSubmission } from "@/app/actions/teacher";
import { mapErrorsToScore } from "@/grading/scale.js";

interface Issue {
  message: string;
}
interface AnswerDetail {
  wordId: string;
  errors: number;
  issues?: Issue[];
}

export function FinalizeControls({
  submissionId,
  meaningScore,
  sentenceErrors,
  finalized,
  meaningDetails,
  sentenceDetails,
}: {
  submissionId: string;
  meaningScore: number;
  /** 문장(오류판단) 영역의 어법 오류 개수(자동/AI 제안 초기값) */
  sentenceErrors: number;
  finalized: boolean;
  meaningDetails?: AnswerDetail[];
  sentenceDetails?: AnswerDetail[];
}) {
  const seedErrors = Math.round(sentenceErrors);
  const [meaning, setMeaning] = useState(String(meaningScore));
  const [sentErrors, setSentErrors] = useState(String(seedErrors));
  const [showDetail, setShowDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // 어법 오류 개수 → 25점 밴드(라이브 미리보기). 서버에서도 동일 산출.
  const previewScore = mapErrorsToScore(Number(sentErrors) || 0);

  async function doFinalize() {
    setBusy(true);
    setError(null);
    try {
      await finalizeGrade(submissionId, {
        meaning_score: Number(meaning) || 0,
        sentence_errors: Math.max(0, Number(sentErrors) || 0),
      });
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "확정 실패");
    } finally {
      setBusy(false);
    }
  }

  async function doRegrade() {
    setBusy(true);
    setError(null);
    try {
      await regradeSubmission(submissionId);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "재채점 실패");
    } finally {
      setBusy(false);
    }
  }

  const allIssues = [
    ...(meaningDetails ?? []).flatMap((d) =>
      (d.issues ?? []).map((i) => `[의미] ${i.message}`),
    ),
    ...(sentenceDetails ?? []).flatMap((d) =>
      (d.issues ?? []).map((i) => `[문장] ${i.message}`),
    ),
  ];

  return (
    <div>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ width: 90, marginBottom: 0 }}>
          <label>의미(25)</label>
          <input
            type="number"
            min={0}
            max={25}
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
            disabled={finalized}
          />
        </div>
        <div className="field" style={{ width: 120, marginBottom: 0 }}>
          <label>어법 오류 개수</label>
          <input
            type="number"
            min={0}
            step={1}
            value={sentErrors}
            onChange={(e) => setSentErrors(e.target.value)}
            disabled={finalized}
          />
        </div>
        <div style={{ marginBottom: 2 }}>
          <div className="muted" style={{ fontSize: 12 }}>문장 점수</div>
          <div style={{ fontWeight: 700 }}>{previewScore} / 25</div>
        </div>
        {!finalized && (
          <>
            {seedErrors !== (Number(sentErrors) || 0) && (
              <button
                className="btn secondary"
                type="button"
                onClick={() => setSentErrors(String(seedErrors))}
                title="AI/자동 채점이 제안한 오류 개수로 되돌립니다"
              >
                AI값({seedErrors}개) 사용
              </button>
            )}
            <button className="btn" type="button" onClick={doFinalize} disabled={busy}>
              확정
            </button>
            <button className="btn secondary" type="button" onClick={doRegrade} disabled={busy}>
              AI 재채점
            </button>
          </>
        )}
        {finalized && <span className="ok">확정됨</span>}
        {allIssues.length > 0 && (
          <button
            className="btn secondary"
            type="button"
            onClick={() => setShowDetail((s) => !s)}
          >
            AI 지적 {allIssues.length}건
          </button>
        )}
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "6px 0 0" }}>
        어법 오류 0→25 · 1~2→20 · 3~4→15 · 5~6→10 · 7+→5 (오류판단 정확성 루브릭)
      </p>
      {error && <p className="error">{error}</p>}
      {showDetail && allIssues.length > 0 && (
        <ul className="muted" style={{ fontSize: 13, marginTop: 8 }}>
          {allIssues.map((m, i) => (
            <li key={i}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
