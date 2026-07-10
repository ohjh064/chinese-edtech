"use server";

/**
 * 단어 세트 관리 + 배부(distribution). 단어 세트 = 연습 모드 assessment(재사용).
 * 배부는 assessment_distributions(다중 반 + 개별 학생)로, 대상 학생은 교사 담당 반 소속만 허용.
 */
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";

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

async function assertOwnsAssessment(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  userId: string,
  assessmentId: string,
) {
  const { data } = await supabase
    .from("assessments")
    .select("id, teacher_id")
    .eq("id", assessmentId)
    .single<{ id: string; teacher_id: string }>();
  if (!data || data.teacher_id !== userId) throw new Error("권한이 없는 세트입니다");
}

function parseTones(s: string): number[] {
  return s
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => {
      const n = Number(t);
      return Number.isFinite(n) ? (n === 5 ? 0 : n) : 0;
    });
}
function parseMeanings(s: string): string[] {
  return s.split(/[,，]/).map((m) => m.trim()).filter(Boolean);
}
function syllableCount(pinyin: string): number {
  return pinyin.trim().split(/\s+/).filter(Boolean).length;
}

// ───────────────────── 세트 생성/단어 저장 ─────────────────────

export async function createWordSet(title: string, description?: string): Promise<string> {
  const { supabase, userId } = await requireTeacher();
  const t = title.trim();
  if (!t) throw new Error("세트 이름을 입력하세요");
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      title: t,
      unit: description?.trim() || null,
      teacher_id: userId,
      class_id: null,
      mode: "practice",
      sentence_task_type: "compose",
      pinyin_error_unit: "initial_final",
      meaning_partial_weight: 1,
      attempts_allowed: 1,
      reveal_answers_in_practice: true,
      proctoring: false,
      allow_practice: true,
      status: "draft",
    })
    .select("id")
    .single<{ id: string }>();
  if (error || !data) throw new Error(error?.message ?? "세트 생성 실패");
  revalidatePath("/teacher/wordsets");
  return data.id;
}

export interface WordSetWordInput {
  id?: string;
  hanzi: string;
  correctPinyin: string;
  correctTones: string; // "3 3"
  acceptableMeanings: string; // 쉼표 구분
  exampleSentence?: string;
  imageUrl?: string; // 단어 대표 이미지(학습 1단계 노출) — words.image_url
}

export async function saveWordSetWords(
  assessmentId: string,
  words: WordSetWordInput[],
): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);

  const clean = words.filter((w) => w.hanzi.trim());
  const { data: existingWords } = await supabase
    .from("words")
    .select("id")
    .eq("assessment_id", assessmentId);
  const existingIds = new Set((existingWords ?? []).map((w: { id: string }) => w.id));
  const keptIds = new Set<string>();

  for (let i = 0; i < clean.length; i++) {
    const w = clean[i]!;
    const keyFields = {
      correct_pinyin: w.correctPinyin.trim(),
      correct_tones: parseTones(w.correctTones),
      acceptable_meanings: parseMeanings(w.acceptableMeanings),
      example_sentence: w.exampleSentence?.trim() || null,
      acceptable_corrections: [],
    };
    if (w.id && existingIds.has(w.id)) {
      keptIds.add(w.id);
      const { error: wErr } = await supabase
        .from("words")
        .update({ ord: i, hanzi: w.hanzi.trim(), syllable_count: syllableCount(w.correctPinyin), error_prompt: null, image_url: w.imageUrl?.trim() || null })
        .eq("id", w.id);
      if (wErr) throw new Error(wErr.message);
      const { error: kErr } = await supabase
        .from("word_keys")
        .upsert({ word_id: w.id, ...keyFields }, { onConflict: "word_id" });
      if (kErr) throw new Error(kErr.message);
    } else {
      const { data: word, error: wErr } = await supabase
        .from("words")
        .insert({ assessment_id: assessmentId, ord: i, hanzi: w.hanzi.trim(), syllable_count: syllableCount(w.correctPinyin), error_prompt: null, image_url: w.imageUrl?.trim() || null })
        .select("id")
        .single<{ id: string }>();
      if (wErr || !word) throw new Error(wErr?.message ?? "문항 저장 실패");
      const { error: kErr } = await supabase.from("word_keys").insert({ word_id: word.id, ...keyFields });
      if (kErr) throw new Error(kErr.message);
    }
  }

  const toDelete = [...existingIds].filter((id) => !keptIds.has(id));
  if (toDelete.length) {
    const { error: dErr } = await supabase.from("words").delete().in("id", toDelete);
    if (dErr) throw new Error(dErr.message);
  }
  revalidatePath("/teacher/wordsets");
}

export async function setWordSetPublished(assessmentId: string, published: boolean): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);
  const { error } = await supabase
    .from("assessments")
    .update({ status: published ? "published" : "draft" })
    .eq("id", assessmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/wordsets");
}

export async function deleteWordSet(assessmentId: string): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);
  const { error } = await supabase.from("assessments").delete().eq("id", assessmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/wordsets");
}

/** 대본 미션 상황(교사 설정)을 저장. 빈 문자열이면 null(=AI 배정)로 되돌린다. */
export async function saveScriptSituation(assessmentId: string, situation: string): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);
  const value = situation.trim() || null;
  const { error } = await supabase
    .from("assessments")
    .update({ script_situation: value })
    .eq("id", assessmentId);
  if (error) throw new Error(error.message);
  revalidatePath("/teacher/wordsets");
}

// ───────────────────── 단어 로드(편집용) ─────────────────────

export async function getWordSetWords(assessmentId: string): Promise<(WordSetWordInput & { id: string })[]> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);
  const { data: words } = await supabase
    .from("words")
    .select("id, hanzi, image_url")
    .eq("assessment_id", assessmentId)
    .order("ord");
  const list = (words ?? []) as { id: string; hanzi: string; image_url: string | null }[];
  if (!list.length) return [];
  const { data: keys } = await supabase
    .from("word_keys")
    .select("word_id, correct_pinyin, correct_tones, acceptable_meanings, example_sentence")
    .in("word_id", list.map((w) => w.id));
  const keyByWord = new Map(
    ((keys ?? []) as {
      word_id: string;
      correct_pinyin: string;
      correct_tones: number[];
      acceptable_meanings: string[];
      example_sentence: string | null;
    }[]).map((k) => [k.word_id, k]),
  );
  return list.map((w) => {
    const k = keyByWord.get(w.id);
    return {
      id: w.id,
      hanzi: w.hanzi,
      correctPinyin: k?.correct_pinyin ?? "",
      correctTones: (k?.correct_tones ?? []).join(" "),
      acceptableMeanings: (k?.acceptable_meanings ?? []).join(", "),
      exampleSentence: k?.example_sentence ?? "",
      imageUrl: w.image_url ?? "",
    };
  });
}

// ───────────────────── 배부(distribution) ─────────────────────

export interface RosterStudent {
  id: string;
  name: string;
  classNo: string | null;
}
export interface RosterClass {
  id: string;
  name: string;
  students: RosterStudent[];
}

export async function getTeacherRoster(): Promise<RosterClass[]> {
  const { supabase, userId } = await requireTeacher();
  const { data: classes } = await supabase
    .from("classes")
    .select("id, name")
    .eq("teacher_id", userId)
    .order("name");
  const classList = (classes ?? []) as { id: string; name: string }[];
  if (!classList.length) return [];
  const classIds = classList.map((c) => c.id);
  const { data: enr } = await supabase
    .from("enrollments")
    .select("class_id, student_id")
    .in("class_id", classIds);
  const enrolls = (enr ?? []) as { class_id: string; student_id: string }[];
  const studentIds = [...new Set(enrolls.map((e) => e.student_id))];
  const { data: profs } = studentIds.length
    ? await supabase.from("profiles").select("id, name, class_no").in("id", studentIds)
    : { data: [] as { id: string; name: string; class_no: string | null }[] };
  const profById = new Map(((profs ?? []) as { id: string; name: string; class_no: string | null }[]).map((p) => [p.id, p]));
  return classList.map((c) => ({
    id: c.id,
    name: c.name,
    students: enrolls
      .filter((e) => e.class_id === c.id)
      .map((e) => profById.get(e.student_id))
      .filter((p): p is { id: string; name: string; class_no: string | null } => !!p)
      .map((p) => ({ id: p.id, name: p.name, classNo: p.class_no })),
  }));
}

export interface DistributionState {
  classIds: string[];
  studentIds: string[];
}

export async function getDistributions(assessmentId: string): Promise<DistributionState> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);
  const { data } = await supabase
    .from("assessment_distributions")
    .select("class_id, student_id")
    .eq("assessment_id", assessmentId);
  const rows = (data ?? []) as { class_id: string | null; student_id: string | null }[];
  return {
    classIds: rows.filter((r) => r.class_id).map((r) => r.class_id as string),
    studentIds: rows.filter((r) => r.student_id).map((r) => r.student_id as string),
  };
}

export async function setDistributions(
  assessmentId: string,
  classIds: string[],
  studentIds: string[],
): Promise<void> {
  const { supabase, userId } = await requireTeacher();
  await assertOwnsAssessment(supabase, userId, assessmentId);

  // 대상 검증: 반=교사 소유, 학생=교사 담당 반 소속만
  const roster = await getTeacherRoster();
  const validClass = new Set(roster.map((c) => c.id));
  const validStudent = new Set(roster.flatMap((c) => c.students.map((s) => s.id)));
  const desiredClass = new Set(classIds.filter((id) => validClass.has(id)));
  const desiredStudent = new Set(studentIds.filter((id) => validStudent.has(id)));

  const { data: existing } = await supabase
    .from("assessment_distributions")
    .select("id, class_id, student_id")
    .eq("assessment_id", assessmentId);
  const rows = (existing ?? []) as { id: string; class_id: string | null; student_id: string | null }[];

  const toDelete = rows
    .filter((r) => (r.class_id && !desiredClass.has(r.class_id)) || (r.student_id && !desiredStudent.has(r.student_id)))
    .map((r) => r.id);
  if (toDelete.length) {
    const { error } = await supabase.from("assessment_distributions").delete().in("id", toDelete);
    if (error) throw new Error(error.message);
  }

  const haveClass = new Set(rows.filter((r) => r.class_id).map((r) => r.class_id as string));
  const haveStudent = new Set(rows.filter((r) => r.student_id).map((r) => r.student_id as string));
  const inserts: { assessment_id: string; class_id?: string; student_id?: string }[] = [];
  for (const cid of desiredClass) if (!haveClass.has(cid)) inserts.push({ assessment_id: assessmentId, class_id: cid });
  for (const sid of desiredStudent) if (!haveStudent.has(sid)) inserts.push({ assessment_id: assessmentId, student_id: sid });
  if (inserts.length) {
    const { error } = await supabase.from("assessment_distributions").insert(inserts);
    if (error) throw new Error(error.message);
  }
  revalidatePath("/teacher/wordsets");
}
