/**
 * 채점 브릿지 (서버 전용): DB 행 ↔ 채점 엔진 연결.
 *
 * 정답키(word_keys)는 RLS상 학생이 못 읽으므로, 서비스 롤(admin) 클라이언트로 읽어
 * 엔진을 호출하고 grades 테이블에 결과를 기록한다. AI 키가 있으면 의미·문장도 채점.
 */
import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { createCachingProvider } from "@/lib/ai-cache";
import { createClaudeProvider } from "@/grading/ai/claudeProvider.js";
import type { AiGradingProvider } from "@/grading/index.js";
import { gradeSubmission } from "@/grading/index.js";
import type {
  GradingConfigInput,
  StudentAnswer,
  WordKey as EngineWordKey,
  AttendanceStatus,
} from "@/grading/index.js";
import type {
  Assessment,
  Word,
  WordKey,
  Answer,
  Submission,
} from "@/lib/database.types";

/**
 * 채점에 쓸 AI 공급자 결정 (BYOK).
 * 우선순위: 해당 평가 출제 교사의 키 → (없으면) 운영자 공용 키 → (없으면) AI 미사용.
 * 이렇게 해서 그 교사/학생의 AI 비용이 교사 본인 키로 과금된다.
 */
async function resolveAiProvider(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherId: string,
): Promise<AiGradingProvider | undefined> {
  const { data: secret } = await admin
    .from("teacher_secrets")
    .select("anthropic_key_encrypted")
    .eq("teacher_id", teacherId)
    .maybeSingle<{ anthropic_key_encrypted: string }>();

  if (secret?.anthropic_key_encrypted) {
    try {
      const apiKey = decryptSecret(secret.anthropic_key_encrypted);
      return createCachingProvider(createClaudeProvider({ apiKey }), admin);
    } catch {
      // 복호화 실패(APP_SECRET_KEY 변경 등) → 아래 fallback
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return createCachingProvider(createClaudeProvider(), admin);
  }
  return undefined;
}

export function toGradingConfig(a: Assessment): GradingConfigInput {
  return {
    pinyinErrorUnit: a.pinyin_error_unit,
    sentenceTaskType: a.sentence_task_type,
    meaningPartialErrorWeight: a.meaning_partial_weight === 0.5 ? 0.5 : 1,
  };
}

/**
 * 제출물 1건을 채점하고 grades 행을 upsert 한다.
 * teacher_finalized는 건드리지 않음(작문/의미 fallback은 교사 확정 필요 — PRD §5.4).
 */
export async function gradeSubmissionById(submissionId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: submission, error: subErr } = await admin
    .from("submissions")
    .select("*")
    .eq("id", submissionId)
    .single<Submission>();
  if (subErr || !submission) throw new Error("제출물을 찾을 수 없습니다");

  const { data: assessment } = await admin
    .from("assessments")
    .select("*")
    .eq("id", submission.assessment_id)
    .single<Assessment>();
  if (!assessment) throw new Error("평가를 찾을 수 없습니다");

  const { data: words } = await admin
    .from("words")
    .select("*")
    .eq("assessment_id", assessment.id)
    .order("ord");
  const { data: keys } = await admin
    .from("word_keys")
    .select("*")
    .in("word_id", (words ?? []).map((w: Word) => w.id));
  const { data: answers } = await admin
    .from("answers")
    .select("*")
    .eq("submission_id", submissionId);

  const keyByWord = new Map<string, WordKey>(
    (keys ?? []).map((k: WordKey) => [k.word_id, k]),
  );

  const engineKeys: EngineWordKey[] = (words ?? []).map((w: Word) => {
    const k = keyByWord.get(w.id);
    return {
      id: w.id,
      hanzi: w.hanzi,
      correctPinyin: k?.correct_pinyin ?? "",
      correctTones: k?.correct_tones ?? [],
      acceptableMeanings: k?.acceptable_meanings ?? [],
      ...(k?.example_sentence ? { exampleSentence: k.example_sentence } : {}),
      ...(w.error_prompt ? { errorPrompt: w.error_prompt } : {}),
      ...(k?.acceptable_corrections
        ? { acceptableCorrections: k.acceptable_corrections }
        : {}),
    };
  });

  const engineAnswers: StudentAnswer[] = (answers ?? []).map((a: Answer) => ({
    wordId: a.word_id,
    ...(a.student_pinyin != null ? { studentPinyin: a.student_pinyin } : {}),
    ...(a.student_tones != null ? { studentTones: a.student_tones } : {}),
    ...(a.student_meaning != null ? { studentMeaning: a.student_meaning } : {}),
    ...(a.student_sentence != null
      ? { studentSentence: a.student_sentence }
      : {}),
  }));

  // 출제 교사의 키로 AI 채점(비용도 그 교사 계정). 키 없으면 의미·문장은
  // 교사 검토(needsReview)로 위임된다. AI 호출 실패는 채점 자체를 막지 않음.
  const ai = await resolveAiProvider(admin, assessment.teacher_id);

  let result;
  try {
    result = await gradeSubmission({
      keys: engineKeys,
      answers: engineAnswers,
      config: toGradingConfig(assessment),
      status: submission.attendance as AttendanceStatus,
      ...(ai ? { ai } : {}),
    });
  } catch {
    // AI 호출 실패(잘못된 키/요금/네트워크 등) → AI 없이 결정론적 채점만 수행
    result = await gradeSubmission({
      keys: engineKeys,
      answers: engineAnswers,
      config: toGradingConfig(assessment),
      status: submission.attendance as AttendanceStatus,
    });
  }

  await admin.from("grades").upsert(
    {
      submission_id: submissionId,
      pinyin_score: result.pinyin.score,
      pinyin_errors: result.pinyin.errors,
      tone_score: result.tone.score,
      tone_errors: result.tone.errors,
      meaning_score: result.meaning.score,
      meaning_errors: result.meaning.errors,
      sentence_score: result.sentence.score,
      sentence_errors: result.sentence.errors,
      total: result.total,
      final: result.final,
      details: {
        pinyin: result.pinyin.details,
        tone: result.tone.details,
        meaning: result.meaning.details,
        sentence: result.sentence.details,
        requiresTeacherConfirm: result.requiresTeacherConfirm,
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "submission_id" },
  );

  await admin
    .from("submissions")
    .update({ status: "graded" })
    .eq("id", submissionId);
}
