"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { gradeSubmissionById } from "@/lib/grading-bridge";
import { mapErrorsToScore } from "@/grading/scale.js";
import { encryptSecret, decryptSecret, lastFour } from "@/lib/crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import type {
  PinyinErrorUnitDb,
  SentenceTaskTypeDb,
} from "@/lib/database.types";

export interface WordInput {
  hanzi: string;
  correctPinyin: string;
  /** "3 3" 형식 또는 빈 값 */
  correctTones: string;
  /** 쉼표 구분 */
  acceptableMeanings: string;
  exampleSentence?: string;
  /** find_error/judge: 학생에게 제시할 문장(오류문장 또는 판단 대상). */
  errorPrompt?: string;
  /** find_error: 정답(수정) 문장. "/" 구분. */
  acceptableCorrections?: string;
  /** judge: 제시 문장이 어법에 맞으면 true(O), 틀리면 false(X). */
  judgeIsGrammatical?: boolean;
  /** judge: 해설(채점 후 피드백용). */
  explanation?: string;
}

export interface CreateAssessmentInput {
  title: string;
  unit?: string;
  classId?: string | null;
  mode: "practice" | "exam";
  sentenceTaskType: SentenceTaskTypeDb;
  pinyinErrorUnit: PinyinErrorUnitDb;
  meaningPartialWeight: number; // 1 | 0.5
  timeLimitSec?: number | null;
  attemptsAllowed: number;
  revealAnswersInPractice: boolean;
  proctoring: boolean;
  /** 학생 연습 허용(연습 모드 + AI 피드백) */
  allowPractice: boolean;
  words: WordInput[];
}

/** 수정용 문항: 기존 문항이면 id 보유, 새 문항이면 id 없음 */
export interface WordEditInput extends WordInput {
  id?: string;
}

export interface UpdateAssessmentInput
  extends Omit<CreateAssessmentInput, "words"> {
  words: WordEditInput[];
}

function parseTones(s: string): number[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const n = Number(t);
      return Number.isFinite(n) ? (n === 5 ? 0 : n) : 0;
    });
}

function parseMeanings(s: string): string[] {
  return s
    .split(/[,，]/)
    .map((m) => m.trim())
    .filter(Boolean);
}

/** 병음 음절 수(입력 칸 수 힌트) */
function syllableCount(correctPinyin: string): number {
  return correctPinyin.trim().split(/\s+/).filter(Boolean).length;
}

/** 오류 찾기형 정답 문장 파싱("/" 또는 줄바꿈 구분) */
function parseCorrections(s: string): string[] {
  return s
    .split(/[\/\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * 문장 유형별 저장 필드 계산.
 * - words.error_prompt: find_error/judge일 때 제시 문장(아니면 null).
 * - word_keys 추가 필드: acceptable_corrections(find_error), is_grammatical·explanation(judge).
 */
function sentenceFieldsFor(
  taskType: SentenceTaskTypeDb,
  w: WordInput,
): { errorPrompt: string | null; keyExtra: Record<string, unknown> } {
  const isFindError = taskType === "find_error";
  const isJudge = taskType === "judge";
  // is_grammatical·explanation 컬럼은 007 마이그레이션 이후에만 존재하므로,
  // judge가 아닐 때는 키 자체를 넣지 않아 마이그레이션 전 compose/find_error 출제가 깨지지 않게 한다.
  const keyExtra: Record<string, unknown> = {
    acceptable_corrections: isFindError
      ? parseCorrections(w.acceptableCorrections ?? "")
      : [],
  };
  if (isJudge) {
    keyExtra.is_grammatical = w.judgeIsGrammatical === true;
    keyExtra.explanation = w.explanation?.trim() || null;
  }
  return {
    errorPrompt: isFindError || isJudge ? w.errorPrompt?.trim() || null : null,
    keyExtra,
  };
}

/**
 * classId가 호출 교사 소유의 반인지 서버에서 검증한다.
 * (RLS는 assessments.class_id 값까지 검사하지 않으므로, 위·변조된 요청이 다른 교사의
 *  반으로 평가를 노출시키지 못하도록 막는다.)
 */
async function assertOwnsClassIfSet(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  teacherId: string,
  classId: string | null | undefined,
) {
  if (!classId) return;
  const { data: cls } = await supabase
    .from("classes")
    .select("id")
    .eq("id", classId)
    .eq("teacher_id", teacherId)
    .maybeSingle();
  if (!cls) throw new Error("권한이 없는 반입니다");
}

export async function createAssessment(input: CreateAssessmentInput) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  await assertOwnsClassIfSet(supabase, user.id, input.classId);

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      title: input.title,
      unit: input.unit ?? null,
      teacher_id: user.id,
      class_id: input.classId ?? null,
      mode: input.mode,
      time_limit_sec: input.timeLimitSec ?? null,
      attempts_allowed: input.attemptsAllowed,
      sentence_task_type: input.sentenceTaskType,
      pinyin_error_unit: input.pinyinErrorUnit,
      meaning_partial_weight: input.meaningPartialWeight,
      reveal_answers_in_practice: input.revealAnswersInPractice,
      proctoring: input.proctoring,
      allow_practice: input.allowPractice,
      status: "draft",
    })
    .select("id")
    .single();
  if (error || !assessment) throw new Error(error?.message ?? "출제 실패");

  // 문항 + 정답키 삽입
  for (let i = 0; i < input.words.length; i++) {
    const w = input.words[i]!;
    const sf = sentenceFieldsFor(input.sentenceTaskType, w);
    const { data: word, error: wErr } = await supabase
      .from("words")
      .insert({
        assessment_id: assessment.id,
        ord: i,
        hanzi: w.hanzi,
        syllable_count: syllableCount(w.correctPinyin),
        error_prompt: sf.errorPrompt,
      })
      .select("id")
      .single();
    if (wErr || !word) throw new Error(wErr?.message ?? "문항 저장 실패");

    const { error: kErr } = await supabase.from("word_keys").insert({
      word_id: word.id,
      correct_pinyin: w.correctPinyin.trim(),
      correct_tones: parseTones(w.correctTones),
      acceptable_meanings: parseMeanings(w.acceptableMeanings),
      example_sentence: w.exampleSentence?.trim() || null,
      ...sf.keyExtra,
    });
    if (kErr) throw new Error(kErr.message);
  }

  revalidatePath("/teacher");
  redirect(`/teacher/${assessment.id}`);
}

export async function publishAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("assessments")
    .update({ status: "published" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
}

export async function closeAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("assessments")
    .update({ status: "closed" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath("/teacher");
}

/** 종료 취소(재개): 종료된 평가를 다시 공개 상태로 되돌려 응시를 재개한다. */
export async function reopenAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  // RLS(assessments_teacher_all)로 출제 교사만 수정 가능.
  await supabase
    .from("assessments")
    .update({ status: "published" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath(`/teacher/${assessmentId}/monitor`);
  revalidatePath("/teacher");
}

/** 회수: 공개된 평가를 초안으로 되돌린다(학생 목록에서 숨김). */
export async function unpublishAssessment(assessmentId: string) {
  const supabase = await createSupabaseServerClient();
  await supabase
    .from("assessments")
    .update({ status: "draft" })
    .eq("id", assessmentId);
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath("/teacher");
}

/**
 * 수행평가 수정: 메타데이터 + 문항/정답키를 갱신한다.
 * 문항은 diff 방식 — 기존(id 보유) 문항은 갱신, 새 문항은 추가, 빠진 문항만 삭제한다.
 * 삭제 시 cascade로 해당 문항의 정답키·학생 답안이 함께 제거되므로 폼에서 경고한다.
 */
export async function updateAssessment(
  assessmentId: string,
  input: UpdateAssessmentInput,
) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // 소유권 확인(RLS도 강제하지만 명시 체크)
  const { data: existing } = await supabase
    .from("assessments")
    .select("id, teacher_id")
    .eq("id", assessmentId)
    .single<{ id: string; teacher_id: string }>();
  if (!existing || existing.teacher_id !== user.id) {
    throw new Error("권한이 없습니다");
  }
  await assertOwnsClassIfSet(supabase, user.id, input.classId);

  const { error: aErr } = await supabase
    .from("assessments")
    .update({
      title: input.title,
      unit: input.unit ?? null,
      class_id: input.classId ?? null,
      mode: input.mode,
      time_limit_sec: input.timeLimitSec ?? null,
      attempts_allowed: input.attemptsAllowed,
      sentence_task_type: input.sentenceTaskType,
      pinyin_error_unit: input.pinyinErrorUnit,
      meaning_partial_weight: input.meaningPartialWeight,
      reveal_answers_in_practice: input.revealAnswersInPractice,
      proctoring: input.proctoring,
      allow_practice: input.allowPractice,
    })
    .eq("id", assessmentId);
  if (aErr) throw new Error(aErr.message);

  // 기존 문항 id 집합
  const { data: existingWords } = await supabase
    .from("words")
    .select("id")
    .eq("assessment_id", assessmentId);
  const existingIds = new Set(
    (existingWords ?? []).map((w: { id: string }) => w.id),
  );
  const keptIds = new Set<string>();

  for (let i = 0; i < input.words.length; i++) {
    const w = input.words[i]!;
    const sf = sentenceFieldsFor(input.sentenceTaskType, w);
    const keyFields = {
      correct_pinyin: w.correctPinyin.trim(),
      correct_tones: parseTones(w.correctTones),
      acceptable_meanings: parseMeanings(w.acceptableMeanings),
      example_sentence: w.exampleSentence?.trim() || null,
      ...sf.keyExtra,
    };

    if (w.id && existingIds.has(w.id)) {
      keptIds.add(w.id);
      const { error: wErr } = await supabase
        .from("words")
        .update({
          ord: i,
          hanzi: w.hanzi,
          syllable_count: syllableCount(w.correctPinyin),
          error_prompt: sf.errorPrompt,
        })
        .eq("id", w.id);
      if (wErr) throw new Error(wErr.message);
      const { error: kErr } = await supabase
        .from("word_keys")
        .upsert({ word_id: w.id, ...keyFields }, { onConflict: "word_id" });
      if (kErr) throw new Error(kErr.message);
    } else {
      const { data: word, error: wErr } = await supabase
        .from("words")
        .insert({
          assessment_id: assessmentId,
          ord: i,
          hanzi: w.hanzi,
          syllable_count: syllableCount(w.correctPinyin),
          error_prompt: sf.errorPrompt,
        })
        .select("id")
        .single();
      if (wErr || !word) throw new Error(wErr?.message ?? "문항 저장 실패");
      const { error: kErr } = await supabase
        .from("word_keys")
        .insert({ word_id: word.id, ...keyFields });
      if (kErr) throw new Error(kErr.message);
    }
  }

  // 폼에서 제거된 문항 삭제(cascade: word_keys·answers 정리)
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error: dErr } = await supabase
      .from("words")
      .delete()
      .in("id", toDelete);
    if (dErr) throw new Error(dErr.message);
  }

  revalidatePath("/teacher");
  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath(`/teacher/${assessmentId}/edit`);
  revalidatePath(`/teacher/${assessmentId}/monitor`);
  redirect(`/teacher/${assessmentId}`);
}

/**
 * 평가의 모든 제출물을 재채점한다(정답키 수정 후 점수 갱신용).
 * 교사가 이미 확정(teacher_finalized)한 제출물은 교사 판단을 덮어쓰지 않도록 건너뛴다.
 */
export async function regradeAllSubmissions(
  assessmentId: string,
): Promise<{ regraded: number; skipped: number }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, teacher_id")
    .eq("id", assessmentId)
    .single<{ id: string; teacher_id: string }>();
  if (!assessment || assessment.teacher_id !== user.id) {
    throw new Error("권한이 없습니다");
  }

  // 진행 중(미제출)은 채점 대상 아님
  const { data: subs } = await supabase
    .from("submissions")
    .select("id")
    .eq("assessment_id", assessmentId)
    .neq("status", "in_progress");
  const submissionIds = (subs ?? []).map((s: { id: string }) => s.id);
  if (!submissionIds.length) return { regraded: 0, skipped: 0 };

  const { data: gradeRows } = await supabase
    .from("grades")
    .select("submission_id, teacher_finalized")
    .in("submission_id", submissionIds);
  const finalized = new Set(
    (gradeRows ?? [])
      .filter((g: { teacher_finalized: boolean }) => g.teacher_finalized)
      .map((g: { submission_id: string }) => g.submission_id),
  );

  let regraded = 0;
  for (const id of submissionIds) {
    if (finalized.has(id)) continue;
    await gradeSubmissionById(id);
    regraded++;
  }

  revalidatePath(`/teacher/${assessmentId}`);
  revalidatePath(`/teacher/${assessmentId}/monitor`);
  return { regraded, skipped: finalized.size };
}

/**
 * 교사 확정: 점수 오버라이드(선택) 후 finalized 처리 (PRD §5.4 교사 확정).
 * 문장(오류판단)은 `sentence_errors`(어법 오류 개수)를 받으면 루브릭 밴드로
 * 점수를 서버에서 산출한다(클라이언트 점수는 신뢰하지 않음).
 */
export async function finalizeGrade(
  submissionId: string,
  overrides?: {
    meaning_score?: number;
    sentence_score?: number;
    sentence_errors?: number;
  },
) {
  const supabase = await createSupabaseServerClient();

  const { data: grade } = await supabase
    .from("grades")
    .select("*")
    .eq("submission_id", submissionId)
    .single();
  if (!grade) throw new Error("채점 결과가 없습니다");

  const meaning = overrides?.meaning_score ?? grade.meaning_score;

  // 문장: 어법 오류 개수가 오면 밴드로 점수 산출(0→25 … 7+→5). 없으면 기존값 유지.
  let sentenceErrors: number = grade.sentence_errors;
  let sentence: number = grade.sentence_score;
  if (overrides?.sentence_errors != null) {
    sentenceErrors = Math.max(0, overrides.sentence_errors);
    sentence = mapErrorsToScore(sentenceErrors);
  } else if (overrides?.sentence_score != null) {
    sentence = overrides.sentence_score;
  }

  const total = grade.pinyin_score + grade.tone_score + meaning + sentence;
  const final = Math.max(total, 20); // 응시자 하한 (PRD §5.5)

  await supabase
    .from("grades")
    .update({
      meaning_score: meaning,
      sentence_score: sentence,
      sentence_errors: sentenceErrors,
      total,
      final,
      teacher_finalized: true,
      finalized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("submission_id", submissionId);

  revalidatePath(`/teacher`);
}

/** AI 재채점(교사 본인 키 사용). 학생 제출 후 교사가 키를 설정/변경한 경우 등. */
export async function regradeSubmission(submissionId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // 본인 평가의 제출인지 확인(RLS도 강제)
  const { data: sub } = await supabase
    .from("submissions")
    .select("id, assessment_id")
    .eq("id", submissionId)
    .single();
  if (!sub) throw new Error("제출물을 찾을 수 없습니다");

  await gradeSubmissionById(submissionId);
  revalidatePath(`/teacher`);
}

// ───────────────────── 교사 API 키(BYOK) ─────────────────────

/** 교사가 본인 Anthropic API 키 저장(암호화). 그 교사/학생 AI 채점에 사용·과금. */
export async function setAnthropicKey(plainKey: string) {
  const key = plainKey.trim();
  if (!key.startsWith("sk-ant-")) {
    throw new Error("올바른 Anthropic API 키 형식이 아닙니다(sk-ant-…).");
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { error } = await supabase.from("teacher_secrets").upsert(
    {
      teacher_id: user.id,
      anthropic_key_encrypted: encryptSecret(key),
      key_last4: lastFour(key),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "teacher_id" },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/settings");
}

export async function removeAnthropicKey() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  await supabase.from("teacher_secrets").delete().eq("teacher_id", user.id);
  revalidatePath("/teacher/settings");
}

// ───────────────────── AI 문항 자동 생성 (한국어 → 단어) ─────────────────────

export interface GenerateWordsInput {
  /** list: 한 줄당 한국어 의미 / topic: 한국어 주제·단원 */
  mode: "list" | "topic";
  text: string;
  /** topic 모드에서 생성할 단어 수(1~20) */
  count?: number;
  sentenceTaskType: SentenceTaskTypeDb;
}

const MAX_GEN = 20;

// structured output 최상위는 object. 미사용 필드는 빈 값("" / [] / false)으로 둔다.
const GeneratedWordsSchema = z.object({
  words: z.array(
    z.object({
      hanzi: z.string(),
      pinyin: z.string(), // 한자에서 로컬 보정되므로 백업용
      tones: z.array(z.number()),
      meanings: z.array(z.string()),
      exampleSentence: z.string(), // compose
      errorSentence: z.string(), // find_error/judge 제시 문장
      correctSentences: z.array(z.string()), // find_error 정답
      isGrammatical: z.boolean(), // judge 정답(O=true)
      explanation: z.string(), // judge 해설
    }),
  ),
});

const GEN_SYSTEM = [
  "당신은 한국 중·고등학교 중국어 교사를 돕는 어휘 출제 보조자입니다.",
  "주어진 한국어 의미 또는 주제로부터 중국어 어휘 문항 데이터를 생성하세요.",
  "규칙:",
  "- hanzi: 표준 중국어(간체) 단어.",
  "- meanings: 한국어 허용 의미 1~3개(자연스러운 것 우선).",
  '- pinyin: 성조 제외, 음절 공백 구분(예: "ni hao"). tones: 음절별 성조 숫자(1~4, 경성=0).',
  "- 출제 유형에 해당하지 않는 문장 필드는 빈 문자열/빈 배열로 두세요.",
  "- 학생 수준에 맞는 자연스럽고 교육적으로 적절한 내용으로 작성하세요.",
].join("\n");

function buildGenUserMessage(
  input: GenerateWordsInput,
  items: string[],
  count: number,
): string {
  const typeRule: Record<SentenceTaskTypeDb, string> = {
    compose:
      "출제 유형=작문형: 각 단어를 활용한 자연스러운 예문 1개를 exampleSentence에 넣으세요. (errorSentence/correctSentences/explanation은 빈 값, isGrammatical=true)",
    find_error:
      "출제 유형=오류 찾기형: 각 단어를 활용하되 어법 오류가 정확히 1개 있는 문장을 errorSentence에, 그 오류를 고친 올바른 문장 1~2개를 correctSentences에 넣으세요. (exampleSentence/explanation은 빈 값, isGrammatical=true)",
    judge:
      "출제 유형=어법 판단형: 각 단어를 활용한 문장 1개를 errorSentence에 넣고, 어법에 맞으면 isGrammatical=true, 틀리면 false로, explanation에 근거를 한국어로 적으세요. 맞는 문장과 틀린 문장을 적절히 섞으세요. (exampleSentence/correctSentences는 빈 값)",
  };

  const task =
    input.mode === "list"
      ? [
          `다음 한국어 의미 각각에 해당하는 중국어 단어 ${items.length}개를 입력 순서대로 생성하세요:`,
          ...items.map((m, i) => `${i + 1}. ${m}`),
        ].join("\n")
      : `다음 주제와 관련된 중국어 어휘 ${count}개를 생성하세요. 주제: "${input.text.trim()}"`;

  return [
    task,
    "",
    typeRule[input.sentenceTaskType],
    "",
    `정확히 ${input.mode === "list" ? items.length : count}개의 words를 반환하세요.`,
  ].join("\n");
}

/**
 * 한국어 의미 목록 또는 주제로부터 중국어 어휘 문항을 AI로 생성한다(교사 BYOK 키).
 * 결과는 초안 — DB에 저장하지 않고 폼에 채워 교사가 검토·수정 후 출제한다.
 * 병음·성조는 AI를 신뢰하지 않고 생성된 한자에서 로컬(pinyin-pro)로 산출한다.
 */
export async function generateWordsFromKorean(
  input: GenerateWordsInput,
): Promise<WordInput[]> {
  const text = (input.text ?? "").trim();
  if (!text) throw new Error("한국어 입력이 비어 있습니다");

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // BYOK: 본인 암호화 키(RLS owner-only) → env fallback
  let apiKey: string | undefined;
  const { data: secret } = await supabase
    .from("teacher_secrets")
    .select("anthropic_key_encrypted")
    .eq("teacher_id", user.id)
    .maybeSingle<{ anthropic_key_encrypted: string }>();
  if (secret?.anthropic_key_encrypted) {
    try {
      apiKey = decryptSecret(secret.anthropic_key_encrypted);
    } catch {
      // 복호화 실패(APP_SECRET_KEY 변경 등) → fallback
    }
  }
  if (!apiKey && process.env.ANTHROPIC_API_KEY) {
    apiKey = process.env.ANTHROPIC_API_KEY;
  }
  if (!apiKey) {
    throw new Error(
      "Anthropic API 키가 설정되지 않았습니다. 교사 설정에서 키를 입력하세요.",
    );
  }

  const items =
    input.mode === "list"
      ? text
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, MAX_GEN)
      : [];
  if (input.mode === "list" && items.length === 0) {
    throw new Error("의미를 한 줄에 하나씩 입력하세요");
  }
  const count =
    input.mode === "topic"
      ? Math.min(MAX_GEN, Math.max(1, Math.floor(input.count ?? 5)))
      : items.length;

  const client = new Anthropic({ apiKey });
  const res = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: {
      format: zodOutputFormat(GeneratedWordsSchema),
      effort: "medium",
    },
    system: GEN_SYSTEM,
    messages: [{ role: "user", content: buildGenUserMessage(input, items, count) }],
  });
  if (!res.parsed_output) throw new Error("생성 응답 파싱 실패");

  // 한자에서 병음·성조 로컬 산출(결정론). suggest 실패 시 AI 값 폴백.
  const { suggestFromHanzi } = await import("@/lib/pinyin-suggest");
  const taskType = input.sentenceTaskType;

  return res.parsed_output.words
    .filter((w) => w.hanzi?.trim())
    .map((w): WordInput => {
      const sug = suggestFromHanzi(w.hanzi);
      const correctPinyin = sug.pinyin || (w.pinyin ?? "").trim();
      const correctTones = (sug.pinyin ? sug.tones : w.tones ?? []).join(" ");
      return {
        hanzi: w.hanzi.trim(),
        correctPinyin,
        correctTones,
        acceptableMeanings: (w.meanings ?? []).filter(Boolean).join(", "),
        exampleSentence:
          taskType === "compose" ? (w.exampleSentence ?? "").trim() : "",
        errorPrompt:
          taskType === "find_error" || taskType === "judge"
            ? (w.errorSentence ?? "").trim()
            : "",
        acceptableCorrections:
          taskType === "find_error"
            ? (w.correctSentences ?? []).filter(Boolean).join(" / ")
            : "",
        judgeIsGrammatical: taskType === "judge" ? w.isGrammatical === true : true,
        explanation: taskType === "judge" ? (w.explanation ?? "").trim() : "",
      };
    });
}
