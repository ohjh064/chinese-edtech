"use server";

/**
 * 내 단어장(개인 약점 컬렉션) — 학생이 플래시카드·단어학습·회화 핵심표현에서 직접 담는 단어/표현.
 * 자동 집계 오답노트(mistakes)와 별개. RLS(student_id=auth.uid())로 본인 것만 add/remove/read.
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
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
