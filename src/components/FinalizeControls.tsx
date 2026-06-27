"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { finalizeGrade, regradeSubmission } from "@/app/actions/teacher";

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
  sentenceScore,
  finalized,
  meaningDetails,
  sentenceDetails,
}: {
  submissionId: string;
  meaningScore: number;
  sentenceScore: number;
  finalized: boolean;
  meaningDetails?: AnswerDetail[];
  sentenceDetails?: AnswerDetail[];
}) {
  const [meaning, setMeaning] = useState(String(meaningScore));
  const [sentence, setSentence] = useState(String(sentenceScore));
  const [showDetail, setShowDetail] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function doFinalize() {
    setBusy(true);
    setError(null);
    try {
      await finalizeGrade(submissionId, {
        meaning_score: Number(meaning),
        sentence_score: Number(sentence),
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
        <div className="field" style={{ width: 90, marginBottom: 0 }}>
          <label>문장(25)</label>
          <input
            type="number"
            min={0}
            max={25}
            value={sentence}
            onChange={(e) => setSentence(e.target.value)}
            disabled={finalized}
          />
        </div>
        {!finalized && (
          <>
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
