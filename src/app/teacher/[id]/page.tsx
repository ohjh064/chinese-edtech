import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import {
  publishAssessment,
  closeAssessment,
  reopenAssessment,
  unpublishAssessment,
} from "@/app/actions/teacher";
import { FinalizeControls } from "@/components/FinalizeControls";
import type {
  Assessment,
  Grade,
  Profile,
  Submission,
} from "@/lib/database.types";

interface GradeDetails {
  requiresTeacherConfirm?: boolean;
  meaning?: { wordId: string; errors: number; issues?: { message: string }[] }[];
  sentence?: { wordId: string; errors: number; issues?: { message: string }[] }[];
}

export default async function AssessmentDetail({
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();
  if (profile?.role !== "teacher") redirect("/student");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single<Assessment>();
  if (!assessment) redirect("/teacher");

  const { data: subs } = await supabase
    .from("submissions")
    .select("*")
    .eq("assessment_id", id)
    .order("submitted_at", { ascending: true });
  const submissions = (subs ?? []) as Submission[];

  const studentIds = [...new Set(submissions.map((s) => s.student_id))];
  const { data: studentRows } = studentIds.length
    ? await supabase.from("profiles").select("id,name").in("id", studentIds)
    : { data: [] as Pick<Profile, "id" | "name">[] };
  const nameById = new Map(
    (studentRows ?? []).map((p) => [p.id, p.name || "학생"]),
  );

  const subIds = submissions.map((s) => s.id);
  const { data: gradeRows } = subIds.length
    ? await supabase.from("grades").select("*").in("submission_id", subIds)
    : { data: [] as Grade[] };
  const gradeBySub = new Map(
    ((gradeRows ?? []) as Grade[]).map((g) => [g.submission_id, g]),
  );

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href="/teacher" className="muted">
          ← 평가 목록
        </Link>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <h1>{assessment.title}</h1>
          <span className="badge">
            {assessment.status === "draft" ? "초안" : assessment.status === "published" ? "공개" : "종료"}
          </span>
        </div>
        <p className="muted">
          {assessment.unit} · {assessment.mode === "exam" ? "평가" : "연습"} · 병음단위:{" "}
          {assessment.pinyin_error_unit} · 문장: {assessment.sentence_task_type}
        </p>

        <div className="card row" style={{ gap: 8 }}>
          {assessment.status === "draft" && (
            <form action={publishAssessment.bind(null, id)}>
              <button className="btn" type="submit">공개(응시 시작)</button>
            </form>
          )}
          {assessment.status === "published" && (
            <>
              <form action={closeAssessment.bind(null, id)}>
                <button className="btn secondary" type="submit">평가 종료</button>
              </form>
              <form action={unpublishAssessment.bind(null, id)}>
                <button
                  className="btn secondary"
                  type="submit"
                  title="학생 목록에서 숨기고 초안으로 되돌립니다"
                >
                  회수(초안으로)
                </button>
              </form>
            </>
          )}
          {assessment.status === "closed" && (
            <form action={reopenAssessment.bind(null, id)}>
              <button className="btn" type="submit" title="종료를 취소하고 응시를 재개합니다">
                종료 취소(응시 재개)
              </button>
            </form>
          )}
          <Link className="btn secondary" href={`/teacher/${id}/edit`}>
            수정
          </Link>
          <Link className="btn secondary" href={`/teacher/${id}/monitor`}>
            응시 현황
          </Link>
          <Link className="btn secondary" href={`/teacher/${id}/analytics`}>
            분석
          </Link>
          <Link className="btn secondary" href={`/api/export/${id}`}>
            엑셀 내보내기(NEIS)
          </Link>
        </div>

        <h2>제출 현황 ({submissions.length})</h2>
        <p className="muted" style={{ fontSize: 13 }}>
          병음·성조는 자동 확정값입니다. 의미·문장은 AI 제안값을 검토·수정 후 <b>확정</b>하면
          학생에게 점수가 공개됩니다(PRD §5.4).
        </p>
        {submissions.length === 0 && <div className="card muted">아직 제출이 없습니다.</div>}

        {submissions.map((s) => {
          const g = gradeBySub.get(s.id);
          const details = (g?.details ?? null) as GradeDetails | null;
          return (
            <div className="card" key={s.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="row" style={{ alignItems: "center", gap: 10 }}>
                  <b>{nameById.get(s.student_id)}</b>
                  <Link
                    className="btn secondary"
                    href={`/teacher/${id}/submission/${s.id}`}
                    style={{ padding: "4px 10px", fontSize: 13 }}
                  >
                    답안 보기
                  </Link>
                </div>
                {g?.teacher_finalized ? (
                  <span className="ok">확정 · 최종 {g.final}점</span>
                ) : details?.requiresTeacherConfirm ? (
                  <span className="badge">검토 필요</span>
                ) : (
                  <span className="muted">{g ? "자동 채점됨" : "미채점"}</span>
                )}
              </div>
              {g && (
                <>
                  <p className="muted" style={{ fontSize: 13 }}>
                    병음 {g.pinyin_score} · 성조 {g.tone_score} · 의미 {g.meaning_score} · 문장{" "}
                    {g.sentence_score}(어법 오류 {g.sentence_errors}개) → 합계 {g.total} / 최종{" "}
                    <b>{g.final}</b>
                  </p>
                  <FinalizeControls
                    submissionId={s.id}
                    meaningScore={g.meaning_score}
                    sentenceErrors={g.sentence_errors}
                    finalized={g.teacher_finalized}
                    meaningDetails={details?.meaning}
                    sentenceDetails={details?.sentence}
                  />
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
