import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TeacherMessageBox } from "@/components/MessageComposer";
import { summarizeStudyLogs, type StudyLogRow } from "@/lib/analytics";
import type { Profile, StudentMessage } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const STEP_LABELS: Record<number, string> = {
  1: "듣기",
  2: "매칭",
  3: "딕테이션",
  4: "스피드",
  5: "Writing",
};

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("ko-KR") : "-";
}

type LogRow = StudyLogRow & { assessment_id: string };

export default async function StudentLearningPage({
  params,
}: {
  params: Promise<{ studentId: string }>;
}) {
  const { studentId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "teacher") redirect("/student");

  const { data: student } = await supabase
    .from("profiles")
    .select("id, name, class_no")
    .eq("id", studentId)
    .single<{ id: string; name: string; class_no: string | null }>();
  if (!student) redirect("/teacher");

  // 이 학생의 학습 로그(RLS로 내 담당 평가만 보임)
  const { data: logsRaw } = await supabase
    .from("study_logs")
    .select("assessment_id, word_id, step, correct, attempt_at")
    .eq("student_id", studentId);
  const logs = (logsRaw ?? []) as LogRow[];

  const assessmentIds = [...new Set(logs.map((l) => l.assessment_id))];
  const { data: assessRaw } = assessmentIds.length
    ? await supabase.from("assessments").select("id, title").in("id", assessmentIds)
    : { data: [] as { id: string; title: string }[] };
  const titleById = new Map(((assessRaw ?? []) as { id: string; title: string }[]).map((a) => [a.id, a.title]));

  const { data: wordsRaw } = assessmentIds.length
    ? await supabase.from("words").select("id, hanzi").in("assessment_id", assessmentIds)
    : { data: [] as { id: string; hanzi: string }[] };
  const hanziById = new Map(((wordsRaw ?? []) as { id: string; hanzi: string }[]).map((w) => [w.id, w.hanzi]));

  const byAssessment = new Map<string, StudyLogRow[]>();
  for (const l of logs) {
    const arr = byAssessment.get(l.assessment_id) ?? [];
    arr.push(l);
    byAssessment.set(l.assessment_id, arr);
  }
  const sections = [...byAssessment.entries()].map(([aid, rows]) => ({
    assessmentId: aid,
    title: titleById.get(aid) ?? "단어 세트",
    summary: summarizeStudyLogs(rows),
  }));

  // 1:1 메시지 스레드
  const { data: msgsRaw } = await supabase
    .from("student_messages")
    .select("*")
    .eq("teacher_id", user.id)
    .eq("student_id", studentId)
    .order("created_at", { ascending: true });
  const msgs = (msgsRaw ?? []) as StudentMessage[];

  return (
    <>
      <Topbar name={profile?.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href="/teacher" className="muted">← 평가 관리</Link>
        <h1>
          {student.name || "학생"}
          {student.class_no && <span className="muted" style={{ marginLeft: 8, fontSize: 15 }}>{student.class_no}</span>}
        </h1>
        <p className="muted">이 학생의 단어장 학습 현황(세트별)과 메시지입니다.</p>

        {sections.length === 0 && <div className="card muted">아직 학습 기록이 없습니다.</div>}
        {sections.map((sec) => (
          <div className="card" key={sec.assessmentId}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Link href={`/teacher/${sec.assessmentId}/learning`} style={{ fontWeight: 700, fontSize: 16 }}>
                {sec.title}
              </Link>
              <span className="muted" style={{ fontSize: 13 }}>
                학습 {sec.summary.learnedWordIds.length} · 오답 {sec.summary.wrongWordIds.length}
              </span>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
              최근 학습 {fmtDate(sec.summary.lastAt)}
              {sec.summary.dates.length > 1 && ` · 총 ${sec.summary.dates.length}일`}
              {sec.summary.firstAt && sec.summary.firstAt.slice(0, 10) !== (sec.summary.lastAt ?? "").slice(0, 10)
                ? ` (${fmtDate(sec.summary.firstAt)}부터)`
                : ""}
            </div>
            <div style={{ marginTop: 8 }}>
              {sec.summary.byStep.map((s) => (
                <div key={s.step} className="row" style={{ alignItems: "baseline", gap: 8, margin: "2px 0" }}>
                  <span className="badge">{s.step}단계 · {STEP_LABELS[s.step]}</span>
                  <span className="muted" style={{ fontSize: 13 }}>
                    {s.step === 1 ? `들은 단어 ${s.attempted}개` : `정답 ${s.correct} / ${s.attempted}`}
                  </span>
                  {s.wrongWordIds.length > 0 && (
                    <span className="error" style={{ fontSize: 13 }}>
                      오답: {s.wrongWordIds.map((w) => hanziById.get(w) ?? "?").join(", ")}
                    </span>
                  )}
                  <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{fmtDate(s.lastAt)}</span>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="card">
          <b>메시지</b>
          {msgs.length === 0 ? (
            <p className="muted" style={{ fontSize: 13, margin: "6px 0" }}>아직 주고받은 메시지가 없습니다.</p>
          ) : (
            <div style={{ margin: "8px 0", display: "grid", gap: 8 }}>
              {msgs.map((m) => (
                <div
                  key={m.id}
                  style={{
                    justifySelf: m.sender_role === "teacher" ? "end" : "start",
                    maxWidth: "80%",
                    background: m.sender_role === "teacher" ? "var(--primary-weak)" : "#f1f5f9",
                    borderRadius: 10,
                    padding: "8px 12px",
                  }}
                >
                  <div className="muted" style={{ fontSize: 11 }}>
                    {m.sender_role === "teacher" ? "나(교사)" : student.name || "학생"} · {new Date(m.created_at).toLocaleString("ko-KR")}
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</div>
                </div>
              ))}
            </div>
          )}
          <TeacherMessageBox studentId={studentId} />
        </div>
      </div>
    </>
  );
}
