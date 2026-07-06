"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendTeacherMessage, replyToTeacher } from "@/app/actions/messages";

/** 공통 입력 UI(교사/학생 공용) — textarea + 전송 → router.refresh(). */
function Composer({
  onSend,
  placeholder,
  label,
}: {
  onSend: (body: string) => Promise<void>;
  placeholder: string;
  label: string;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit() {
    if (!body.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSend(body.trim());
      setBody("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
      <label>{label}</label>
      <textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        disabled={busy}
      />
      <div className="row" style={{ marginTop: 6 }}>
        <button type="button" className="btn" onClick={submit} disabled={busy || !body.trim()}>
          {busy ? "전송 중…" : "보내기"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

/** 교사 → 학생 메시지 입력. */
export function TeacherMessageBox({
  studentId,
  assessmentId,
}: {
  studentId: string;
  assessmentId?: string;
}) {
  return (
    <Composer
      label="학생에게 메시지 보내기"
      placeholder="예: 3단계 딕테이션에서 성조를 자주 틀렸어요. 다시 연습해 볼까요?"
      onSend={(text) => sendTeacherMessage(studentId, text, assessmentId)}
    />
  );
}

/** 학생 → 교사 답글 입력. */
export function StudentMessageReply({ teacherId }: { teacherId: string }) {
  return (
    <Composer
      label="답글 쓰기"
      placeholder="선생님께 답글을 남겨보세요."
      onSend={(text) => replyToTeacher(teacherId, text)}
    />
  );
}
