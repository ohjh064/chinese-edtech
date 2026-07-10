"use server";

/**
 * 내 단어장(개인 약점 컬렉션) — 학생이 플래시카드·단어학습·회화 핵심표현에서 직접 담는 단어/표현.
 * 자동 집계 오답노트(mistakes)와 별개. RLS(student_id=auth.uid())로 본인 것만 add/remove/read.
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient, createSupabaseAdminClient } from "@/lib/supabase/server";
import { displayPinyin } from "@/lib/pinyin-suggest";
import type { WordbookItem, WordbookKind } from "@/lib/database.types";

async function requireStudent() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("로그인이 필요합니다");
  return { supabase, userId: user.id };
}

export interface WordbookInput {
  kind: WordbookKind;
  hanzi: string;
  pinyin?: string | null;
  meaning?: string | null;
  example?: string | null;
  wordId?: string | null;
  situationId?: string | null;
  source?: string;
}

/** 단어/표현을 내 단어장에 담기(중복은 무시 — 멱등). */
export async function addToWordbook(input: WordbookInput): Promise<void> {
  const { supabase, userId } = await requireStudent();
  const hanzi = input.hanzi.trim();
  if (!hanzi) return;
  const { error } = await supabase.from("wordbook_items").upsert(
    {
      student_id: userId,
      kind: input.kind,
      hanzi,
      pinyin: input.pinyin?.trim() || null,
      meaning: input.meaning?.trim() || null,
      example: input.example?.trim() || null,
      word_id: input.wordId ?? null,
      situation_id: input.situationId ?? null,
      source: input.source ?? null,
    },
    { onConflict: "student_id,kind,hanzi", ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  revalidatePath("/student/vocab");
}

/** 내 단어장 항목 삭제(본인 것만). */
export async function removeFromWordbook(id: string): Promise<void> {
  const { supabase, userId } = await requireStudent();
  const { error } = await supabase.from("wordbook_items").delete().eq("id", id).eq("student_id", userId);
  if (error) throw new Error(error.message);
  revalidatePath("/student/vocab");
}

// ───────────────────── 드래그 → 자동 채우기(병음·뜻) ─────────────────────

/** CJK 통합 한자(+확장 A·호환 한자) 매칭 — 선택 조각에서 한자만 추림. */
const CJK_RE = /[㐀-䶿一-鿿豈-﫿]/g;

export interface WordbookLookup {
  hanzi: string;
  pinyin: string;
  meaning: string;
  kind: WordbookKind;
}

/**
 * 시험지에서 드래그한 중국어 조각 → 정제된 한자 + 병음(로컬 pinyin-pro) + 한국어 뜻(무료 사전·캐시).
 * 저장은 하지 않고 값만 돌려준다(학생이 확인·수정 후 addToWordbook). 로그인 학생만.
 */
export async function lookupWordForWordbook(raw: string): Promise<WordbookLookup> {
  await requireStudent();
  const hanzi = (raw.match(CJK_RE) ?? []).join("");
  if (!hanzi) return { hanzi: "", pinyin: "", meaning: "", kind: "word" };

  const kind: WordbookKind = hanzi.length > 4 ? "expression" : "word";
  const [pinyin, meaning] = await Promise.all([
    Promise.resolve(displayPinyin(hanzi)),
    lookupMeaning(hanzi),
  ]);
  return { hanzi, pinyin, meaning, kind };
}

/**
 * 한자 → 한국어 뜻. 키가 필요 없는 무료 사전(Google translate gtx, zh→ko)으로 조회하고
 * 결과는 ai_cache에 캐시(단어 이미지 검색과 동일한 무키·베스트에포트 방식). 실패 시 빈 문자열.
 */
async function lookupMeaning(hanzi: string): Promise<string> {
  const key = `wbmean:${hanzi}`;
  const admin = createSupabaseAdminClient();
  const { data: hit } = await admin
    .from("ai_cache")
    .select("result")
    .eq("key", key)
    .maybeSingle<{ result: { meaning: string } }>();
  if (hit) return hit.result?.meaning ?? "";

  let meaning = "";
  try {
    const res = await fetch(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ko&dt=t&q=${encodeURIComponent(hanzi)}`,
      { headers: { "User-Agent": "Mozilla/5.0" } },
    );
    if (res.ok) {
      // 응답: [[["번역","원문",...], ...], ...] — dt=t 세그먼트의 0번을 이어붙인다.
      const json = (await res.json()) as [Array<[string, ...unknown[]]> | null, ...unknown[]];
      meaning = (json[0] ?? [])
        .map((seg) => (Array.isArray(seg) ? (seg[0] ?? "") : ""))
        .join("")
        .trim();
    }
  } catch {
    return "";
  }

  if (meaning) {
    try {
      await admin
        .from("ai_cache")
        .upsert({ key, kind: "wbmean", result: { meaning } }, { onConflict: "key" });
    } catch {
      /* 캐시 실패는 무시 */
    }
  }
  return meaning;
}

/** 내 단어장 전체(최근 담은 순). */
export async function getWordbook(): Promise<WordbookItem[]> {
  const { supabase, userId } = await requireStudent();
  const { data } = await supabase
    .from("wordbook_items")
    .select("*")
    .eq("student_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as WordbookItem[];
}
