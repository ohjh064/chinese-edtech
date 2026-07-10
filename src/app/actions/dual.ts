"use server";

/**
 * AI 듀얼 롤플레이 (PRD §12) — AI가 두 역할(A=상대, B=학생 역할)을 번갈아 연기해
 * 모범 대화를 시연하고, 학생이 원하면 B 역할로 끼어들 수 있다. 회화 엔진(비스트리밍)·턴 상한 재사용.
 * 각 AI 발화 1회 = Claude 1회(상한 카운트). 모범답안/키는 서버(admin)에서만 다룬다.
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { getAnthropicKey, aiErrorMessage } from "@/lib/ai-key";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";

const MAX_TURNS = 30;
const MODEL = "claude-sonnet-4-6";

export type DualSpeaker = "a" | "b" | "student";
export interface DualMsg {
  speaker: DualSpeaker;
  zh: string;
  ko: string | null;
}
export interface DualStart {
  conversationId: string;
  roleA: string;
  roleB: string;
  history: DualMsg[];
  turnsLeft: number;
  done: boolean;
}
export interface DualTurnResult {
  line: DualMsg;
  turnsLeft: number;
  done: boolean;
}

const LineSchema = z.object({ lineZh: z.string(), lineKo: z.string() });

function roleToSpeaker(role: string): DualSpeaker {
  if (role === "ai") return "a";
  if (role === "ai2") return "b";
  return "student";
}
function speakerToRole(s: DualSpeaker): string {
  return s === "a" ? "ai" : s === "b" ? "ai2" : "student";
}

export async function startDual(situationId: string): Promise<DualStart> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  // RLS: 열람 가능한 상황만(역할 라벨 포함)
  const { data: situation } = await supabase
    .from("situations")
    .select("id, role_student, role_ai")
    .eq("id", situationId)
    .single<{ id: string; role_student: string | null; role_ai: string | null }>();
  if (!situation) throw new Error("접근할 수 없는 상황입니다");

  let { data: conv } = await supabase
    .from("conversations")
    .select("id, turns, status")
    .eq("student_id", user.id)
    .eq("situation_id", situationId)
    .eq("mode", "dual")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; turns: number; status: string }>();

  if (!conv) {
    const { data: created, error } = await supabase
      .from("conversations")
      .insert({ student_id: user.id, situation_id: situationId, mode: "dual" })
      .select("id, turns, status")
      .single<{ id: string; turns: number; status: string }>();
    if (error || !created) throw new Error(error?.message ?? "대화 시작 실패");
    conv = created;
  }

  const { data: msgs } = await supabase
    .from("messages")
    .select("role, content_zh, content_ko")
    .eq("conversation_id", conv.id)
    .order("created_at", { ascending: true });
  const history: DualMsg[] = (msgs ?? []).map(
    (m: { role: string; content_zh: string | null; content_ko: string | null }) => ({
      speaker: roleToSpeaker(m.role),
      zh: m.content_zh ?? "",
      ko: m.content_ko ?? null,
    }),
  );

  return {
    conversationId: conv.id,
    roleA: situation.role_ai || "상대",
    roleB: situation.role_student || "학습자",
    history,
    turnsLeft: Math.max(0, MAX_TURNS - conv.turns),
    done: conv.status === "done",
  };
}

interface DualGround {
  apiKey: string;
  roleA: string;
  roleB: string;
  title: string;
  description: string;
  difficulty: string;
  expressions: { hanzi: string; pinyin: string | null; meaning: string | null }[];
  transcript: { speaker: DualSpeaker; zh: string }[];
}

/** 대화 소유·열람을 재확인하고 그라운딩(상황·표현·교사 키)을 admin으로 로드 */
async function loadDual(conversationId: string): Promise<{
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  conv: { id: string; situation_id: string; turns: number; status: string };
  ground: DualGround;
}> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, student_id, situation_id, turns, status, mode")
    .eq("id", conversationId)
    .single<{ id: string; student_id: string; situation_id: string; turns: number; status: string; mode: string }>();
  if (!conv || conv.student_id !== user.id) throw new Error("대화를 찾을 수 없습니다");
  if (conv.mode !== "dual") throw new Error("듀얼 롤플레이 대화가 아닙니다");

  const { data: stillViewable } = await supabase
    .from("situations")
    .select("id")
    .eq("id", conv.situation_id)
    .maybeSingle<{ id: string }>();
  if (!stillViewable) throw new Error("이 상황은 더 이상 이용할 수 없습니다");

  const admin = createSupabaseAdminClient();
  const { data: situation } = await admin
    .from("situations")
    .select("unit_id, title, description, role_student, role_ai, difficulty")
    .eq("id", conv.situation_id)
    .single<{
      unit_id: string;
      title: string;
      description: string | null;
      role_student: string | null;
      role_ai: string | null;
      difficulty: string;
    }>();
  if (!situation) throw new Error("상황을 찾을 수 없습니다");
  const { data: unit } = await admin
    .from("units")
    .select("teacher_id")
    .eq("id", situation.unit_id)
    .single<{ teacher_id: string }>();
  if (!unit) throw new Error("단원을 찾을 수 없습니다");
  const apiKey = getAnthropicKey();
  if (!apiKey) throw new Error("교사 Anthropic API 키가 설정되지 않아 대화를 진행할 수 없습니다.");

  const { data: exprs } = await admin
    .from("expressions")
    .select("hanzi, pinyin, meaning")
    .eq("situation_id", conv.situation_id)
    .order("ord");
  const { data: msgs } = await supabase
    .from("messages")
    .select("role, content_zh")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  const transcript = ((msgs ?? []) as { role: string; content_zh: string | null }[]).map((m) => ({
    speaker: roleToSpeaker(m.role),
    zh: m.content_zh ?? "",
  }));

  return {
    supabase,
    conv,
    ground: {
      apiKey,
      roleA: situation.role_ai || "상대",
      roleB: situation.role_student || "학습자",
      title: situation.title,
      description: situation.description ?? "",
      difficulty: situation.difficulty,
      expressions: (exprs ?? []) as { hanzi: string; pinyin: string | null; meaning: string | null }[],
      transcript,
    },
  };
}

function nameOf(g: DualGround, s: DualSpeaker): string {
  return s === "a" ? g.roleA : g.roleB;
}

async function speakAs(g: DualGround, self: DualSpeaker): Promise<{ zh: string; ko: string }> {
  const selfName = nameOf(g, self);
  const otherName = self === "a" ? g.roleB : g.roleA;
  const exprs = g.expressions.map((e) => `- ${e.hanzi}${e.meaning ? ` : ${e.meaning}` : ""}`).join("\n");
  const system = [
    `당신은 중국어 회화 시연의 "${selfName}" 역할입니다. 상대는 "${otherName}".`,
    `상황: ${g.title}. ${g.description}`,
    `난이도: ${g.difficulty}. 학습용 시연이므로 자연스럽고 교육적으로, 한 번에 한 문장만.`,
    "참고 표현:",
    exprs || "(없음)",
    "",
    `출력(JSON): lineZh=${selfName}로서의 중국어 한 문장, lineKo=한국어 번역.`,
  ].join("\n");
  const lines = g.transcript.map((t) => `${nameOf(g, t.speaker)}: ${t.zh}`).join("\n");
  const userContent = lines
    ? `지금까지 대화:\n${lines}\n\n이제 "${selfName}"의 다음 한 문장을 말하세요.`
    : `장면을 시작하세요. "${selfName}"가 먼저 자연스럽게 말을 겁니다.`;

  const client = new Anthropic({ apiKey: g.apiKey });
  let res;
  try {
    res = await client.messages.parse({
      model: MODEL,
      max_tokens: 512,
      thinking: { type: "disabled" },
      output_config: { format: zodOutputFormat(LineSchema), effort: "low" },
      system,
      messages: [{ role: "user", content: userContent }],
    });
  } catch (e) {
    throw new Error(aiErrorMessage(e));
  }
  if (!res.parsed_output) throw new Error("대사 생성 실패");
  return { zh: res.parsed_output.lineZh, ko: res.parsed_output.lineKo };
}

async function persistTurn(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  conv: { id: string; situation_id: string; turns: number },
  studentId: string,
  speaker: DualSpeaker,
  line: { zh: string; ko: string },
): Promise<DualTurnResult> {
  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: speakerToRole(speaker),
    content_zh: line.zh,
    content_ko: line.ko,
  });
  const newTurns = conv.turns + 1;
  const done = newTurns >= MAX_TURNS;
  await supabase
    .from("conversations")
    .update({ turns: newTurns, status: done ? "done" : "active" })
    .eq("id", conv.id);
  // 시연을 어느 정도 진행하면 완료로 표시(코스 배지)
  if (newTurns >= 6) {
    await supabase.from("level_progress").upsert(
      {
        student_id: studentId,
        situation_id: conv.situation_id,
        activity: "dual",
        cleared: true,
        score: newTurns,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,situation_id,activity" },
    );
  }
  return { line: { speaker, zh: line.zh, ko: line.ko }, turnsLeft: Math.max(0, MAX_TURNS - newTurns), done };
}

/** AI↔AI 시연의 다음 한 턴: 마지막 발화자의 상대 역할이 이어 말한다. */
export async function nextDualTurn(conversationId: string): Promise<DualTurnResult> {
  const { supabase, conv, ground } = await loadDual(conversationId);
  if (conv.status === "done" || conv.turns >= MAX_TURNS) {
    return { line: { speaker: "a", zh: "", ko: "" }, turnsLeft: 0, done: true };
  }
  const last = ground.transcript[ground.transcript.length - 1];
  // 첫 발화는 A(상대), 그 외에는 직전 발화자의 반대 역할(student 발화 뒤엔 A)
  const self: DualSpeaker = !last ? "a" : last.speaker === "a" ? "b" : "a";
  const line = await speakAs(ground, self);
  const studentId = (await supabase.auth.getUser()).data.user!.id;
  return persistTurn(supabase, conv, studentId, self, line);
}

/** 학생이 B(학습자) 역할로 끼어든다 → 학생 발화 저장 후 A(상대)가 응답. */
export async function studentDualSay(conversationId: string, studentText: string): Promise<DualTurnResult> {
  const { supabase, conv, ground } = await loadDual(conversationId);
  const text = (studentText ?? "").trim();
  if (!text) throw new Error("내용을 입력하세요");
  if (conv.status === "done" || conv.turns >= MAX_TURNS) {
    return { line: { speaker: "a", zh: "", ko: "" }, turnsLeft: 0, done: true };
  }
  const studentId = (await supabase.auth.getUser()).data.user!.id;
  // 학생 발화 저장(AI 호출 아님 → 상한 미카운트)
  await supabase.from("messages").insert({
    conversation_id: conv.id,
    role: "student",
    content_zh: text,
  });
  ground.transcript.push({ speaker: "student", zh: text });
  const line = await speakAs(ground, "a");
  return persistTurn(supabase, conv, studentId, "a", line);
}
