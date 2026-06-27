import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import type { Grade, Profile, Submission } from "@/lib/database.types";

const AREAS = [
  { key: "pinyin", label: "병음표기" },
  { key: "tone", label: "성조변별" },
  { key: "meaning", label: "의미변별" },
  { key: "sentence", label: "오류판단(문장)" },
] as const;

export default async function ResultPage({
  params,
}: {
  params: Promise<{ submissionId: string }>;
}) {
  const { submissionId } = await params;
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

  const { data: submission } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single<Submission>();
  if (!submission || submission.student_id !== user.id) redirect("/student");

  // RLS: teacher_finalized 된 경우에만 조회됨
  const { data: grade } = await supabase
    .from("grades")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle<Grade>();

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <Link href="/student" className="muted">
          ← 내 평가
        </Link>
        <h1>채점 결과</h1>

        {!grade && (
          <div className="card">
            <p>제출이 완료되었습니다. 교사 검수 후 점수가 공개됩니다.</p>
            <p className="muted">병음·성조는 자동채점되었고, 의미·문장은 교사 확정 대기 중입니다.</p>
          </div>
        )}

        {grade && (
          <>
            <div className="card" style={{ textAlign: "center" }}>
              <div className="muted">최종 점수</div>
              <div className="score-big">{grade.final}</div>
              <div className="muted">합계 {grade.total} / 100</div>
            </div>

            <div className="card">
              <table>
                <thead>
                  <tr>
                    <th>영역</th>
                    <th>오류 수</th>
                    <th>점수</th>
                  </tr>
                </thead>
                <tbody>
                  {AREAS.map((a) => {
                    const score = grade[`${a.key}_score` as keyof Grade] as number;
                    const errors = grade[`${a.key}_errors` as keyof Grade] as number;
                    return (
                      <tr key={a.key}>
                        <td>{a.label}</td>
                        <td>{errors}</td>
                        <td>
                          <b>{score}</b> / 25
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
