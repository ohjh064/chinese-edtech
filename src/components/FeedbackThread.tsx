"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { replyToTeacher, markTeacherMessagesRead } from "@/app/actions/messages";

export interface ThreadMessage {
  id: string;
  sender_role: "teacher" | "student";
  body: string;
  created_at: string;
  read_at?: string | null;
}

/**
 * 학생 대시보드에서 단어 세트별 "선생님 피드백" 버튼 + 대화 팝업.
 * 버튼에 안읽음 배지, 클릭 시 팝업에서 대화(교사↔학생)를 보고 추가 질문(답글)을 남길 수 있다.
 */
export function StudentFeedbackButton({
  teacherId,
  assessmentId,
  messages,
  unread,
}: {
  teacherId: string;
  assessmentId: string;
  messages: ThreadMessage[];
  unread: number;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function openPopup() {
    setOpen(true);
    if (unread > 0) {
      try {
        await markTeacherMessagesRead(assessmentId);
        router.refresh();
      } catch {
        /* 무시 */
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn secondary"
        onClick={openPopup}
        style={{ position: "relative" }}
        title="선생님 피드백 보기"
      >
        💬 선생님 피드백
        {unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 18,
              height: 18,
              padding: "0 5px",
              borderRadius: 999,
              background: "#dc2626",
              color: "#fff",
              fontSize: 11,
              fontWeight: 700,
              lineHeight: "18px",
              textAlign: "center",
            }}
          >
            {unread}
          </span>
        )}
      </button>

      {open && (
        <FeedbackPopup
          teacherId={teacherId}
          assessmentId={assessmentId}
          messages={messages}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function FeedbackPopup({
  teacherId,
  assessmentId,
  messages,
  onClose,
}: {
  teacherId: string;
  assessmentId: string;
  messages: ThreadMessage[];
  onClose: () => void;
}) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await replyToTeacher(teacherId, text, assessmentId);
      setBody("");
      router.refresh(); // 서버 재렌더로 새 답글이 스레드에 반영됨
    } catch (e) {
      setError(e instanceof Error ? e.message : "전송 실패");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="card"
        style={{ width: "min(460px, 100%)", maxHeight: "85vh", display: "flex", flexDirection: "column", background: "#fff", margin: 0 }}
      >
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <b>선생님 피드백</b>
          <button type="button" className="btn secondary" style={{ padding: "4px 10px", fontSize: 13 }} onClick={onClose}>
            닫기
          </button>
        </div>

        <div style={{ margin: "10px 0", display: "grid", gap: 8, overflowY: "auto", flex: 1 }}>
          {messages.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>아직 피드백이 없어요.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                style={{
                  justifySelf: m.sender_role === "student" ? "end" : "start",
                  maxWidth: "82%",
                  background: m.sender_role === "student" ? "#f1f5f9" : "var(--primary-weak)",
                  borderRadius: 10,
                  padding: "8px 12px",
                }}
              >
                <div className="muted" style={{ fontSize: 11 }}>
                  {m.sender_role === "student" ? "나" : "선생님"} · {new Date(m.created_at).toLocaleString("ko-KR")}
                </div>
                <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</div>
              </div>
            ))
          )}
        </div>

        <div className="field" style={{ margin: 0 }}>
          <label>추가 질문·답글</label>
          <textarea
            rows={2}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="선생님께 궁금한 점을 물어보세요."
            disabled={busy}
          />
          <div className="row" style={{ marginTop: 6, justifyContent: "flex-end" }}>
            <button type="button" className="btn" onClick={send} disabled={busy || !body.trim()}>
              {busy ? "전송 중…" : "보내기"}
            </button>
          </div>
          {error && <p className="error" style={{ fontSize: 13 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
