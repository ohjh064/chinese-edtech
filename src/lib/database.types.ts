/**
 * Supabase 테이블 타입 (supabase/schema.sql과 동기화).
 * 실제 프로젝트에서는 `supabase gen types typescript`로 자동 생성 권장.
 */

export type UserRole = "teacher" | "student";
export type AssessmentMode = "practice" | "exam";
export type AssessmentStatus = "draft" | "published" | "closed";
export type SentenceTaskTypeDb = "compose" | "find_error" | "judge";
export type PinyinErrorUnitDb = "initial_final" | "syllable" | "word";
export type SubmissionStatus = "in_progress" | "submitted" | "graded";
export type AttendanceStatusDb = "attempted" | "long_absent" | "not_attempted";

export interface Profile {
  id: string;
  role: UserRole;
  name: string;
  email: string | null;
  school: string | null;
  class_no: string | null;
  must_change_password: boolean;
  created_at: string;
}

export interface ClassRow {
  id: string;
  name: string;
  grade: string | null;
  teacher_id: string;
  created_at: string;
}

export interface Assessment {
  id: string;
  title: string;
  unit: string | null;
  teacher_id: string;
  class_id: string | null;
  mode: AssessmentMode;
  time_limit_sec: number | null;
  attempts_allowed: number;
  sentence_task_type: SentenceTaskTypeDb;
  pinyin_error_unit: PinyinErrorUnitDb;
  meaning_partial_weight: number;
  reveal_answers_in_practice: boolean;
  proctoring: boolean;
  allow_practice: boolean;
  status: AssessmentStatus;
  created_at: string;
}

export interface AssessmentDistribution {
  id: string;
  assessment_id: string;
  class_id: string | null;
  student_id: string | null;
  created_at: string;
}

export interface Word {
  id: string;
  assessment_id: string;
  ord: number;
  hanzi: string;
  syllable_count: number | null;
  error_prompt: string | null;
  image_url: string | null;
  created_at: string;
}

export interface WordKey {
  word_id: string;
  correct_pinyin: string;
  correct_tones: number[];
  acceptable_meanings: string[];
  example_sentence: string | null;
  acceptable_corrections: string[];
  is_grammatical: boolean | null;
  explanation: string | null;
}

export interface Submission {
  id: string;
  assessment_id: string;
  student_id: string;
  mode: AssessmentMode;
  status: SubmissionStatus;
  attendance: AttendanceStatusDb;
  started_at: string;
  submitted_at: string | null;
  returned_at: string | null;
  returned_note: string | null;
}

export interface Answer {
  id: string;
  submission_id: string;
  word_id: string;
  student_pinyin: string | null;
  student_tones: number[] | null;
  student_meaning: string | null;
  student_sentence: string | null;
  updated_at: string;
}

export interface TeacherSecret {
  teacher_id: string;
  anthropic_key_encrypted: string;
  key_last4: string | null;
  updated_at: string;
}

export interface Grade {
  submission_id: string;
  pinyin_score: number;
  pinyin_errors: number;
  tone_score: number;
  tone_errors: number;
  meaning_score: number;
  meaning_errors: number;
  sentence_score: number;
  sentence_errors: number;
  total: number;
  final: number;
  details: unknown;
  teacher_finalized: boolean;
  finalized_at: string | null;
  updated_at: string;
}

// ───────── v2: 단원/상황/표현/질문 (AI 롤플레이 코치) ─────────
export type Difficulty = "easy" | "normal" | "hard";

export interface Unit {
  id: string;
  teacher_id: string;
  class_id: string | null;
  title: string;
  subtitle: string | null;
  theme: string | null;
  culture_note: string | null;
  ord: number;
  published: boolean;
  created_at: string;
}

export interface Situation {
  id: string;
  unit_id: string;
  title: string;
  description: string | null;
  role_student: string | null;
  role_ai: string | null;
  difficulty: Difficulty;
  ord: number;
  created_at: string;
}

export interface Expression {
  id: string;
  situation_id: string;
  hanzi: string;
  pinyin: string | null;
  meaning: string | null;
  ord: number;
}

export interface Question {
  id: string;
  situation_id: string;
  prompt_zh: string;
  prompt_ko: string | null;
  model_answer_zh: string | null;
  model_answer_ko: string | null;
  ord: number;
}

export interface Conversation {
  id: string;
  student_id: string;
  situation_id: string;
  mode: string;
  status: string;
  turns: number;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: "student" | "ai";
  content_zh: string | null;
  content_ko: string | null;
  feedback: unknown;
  scaffold_level: number | null;
  created_at: string;
}

export interface SentenceItem {
  id: string;
  situation_id: string;
  target_zh: string;
  target_ko: string | null;
  tokens: string[];
  difficulty: Difficulty;
  ord: number;
}

export interface BossMission {
  id: string;
  situation_id: string;
  description: string | null;
  steps: string[];
  created_at: string;
}

export interface LevelProgress {
  id: string;
  student_id: string;
  situation_id: string;
  activity: string;
  cleared: boolean;
  score: number;
  attempts: number;
  updated_at: string;
}

export type WordbookKind = "word" | "expression";

export interface WordbookItem {
  id: string;
  student_id: string;
  kind: WordbookKind;
  hanzi: string;
  pinyin: string | null;
  meaning: string | null;
  example: string | null;
  word_id: string | null;
  situation_id: string | null;
  source: string | null;
  created_at: string;
}

export type MistakeKind = "pinyin" | "tone" | "meaning" | "grammar" | "expression";

export interface Mistake {
  id: string;
  student_id: string;
  teacher_id: string | null;
  word_id: string | null;
  kind: MistakeKind;
  label: string;
  detail: string | null;
  count: number;
  resolved: boolean;
  created_at: string;
  last_at: string;
}

// ───────── 단어장 학습 추적(교사용) + 교사↔학생 메시지 ─────────
export interface StudyLog {
  id: string;
  student_id: string;
  assessment_id: string;
  word_id: string;
  step: number; // 1..5
  correct: boolean | null; // null = 1단계(듣기)
  attempt_at: string;
}

export type MessageSenderRole = "teacher" | "student";

export interface StudentMessage {
  id: string;
  teacher_id: string;
  student_id: string;
  assessment_id: string | null;
  sender_role: MessageSenderRole;
  body: string;
  read_at: string | null;
  created_at: string;
}

// ───────── 문제 은행(기출 스타일 학습 + AI 문항 생성 + 보관함) ─────────
export interface QbankType {
  id: string;
  teacher_id: string;
  name: string;
  ord: number;
  created_at: string;
}

export interface QbankExample {
  id: string;
  teacher_id: string;
  type_id: string | null;
  qnum: string | null;
  passage: string | null;
  stem: string;
  choices: string[];
  answer_index: number | null;
  explanation: string | null;
  source: string | null;
  created_at: string;
}

export interface QbankSettings {
  teacher_id: string;
  guidelines: string | null;
  updated_at: string;
}

export interface QbankSet {
  id: string;
  teacher_id: string;
  title: string;
  passage: string | null;
  spec: unknown;
  shared: boolean;
  class_id: string | null;
  created_at: string;
}

export interface QbankItem {
  id: string;
  set_id: string;
  ord: number;
  passage: string | null;
  stem: string;
  choices: string[];
  answer_index: number;
  explanation: string | null;
  type_id: string | null;
  created_at: string;
}

export interface QbankDistribution {
  id: string;
  set_id: string;
  class_id: string | null;
  student_id: string | null;
  created_at: string;
}
