import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Topbar } from "@/components/Topbar";
import { MonitorAutoRefresh } from "@/components/MonitorAutoRefresh";
import type { Assessment, Profile, Submission } from "@/lib/database.types";

// 모니터링은 항상 최신 데이터로(캐시 금지). router.refresh()가 매번 새로 실행.
export const dynamic = "force-dynamic";

type State =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "graded"
  | "finalized";

interface Row {
  studentId: string;
  name: string;
  classNo: string | null;
  inRoster: boolean;
  state: State;
  attempts: number;
  submissionId: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  answered: number;
  elapsedSec: number | null;
  overtime: boolean;
  final: number | null;
}

const STATE_LABEL: Record<State, string> = {
  not_started: "미응시",
  in_progress: "진행중",
  submitted: "제출(검토중)",
  graded: "채점됨",
  finalized: "확정",
};

function stateColor(state: State): string {
  switch (state) {
    case "finalized":
      return "var(--ok)";
    case "in_progress":
      return "var(--warn)";
    case "not_started":
      return "var(--muted)";
    default:
      return "var(--text)";
  }
}

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default async function MonitorPage({
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
  if (!assessment || assessment.teacher_id !== user.id) redirect("/teacher");

  // 대상 반 명단(미응시자 파악용)
  const roster = new Map<string, { name: string; classNo: string | null }>();
  if (assessment.class_id) {
    const { data: enr } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("class_id", assessment.class_id);
    const studentIds = (enr ?? []).map((e: { student_id: string }) => e.student_id);
    if (studentIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, class_no")
        .in("id", studentIds);
      for (const p of (profs ?? []) as Pick<Profile, "id" | "name" | "class_no">[]) {
        roster.set(p.id, { name: p.name || "학생", classNo: p.class_no });
      }
    }
  }

  // 제출물(오름차순 → 마지막이 최신)
  const { data: subRows } = await supabase
    .from("submissions")
    .select("*")
    .eq("assessment_id", id)
    .order("started_at", { ascending: true });
  const submissions = (subRows ?? []) as Submission[];

  // 문항 수(진척도 분모)
  const { count: wordCountRaw } = await supabase
    .from("words")
    .select("id", { count: "exact", head: true })
    .eq("assessment_id", id);
  const wordCount = wordCountRaw ?? 0;

  // 진행 중 제출물의 "실제로 답한" 문항 수(진척도).
  // 자동 임시저장은 빈 칸도 문항마다 행을 만들므로(12초 주기), 행 수가 아니라
  // 내용이 있는 답안만 센다.
  const inProgressIds = submissions
    .filter((s) => s.status === "in_progress")
    .map((s) => s.id);
  const answeredBySub = new Map<string, number>();
  if (inProgressIds.length) {
    const { data: ans } = await supabase
      .from("answers")
      .select(
        "submission_id, student_pinyin, student_tones, student_meaning, student_sentence",
      )
      .in("submission_id", inProgressIds);
    type AnsRow = {
      submission_id: string;
      student_pinyin: string | null;
      student_tones: number[] | null;
      student_meaning: string | null;
      student_sentence: string | null;
    };
    for (const a of (ans ?? []) as AnsRow[]) {
      const hasContent =
        !!a.student_pinyin?.trim() ||
        (a.student_tones?.length ?? 0) > 0 ||
        !!a.student_meaning?.trim() ||
        !!a.student_sentence?.trim();
      if (hasContent) {
        answeredBySub.set(
          a.submission_id,
          (answeredBySub.get(a.submission_id) ?? 0) + 1,
        );
      }
    }
  }

  // 채점 결과(확정 여부 + 최종점수)
  const subIds = submissions.map((s) => s.id);
  const { data: gradeRows } = subIds.length
    ? await supabase
        .from("grades")
        .select("submission_id, final, teacher_finalized")
        .in("submission_id", subIds)
    : { data: [] as { submission_id: string; final: number; teacher_finalized: boolean }[] };
  const gradeBySub = new Map(
    ((gradeRows ?? []) as {
      submission_id: string;
      final: number;
      teacher_finalized: boolean;
    }[]).map((g) => [g.submission_id, g]),
  );

  // 학생별 최신 제출 + 시도 횟수
  const latestByStudent = new Map<string, Submission>();
  const attemptsByStudent = new Map<string, number>();
  for (const s of submissions) {
    latestByStudent.set(s.student_id, s); // 오름차순이므로 마지막 = 최신
    attemptsByStudent.set(s.student_id, (attemptsByStudent.get(s.student_id) ?? 0) + 1);
  }

  // 명단 밖 응시자 이름 보충
  const extraIds = [...latestByStudent.keys()].filter((sid) => !roster.has(sid));
  const nameById = new Map<string, string>();
  if (extraIds.length) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, name")
      .in("id", extraIds);
    for (const p of (profs ?? []) as Pick<Profile, "id" | "name">[]) {
      nameById.set(p.id, p.name || "학생");
    }
  }

  const now = Date.now();
  const allStudentIds = new Set<string>([
    ...roster.keys(),
    ...latestByStudent.keys(),
  ]);

  const rows: Row[] = [...allStudentIds].map((sid) => {
    const meta = roster.get(sid);
    const inRoster = roster.has(sid);
    const name = meta?.name ?? nameById.get(sid) ?? "학생";
    const sub = latestByStudent.get(sid);

    if (!sub) {
      return {
        studentId: sid,
        name,
        classNo: meta?.classNo ?? null,
        inRoster,
        state: "not_started",
        attempts: 0,
        submissionId: null,
        startedAt: null,
        submittedAt: null,
        answered: 0,
        elapsedSec: null,
        overtime: false,
        final: null,
      };
    }

    const grade = gradeBySub.get(sub.id);
    let state: State;
    if (grade?.teacher_finalized) state = "finalized";
    else if (sub.status === "graded") state = "graded";
    else if (sub.status === "submitted") state = "submitted";
    else state = "in_progress";

    const elapsedSec =
      state === "in_progress" && sub.started_at
        ? Math.max(0, Math.floor((now - new Date(sub.started_at).getTime()) / 1000))
        : null;
    const overtime =
      elapsedSec != null &&
      assessment.time_limit_sec != null &&
      elapsedSec > assessment.time_limit_sec;

    return {
      studentId: sid,
      name,
      classNo: meta?.classNo ?? null,
      inRoster,
      state,
      attempts: attemptsByStudent.get(sid) ?? 0,
      submissionId: sub.id,
      startedAt: sub.started_at,
      submittedAt: sub.submitted_at,
      answered: answeredBySub.get(sub.id) ?? 0,
      elapsedSec,
      overtime,
      final: grade?.teacher_finalized ? grade.final : null,
    };
  });

  // 정렬: 미응시 → 진행중 → 제출 → 채점 → 확정, 같은 상태면 번호/이름
  const order: Record<State, number> = {
    not_started: 0,
    in_progress: 1,
    submitted: 2,
    graded: 3,
    finalized: 4,
  };
  rows.sort((a, b) => {
    if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state];
    const an = a.classNo ?? "";
    const bn = b.classNo ?? "";
    if (an !== bn) return an.localeCompare(bn, "ko", { numeric: true });
    return a.name.localeCompare(b.name, "ko");
  });

  const counts = {
    total: rows.length,
    not_started: rows.filter((r) => r.state === "not_started").length,
    in_progress: rows.filter((r) => r.state === "in_progress").length,
    submitted: rows.filter((r) => r.state === "submitted").length,
    graded: rows.filter((r) => r.state === "graded").length,
    finalized: rows.filter((r) => r.state === "finalized").length,
  };
  const doneCount = counts.submitted + counts.graded + counts.finalized;

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
          <h1>응시 현황 모니터링</h1>
          <span className="badge">
            {assessment.status === "draft"
              ? "초안"
              : assessment.status === "published"
                ? "공개"
                : "종료"}
          </span>
        </div>
        <p className="muted" style={{ fontSize: 13 }}>
          {assessment.unit} · {assessment.mode === "exam" ? "평가" : "연습"} ·{" "}
          {assessment.time_limit_sec
            ? `제한시간 ${Math.round(assessment.time_limit_sec / 60)}분`
            : "제한시간 없음"}{" "}
          · 문항 {wordCount}개
          {!assessment.class_id && " · ⚠ 대상 반 미지정(미응시자 명단 없음)"}
        </p>

        <div style={{ margin: "8px 0 16px" }}>
          <MonitorAutoRefresh intervalSec={10} />
        </div>

        <div className="card">
          <div className="row" style={{ gap: 20, flexWrap: "wrap" }}>
            <SummaryStat label="대상" value={counts.total} />
            <SummaryStat label="미응시" value={counts.not_started} color="var(--muted)" />
            <SummaryStat label="진행중" value={counts.in_progress} color="var(--warn)" />
            <SummaryStat label="제출완료" value={doneCount} color="var(--ok)" />
            <SummaryStat label="확정" value={counts.finalized} color="var(--primary)" />
          </div>
          {counts.total > 0 && (
            <p className="muted" style={{ fontSize: 13, margin: "10px 0 0" }}>
              제출 진행률{" "}
              <b>{Math.round((doneCount / counts.total) * 100)}%</b> ({doneCount}/
              {counts.total})
            </p>
          )}
        </div>

        {rows.length === 0 ? (
          <div className="card muted">
            대상 반을 지정하면 명단 기반으로 미응시자까지 표시됩니다. 아직 데이터가
            없습니다.
          </div>
        ) : (
          <div className="card" style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th>번호</th>
                  <th>학생</th>
                  <th>상태</th>
                  <th>진척도</th>
                  <th>경과/제출</th>
                  <th>시도</th>
                  <th>최종</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.studentId}>
                    <td>{r.classNo ?? "—"}</td>
                    <td style={{ fontWeight: 600 }}>
                      {r.submissionId ? (
                        <Link href={`/teacher/${id}/submission/${r.submissionId}`}>
                          {r.name}
                        </Link>
                      ) : (
                        r.name
                      )}
                      {!r.inRoster && (
                        <span className="muted" style={{ fontSize: 11 }}> (명단 외)</span>
                      )}
                    </td>
                    <td style={{ color: stateColor(r.state), fontWeight: 600 }}>
                      {STATE_LABEL[r.state]}
                      {r.overtime && (
                        <span style={{ color: "var(--primary)", fontSize: 11 }}>
                          {" "}· 시간초과
                        </span>
                      )}
                    </td>
                    <td>
                      {r.state === "in_progress" && wordCount > 0
                        ? `${r.answered}/${wordCount}`
                        : r.state === "not_started"
                          ? "—"
                          : "완료"}
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>
                      {r.state === "in_progress" && r.elapsedSec != null
                        ? `${fmtClock(r.elapsedSec)} 경과`
                        : r.submittedAt
                          ? new Date(r.submittedAt).toLocaleTimeString("ko-KR")
                          : "—"}
                    </td>
                    <td>{r.attempts || "—"}</td>
                    <td style={{ fontWeight: 700 }}>
                      {r.final != null ? `${r.final}점` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="row">
          <Link className="btn secondary" href={`/teacher/${id}`}>
            제출 검수
          </Link>
          <Link className="btn secondary" href={`/teacher/${id}/analytics`}>
            분석
          </Link>
        </div>
      </div>
    </>
  );
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? "var(--text)" }}>
        {value}
      </div>
      <div className="muted" style={{ fontSize: 13 }}>
        {label}
      </div>
    </div>
  );
}
