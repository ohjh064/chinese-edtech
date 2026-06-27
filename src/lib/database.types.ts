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

export interface Word {
  id: string;
  assessment_id: string;
  ord: number;
  hanzi: string;
  syllable_count: number | null;
  error_prompt: string | null;
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
