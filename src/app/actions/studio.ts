"use server";

/**
 * Teacher Studio — v2 단원/상황/표현/질문 CRUD + AI 상황 생성기(PRD §4, §15).
 * 쓰기 권한은 RLS(units_teacher_all / owns_unit with check)로 강제. AI는 교사 BYOK 키 사용.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { UNIT_TEMPLATES } from "@/lib/unit-templates";
import { toDisplayWord } from "@/grading/pinyin.js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import type { Difficulty } from "@/lib/database.types";

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  return { supabase, userId: user.id };
}

// ───────────────────── 단원(unit) ─────────────────────

export async function seedUnitsFromTemplates() {
  const { supabase, userId } = await requireTeacher();
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", userId);
  const base = count ?? 0;
  const rows = UNIT_TEMPLATES.map((t, i) => ({
    teacher_id: userId,
    title: t.title,
    subtitle: t.subtitle,
    theme: t.theme,
    ord: base + i,
  }));
  const { error } = await supabase.from("units").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/studio");
}

export async function createUnit(title: string) {
  const { supabase, userId } = await requireTeacher();
  const t = title.trim() || "새 단원";
  const { count } = await supabase
    .from("units")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", userId);
  const { data, error } = await supabase
    .from("units")
    .insert({ teacher_id: userId, title: t, ord: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "단원 생성 실패");
  revalidatePath("/teacher/studio");
  redirect(`/teacher/studio/${data.id}`);
}

export interface UnitMetaInput {
  title: string;
  subtitle?: string | null;
  theme?: string | null;
  cultureNote?: string | null;
  classId?: string | null;
  published: boolean;
}

export async function updateUnitMeta(unitId: string, input: UnitMetaInput) {
  const { supabase } = await requireTeacher();
  const { error } = await supabase
    .from("units")
    .update({
      title: input.title,
      subtitle: input.subtitle ?? null,
      theme: input.theme ?? null,
      culture_note: input.cultureNote ?? null,
      class_id: input.classId ?? null,
      published: input.published,
    })
    .eq("id", unitId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/studio");
  revalidatePath(`/teacher/studio/${unitId}`);
}

export async function deleteUnit(unitId: string) {
  const { supabase } = await requireTeacher();
  await supabase.from("units").delete().eq("id", unitId);
  revalidatePath("/teacher/studio");
  redirect("/teacher/studio");
}

// ───────────────────── 상황(situation) ─────────────────────

export async function createSituation(unitId: string, title: string) {
  const { supabase } = await requireTeacher();
  const { count } = await supabase
    .from("situations")
    .select("id", { count: "exact", head: true })
    .eq("unit_id", unitId);
  const { data, error } = await supabase
    .from("situations")
    .insert({ unit_id: unitId, title: title.trim() || "새 상황", ord: count ?? 0 })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "상황 생성 실패");
  revalidatePath(`/teacher/studio/${unitId}`);
  redirect(`/teacher/studio/${unitId}/${data.id}`);
}

export async function deleteSituation(situationId: string, unitId: string) {
  const { supabase } = await requireTeacher();
  await supabase.from("situations").delete().eq("id", situationId);
  revalidatePath(`/teacher/studio/${unitId}`);
  redirect(`/teacher/studio/${unitId}`);
}

export interface ExpressionRow {
  id?: string;
  hanzi: string;
  pinyin: string;
  meaning: string;
}
export interface QuestionRow {
  id?: string;
  promptZh: string;
  promptKo: string;
  modelAnswerZh: string;
  modelAnswerKo: string;
}
export interface SaveSituationInput {
  unitId: string;
  title: string;
  description?: string | null;
  roleStudent?: string | null;
  roleAi?: string | null;
  difficulty: Difficulty;
  expressions: ExpressionRow[];
  questions: QuestionRow[];
}

/** 상황 메타 + 표현 + 질문을 한 번에 저장(diff-upsert). RLS로 소유권 강제. */
export async function saveSituation(situationId: string, input: SaveSituationInput) {
  const { supabase } = await requireTeacher();

  const { error: sErr } = await supabase
    .from("situations")
    .update({
      title: input.title,
      description: input.description ?? null,
      role_student: input.roleStudent ?? null,
      role_ai: input.roleAi ?? null,
      difficulty: input.difficulty,
    })
    .eq("id", situationId);
  if (sErr) throw new Error(sErr.message);

  await diffUpsert(
    supabase,
    "expressions",
    "situation_id",
    situationId,
    input.expressions
      .filter((e) => e.hanzi.trim())
      .map((e, i) => ({
        id: e.id,
        row: {
          situation_id: situationId,
          hanzi: e.hanzi.trim(),
          pinyin: e.pinyin.trim() || null,
          meaning: e.meaning.trim() || null,
          ord: i,
        },
      })),
  );

  await diffUpsert(
    supabase,
    "questions",
    "situation_id",
    situationId,
    input.questions
      .filter((q) => q.promptZh.trim() || q.promptKo.trim())
      .map((q, i) => ({
        id: q.id,
        row: {
          situation_id: situationId,
          prompt_zh: q.promptZh.trim(),
          prompt_ko: q.promptKo.trim() || null,
          model_answer_zh: q.modelAnswerZh.trim() || null,
          model_answer_ko: q.modelAnswerKo.trim() || null,
          ord: i,
        },
      })),
  );

  revalidatePath(`/teacher/studio/${input.unitId}`);
  revalidatePath(`/teacher/studio/${input.unitId}/${situationId}`);
}

/** 기존(id 보유)=update, 신규=insert, 빠진 것=delete. updateAssessment 패턴. */
async function diffUpsert(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  table: "expressions" | "questions",
  parentCol: string,
  parentId: string,
  items: { id?: string; row: Record<string, unknown> }[],
) {
  const { data: existing } = await supabase.from(table).select("id").eq(parentCol, parentId);
  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));
  const keptIds = new Set<string>();

  for (const it of items) {
    if (it.id && existingIds.has(it.id)) {
      keptIds.add(it.id);
      const { error } = await supabase.from(table).update(it.row).eq("id", it.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from(table).insert(it.row);
      if (error) throw new Error(error.message);
    }
  }
  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error } = await supabase.from(table).delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }
}

// ───────────────────── AI 상황 생성기 (§15) ─────────────────────

const GeneratedSituationSchema = z.object({
  title: z.string(),
  description: z.string(),
  roleStudent: z.string(),
  roleAi: z.string(),
  expressions: z.array(
    z.object({ hanzi: z.string(), pinyin: z.string(), meaning: z.string() }),
  ),
  questions: z.array(
    z.object({
      promptZh: z.string(),
      promptKo: z.string(),
      modelAnswerZh: z.string(),
      modelAnswerKo: z.string(),
    }),
  ),
});

const GEN_SYSTEM = [
  "당신은 한국 중·고등학교 중국어 교사를 돕는 회화 수업 설계 보조자입니다.",
  "주어진 상황 설명으로부터 역할극 학습용 콘텐츠를 생성하세요.",
  "규칙:",
  "- title: 상황 제목(한국어). description: 상황 소개(한국어 2~3문장).",
  "- roleStudent/roleAi: 역할(예: 손님/점원).",
  "- expressions: 핵심 표현·단어 6~10개. hanzi(간체), pinyin(성조 숫자/부호 무관, 최선), meaning(한국어).",
  "- questions: AI가 학생에게 던질 질문 10~15개. promptZh(중국어 질문), promptKo(한국어 번역),",
  "  modelAnswerZh(모범답안 중국어), modelAnswerKo(한국어 번역).",
  "- 학생 수준과 난이도에 맞는 자연스럽고 교육적으로 적절한 내용으로.",
].join("\n");

export interface GenerateSituationInput {
  unitTheme?: string;
  description: string;
  difficulty: Difficulty;
}

export interface GeneratedSituation {
  title: string;
  description: string;
  roleStudent: string;
  roleAi: string;
  expressions: ExpressionRow[];
  questions: QuestionRow[];
}

export async function generateSituation(
  input: GenerateSituationInput,
): Promise<GeneratedSituation> {
  const desc = (input.description ?? "").trim();
  if (!desc) throw new Error("상황 설명을 입력하세요");
  const { supabase, userId } = await requireTeacher();

  let apiKey: string | undefined;
  const { data: secret } = await supabase
    .from("teacher_secrets")
    .select("anthropic_key_encrypted")
    .eq("teacher_id", userId)
    .maybeSingle<{ anthropic_key_encrypted: string }>();
  if (secret?.anthropic_key_encrypted) {
    try {
      apiKey = decryptSecret(secret.anthropic_key_encrypted);
    } catch {
      /* fallback */
    }
  }
  if (!apiKey && process.env.ANTHROPIC_API_KEY) apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API 키가 설정되지 않았습니다. 교사 설정에서 키를 입력하세요.");
  }

  const userMsg = [
    input.unitTheme ? `단원 주제: ${input.unitTheme}` : "",
    `상황 설명: ${desc}`,
    `난이도: ${input.difficulty}`,
  ]
    .filter(Boolean)
    .join("\n");

  const client = new Anthropic({ apiKey });
  const res = await client.messages.parse({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: { format: zodOutputFormat(GeneratedSituationSchema), effort: "medium" },
    system: GEN_SYSTEM,
    messages: [{ role: "user", content: userMsg }],
  });
  if (!res.parsed_output) throw new Error("생성 응답 파싱 실패");
  const out = res.parsed_output;

  const { suggestFromHanzi } = await import("@/lib/pinyin-suggest");
  return {
    title: out.title,
    description: out.description,
    roleStudent: out.roleStudent,
    roleAi: out.roleAi,
    expressions: out.expressions
      .filter((e) => e.hanzi?.trim())
      .map((e) => {
        const s = suggestFromHanzi(e.hanzi);
        return {
          hanzi: e.hanzi.trim(),
          pinyin: s.pinyin ? toDisplayWord(s.pinyin, s.tones) : (e.pinyin ?? "").trim(),
          meaning: (e.meaning ?? "").trim(),
        };
      }),
    questions: out.questions.map((q) => ({
      promptZh: (q.promptZh ?? "").trim(),
      promptKo: (q.promptKo ?? "").trim(),
      modelAnswerZh: (q.modelAnswerZh ?? "").trim(),
      modelAnswerKo: (q.modelAnswerKo ?? "").trim(),
    })),
  };
}
