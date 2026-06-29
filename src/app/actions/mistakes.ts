"use server";

/**
 * AI 오답노트 (PRD §13) — 학생별 오답 누적·유형분석·AI 맞춤 출제.
 * 오답 기록은 연습 채점(practice)에서 sync_practice_mistakes로 일원화된다.
 * 맞춤 출제는 정답키(admin)로 그라운딩하고 콘텐츠 작성 교사의 BYOK 키로 호출한다.
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { decryptSecret } from "@/lib/crypto";
import { toDisplayWord } from "@/grading/pinyin.js";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { createHash } from "node:crypto";
import type { MistakeKind } from "@/lib/database.types";

const MODEL = "claude-sonnet-4-6";
const MAX_DRILL = 8;
const DRILL_TTL_MS = 1000 * 60 * 60; // 동일 오답 세트 캐시 유효(1시간)
const DRILL_THROTTLE_MS = 20_000; // 유료 호출 연타 방지(학생당 최소 간격)

async function requireStudent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  return { supabase, userId: user.id };
}

async function resolveTeacherKey(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  teacherId: string,
): Promise<string | undefined> {
  const { data: secret } = await admin
    .from("teacher_secrets")
    .select("anthropic_key_encrypted")
    .eq("teacher_id", teacherId)
    .maybeSingle<{ anthropic_key_encrypted: string }>();
  if (secret?.anthropic_key_encrypted) {
    try {
      return decryptSecret(secret.anthropic_key_encrypted);
    } catch {
      /* fallback */
    }
  }
  return process.env.ANTHROPIC_API_KEY || undefined;
}

const KIND_KO: Record<MistakeKind, string> = {
  pinyin: "병음",
  tone: "성조",
  meaning: "의미",
  grammar: "어법",
  expression: "표현",
};

export interface MistakeRow {
  id: string;
  kind: MistakeKind;
  label: string;
  detail: string | null;
  count: number;
}
export interface MistakeSummary {
  items: MistakeRow[];
  resolvedCount: number;
  byKind: { kind: MistakeKind; ko: string; count: number }[];
}

export async function getMistakes(): Promise<MistakeSummary> {
  const { supabase, userId } = await requireStudent();
  const { data } = await supabase
    .from("mistakes")
    .select("id, kind, label, detail, count, resolved, last_at")
    .eq("student_id", userId)
    .order("count", { ascending: false })
    .order("last_at", { ascending: false });
  const all = (data ?? []) as {
    id: string;
    kind: MistakeKind;
    label: string;
    detail: string | null;
    count: number;
    resolved: boolean;
  }[];
  const open = all.filter((m) => !m.resolved);
  const byKindMap = new Map<MistakeKind, number>();
  for (const m of open) byKindMap.set(m.kind, (byKindMap.get(m.kind) ?? 0) + 1);
  return {
    items: open.map((m) => ({ id: m.id, kind: m.kind, label: m.label, detail: m.detail, count: m.count })),
    resolvedCount: all.length - open.length,
    byKind: [...byKindMap.entries()].map(([kind, count]) => ({ kind, ko: KIND_KO[kind] ?? kind, count })),
  };
}

export async function resolveMistake(id: string): Promise<void> {
  const { supabase, userId } = await requireStudent();
  await supabase
    .from("mistakes")
    .update({ resolved: true, last_at: new Date().toISOString() })
    .eq("id", id)
    .eq("student_id", userId);
}

export interface DrillItem {
  mistakeId: string;
  kind: MistakeKind;
  label: string;
  prompt: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

const DrillSchema = z.object({
  drills: z.array(
    z.object({
      mistakeId: z.string(),
      prompt: z.string(),
      choices: z.array(z.string()),
      answerIndex: z.number().int(),
      explanation: z.string(),
    }),
  ),
});

/** 미해결 오답에 대해 정답키로 그라운딩한 4지선다 맞춤 연습을 AI(BYOK)로 1배치 생성한다. */
export async function generateMistakeDrill(): Promise<DrillItem[]> {
  const { supabase, userId } = await requireStudent();
  const { data } = await supabase
    .from("mistakes")
    .select("id, teacher_id, word_id, kind, label, detail, count")
    .eq("student_id", userId)
    .eq("resolved", false)
    .order("count", { ascending: false })
    .order("last_at", { ascending: false })
    .limit(MAX_DRILL);
  const ms = (data ?? []) as {
    id: string;
    teacher_id: string | null;
    word_id: string | null;
    kind: MistakeKind;
    label: string;
    detail: string | null;
    count: number;
  }[];
  if (!ms.length) return [];

  const admin = createSupabaseAdminClient();

  // 동일 오답 세트의 반복 클릭은 캐시로 반환(유료 호출 0). 세트가 바뀌면 새로 생성.
  const setHash = createHash("sha256")
    .update(JSON.stringify({ u: userId, items: ms.map((m) => [m.id, m.count]).sort() }))
    .digest("hex");
  const cacheKey = `drill:${setHash}`;
  const { data: hit } = await admin
    .from("ai_cache")
    .select("result, created_at")
    .eq("key", cacheKey)
    .maybeSingle<{ result: DrillItem[]; created_at: string }>();
  if (hit && Date.now() - new Date(hit.created_at).getTime() < DRILL_TTL_MS) {
    return hit.result;
  }

  // 가장 빈번한 교사(콘텐츠 작성자)의 키로 호출
  const teacherCount = new Map<string, number>();
  for (const m of ms) if (m.teacher_id) teacherCount.set(m.teacher_id, (teacherCount.get(m.teacher_id) ?? 0) + 1);
  const teacherId = [...teacherCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (!teacherId) throw new Error("맞춤 출제를 위한 교사 정보가 없습니다.");

  const apiKey = await resolveTeacherKey(admin, teacherId);
  if (!apiKey) throw new Error("교사 Anthropic API 키가 설정되지 않아 맞춤 출제를 할 수 없습니다.");

  // 유료 호출 직전 연타 방지: 학생당 최소 간격(캐시 미스 경로에만 적용). 호출 실패 시에도 카운트.
  const throttleKey = `drill_throttle:${userId}`;
  const { data: thr } = await admin
    .from("ai_cache")
    .select("created_at")
    .eq("key", throttleKey)
    .maybeSingle<{ created_at: string }>();
  if (thr && Date.now() - new Date(thr.created_at).getTime() < DRILL_THROTTLE_MS) {
    throw new Error("맞춤 연습은 잠시 후 다시 만들 수 있어요.");
  }
  await admin
    .from("ai_cache")
    .upsert({ key: throttleKey, kind: "drill_throttle", result: {}, created_at: new Date().toISOString() }, { onConflict: "key" });

  // 정답키 그라운딩(있는 word_id만) — AI가 정답을 지어내지 않도록
  const wordIds = ms.map((m) => m.word_id).filter((x): x is string => !!x);
  const keyByWord = new Map<string, { pinyin: string; tones: number[]; meanings: string[]; example: string | null }>();
  if (wordIds.length) {
    const { data: keys } = await admin
      .from("word_keys")
      .select("word_id, correct_pinyin, correct_tones, acceptable_meanings, example_sentence")
      .in("word_id", wordIds);
    for (const k of (keys ?? []) as {
      word_id: string;
      correct_pinyin: string;
      correct_tones: number[];
      acceptable_meanings: string[];
      example_sentence: string | null;
    }[]) {
      keyByWord.set(k.word_id, {
        pinyin: k.correct_pinyin,
        tones: k.correct_tones,
        meanings: k.acceptable_meanings ?? [],
        example: k.example_sentence,
      });
    }
  }

  const lines = ms
    .map((m) => {
      const k = m.word_id ? keyByWord.get(m.word_id) : undefined;
      const info = k
        ? ` 정답병음=${toDisplayWord(k.pinyin, k.tones)} 의미=${k.meanings.slice(0, 3).join("/")}${k.example ? ` 예문=${k.example}` : ""}`
        : "";
      return `- id=${m.id} 종류=${KIND_KO[m.kind] ?? m.kind} 한자=${m.label}${info}`;
    })
    .join("\n");

  const system = [
    "당신은 중국어 학습 오답 클리닉입니다. 각 오답 항목마다 그 약점을 교정하는 4지선다 연습문제를 한국어로 정확히 1개씩 만드세요.",
    "규칙: choices는 정확히 4개(서로 다르게), answerIndex는 정답 보기의 0기반 인덱스, explanation은 왜 정답인지 1~2문장.",
    "종류가 병음/성조면 발음을, 의미면 뜻을, 어법이면 어법 포인트를 묻는 문제로 만드세요.",
    "제공된 정답 정보를 사용하고 새로 지어내지 마세요. 각 drill의 mistakeId는 입력 id를 그대로 사용하세요.",
  ].join("\n");

  const client = new Anthropic({ apiKey });
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 2048,
    thinking: { type: "disabled" },
    output_config: { format: zodOutputFormat(DrillSchema), effort: "low" },
    system,
    messages: [{ role: "user", content: `오답 목록:\n${lines}` }],
  });
  if (!res.parsed_output) throw new Error("문제 생성 실패");

  const byId = new Map(ms.map((m) => [m.id, m]));
  const drills: DrillItem[] = res.parsed_output.drills
    .filter(
      (d) =>
        byId.has(d.mistakeId) &&
        Array.isArray(d.choices) &&
        d.choices.length === 4 &&
        d.answerIndex >= 0 &&
        d.answerIndex < 4,
    )
    .map((d) => {
      const m = byId.get(d.mistakeId)!;
      return {
        mistakeId: d.mistakeId,
        kind: m.kind,
        label: m.label,
        prompt: d.prompt,
        choices: d.choices,
        answerIndex: d.answerIndex,
        explanation: d.explanation,
      };
    });

  // 동일 세트 재요청 시 재과금 방지
  await admin
    .from("ai_cache")
    .upsert({ key: cacheKey, kind: "drill", result: drills, created_at: new Date().toISOString() }, { onConflict: "key" });
  return drills;
}
