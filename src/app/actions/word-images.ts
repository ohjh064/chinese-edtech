"use server";

/**
 * 단어 이미지 온라인 검색(Openverse, API 키 불필요) — 교사가 단어에 붙일 이미지를 고르는 모달용.
 * 결과 목록은 ai_cache에 쿼리별로 캐시. 기존 study.ts의 단건 getWordImage를 다건으로 확장한 형태.
 */
import {
  createSupabaseServerClient,
  createSupabaseAdminClient,
} from "@/lib/supabase/server";

export interface ImageResult {
  url: string; // 원본(또는 없으면 썸네일)
  thumbnail: string; // 그리드 표시용
}

export async function searchWordImages(query: string): Promise<ImageResult[]> {
  const q = query.trim();
  if (!q) return [];

  // 로그인 사용자만(임의 검색 프록시 남용 방지)
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");

  const key = `imgs:${q.toLowerCase()}`;
  const admin = createSupabaseAdminClient();
  const { data: hit } = await admin
    .from("ai_cache")
    .select("result")
    .eq("key", key)
    .maybeSingle<{ result: { items: ImageResult[] } }>();
  if (hit) return hit.result?.items ?? [];

  let items: ImageResult[] = [];
  try {
    const res = await fetch(
      `https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=24&mature=false`,
      { headers: { "User-Agent": "pinmaster-edu/1.0 (education)" } },
    );
    if (res.ok) {
      const json = (await res.json()) as { results?: { url?: string; thumbnail?: string }[] };
      items = (json.results ?? [])
        .map((r) => {
          const thumbnail = r.thumbnail || r.url || "";
          const url = r.url || r.thumbnail || "";
          return { url, thumbnail };
        })
        .filter((r) => r.thumbnail);
    }
  } catch {
    items = [];
  }

  try {
    await admin.from("ai_cache").upsert({ key, kind: "img", result: { items } }, { onConflict: "key" });
  } catch {
    /* 캐시 실패는 무시 */
  }
  return items;
}
