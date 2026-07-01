"use server";

/**
 * 단어장 학습 보조 — 단어 대표 이미지 자동 검색(Openverse, 무료·키 불필요).
 * 결과는 ai_cache에 캐시(외부 호출·레이트리밋 최소화). 무결과/실패는 null(폴백=한자 카드).
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

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
