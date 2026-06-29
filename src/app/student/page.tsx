import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { aggregatePracticeWeakness, type PracticeLogRow } from "@/lib/analytics";
import type { Assessment, Profile, Submission, Word } from "@/lib/database.types";

export default async function StudentDashboard() {
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
  if (profile?.role === "teacher") redirect("/teacher");
  if (profile?.must_change_password) redirect("/account/password");

  // RLS: 학생은 published + 본인 반 평가만 조회됨
  const { data: assessments } = await supabase
    .from("assessments")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  const { data: mySubs } = await supabase
    .from("submissions")
    .select("*")
    .eq("student_id", user.id);
  const subByAssessment = new Map<string, Submission>();
  for (const s of (mySubs ?? []) as Submission[]) {
    subByAssessment.set(s.assessment_id, s);
  }
  // 교사가 돌려준(반려) 세트 — 재제출/연습 가능
  const returnedAssessmentIds = new Set(
    ((mySubs ?? []) as Submission[])
      .filter((s) => s.returned_at)
      .map((s) => s.assessment_id),
  );

  // 연습 약점 복습 추천 (PRD §6.1)
  const { data: logs } = await supabase
    .from("practice_logs")
    .select("word_id, correct_by_area")
    .eq("student_id", user.id)
    .order("attempt_at", { ascending: false })
    .limit(500);
  const weak = aggregatePracticeWeakness((logs ?? []) as PracticeLogRow[]).slice(0, 5);
  const weakWordIds = weak.map((w) => w.wordId);
  const { data: weakWords } = weakWordIds.length
    ? await supabase
        .from("words")
        .select("id, hanzi, assessment_id")
        .in("id", weakWordIds)
    : { data: [] as Pick<Word, "id" | "hanzi" | "assessment_id">[] };
  const wordInfo = new Map(
    (weakWords ?? []).map((w) => [w.id, w]),
  );
  // 추천 단어의 평가가 현재 연습 가능한지(RLS로 조회되면 가능)
  const practiceableAssessmentIds = new Set(
    (assessments as Assessment[] | null)
      ?.filter(
        (a) =>
          a.mode === "practice" || a.allow_practice || returnedAssessmentIds.has(a.id),
      )
      .map((a) => a.id) ?? [],
  );

  return (
    <>
      <Topbar name={profile?.name || "학생"} role="student" home="/student" />
      <div className="container">
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <Link className="btn secondary" href="/student/notebook">
            AI 오답노트
          </Link>
          <Link className="btn" href="/student/learn">
            회화 학습 →
          </Link>
        </div>
        {weak.length > 0 && (
          <div className="card" style={{ background: "var(--primary-weak)" }}>
            <b>복습 추천</b>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
              연습에서 자주 틀린 단어예요. 다시 연습해 보세요.
            </p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {weak.map((w) => {
                const info = wordInfo.get(w.wordId);
                if (!info) return null;
                const canPractice = practiceableAssessmentIds.has(info.assessment_id);
                const chip = (
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "baseline",
                      padding: "6px 10px",
                      background: "#fff",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  >
                    <b style={{ fontSize: 18 }}>{info.hanzi}</b>
                    <span className="muted" style={{ fontSize: 12 }}>오답 {w.wrong}회</span>
                  </span>
                );
                return canPractice ? (
                  <Link key={w.wordId} href={`/student/practice/${info.assessment_id}`}>
                    {chip}
                  </Link>
                ) : (
                  <span key={w.wordId}>{chip}</span>
                );
              })}
            </div>
          </div>
        )}

        <h1>내 평가</h1>
        {(!assessments || assessments.length === 0) && (
          <div className="card muted">현재 응시 가능한 평가가 없습니다.</div>
        )}
        {(assessments as Assessment[] | null)?.map((a) => {
          const sub = subByAssessment.get(a.id);
          const done = sub && sub.status !== "in_progress";
          const isPractice = a.mode === "practice";
          const returned = !!sub?.returned_at && sub.status === "in_progress";
          const canPractice = a.allow_practice || returnedAssessmentIds.has(a.id);
          return (
            <div className="card" key={a.id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 600 }}>
                    {a.title}
                    {returned && <span className="badge" style={{ marginLeft: 8 }}>돌려받음</span>}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {a.unit} · {isPractice ? "연습" : "평가"}
                    {a.time_limit_sec ? ` · ${Math.round(a.time_limit_sec / 60)}분` : ""}
                  </div>
                </div>
                {isPractice ? (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    <Link className="btn" href={`/student/practice/${a.id}`}>
                      연습하기
                    </Link>
                    <Link className="btn secondary" href={`/student/quiz/${a.id}`}>
                      퀴즈
                    </Link>
                    <Link className="btn secondary" href={`/student/flashcards/${a.id}`}>
                      플래시카드
                    </Link>
                  </div>
                ) : (
                  <div className="row" style={{ gap: 8, alignItems: "center" }}>
                    {done ? (
                      <Link className="btn secondary" href={`/student/result/${sub!.id}`}>
                        결과 보기
                      </Link>
                    ) : (
                      <Link className="btn" href={`/student/take/${a.id}`}>
                        {sub ? (returned ? "다시 제출하기" : "이어서 응시") : "응시 시작"}
                      </Link>
                    )}
                    {canPractice && (
                      <>
                        <Link className="btn secondary" href={`/student/practice/${a.id}`}>
                          연습하기
                        </Link>
                        <Link className="btn secondary" href={`/student/quiz/${a.id}`}>
                          퀴즈
                        </Link>
                        <Link className="btn secondary" href={`/student/flashcards/${a.id}`}>
                          플래시카드
                        </Link>
                      </>
                    )}
                  </div>
                )}
              </div>
              {returned && (
                <p className="muted" style={{ fontSize: 13, margin: "8px 0 0" }}>
                  ↩ 교사가 돌려줬습니다.
                  {sub?.returned_note ? ` 코멘트: ${sub.returned_note}` : " 답안을 고쳐 다시 제출하거나 연습해 보세요."}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
