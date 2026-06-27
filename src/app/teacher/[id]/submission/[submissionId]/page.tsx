import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { toDisplayWord } from "@/grading/pinyin.js";
import type {
  Answer,
  Assessment,
  Grade,
  Profile,
  Submission,
  Word,
  WordKey,
} from "@/lib/database.types";

interface AreaDetail {
  wordId: string;
  errors: number;
  issues?: { message: string }[];
}
interface GradeDetails {
  pinyin?: AreaDetail[];
  tone?: AreaDetail[];
  meaning?: AreaDetail[];
  sentence?: AreaDetail[];
  requiresTeacherConfirm?: boolean;
}

const ATTENDANCE_LABEL: Record<string, string> = {
  attempted: "응시",
  long_absent: "장기결석",
  not_attempted: "미응시",
};

// 오류판단 정확성 루브릭(어법 오류 개수 → 25점). scale.ts mapErrorsToScore와 일치.
const RUBRIC = [
  { label: "0", score: 25 },
  { label: "1~2", score: 20 },
  { label: "3~4", score: 15 },
  { label: "5~6", score: 10 },
  { label: "7+", score: 5 },
] as const;

function rubricBand(errors: number): number {
  if (errors <= 0) return 0;
  if (errors <= 2) return 1;
  if (errors <= 4) return 2;
  if (errors <= 6) return 3;
  return 4;
}

/** 정답(오류 0)이면 초록, 오류가 있으면 빨강 표시 */
function markStyle(errors: number | undefined): React.CSSProperties {
  return errors && errors > 0
    ? { color: "var(--primary)", fontWeight: 600 }
    : { color: "var(--ok)", fontWeight: 600 };
}

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string; submissionId: string }>;
}) {
  const { id, submissionId } = await params;
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

  // RLS(submissions_teacher_read): 본인 평가의 제출만 조회됨
  const { data: submission } = await supabase
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single<Submission>();
  if (!submission || submission.assessment_id !== id) redirect(`/teacher/${id}`);

  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", id)
    .single<Assessment>();
  if (!assessment || assessment.teacher_id !== user.id) redirect("/teacher");

  const { data: student } = await supabase
    .from("profiles")
    .select("id, name, class_no")
    .eq("id", submission.student_id)
    .single<Pick<Profile, "id" | "name" | "class_no">>();

  // 문항 + 정답키(교사 RLS로 읽기 가능) + 학생 답안
  const { data: wordRows } = await supabase
    .from("words")
    .select("*")
    .eq("assessment_id", id)
    .order("ord");
  const words = (wordRows ?? []) as Word[];

  const wordIds = words.map((w) => w.id);
  const { data: keyRows } = wordIds.length
    ? await supabase.from("word_keys").select("*").in("word_id", wordIds)
    : { data: [] as WordKey[] };
  const keyByWord = new Map(
    ((keyRows ?? []) as WordKey[]).map((k) => [k.word_id, k]),
  );

  const { data: answerRows } = await supabase
    .from("answers")
    .select("*")
    .eq("submission_id", submissionId);
  const answerByWord = new Map(
    ((answerRows ?? []) as Answer[]).map((a) => [a.word_id, a]),
  );

  const { data: grade } = await supabase
    .from("grades")
    .select("*")
    .eq("submission_id", submissionId)
    .maybeSingle<Grade>();
  const details = (grade?.details ?? null) as GradeDetails | null;

  const detailMap = (arr?: AreaDetail[]) =>
    new Map((arr ?? []).map((d) => [d.wordId, d]));
  const pinyinD = detailMap(details?.pinyin);
  const toneD = detailMap(details?.tone);
  const meaningD = detailMap(details?.meaning);
  const sentenceD = detailMap(details?.sentence);

  const isFindError = assessment.sentence_task_type === "find_error";
  const isJudge = assessment.sentence_task_type === "judge";

  return (
    <>
      <Topbar name={profile.name || "교사"} role="teacher" home="/teacher" />
      <div className="container">
        <Link href={`/teacher/${id}`} className="muted">
          ← {assessment.title}
        </Link>
        <div
          className="row"
          style={{ justifyContent: "space-between", alignItems: "center" }}
        >
          <h1>
            {student?.name || "학생"} 답안
            {student?.class_no && (
              <span className="muted" style={{ fontSize: 15 }}> · {student.class_no}번</span>
            )}
          </h1>
          {grade && <span className="badge">최종 {grade.final}점</span>}
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          {ATTENDANCE_LABEL[submission.attendance] ?? submission.attendance} ·{" "}
          {submission.submitted_at
            ? `제출 ${new Date(submission.submitted_at).toLocaleString("ko-KR")}`
            : "미제출"}
          {grade &&
            ` · 병음 ${grade.pinyin_score} · 성조 ${grade.tone_score} · 의미 ${grade.meaning_score} · 문장 ${grade.sentence_score} → 합계 ${grade.total}`}
        </p>

        {grade && !isFindError && (
          <div className="card">
            <b>오류판단 정확성({isJudge ? "어법 판단형" : "문장"})</b>
            <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>
              {isJudge ? "오답" : "어법 오류"}{" "}
              <b style={{ color: "var(--text)" }}>{grade.sentence_errors}</b>개 → 문장{" "}
              <b style={{ color: "var(--text)" }}>{grade.sentence_score}</b> / 25
              {grade.teacher_finalized
                ? " · 교사 확정"
                : isJudge
                  ? " · 자동 채점"
                  : " · 검토 전(자동/AI 제안)"}
            </p>
            <table>
              <tbody>
                <tr>
                  <th>{isJudge ? "오답 수" : "어법 오류"}</th>
                  {RUBRIC.map((b, i) => (
                    <td
                      key={b.label}
                      style={{
                        textAlign: "center",
                        background:
                          rubricBand(grade.sentence_errors) === i
                            ? "var(--primary-weak)"
                            : "transparent",
                        fontWeight: rubricBand(grade.sentence_errors) === i ? 700 : 400,
                      }}
                    >
                      {b.label}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th>점수</th>
                  {RUBRIC.map((b, i) => (
                    <td
                      key={b.label}
                      style={{
                        textAlign: "center",
                        background:
                          rubricBand(grade.sentence_errors) === i
                            ? "var(--primary-weak)"
                            : "transparent",
                        fontWeight: rubricBand(grade.sentence_errors) === i ? 700 : 400,
                      }}
                    >
                      {b.score}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {words.length === 0 && (
          <div className="card muted">문항이 없습니다.</div>
        )}

        {words.map((w) => {
          const key = keyByWord.get(w.id);
          const ans = answerByWord.get(w.id);
          const pin = pinyinD.get(w.id);
          const ton = toneD.get(w.id);
          const mea = meaningD.get(w.id);
          const sen = sentenceD.get(w.id);

          const studentPinyin = ans?.student_pinyin
            ? toDisplayWord(ans.student_pinyin, ans.student_tones ?? undefined)
            : "(미입력)";
          const correctPinyin = key
            ? toDisplayWord(key.correct_pinyin, key.correct_tones)
            : "—";

          const issues = [
            ...(pin?.issues ?? []),
            ...(ton?.issues ?? []),
            ...(mea?.issues ?? []),
            ...(sen?.issues ?? []),
          ];

          return (
            <div className="card" key={w.id}>
              <div className="row" style={{ alignItems: "baseline", gap: 10 }}>
                <span className="muted">{w.ord + 1}.</span>
                <span style={{ fontSize: 28, fontWeight: 700 }}>{w.hanzi}</span>
              </div>

              <table style={{ marginTop: 8 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>영역</th>
                    <th>학생 답안</th>
                    <th>정답</th>
                    <th style={{ width: 120 }}>오류</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>병음·성조</td>
                    <td className="pill-preview" style={markStyle((pin?.errors ?? 0) + (ton?.errors ?? 0))}>
                      {studentPinyin}
                    </td>
                    <td className="pill-preview muted">{correctPinyin}</td>
                    <td>
                      병음 {pin?.errors ?? 0} · 성조 {ton?.errors ?? 0}
                    </td>
                  </tr>
                  <tr>
                    <td>의미</td>
                    <td style={markStyle(mea?.errors)}>
                      {ans?.student_meaning || "(미입력)"}
                    </td>
                    <td className="muted">
                      {key?.acceptable_meanings?.length
                        ? key.acceptable_meanings.join(", ")
                        : "—"}
                    </td>
                    <td>{mea?.errors ?? 0}</td>
                  </tr>
                  <tr>
                    <td>{isJudge ? "어법 판단" : "문장"}</td>
                    <td style={markStyle(sen?.errors)}>
                      {isJudge
                        ? ans?.student_sentence
                          ? ans.student_sentence.toUpperCase() === "O"
                            ? "O (맞음)"
                            : "X (안 맞음)"
                          : "(미응답)"
                        : ans?.student_sentence || "(미입력)"}
                    </td>
                    <td className="muted">
                      {isJudge
                        ? key?.is_grammatical
                          ? "O (맞음)"
                          : "X (안 맞음)"
                        : isFindError
                          ? key?.acceptable_corrections?.length
                            ? key.acceptable_corrections.join(" / ")
                            : "—"
                          : key?.example_sentence || "(예문 없음)"}
                    </td>
                    <td>{sen?.errors ?? 0}</td>
                  </tr>
                </tbody>
              </table>

              {(isFindError || isJudge) && w.error_prompt && (
                <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>
                  제시 문장: {w.error_prompt}
                </p>
              )}
              {isJudge && key?.explanation && (
                <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  해설: {key.explanation}
                </p>
              )}

              {issues.length > 0 && (
                <ul className="muted" style={{ fontSize: 13, marginTop: 8 }}>
                  {issues.map((it, idx) => (
                    <li key={idx}>{it.message}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <Link className="btn secondary" href={`/teacher/${id}`}>
          ← 제출 목록으로
        </Link>
      </div>
    </>
  );
}
