import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { aggregateErrors, type SubmissionDetails } from "@/lib/analytics";
import type { Assessment, Grade, Profile, Word } from "@/lib/database.types";

function heatColor(count: number, max: number): string {
  if (count <= 0 || max <= 0) return "transparent";
  const intensity = Math.min(1, count / max);
  // 연한 → 진한 홍색
  const alpha = 0.12 + intensity * 0.6;
  return `rgba(192, 57, 43, ${alpha.toFixed(2)})`;
}

export default async function AnalyticsPage({
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

  const { data: words } = await supabase
    .from("words")
    .select("*")
    .eq("assessment_id", id)
    .order("ord");
  const hanziById = new Map(((words ?? []) as Word[]).map((w) => [w.id, w.hanzi]));

  const { data: subs } = await supabase
    .from("submissions")
    .select("id")
    .eq("assessment_id", id);
  const subIds = (subs ?? []).map((s: { id: string }) => s.id);

  const { data: grades } = subIds.length
    ? await supabase.from("grades").select("*").in("submission_id", subIds)
    : { data: [] as Grade[] };

  const detailsList: SubmissionDetails[] = ((grades ?? []) as Grade[])
    .map((g) => g.details)
    .filter((d): d is SubmissionDetails => !!d && typeof d === "object");

  const agg = aggregateErrors(detailsList);
  const maxCell = Math.max(
    1,
    ...agg.byWord.flatMap((w) => [w.pinyin, w.tone, w.meaning, w.sentence]),
  );

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href={`/teacher/${id}`} className="muted">
          ← {assessment.title}
        </Link>
        <h1>분석 · {assessment.title}</h1>

        <div className="card">
          <b>채점된 제출 {agg.submissions}건</b>
          <p className="muted" style={{ fontSize: 13, margin: "4px 0 0" }}>
            평균 오류 — 병음 {agg.areaAvgErrors.pinyin.toFixed(1)} · 성조{" "}
            {agg.areaAvgErrors.tone.toFixed(1)} · 의미{" "}
            {agg.areaAvgErrors.meaning.toFixed(1)} · 문장{" "}
            {agg.areaAvgErrors.sentence.toFixed(1)}
          </p>
        </div>

        {agg.byWord.length === 0 ? (
          <div className="card muted">아직 채점된 제출이 없습니다.</div>
        ) : (
          <>
            <div className="card" style={{ overflowX: "auto" }}>
              <h3 style={{ marginTop: 0 }}>오류 히트맵 (단어 × 영역)</h3>
              <table>
                <thead>
                  <tr>
                    <th>단어</th>
                    <th>병음</th>
                    <th>성조</th>
                    <th>의미</th>
                    <th>문장</th>
                    <th>오답 학생</th>
                  </tr>
                </thead>
                <tbody>
                  {agg.byWord.map((w) => (
                    <tr key={w.wordId}>
                      <td style={{ fontWeight: 600 }}>
                        {hanziById.get(w.wordId) ?? w.wordId.slice(0, 6)}
                      </td>
                      {(["pinyin", "tone", "meaning", "sentence"] as const).map((a) => (
                        <td
                          key={a}
                          style={{ background: heatColor(w[a], maxCell), textAlign: "center" }}
                        >
                          {w[a] || ""}
                        </td>
                      ))}
                      <td>
                        {w.studentsWithError}/{agg.submissions}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="card">
              <h3 style={{ marginTop: 0 }}>취약 단어 Top 5 (복습 추천)</h3>
              <ol>
                {agg.byWord.slice(0, 5).map((w) => (
                  <li key={w.wordId}>
                    <b>{hanziById.get(w.wordId) ?? w.wordId.slice(0, 6)}</b> — 총 오류{" "}
                    {w.total}회, 오답 학생 {w.studentsWithError}명
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </div>
    </>
  );
}
