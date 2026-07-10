import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { TeacherMessageBox } from "@/components/MessageComposer";
import { summarizeStudyLogs, type StudyLogRow } from "@/lib/analytics";
import type { Assessment, Profile, StudentMessage } from "@/lib/database.types";

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

type LogRow = StudyLogRow & { student_id: string };
type ProfRow = { id: string; name: string; class_no: string | null };

export default async function LearningPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (profile?.role !== "teacher") redirect("/student");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single<Assessment>();
  if (!assessment || assessment.teacher_id !== user.id) redirect("/teacher");

  // 학습 로그(RLS: 교사는 담당 평가만 read)
  const { data: logsRaw } = await supabase
    .from("study_logs")
    .select("student_id, word_id, step, correct, attempt_at")
    .eq("assessment_id", id);
  const logs = (logsRaw ?? []) as LogRow[];

  // 단어 라벨(한자)
  const { data: wordsRaw } = await supabase.from("words").select("id, hanzi").eq("assessment_id", id);
  const hanziById = new Map(
    ((wordsRaw ?? []) as { id: string; hanzi: string }[]).map((w) => [w.id, w.hanzi]),
  );

  // 이 세트의 피드백 스레드(학생별) — 대화형 답변용
  const { data: msgsRaw } = await supabase
    .from("student_messages")
    .select("*")
    .eq("teacher_id", user.id)
    .eq("assessment_id", id)
    .order("created_at", { ascending: true });
  const msgsByStudent = new Map<string, StudentMessage[]>();
  for (const m of (msgsRaw ?? []) as StudentMessage[]) {
    const arr = msgsByStudent.get(m.student_id) ?? [];
    arr.push(m);
    msgsByStudent.set(m.student_id, arr);
  }

  // 명단: 반 enrollment + 학습 기록이 있는 학생 union
  const idsWithLogs = [...new Set(logs.map((l) => l.student_id))];
  let rosterIds: string[] = [];
  if (assessment.class_id) {
    const { data: enr } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("class_id", assessment.class_id);
    rosterIds = ((enr ?? []) as { student_id: string }[]).map((e) => e.student_id);
  }
  const allIds = [...new Set([...rosterIds, ...idsWithLogs])];
  const { data: profsRaw } = allIds.length
    ? await supabase.from("profiles").select("id, name, class_no").in("id", allIds)
    : { data: [] as ProfRow[] };
  const profById = new Map(((profsRaw ?? []) as ProfRow[]).map((p) => [p.id, p]));

  const byStudent = new Map<string, StudyLogRow[]>();
  for (const l of logs) {
    const arr = byStudent.get(l.student_id) ?? [];
    arr.push(l);
    byStudent.set(l.student_id, arr);
  }

  const rows = allIds
    .map((sid) => ({
      id: sid,
      prof: profById.get(sid),
      summary: summarizeStudyLogs(byStudent.get(sid) ?? []),
      messages: msgsByStudent.get(sid) ?? [],
    }))
    .sort((a, b) =>
      (a.prof?.class_no ?? "").localeCompare(b.prof?.class_no ?? "", "ko", { numeric: true }),
    );

  return (
    <>
      <Topbar name={profile?.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href={`/teacher/${id}`} className="muted">← {assessment.title}</Link>
        <h1>학습 현황 · {assessment.title}</h1>
        <p className="muted">단어장 학습 단계별로 학생이 학습한 단어와 오답 단어를 확인하고 메시지를 보낼 수 있어요.</p>
        {rows.length === 0 && <div className="card muted">아직 학습 기록이 없습니다.</div>}
        {rows.map((r) => (
          <div className="card" key={r.id}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <Link href={`/teacher/student/${r.id}`} style={{ fontWeight: 700, fontSize: 16 }}>
                  {r.prof?.name || "학생"}
                </Link>
                {r.prof?.class_no && (
                  <span className="muted" style={{ marginLeft: 6, fontSize: 13 }}>{r.prof.class_no}</span>
                )}
              </div>
              <span className="muted" style={{ fontSize: 13 }}>
                학습 {r.summary.learnedWordIds.length} · 오답 {r.summary.wrongWordIds.length}
              </span>
            </div>
            {r.summary.byStep.length === 0 ? (
              <p className="muted" style={{ fontSize: 13, margin: "6px 0 0" }}>아직 학습 기록이 없어요.</p>
            ) : (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                  최근 학습 {fmtDate(r.summary.lastAt)}
                  {r.summary.dates.length > 1 && ` · 총 ${r.summary.dates.length}일`}
                  {r.summary.firstAt && r.summary.firstAt.slice(0, 10) !== (r.summary.lastAt ?? "").slice(0, 10)
                    ? ` (${fmtDate(r.summary.firstAt)}부터)`
                    : ""}
                </div>
                <div style={{ marginTop: 8 }}>
                  {r.summary.byStep.map((s) => (
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
              </>
            )}
            {r.messages.length > 0 && (
              <div style={{ margin: "10px 0 0", display: "grid", gap: 8 }}>
                {r.messages.map((m) => (
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
                      {m.sender_role === "teacher" ? "나(교사)" : r.prof?.name || "학생"} · {new Date(m.created_at).toLocaleString("ko-KR")}
                    </div>
                    <div style={{ fontSize: 14, whiteSpace: "pre-wrap" }}>{m.body}</div>
                  </div>
                ))}
              </div>
            )}
            <TeacherMessageBox studentId={r.id} assessmentId={id} />
          </div>
        ))}
      </div>
    </>
  );
}
