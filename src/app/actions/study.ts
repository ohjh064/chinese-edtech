"use server";

/**
 * 단어장 학습 보조 — 단어 대표 이미지 자동 검색(Openverse) + 단계별 학습 로깅(교사 추적용).
 * 이미지 결과는 ai_cache에 캐시. 무결과/실패는 null(폴백=한자 카드).
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";
import { assertCanPractice } from "@/lib/study-access";

export async function getWordImage(term: string): Promise<string | null> {
  const q = term.trim();
  if (!q) return null;

  // 로그인 사용자만(우리 서버가 임의 검색 프록시로 남용되지 않도록)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const key = `img:${q.toLowerCase()}`;
  const admin = createSupabaseAdminClient();
  const { data: hit } = await admin
    .from("ai_cache")
    .select("result")
    .eq("key", key)
    .maybeSingle<{ result: { url: string | null } }>();
  if (hit) return hit.result?.url ?? null;

  let url: string | null = null;
  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=1&mature=false`,
      { headers: { "User-Agent": "pinmaster-edu/1.0 (education)" } },
    );
    if (res.ok) {
      const json = (await res.json()) as { results?: { url?: string; thumbnail?: string }[] };
      const first = json.results?.[0];
      url = first?.thumbnail || first?.url || null;
    }
  } catch {
    url = null;
  }

  try {
    await admin.from("ai_cache").upsert({ key, kind: "img", result: { url } }, { onConflict: "key" });
  } catch {
    /* 캐시 실패는 무시 */
  }
  return url;
}

export interface StudyAttempt {
  wordId: string;
  correct: boolean | null; // null = 정오답 없음(1단계 듣기)
}

/**
 * 단어장 학습 한 단계 완료 시, 그 판의 단어별 결과를 study_logs에 배치 기록(교사 추적용).
 * play당 단어별 1행. 실패는 삼켜 학습 흐름을 막지 않는다.
 */
export async function logStudyAttempts(
  assessmentId: string,
  step: number,
  items: StudyAttempt[],
): Promise<void> {
  if (!items.length || step < 1 || step > 5) return;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await assertCanPractice(supabase, assessmentId, user.id);

    // 단어별 1행으로 정리(중복 wordId는 마지막 결과 사용; 한 번이라도 틀리면 오답)
    const byWord = new Map<string, boolean | null>();
    for (const it of items) {
      if (!it.wordId) continue;
      const prev = byWord.get(it.wordId);
      // 오답(false)은 유지 우선: 이미 false면 그대로, 아니면 새 값
      if (prev === false) continue;
      byWord.set(it.wordId, it.correct);
    }
    const rows = [...byWord.entries()].map(([wordId, correct]) => ({
      student_id: user.id,
      assessment_id: assessmentId,
      word_id: wordId,
      step,
      correct,
    }));
    if (rows.length) await supabase.from("study_logs").insert(rows);
  } catch {
    /* 로깅 실패는 무시 */
  }
}
