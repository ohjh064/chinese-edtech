"use server";

/**
 * 문제 은행 — 기출 예시(스타일 학습) 등록 + AI 문항 생성 + 보관함.
 * 정답·해설이 담긴 문항은 교사 소유(RLS). AI는 교사 BYOK 키로 호출(구조화 출력).
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import type { QbankType, QbankExample, QbankItem } from "@/lib/database.types";
import { getTeacherRoster } from "@/app/actions/wordsets";

const MODEL = "claude-sonnet-4-6";

async function requireTeacher() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single<{ role: string }>();
  if (profile?.role !== "teacher") throw new Error("교사만 사용할 수 있습니다");
  return { supabase, userId: user.id };
}

/** 교사 BYOK 키(암호화) → 평문. 없으면 env fallback, 그래도 없으면 throw. */
async function getTeacherKey(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
): Promise<string> {
  const { data: secret } = await supabase
    .from("teacher_secrets")
    .select("anthropic_key_encrypted")
    .eq("teacher_id", userId)
    .maybeSingle<{ anthropic_key_encrypted: string }>();
  let apiKey: string | undefined;
  if (secret?.anthropic_key_encrypted) {
    try {
      apiKey = decryptSecret(secret.anthropic_key_encrypted);
    } catch {
      /* fallback */
    }
  }
  if (!apiKey && process.env.ANTHROPIC_API_KEY) apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic API 키가 설정되지 않았습니다. 교사 설정에서 키를 입력하세요.");
  return apiKey;
}

// ───────────────────── 유형(qbank_types) ─────────────────────

export async function saveTypes(types: { id?: string; name: string }[]): Promise<QbankType[]> {
  const { supabase, userId } = await requireTeacher();
  const { data: existing } = await supabase.from("qbank_types").select("id").eq("teacher_id", userId);
  const existingIds = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
  const kept = new Set<string>();
  let ord = 0;
  for (const t of types) {
    const name = t.name.trim();
    if (!name) continue;
    if (t.id && existingIds.has(t.id)) {
      kept.add(t.id);
      await supabase.from("qbank_types").update({ name, ord: ord++ }).eq("id", t.id);
    } else {
      await supabase.from("qbank_types").insert({ teacher_id: userId, name, ord: ord++ });
    }
  }
  const toDelete = [...existingIds].filter((id) => !kept.has(id));
  if (toDelete.length) await supabase.from("qbank_types").delete().in("id", toDelete);
  const { data: fresh } = await supabase
    .from("qbank_types")
    .select("*")
    .eq("teacher_id", userId)
    .order("ord");
  revalidatePath("/teacher/question-bank");
  return (fresh ?? []) as QbankType[];
}

// ───────────────────── 기출 예시(qbank_examples) ─────────────────────

export interface QbankExampleInput {
  id?: string;
  typeId: string | null;
  qnum: string;
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number | null;
  explanation: string;
  source: string;
}

/** 전체 예시를 diff 저장(추가/수정/삭제) 후 최신 목록 반환. */
export async function saveExamples(rows: QbankExampleInput[]): Promise<QbankExample[]> {
  const { supabase, userId } = await requireTeacher();
  const { data: existing } = await supabase.from("qbank_examples").select("id").eq("teacher_id", userId);
  const existingIds = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
  const kept = new Set<string>();
  for (const r of rows) {
    const choices = r.choices.map((c) => c.trim()).filter(Boolean);
    if (!r.stem.trim() && choices.length === 0) continue; // 빈 행 스킵
    const row = {
      teacher_id: userId,
      type_id: r.typeId,
      qnum: r.qnum.trim() || null,
      passage: r.passage.trim() || null,
      stem: r.stem.trim(),
      choices,
      answer_index: r.answerIndex,
      explanation: r.explanation.trim() || null,
      source: r.source.trim() || null,
    };
    if (r.id && existingIds.has(r.id)) {
      kept.add(r.id);
      await supabase.from("qbank_examples").update(row).eq("id", r.id);
    } else {
      await supabase.from("qbank_examples").insert(row);
    }
  }
  const toDelete = [...existingIds].filter((id) => !kept.has(id));
  if (toDelete.length) await supabase.from("qbank_examples").delete().in("id", toDelete);
  const { data: fresh } = await supabase
    .from("qbank_examples")
    .select("*")
    .eq("teacher_id", userId)
    .order("created_at");
  revalidatePath("/teacher/question-bank");
  return (fresh ?? []) as QbankExample[];
}

/** 기출 예시 1건 즉시 삭제(저장된 것). RLS로 소유자만. */
export async function deleteExample(id: string): Promise<void> {
  const { supabase } = await requireTeacher();
  await supabase.from("qbank_examples").delete().eq("id", id);
  revalidatePath("/teacher/question-bank");
}

// ───────────────────── 출제 지침(qbank_settings) ─────────────────────

export async function saveGuidelines(text: string): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  await supabase
    .from("qbank_settings")
    .upsert(
      { teacher_id: userId, guidelines: text.trim() || null, updated_at: new Date().toISOString() },
      { onConflict: "teacher_id" },
    );
  revalidatePath("/teacher/question-bank");
}

// (PDF/이미지 추출은 대용량 파일이 서버 액션 인자 한도에 걸리므로 Route Handler로 이관:
//  src/app/api/qbank/extract/route.ts + src/lib/qbank-extract.ts)

// ───────────────────── 새 시험 생성(few-shot) ─────────────────────

export interface GeneratedItem {
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  typeName?: string; // 표시용(어떤 유형으로 생성됐는지). 저장 시엔 미사용.
  typeId?: string; // 유형변경·AI 수정 스타일 참조용(draft 전용, 비영속).
}

const GenSchema = z.object({
  items: z.array(
    z.object({
      passage: z.string(), // 제시문(빈칸 문장/지문). 기출 형식에 지문이 없으면 빈 문자열.
      stem: z.string(),
      choices: z.array(z.string()),
      answerIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

const GEN_SYSTEM = [
  "당신은 한국 교사를 돕는 시험 문항 출제 보조자입니다.",
  "핵심 원칙: 교사가 등록한 '기출 예시'의 **형식을 그대로 재현**해 새 문항을 만드세요. 내용만 새로 만들고,",
  "구조·형식(제시문 유무, 발문 어투, 선지 개수, 해설 방식)은 예시와 동일하게 맞춥니다.",
  "각 문항 필드: passage(제시문), stem(발문), choices(선지), answerIndex(정답 0기반), explanation(해설).",
  "규칙:",
  "- **제시문(passage)**: 예시에 제시문/지문이 있으면 새 문항에도 반드시 만들어 넣으세요. 특히 발문이 빈칸·밑줄·",
  "  대화 완성처럼 지문을 전제하면, 그 빈칸이 든 문장/대화/지문을 passage에 반드시 포함해야 문항이 성립합니다.",
  "  예시에 제시문이 없는 형식이면 passage는 빈 문자열로 두세요.",
  "- **<보기>·항목 조합 문항(매우 중요)**: 발문이나 선지가 '<보기>' 또는 항목 기호(a·b·c·d, ㄱ·ㄴ·ㄷ 등)를 가리키면,",
  "  그 <보기> 전체를 passage에 반드시 넣으세요. 각 항목을 기호와 실제 내용까지 모두 적어야 합니다",
  "  (예: passage에 '多少钱?' 밑줄 + '<보기>' + 'a. 你好\\nb. 谢谢\\nc. 老师\\nd. 什么'). 선지는 그 항목들의 조합(예: 'a, b').",
  "  선지가 참조하는 항목이 passage에 하나라도 없으면 안 됩니다.",
  "- 각 문항은 그 자체(제시문+발문+선지)만으로 풀 수 있게 완결하세요. 풀이에 필요한 자료(보기·지문 등)를 빠뜨리지 마세요.",
  "- **선지 개수**는 예시와 동일하게(예시가 5지선다면 5개). answerIndex는 정답 선지의 0기반 인덱스, 정답은 하나만.",
  "- **밑줄**: 발문이 '밑줄 친 부분'을 가리키면, 제시문(passage)에서 밑줄 대상 부분을 반드시 `<u>...</u>`로 감싸 표시하세요.",
  "  예) 我想买一条<u>裤子</u>。 / The word <u>run</u> means…  (밑줄이 필요 없는 유형이면 사용하지 마세요.)",
  "- **이미지·그림·표 형식(중요)**: 예시가 그림/사진/지도/표 등 이미지를 전제하는 형식이어도, 이미지는 만들 수 없으므로",
  "  그 내용을 **텍스트(지문·상황 설명·표를 글로 풀어쓴 형태)로 제시**해 passage에 넣고, 텍스트만으로 풀 수 있는 문항으로",
  "  만드세요(예: '[그림: 지하철 노선도 — 1호선 A역→B역…]', '[표] 요일별 기온: 월 5도, 화 7도…'). 이미지 형식이라고",
  "  문항을 건너뛰거나 비우지 말고, 반드시 텍스트로 대체해 완결하세요.",
  "- 정답은 제시문/지문에서 확인 가능해야 하고, 나머지는 매력적인 오답으로.",
  "- 발문 어투·해설 문체를 예시와 동일하게. 출제 지침이 주어지면 반드시 반영.",
  "- 소재(지문/내용)가 주어지면 그것을 바탕으로, 없으면 예시와 같은 주제 범위에서 출제.",
].join("\n");

function buildGenUserMessage(
  examples: { stem: string; choices: string[]; answer_index: number | null; explanation: string | null; passage: string | null }[],
  guidelines: string | null,
  passage: string,
  count: number,
  difficulty: string,
): string {
  const parts: string[] = [];
  if (guidelines?.trim()) {
    parts.push("[출제 지침]", guidelines.trim(), "");
  }
  if (examples.length) {
    const payload = examples.map((e) => ({
      passage: e.passage ?? undefined,
      stem: e.stem,
      choices: e.choices,
      answerIndex: e.answer_index,
      explanation: e.explanation ?? undefined,
    }));
    parts.push(
      "[기출 예시 — 이 스타일을 따르세요]",
      "```json",
      JSON.stringify(payload, null, 2),
      "```",
      "",
    );
  }
  parts.push(
    "[소재(선택) — 이 내용을 바탕으로 출제]",
    passage || "(소재 없음 — 예시와 같은 주제 범위에서 자체 출제. 형식은 예시 그대로.)",
    "",
    `위 기출 예시의 형식을 그대로 재현해, 난이도 '${difficulty}'의 새 문항 ${count}개를 생성하세요.`,
    "예시에 제시문이 있으면 각 문항에도 반드시 제시문(passage)을 만들어 넣으세요.",
  );
  return parts.join("\n");
}

type ExampleRow = {
  stem: string;
  choices: string[];
  answer_index: number | null;
  explanation: string | null;
  passage: string | null;
};

/** 한 유형의 예시(few-shot)로 count개 생성(순수 Claude 호출). */
async function genCore(
  client: Anthropic,
  examples: ExampleRow[],
  guidelines: string | null,
  passage: string,
  count: number,
  difficulty: string,
): Promise<GeneratedItem[]> {
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: { format: zodOutputFormat(GenSchema), effort: "medium" },
    system: GEN_SYSTEM,
    messages: [
      { role: "user", content: buildGenUserMessage(examples, guidelines, passage, count, difficulty) },
    ],
  });
  if (!res.parsed_output) throw new Error("생성 응답 파싱 실패");
  return res.parsed_output.items
    .filter((it) => it.stem.trim() && it.choices.filter((c) => c.trim()).length >= 2)
    .map((it) => {
      const choices = it.choices.map((c) => c.trim()).filter(Boolean);
      const answerIndex = it.answerIndex >= 0 && it.answerIndex < choices.length ? it.answerIndex : 0;
      return { passage: it.passage.trim(), stem: it.stem.trim(), choices, answerIndex, explanation: it.explanation.trim() };
    });
}

export interface GenTypeSpec {
  typeId: string;
  count: number;
}

/** 유형별 문항 수를 지정 → 각 유형의 기출 예시로 생성해 합친다(유형명 태깅). */
export async function generateExamBySpecs(input: {
  specs: GenTypeSpec[];
  passage: string;
  difficulty: string;
}): Promise<GeneratedItem[]> {
  const { supabase, userId } = await requireTeacher();
  const apiKey = await getTeacherKey(supabase, userId);
  const passage = (input.passage ?? "").trim();

  const specs = input.specs
    .map((s) => ({ typeId: s.typeId, count: Math.min(20, Math.max(0, Math.floor(s.count || 0))) }))
    .filter((s) => s.typeId && s.count > 0);
  if (!specs.length) throw new Error("유형별 문항 수를 1개 이상 지정하세요.");

  const { data: typeRows } = await supabase
    .from("qbank_types")
    .select("id, name")
    .eq("teacher_id", userId)
    .in("id", specs.map((s) => s.typeId));
  const nameById = new Map(((typeRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));

  const { data: settings } = await supabase
    .from("qbank_settings")
    .select("guidelines")
    .eq("teacher_id", userId)
    .maybeSingle<{ guidelines: string | null }>();
  const guidelines = settings?.guidelines ?? null;

  const client = new Anthropic({ apiKey });
  const groups = await Promise.all(
    specs.map(async (spec) => {
      const { data: examples } = await supabase
        .from("qbank_examples")
        .select("stem, choices, answer_index, explanation, passage")
        .eq("teacher_id", userId)
        .eq("type_id", spec.typeId)
        .limit(8);
      const items = await genCore(
        client,
        (examples ?? []) as ExampleRow[],
        guidelines,
        passage,
        spec.count,
        input.difficulty,
      );
      const typeName = nameById.get(spec.typeId) ?? "";
      return items.map((it) => ({ ...it, typeName, typeId: spec.typeId }));
    }),
  );
  return groups.flat();
}

/** 문항 1건을 사용자 요청대로 AI가 다시 다듬는다(그 유형의 기출 스타일 유지). */
export async function refineExamItem(input: {
  typeId?: string | null;
  item: SavedItemInput;
  instruction: string;
  difficulty: string;
}): Promise<GeneratedItem> {
  const { supabase, userId } = await requireTeacher();
  const apiKey = await getTeacherKey(supabase, userId);
  const instruction = input.instruction.trim();
  if (!instruction) throw new Error("수정 요청을 입력하세요.");

  // 유형 예시(few-shot) + 유형명 + 출제 지침 로드
  let examples: ExampleRow[] = [];
  let typeName = "";
  if (input.typeId) {
    const [{ data: ex }, { data: t }] = await Promise.all([
      supabase
        .from("qbank_examples")
        .select("stem, choices, answer_index, explanation, passage")
        .eq("teacher_id", userId)
        .eq("type_id", input.typeId)
        .limit(8),
      supabase
        .from("qbank_types")
        .select("name")
        .eq("teacher_id", userId)
        .eq("id", input.typeId)
        .maybeSingle<{ name: string }>(),
    ]);
    examples = (ex ?? []) as ExampleRow[];
    typeName = t?.name ?? "";
  }
  const { data: settings } = await supabase
    .from("qbank_settings")
    .select("guidelines")
    .eq("teacher_id", userId)
    .maybeSingle<{ guidelines: string | null }>();
  const guidelines = settings?.guidelines ?? null;

  const parts: string[] = [];
  if (guidelines?.trim()) parts.push("[출제 지침]", guidelines.trim(), "");
  if (examples.length) {
    const payload = examples.map((e) => ({
      passage: e.passage ?? undefined,
      stem: e.stem,
      choices: e.choices,
      answerIndex: e.answer_index,
      explanation: e.explanation ?? undefined,
    }));
    parts.push("[기출 예시 — 이 스타일을 따르세요]", "```json", JSON.stringify(payload, null, 2), "```", "");
  }
  parts.push(
    "[현재 문항 — 이것을 수정하세요]",
    "```json",
    JSON.stringify(
      {
        passage: input.item.passage,
        stem: input.item.stem,
        choices: input.item.choices,
        answerIndex: input.item.answerIndex,
        explanation: input.item.explanation,
      },
      null,
      2,
    ),
    "```",
    "",
    "[수정 요청]",
    instruction,
    "",
    `위 '현재 문항'을 수정 요청대로 고쳐, 난이도 '${input.difficulty}'의 문항 1개로 다시 만드세요.`,
    "요청과 무관한 부분은 최대한 유지하고, 기출 형식·선지 개수·밑줄/제시문 규칙은 그대로 지키세요.",
    "items 배열에 수정된 문항 1개만 담아 반환하세요.",
  );

  const client = new Anthropic({ apiKey });
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: "disabled" },
    output_config: { format: zodOutputFormat(GenSchema), effort: "medium" },
    system: GEN_SYSTEM,
    messages: [{ role: "user", content: parts.join("\n") }],
  });
  const out = res.parsed_output?.items?.[0];
  if (!out) throw new Error("수정 응답 파싱 실패");
  const choices = out.choices.map((c) => c.trim()).filter(Boolean);
  const answerIndex = out.answerIndex >= 0 && out.answerIndex < choices.length ? out.answerIndex : 0;
  return {
    passage: out.passage.trim(),
    stem: out.stem.trim(),
    choices,
    answerIndex,
    explanation: out.explanation.trim(),
    typeName: typeName || undefined,
    typeId: input.typeId ?? undefined,
  };
}

// ───────────────────── 문항 유형 자동 분류(AI) ─────────────────────

const ClassifySchema = z.object({
  assignments: z.array(z.object({ index: z.number().int(), typeName: z.string() })),
});

/**
 * 문항들을 교사의 '유형 관리' 유형 중 하나로 AI 분류. 반환은 입력 순서에 맞춘 typeId(또는 null) 배열.
 * 유형이 없거나 매칭 실패면 null.
 */
export async function classifyExamItems(
  items: { passage: string; stem: string; choices: string[]; explanation: string }[],
): Promise<(string | null)[]> {
  const { supabase, userId } = await requireTeacher();
  if (!items.length) return [];
  const { data: typeRows } = await supabase
    .from("qbank_types")
    .select("id, name")
    .eq("teacher_id", userId)
    .order("ord");
  const types = (typeRows ?? []) as { id: string; name: string }[];
  if (!types.length) return items.map(() => null);
  const idByName = new Map(types.map((t) => [t.name.trim(), t.id]));
  const apiKey = await getTeacherKey(supabase, userId);
  const client = new Anthropic({ apiKey });

  const payload = items.map((it, i) => ({ index: i, passage: it.passage, stem: it.stem, choices: it.choices, explanation: it.explanation }));
  const system = [
    "당신은 한국 교사의 객관식 문항을 유형으로 분류하는 보조자입니다.",
    "각 문항을 아래 '허용 유형' 중 가장 알맞은 하나로만 분류하세요. 어디에도 맞지 않으면 빈 문자열로 두세요.",
    "발문(stem)·제시문(passage)·선지·해설을 근거로 판단하고, 목록에 없는 새 유형명은 만들지 마세요.",
  ].join("\n");
  const user = [
    `[허용 유형]\n${types.map((t) => `- ${t.name}`).join("\n")}`,
    "",
    "[문항들(JSON)]",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "각 문항의 index와 배정한 typeName을 assignments 배열로 반환하세요(모든 index 포함, 허용 유형 표기 그대로).",
  ].join("\n");

  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "disabled" },
    output_config: { format: zodOutputFormat(ClassifySchema), effort: "low" },
    system,
    messages: [{ role: "user", content: user }],
  });
  const byIndex = new Map((res.parsed_output?.assignments ?? []).map((a) => [a.index, a.typeName.trim()]));
  return items.map((_, i) => {
    const name = byIndex.get(i);
    return name ? idByName.get(name) ?? null : null;
  });
}

// ───────────────────── 보관함(qbank_sets / qbank_items) ─────────────────────

export interface SavedItemInput {
  id?: string;
  passage: string;
  stem: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
  typeId?: string | null;
}

export async function saveGeneratedSet(input: {
  title: string;
  passage: string;
  spec: unknown;
  items: SavedItemInput[];
}): Promise<string> {
  const { supabase, userId } = await requireTeacher();
  const title = input.title.trim() || "제목 없는 시험";
  const { data: set, error } = await supabase
    .from("qbank_sets")
    .insert({
      teacher_id: userId,
      title,
      passage: input.passage.trim() || null,
      spec: input.spec ?? null,
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !set) throw new Error(error?.message ?? "세트 저장 실패");

  const rows = input.items
    .filter((it) => it.stem.trim())
    .map((it, i) => ({
      set_id: set.id,
      ord: i,
      passage: it.passage.trim() || null,
      stem: it.stem.trim(),
      choices: it.choices.map((c) => c.trim()).filter(Boolean),
      answer_index: it.answerIndex,
      explanation: it.explanation.trim() || null,
      type_id: it.typeId ?? null,
    }));
  if (rows.length) await supabase.from("qbank_items").insert(rows);

  revalidatePath("/teacher/question-bank");
  return set.id;
}

/** 문항 1건을 교사의 "보관 문항"(낱개 보관) 세트에 append. 세트가 없으면 만든다. */
export async function saveItemToBank(item: SavedItemInput): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  if (!item.stem.trim()) throw new Error("빈 문항은 보관할 수 없습니다.");

  // spec.kind='singles'로 낱개 보관 세트를 식별(제목 변경에도 견고)
  let setId: string | undefined;
  const { data: existing } = await supabase
    .from("qbank_sets")
    .select("id")
    .eq("teacher_id", userId)
    .eq("spec->>kind", "singles")
    .maybeSingle<{ id: string }>();
  if (existing?.id) {
    setId = existing.id;
  } else {
    const { data: created, error } = await supabase
      .from("qbank_sets")
      .insert({ teacher_id: userId, title: "보관 문항", spec: { kind: "singles" } })
      .select("id")
      .single<{ id: string }>();
    if (error || !created) throw new Error(error?.message ?? "보관 세트 생성 실패");
    setId = created.id;
  }

  // 기존 최대 ord 다음에 append
  const { data: last } = await supabase
    .from("qbank_items")
    .select("ord")
    .eq("set_id", setId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle<{ ord: number }>();
  const ord = (last?.ord ?? -1) + 1;

  await supabase.from("qbank_items").insert({
    set_id: setId,
    ord,
    passage: item.passage.trim() || null,
    stem: item.stem.trim(),
    choices: item.choices.map((c) => c.trim()).filter(Boolean),
    answer_index: item.answerIndex,
    explanation: item.explanation.trim() || null,
    type_id: item.typeId ?? null,
  });

  revalidatePath("/teacher/question-bank");
}

export async function getSetItems(setId: string): Promise<QbankItem[]> {
  const { supabase } = await requireTeacher();
  const { data } = await supabase
    .from("qbank_items")
    .select("*")
    .eq("set_id", setId) // RLS: 세트 소유 교사만
    .order("ord");
  return (data ?? []) as QbankItem[];
}

/** 세트 제목 + 문항 diff 저장(보관함 편집). */
export async function updateSet(
  setId: string,
  title: string,
  items: SavedItemInput[],
): Promise<void> {
  const { supabase } = await requireTeacher();
  await supabase.from("qbank_sets").update({ title: title.trim() || "제목 없는 시험" }).eq("id", setId);

  const { data: existing } = await supabase.from("qbank_items").select("id").eq("set_id", setId);
  const existingIds = new Set(((existing ?? []) as { id: string }[]).map((r) => r.id));
  const kept = new Set<string>();
  let ord = 0;
  for (const it of items) {
    if (!it.stem.trim()) continue;
    const row = {
      set_id: setId,
      ord: ord++,
      passage: it.passage.trim() || null,
      stem: it.stem.trim(),
      choices: it.choices.map((c) => c.trim()).filter(Boolean),
      answer_index: it.answerIndex,
      explanation: it.explanation.trim() || null,
      type_id: it.typeId ?? null,
    };
    if (it.id && existingIds.has(it.id)) {
      kept.add(it.id);
      await supabase.from("qbank_items").update(row).eq("id", it.id);
    } else {
      await supabase.from("qbank_items").insert(row);
    }
  }
  const toDelete = [...existingIds].filter((id) => !kept.has(id));
  if (toDelete.length) await supabase.from("qbank_items").delete().in("id", toDelete);
  revalidatePath("/teacher/question-bank");
}

export async function deleteSet(setId: string): Promise<void> {
  const { supabase } = await requireTeacher();
  await supabase.from("qbank_sets").delete().eq("id", setId);
  revalidatePath("/teacher/question-bank");
}

// ───────────────────── 시험지(qbank_sets, spec.kind='exam') ─────────────────────

/** 빈 시험지 생성 → setId. */
export async function createPaper(title: string): Promise<string> {
  const { supabase, userId } = await requireTeacher();
  const { data, error } = await supabase
    .from("qbank_sets")
    .insert({ teacher_id: userId, title: title.trim() || "새 시험지", spec: { kind: "exam" } })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "시험지 생성 실패");
  revalidatePath("/teacher/question-bank");
  return data.id;
}

async function nextOrd(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  setId: string,
): Promise<number> {
  const { data: last } = await supabase
    .from("qbank_items")
    .select("ord")
    .eq("set_id", setId)
    .order("ord", { ascending: false })
    .limit(1)
    .maybeSingle<{ ord: number }>();
  return (last?.ord ?? -1) + 1;
}

/** 보관함 문항을 시험지에 담기(스냅샷 복사, append). */
export async function addItemsToPaper(paperId: string, items: SavedItemInput[]): Promise<void> {
  const { supabase } = await requireTeacher();
  const clean = items.filter((it) => it.stem.trim());
  if (!clean.length) return;
  let ord = await nextOrd(supabase, paperId);
  const rows = clean.map((it) => ({
    set_id: paperId,
    ord: ord++,
    passage: it.passage.trim() || null,
    stem: it.stem.trim(),
    choices: it.choices.map((c) => c.trim()).filter(Boolean),
    answer_index: it.answerIndex,
    explanation: it.explanation.trim() || null,
    type_id: it.typeId ?? null,
  }));
  const { error } = await supabase.from("qbank_items").insert(rows); // RLS: 대상 시험지 소유 교사만
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/question-bank");
}

/** 문항을 다른 시험지로 이동(set_id 재지정 + append). RLS가 원본·대상 소유 모두 강제. */
export async function moveItemsToPaper(itemIds: string[], targetPaperId: string): Promise<void> {
  const { supabase } = await requireTeacher();
  if (!itemIds.length) return;
  let ord = await nextOrd(supabase, targetPaperId);
  for (const id of itemIds) {
    const { error } = await supabase
      .from("qbank_items")
      .update({ set_id: targetPaperId, ord: ord++ })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/teacher/question-bank");
}

// ───────────────────── 시험지 공유(배부) ─────────────────────

export async function setQbankShared(setId: string, shared: boolean): Promise<void> {
  const { supabase } = await requireTeacher();
  const { error } = await supabase.from("qbank_sets").update({ shared }).eq("id", setId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/question-bank");
}

export interface QbankDistState {
  classIds: string[];
  studentIds: string[];
}

export async function getQbankDistributions(setId: string): Promise<QbankDistState> {
  const { supabase } = await requireTeacher();
  const { data } = await supabase
    .from("qbank_distributions")
    .select("class_id, student_id")
    .eq("set_id", setId);
  const rows = (data ?? []) as { class_id: string | null; student_id: string | null }[];
  return {
    classIds: rows.filter((r) => r.class_id).map((r) => r.class_id as string),
    studentIds: rows.filter((r) => r.student_id).map((r) => r.student_id as string),
  };
}

export async function setQbankDistributions(
  setId: string,
  classIds: string[],
  studentIds: string[],
): Promise<void> {
  const { supabase } = await requireTeacher();
  const roster = await getTeacherRoster();
  const validClass = new Set(roster.map((c) => c.id));
  const validStudent = new Set(roster.flatMap((c) => c.students.map((s) => s.id)));
  const desiredClass = new Set(classIds.filter((id) => validClass.has(id)));
  const desiredStudent = new Set(studentIds.filter((id) => validStudent.has(id)));

  const { data: existing } = await supabase
    .from("qbank_distributions")
    .select("id, class_id, student_id")
    .eq("set_id", setId);
  const rows = (existing ?? []) as { id: string; class_id: string | null; student_id: string | null }[];

  const toDelete = rows
    .filter((r) => (r.class_id && !desiredClass.has(r.class_id)) || (r.student_id && !desiredStudent.has(r.student_id)))
    .map((r) => r.id);
  if (toDelete.length) {
    const { error } = await supabase.from("qbank_distributions").delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }

  const haveClass = new Set(rows.filter((r) => r.class_id).map((r) => r.class_id as string));
  const haveStudent = new Set(rows.filter((r) => r.student_id).map((r) => r.student_id as string));
  const inserts: { set_id: string; class_id?: string; student_id?: string }[] = [];
  for (const cid of desiredClass) if (!haveClass.has(cid)) inserts.push({ set_id: setId, class_id: cid });
  for (const sid of desiredStudent) if (!haveStudent.has(sid)) inserts.push({ set_id: setId, student_id: sid });
  if (inserts.length) {
    const { error } = await supabase.from("qbank_distributions").insert(inserts);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/teacher/question-bank");
}

// ───────────────────── 학생: 공유된 시험지 풀기·자가채점 ─────────────────────

export interface SharedQbankItem {
  id: string;
  passage: string | null;
  stem: string;
  choices: string[];
}
export interface SharedQbank {
  id: string;
  title: string;
  passage: string | null;
  items: SharedQbankItem[]; // 정답/해설 제거됨
}

async function assertStudentCanView(setId: string) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  const { data: allowed } = await supabase.rpc("can_view_qset", { p_set: setId });
  if (!allowed) throw new Error("이 시험지에 접근할 수 없습니다");
  return { userId: user.id };
}

/** 학생용: 정답·해설 제거된 문항만 반환(admin 경유). */
export async function getSharedQbankForStudent(setId: string): Promise<SharedQbank> {
  await assertStudentCanView(setId);
  const admin = createSupabaseAdminClient();
  const { data: set } = await admin
    .from("qbank_sets")
    .select("id, title, passage")
    .eq("id", setId)
    .single<{ id: string; title: string; passage: string | null }>();
  if (!set) throw new Error("시험지를 찾을 수 없습니다");
  const { data: items } = await admin
    .from("qbank_items")
    .select("id, ord, passage, stem, choices")
    .eq("set_id", setId)
    .order("ord");
  const rows = (items ?? []) as { id: string; ord: number; passage: string | null; stem: string; choices: string[] }[];
  return {
    id: set.id,
    title: set.title,
    passage: set.passage ?? null,
    items: rows.map((it) => ({ id: it.id, passage: it.passage ?? null, stem: it.stem, choices: it.choices })),
  };
}

export interface QbankGradeResult {
  itemId: string;
  correctIndex: number;
  chosen: number;
  correct: boolean;
  explanation: string | null;
}

/** 학생용: 서버에서 채점(정답은 여기서만 조회). 제출 저장은 하지 않음(자가채점). */
export async function gradeSharedQbank(
  setId: string,
  answers: { itemId: string; choiceIndex: number }[],
): Promise<{ score: number; total: number; results: QbankGradeResult[] }> {
  await assertStudentCanView(setId);
  const admin = createSupabaseAdminClient();
  const { data: items } = await admin
    .from("qbank_items")
    .select("id, ord, answer_index, explanation")
    .eq("set_id", setId)
    .order("ord");
  const rows = (items ?? []) as { id: string; ord: number; answer_index: number; explanation: string | null }[];
  const chosenById = new Map(answers.map((a) => [a.itemId, a.choiceIndex]));
  const results: QbankGradeResult[] = rows.map((it) => {
    const chosen = chosenById.get(it.id) ?? -1;
    return {
      itemId: it.id,
      correctIndex: it.answer_index,
      chosen,
      correct: chosen === it.answer_index,
      explanation: it.explanation ?? null,
    };
  });
  return { score: results.filter((r) => r.correct).length, total: results.length, results };
}
