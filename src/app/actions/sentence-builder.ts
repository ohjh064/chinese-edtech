"use server";

/**
 * Sentence Builder (PRD §6) — 단어 배열 게임. 정답(토큰 순서)은 서버에서만 채점한다.
 * 학생에겐 셔플된 토큰만 전달하고, 접근은 상황 열람 RLS로 매 호출 재확인한다.
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { shuffleTokens, checkSentence, hintTokens } from "@/lib/sentence-build";

async function requireStudent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  return { supabase, userId: user.id };
}

/** 상황을 현재 열람 가능한지 RLS로 재확인 */
async function assertViewable(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  situationId: string,
) {
  const { data } = await supabase
    .from("situations")
    .select("id")
    .eq("id", situationId)
    .maybeSingle<{ id: string }>();
  if (!data) throw new Error("접근할 수 없는 상황입니다");
}

export interface BuilderItem {
  id: string;
  promptKo: string;
  tokens: string[]; // 셔플됨
  count: number;
  difficulty: string;
}

export async function getSentenceBuilder(situationId: string): Promise<BuilderItem[]> {
  const { supabase } = await requireStudent();
  await assertViewable(supabase, situationId);

  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from("sentence_items")
    .select("id, target_ko, tokens, difficulty")
    .eq("situation_id", situationId)
    .order("ord");

  const seed = Math.floor(Math.random() * 1_000_000_000);
  return ((data ?? []) as {
    id: string;
    target_ko: string | null;
    tokens: string[];
    difficulty: string;
  }[])
    .filter((it) => (it.tokens?.length ?? 0) >= 2)
    .map((it, i) => ({
      id: it.id,
      promptKo: it.target_ko ?? "",
      tokens: shuffleTokens(it.tokens, seed + i),
      count: it.tokens.length,
      difficulty: it.difficulty,
    }));
}

export interface GradeResult {
  correct: boolean;
  targetZh?: string;
  targetKo?: string;
}

export async function gradeSentence(
  itemId: string,
  ordered: string[],
): Promise<GradeResult> {
  const { supabase, userId } = await requireStudent();
  const admin = createSupabaseAdminClient();
  const { data: item } = await admin
    .from("sentence_items")
    .select("situation_id, target_zh, target_ko, tokens")
    .eq("id", itemId)
    .single<{ situation_id: string; target_zh: string; target_ko: string | null; tokens: string[] }>();
  if (!item) throw new Error("문항을 찾을 수 없습니다");
  await assertViewable(supabase, item.situation_id);

  const correct = checkSentence(ordered, item.tokens);
  if (correct) {
    await supabase.from("level_progress").upsert(
      {
        student_id: userId,
        situation_id: item.situation_id,
        activity: "builder",
        cleared: true,
        score: item.tokens.length,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,situation_id,activity" },
    );
  }
  return correct
    ? { correct: true, targetZh: item.target_zh, targetKo: item.target_ko ?? undefined }
    : { correct: false };
}

export async function sentenceHint(itemId: string, count: number): Promise<string[]> {
  const { supabase } = await requireStudent();
  const admin = createSupabaseAdminClient();
  const { data: item } = await admin
    .from("sentence_items")
    .select("situation_id, tokens")
    .eq("id", itemId)
    .single<{ situation_id: string; tokens: string[] }>();
  if (!item) throw new Error("문항을 찾을 수 없습니다");
  await assertViewable(supabase, item.situation_id);
  // 정답 전체 순서가 새지 않도록 마지막 토큰은 절대 공개하지 않는다(앞부분 일부만).
  const max = Math.max(1, item.tokens.length - 1);
  const n = Math.min(Math.max(0, Math.floor(count)), max);
  return hintTokens(item.tokens, n);
}
