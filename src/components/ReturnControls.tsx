"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { returnSubmission } from "@/app/actions/teacher";

/**
 * 제출물 돌려주기(반려) — 메모 입력 후 학생에게 되돌린다.
 * 돌려주면 학생이 답안을 고쳐 재제출하거나 그 세트를 연습 모드로 복습할 수 있다.
 */
export function ReturnControls({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function doReturn() {
    setBusy(true);
    setError(null);
    try {
      await returnSubmission(submissionId, note);
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "돌려주기 실패");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn secondary"
        style={{ padding: "4px 10px", fontSize: 13 }}
        onClick={() => setOpen(true)}
        title="학생에게 돌려줘 재제출·연습할 수 있게 합니다"
      >
        돌려주기
      </button>
    );
  }

  return (
    <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
      <label>돌려주기 메모(학생에게 표시 · 선택)</label>
      <textarea
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="예: 3번 단어 성조를 다시 확인해 보세요."
        disabled={busy}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button type="button" className="btn" onClick={doReturn} disabled={busy}>
          {busy ? "처리 중…" : "돌려주기 확정"}
        </button>
        <button type="button" className="btn secondary" onClick={() => setOpen(false)} disabled={busy}>
          취소
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12, margin: "4px 0 0" }}>
        되돌리면 점수는 재확정 전까지 학생에게 숨겨집니다.
      </p>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
