"use server";

/**
 * 영역별 퀴즈 게임 서버 액션 — 문제 생성(정답키 admin 로딩), 점수 제출, 리더보드.
 * 정답키는 클라에 노출하지 않고 생성된 보기/정답 index만 전달. 결정론 채점(AI·비용 0).
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import {
  buildQuestions,
  type QuizMode,
  type QuizDirection,
  type QuizQuestion,
  type QuizItem,
} from "@/lib/quiz-gen";
import type { Assessment, Word, WordKey, SentenceTaskTypeDb } from "@/lib/database.types";

async function assertCanPractice(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  assessmentId: string,
  userId: string,
): Promise<Assessment> {
  const { data: assessment } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .single<Assessment>();
  if (!assessment) throw new Error("접근할 수 없는 평가입니다");
  let can = assessment.mode === "practice" || assessment.allow_practice;
  if (!can) {
    const { data: returned } = await supabase
      .from("submissions")
      .select("id")
      .eq("assessment_id", assessmentId)
      .eq("student_id", userId)
      .not("returned_at", "is", null)
      .limit(1)
      .maybeSingle();
    can = !!returned;
  }
  if (!can) throw new Error("퀴즈가 허용되지 않은 평가입니다");
  return assessment;
}

export interface QuizPayload {
  questions: QuizQuestion[];
  sentenceTaskType: SentenceTaskTypeDb;
}

export async function getQuizQuestions(
  assessmentId: string,
  mode: QuizMode,
  direction: QuizDirection,
): Promise<QuizPayload> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  const assessment = await assertCanPractice(supabase, assessmentId, user.id);

  const admin = createSupabaseAdminClient();
  const { data: words } = await admin
    .from("words")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("ord");
  const wordList = (words ?? []) as Word[];
  const { data: keys } = await admin
    .from("word_keys")
    .select("*")
    .in("word_id", wordList.map((w) => w.id));
  const keyByWord = new Map<string, WordKey>(
    ((keys ?? []) as WordKey[]).map((k) => [k.word_id, k]),
  );

  const items: QuizItem[] = wordList.map((w) => {
    const k = keyByWord.get(w.id);
    return {
      wordId: w.id,
      hanzi: w.hanzi,
      pinyin: k?.correct_pinyin ?? "",
      tones: k?.correct_tones ?? [],
      meanings: k?.acceptable_meanings ?? [],
      exampleSentence: k?.example_sentence ?? undefined,
      errorPrompt: w.error_prompt ?? undefined,
      acceptableCorrections: k?.acceptable_corrections ?? undefined,
      grammatical: k?.is_grammatical ?? undefined,
      explanation: k?.explanation ?? undefined,
    };
  });

  const seed = Math.floor(Math.random() * 1_000_000_000);
  const questions = buildQuestions(items, {
    mode,
    direction,
    sentenceTaskType: assessment.sentence_task_type,
    seed,
  });
  return { questions, sentenceTaskType: assessment.sentence_task_type };
}

export async function submitQuizScore(
  assessmentId: string,
  mode: string, // 'pinyin'|'tone'|'meaning'|'sentence'|'match' (quiz_scores.mode=text)
  score: number,
  correct: number,
  total: number,
): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  // 접근 권한 확인(퀴즈 가능한 평가인지)
  await assertCanPractice(supabase, assessmentId, user.id);

  // 비정상 점수 방지용 상한 클램프(저위험 연습 게임)
  const cappedTotal = Math.max(0, Math.min(Math.round(total), 1000));
  const cappedCorrect = Math.max(0, Math.min(Math.round(correct), cappedTotal));
  const cappedScore = Math.max(0, Math.min(Math.round(score), cappedTotal * 2000 + 2000));

  await supabase.from("quiz_scores").insert({
    assessment_id: assessmentId,
    student_id: user.id,
    mode,
    score: cappedScore,
    correct: cappedCorrect,
    total: cappedTotal,
  });
}

export interface LeaderboardEntry {
  rank: number;
  maskedName: string;
  score: number;
  isMe: boolean;
}
export interface Leaderboard {
  overall: LeaderboardEntry[];
  klass: LeaderboardEntry[];
  myBest: number | null;
  myToday: number | null;
}

function maskName(name: string): string {
  const n = (name || "").trim();
  if (!n) return "학생";
  if (n.length <= 1) return `${n}*`;
  if (n.length === 2) return `${n[0]}*`;
  const shown = Math.ceil(n.length / 2);
  return n.slice(0, shown) + "*".repeat(Math.min(2, n.length - shown));
}

export async function getQuizLeaderboard(
  assessmentId: string,
  mode: string,
  scope: "best" | "today" = "best",
): Promise<Leaderboard> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const admin = createSupabaseAdminClient();
  const { data: assessment } = await admin
    .from("assessments")
    .select("class_id")
    .eq("id", assessmentId)
    .single<{ class_id: string | null }>();

  const { data: rows } = await admin
    .from("quiz_scores")
    .select("student_id, score, played_at")
    .eq("assessment_id", assessmentId)
    .eq("mode", mode);
  const scores = (rows ?? []) as { student_id: string; score: number; played_at: string }[];

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const filtered = scope === "today" ? scores.filter((s) => new Date(s.played_at) >= startOfToday) : scores;

  const bestByStudent = new Map<string, number>();
  for (const s of filtered) {
    bestByStudent.set(s.student_id, Math.max(bestByStudent.get(s.student_id) ?? 0, s.score));
  }
  const studentIds = [...bestByStudent.keys()];

  const { data: profs } = studentIds.length
    ? await admin.from("profiles").select("id, name").in("id", studentIds)
    : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((profs ?? []).map((p) => [p.id, p.name]));

  let classMembers = new Set<string>();
  if (assessment?.class_id) {
    const { data: enr } = await admin
      .from("enrollments")
      .select("student_id")
      .eq("class_id", assessment.class_id);
    classMembers = new Set((enr ?? []).map((e: { student_id: string }) => e.student_id));
  }

  const buildList = (ids: string[]): LeaderboardEntry[] =>
    ids
      .map((id) => ({ id, score: bestByStudent.get(id)! }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 50)
      .map((e, i) => ({
        rank: i + 1,
        maskedName: maskName(nameById.get(e.id) ?? ""),
        score: e.score,
        isMe: e.id === user.id,
      }));

  const myScores = scores.filter((s) => s.student_id === user.id);
  const myBest = myScores.length ? Math.max(...myScores.map((s) => s.score)) : null;
  const myTodayScores = myScores.filter((s) => new Date(s.played_at) >= startOfToday);
  const myToday = myTodayScores.length ? Math.max(...myTodayScores.map((s) => s.score)) : null;

  return {
    overall: buildList(studentIds),
    klass: buildList(studentIds.filter((id) => classMembers.has(id))),
    myBest,
    myToday,
  };
}
