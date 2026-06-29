-- 핀마스터(PinMaster) DB 스키마 + RLS (PRD §10, §12)
--
-- 보안 원칙(§12):
--  - RLS로 학생은 본인 데이터만, 교사는 담당 반만 접근.
--  - 정답키(병음·성조·허용의미·예문)는 word_keys 테이블로 분리 → 학생은 절대 read 불가.
--    채점은 서버(서비스 롤 또는 security-definer)에서만 정답키를 읽는다.
--  - 점수(grades)는 teacher_finalized 후에만 학생에게 노출.
--
-- 실행: Supabase SQL Editor에 통째로 붙여넣기(멱등하도록 작성).

-- ───────────────────────── 확장 ─────────────────────────
create extension if not exists "pgcrypto";

-- ───────────────────────── ENUM ─────────────────────────
do $$ begin
  create type user_role as enum ('teacher', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assessment_mode as enum ('practice', 'exam');
exception when duplicate_object then null; end $$;

do $$ begin
  create type assessment_status as enum ('draft', 'published', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sentence_task_type as enum ('compose', 'find_error', 'judge');
exception when duplicate_object then null; end $$;
-- 기존 DB 업그레이드: enum 값 보강(멱등)
alter type sentence_task_type add value if not exists 'judge';

do $$ begin
  create type pinyin_error_unit as enum ('initial_final', 'syllable', 'word');
exception when duplicate_object then null; end $$;

do $$ begin
  create type submission_status as enum ('in_progress', 'submitted', 'graded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type attendance_status as enum ('attempted', 'long_absent', 'not_attempted');
exception when duplicate_object then null; end $$;

-- ───────────────────────── 테이블 ─────────────────────────

-- 프로필(= auth.users 1:1)
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'student',
  name text not null default '',
  email text,
  school text,
  class_no text,
  must_change_password boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade text,
  teacher_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists enrollments (
  student_id uuid not null references profiles(id) on delete cascade,
  class_id uuid not null references classes(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, class_id)
);

create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  unit text,
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  mode assessment_mode not null default 'exam',
  time_limit_sec int,                 -- null = 무제한
  attempts_allowed int not null default 1,
  sentence_task_type sentence_task_type not null default 'compose',   -- §15-1
  pinyin_error_unit pinyin_error_unit not null default 'initial_final',-- §15-2
  meaning_partial_weight numeric not null default 1,                   -- §15-3 (1 또는 0.5)
  reveal_answers_in_practice boolean not null default true,            -- §15-4
  proctoring boolean not null default false,                           -- §15-5
  allow_practice boolean not null default false,                       -- 학생 연습 허용(연습 모드 + AI 피드백)
  status assessment_status not null default 'draft',
  created_at timestamptz not null default now()
);
-- 기존 DB 업그레이드(멱등)
alter table assessments add column if not exists allow_practice boolean not null default false;

-- 학생 노출 가능한 문항 정보
create table if not exists words (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  ord int not null default 0,
  hanzi text not null,
  syllable_count int,                 -- 입력 칸 수 힌트
  error_prompt text,                  -- 오류 찾기형: 학생에게 보여줄 오류 문장
  created_at timestamptz not null default now()
);

-- 정답키(학생 read 절대 불가) — words와 분리. PRD §12 정답키 보호
create table if not exists word_keys (
  word_id uuid primary key references words(id) on delete cascade,
  correct_pinyin text not null default '',
  correct_tones int[] not null default '{}',
  acceptable_meanings text[] not null default '{}',
  example_sentence text,
  acceptable_corrections text[] not null default '{}',  -- 오류 찾기형 정답
  is_grammatical boolean,                               -- 어법 판단형 정답(O=true/X=false)
  explanation text                                      -- 어법 판단형 해설(교사 전용)
);
-- 기존 DB 업그레이드(멱등)
alter table word_keys add column if not exists is_grammatical boolean;
alter table word_keys add column if not exists explanation text;

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  mode assessment_mode not null default 'exam',
  status submission_status not null default 'in_progress',
  attendance attendance_status not null default 'attempted',
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  returned_at timestamptz,            -- 교사 돌려주기(반려) 시각
  returned_note text                  -- 돌려주기 사유/코멘트(학생 노출)
);
-- 기존 DB 업그레이드(멱등)
alter table submissions add column if not exists returned_at timestamptz;
alter table submissions add column if not exists returned_note text;

create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  student_pinyin text,
  student_tones int[],
  student_meaning text,
  student_sentence text,
  updated_at timestamptz not null default now(),
  unique (submission_id, word_id)
);

create table if not exists grades (
  submission_id uuid primary key references submissions(id) on delete cascade,
  pinyin_score int not null default 0,
  pinyin_errors numeric not null default 0,
  tone_score int not null default 0,
  tone_errors numeric not null default 0,
  meaning_score int not null default 0,
  meaning_errors numeric not null default 0,
  sentence_score int not null default 0,
  sentence_errors numeric not null default 0,
  total int not null default 0,
  final int not null default 0,
  details jsonb,                       -- 영역별 상세(피드백/하이라이트)
  teacher_finalized boolean not null default false,
  finalized_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references answers(id) on delete cascade,
  area text not null,
  content text not null,
  ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists practice_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  attempt_at timestamptz not null default now(),
  correct_by_area jsonb               -- {pinyin:bool, tone:bool, meaning:bool}
);

-- ───────────────────────── 인덱스 ─────────────────────────
create index if not exists idx_words_assessment on words(assessment_id, ord);
create index if not exists idx_submissions_assessment on submissions(assessment_id);
create index if not exists idx_submissions_student on submissions(student_id);
create index if not exists idx_answers_submission on answers(submission_id);
create index if not exists idx_enrollments_class on enrollments(class_id);

-- ──────────────── 헬퍼 함수(정책 재귀 방지: SECURITY DEFINER) ────────────────
create or replace function is_teacher()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'teacher');
$$;

-- 해당 평가가 내가 담당하는(출제한) 것인가
create or replace function owns_assessment(a_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from assessments where id = a_id and teacher_id = auth.uid());
$$;

-- 내가 응시할 수 있는 평가인가(published + 내 반)
create or replace function can_take_assessment(a_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assessments a
    join enrollments e on e.class_id = a.class_id
    where a.id = a_id and a.status = 'published' and e.student_id = auth.uid()
  );
$$;

-- classes ↔ enrollments 정책 상호참조로 인한 무한 재귀 방지용(SECURITY DEFINER)
create or replace function is_enrolled(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments where class_id = c_id and student_id = auth.uid());
$$;

create or replace function owns_class(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = c_id and teacher_id = auth.uid());
$$;

-- ───────────────────────── RLS 활성화 ─────────────────────────
alter table profiles       enable row level security;
alter table classes        enable row level security;
alter table enrollments    enable row level security;
alter table assessments    enable row level security;
alter table words          enable row level security;
alter table word_keys      enable row level security;
alter table submissions    enable row level security;
alter table answers        enable row level security;
alter table grades         enable row level security;
alter table feedback       enable row level security;
alter table practice_logs  enable row level security;

-- profiles: 본인 행 read/update, 교사는 전체 read(반 편성용)
drop policy if exists profiles_self_read on profiles;
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or is_teacher());
drop policy if exists profiles_self_update on profiles;
create policy profiles_self_update on profiles for update
  using (id = auth.uid());
drop policy if exists profiles_self_insert on profiles;
create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

-- classes: 교사는 본인 반 전체 관리, 학생은 소속 반 read
drop policy if exists classes_teacher_all on classes;
create policy classes_teacher_all on classes for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists classes_student_read on classes;
create policy classes_student_read on classes for select
  using (is_enrolled(id));

-- enrollments: 교사(반 소유)만 관리, 학생은 본인 것 read
drop policy if exists enrollments_teacher_all on enrollments;
create policy enrollments_teacher_all on enrollments for all
  using (owns_class(class_id)) with check (owns_class(class_id));
drop policy if exists enrollments_student_read on enrollments;
create policy enrollments_student_read on enrollments for select
  using (student_id = auth.uid());

-- assessments: 교사는 본인 것 전체, 학생은 published + 내 반만 read
drop policy if exists assessments_teacher_all on assessments;
create policy assessments_teacher_all on assessments for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists assessments_student_read on assessments;
create policy assessments_student_read on assessments for select
  using (status = 'published' and can_take_assessment(id));

-- words: 교사는 본인 평가 문항 전체, 학생은 응시 가능 평가의 문항 read(정답키 제외)
drop policy if exists words_teacher_all on words;
create policy words_teacher_all on words for all
  using (owns_assessment(assessment_id)) with check (owns_assessment(assessment_id));
drop policy if exists words_student_read on words;
create policy words_student_read on words for select
  using (can_take_assessment(assessment_id));

-- word_keys: 교사만(학생 정책 없음 = 접근 불가). 채점은 서버 서비스롤.
drop policy if exists word_keys_teacher_all on word_keys;
create policy word_keys_teacher_all on word_keys for all
  using (exists (select 1 from words w where w.id = word_id and owns_assessment(w.assessment_id)))
  with check (exists (select 1 from words w where w.id = word_id and owns_assessment(w.assessment_id)));

-- submissions: 학생 본인 것 관리, 교사는 본인 평가 것 read
drop policy if exists submissions_student_all on submissions;
create policy submissions_student_all on submissions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists submissions_teacher_read on submissions;
create policy submissions_teacher_read on submissions for select
  using (owns_assessment(assessment_id));

-- answers: 학생 본인 제출의 답안 관리, 교사는 본인 평가의 답안 read
drop policy if exists answers_student_all on answers;
create policy answers_student_all on answers for all
  using (exists (select 1 from submissions s where s.id = submission_id and s.student_id = auth.uid()))
  with check (exists (select 1 from submissions s where s.id = submission_id and s.student_id = auth.uid()));
drop policy if exists answers_teacher_read on answers;
create policy answers_teacher_read on answers for select
  using (exists (select 1 from submissions s where s.id = submission_id and owns_assessment(s.assessment_id)));

-- grades: 교사는 본인 평가 전체 관리, 학생은 확정(finalized)된 본인 점수만 read
drop policy if exists grades_teacher_all on grades;
create policy grades_teacher_all on grades for all
  using (exists (select 1 from submissions s where s.id = submission_id and owns_assessment(s.assessment_id)))
  with check (exists (select 1 from submissions s where s.id = submission_id and owns_assessment(s.assessment_id)));
drop policy if exists grades_student_read on grades;
create policy grades_student_read on grades for select
  using (teacher_finalized and exists (
    select 1 from submissions s where s.id = submission_id and s.student_id = auth.uid()));

-- feedback: 교사 관리, 학생은 확정된 본인 제출의 피드백만 read
drop policy if exists feedback_teacher_all on feedback;
create policy feedback_teacher_all on feedback for all
  using (exists (
    select 1 from answers a join submissions s on s.id = a.submission_id
    where a.id = answer_id and owns_assessment(s.assessment_id)))
  with check (exists (
    select 1 from answers a join submissions s on s.id = a.submission_id
    where a.id = answer_id and owns_assessment(s.assessment_id)));
drop policy if exists feedback_student_read on feedback;
create policy feedback_student_read on feedback for select
  using (exists (
    select 1 from answers a
    join submissions s on s.id = a.submission_id
    join grades g on g.submission_id = s.id
    where a.id = answer_id and s.student_id = auth.uid() and g.teacher_finalized));

-- practice_logs: 학생 본인 것 관리, 교사 read(담당 반 분석)
drop policy if exists practice_logs_student_all on practice_logs;
create policy practice_logs_student_all on practice_logs for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists practice_logs_teacher_read on practice_logs;
create policy practice_logs_teacher_read on practice_logs for select
  using (is_teacher());

-- ──────────────── 영역별 퀴즈 게임 점수/리더보드 ────────────────
create table if not exists quiz_scores (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  mode text not null,                 -- 'pinyin' | 'tone' | 'meaning' | 'sentence'
  score int not null,
  correct int not null default 0,
  total int not null default 0,
  played_at timestamptz not null default now()
);
create index if not exists idx_quiz_scores_lookup on quiz_scores(assessment_id, mode, score desc);
create index if not exists idx_quiz_scores_student on quiz_scores(student_id, played_at desc);

alter table quiz_scores enable row level security;
-- 학생 본인 것 insert/read, 교사 본인 평가 read. 리더보드 타인 조회는 admin(service role).
drop policy if exists quiz_scores_student_ins on quiz_scores;
create policy quiz_scores_student_ins on quiz_scores for insert
  with check (student_id = auth.uid());
drop policy if exists quiz_scores_student_read on quiz_scores;
create policy quiz_scores_student_read on quiz_scores for select
  using (student_id = auth.uid());
drop policy if exists quiz_scores_teacher_read on quiz_scores;
create policy quiz_scores_teacher_read on quiz_scores for select
  using (owns_assessment(assessment_id));

-- ──────────────── v2: 단원/상황/표현/질문 (AI 롤플레이 코치 토대) ────────────────
create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  class_id uuid references classes(id) on delete set null,
  title text not null,
  subtitle text,
  theme text,
  culture_note text,
  ord int not null default 0,
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists situations (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units(id) on delete cascade,
  title text not null,
  description text,
  role_student text,
  role_ai text,
  difficulty text not null default 'normal',
  ord int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists expressions (
  id uuid primary key default gen_random_uuid(),
  situation_id uuid not null references situations(id) on delete cascade,
  hanzi text not null,
  pinyin text,
  meaning text,
  ord int not null default 0
);
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  situation_id uuid not null references situations(id) on delete cascade,
  prompt_zh text not null default '',
  prompt_ko text,
  model_answer_zh text,
  model_answer_ko text,
  ord int not null default 0
);
create index if not exists idx_units_teacher on units(teacher_id, ord);
create index if not exists idx_situations_unit on situations(unit_id, ord);
create index if not exists idx_expressions_situation on expressions(situation_id, ord);
create index if not exists idx_questions_situation on questions(situation_id, ord);

create or replace function owns_unit(u_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from units where id = u_id and teacher_id = auth.uid());
$$;
create or replace function can_view_unit(u_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from units u
    join enrollments e on e.class_id = u.class_id
    where u.id = u_id and u.published and e.student_id = auth.uid()
  );
$$;

alter table units       enable row level security;
alter table situations  enable row level security;
alter table expressions enable row level security;
alter table questions   enable row level security;

drop policy if exists units_teacher_all on units;
create policy units_teacher_all on units for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists units_student_read on units;
create policy units_student_read on units for select
  using (published and can_view_unit(id));

drop policy if exists situations_teacher_all on situations;
create policy situations_teacher_all on situations for all
  using (owns_unit(unit_id)) with check (owns_unit(unit_id));
drop policy if exists situations_student_read on situations;
create policy situations_student_read on situations for select
  using (can_view_unit(unit_id));

drop policy if exists expressions_teacher_all on expressions;
create policy expressions_teacher_all on expressions for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));
drop policy if exists expressions_student_read on expressions;
create policy expressions_student_read on expressions for select
  using (exists (select 1 from situations s where s.id = situation_id and can_view_unit(s.unit_id)));

drop policy if exists questions_teacher_all on questions;
create policy questions_teacher_all on questions for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));

-- ──────────────── v2 Phase 2: AI 롤플레이 회화 ────────────────
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  situation_id uuid not null references situations(id) on delete cascade,
  mode text not null default 'roleplay',
  status text not null default 'active',
  turns int not null default 0,
  created_at timestamptz not null default now()
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null,
  content_zh text,
  content_ko text,
  feedback jsonb,
  scaffold_level int,
  created_at timestamptz not null default now()
);
create index if not exists idx_conversations_student on conversations(student_id, situation_id);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

alter table conversations enable row level security;
alter table messages      enable row level security;

drop policy if exists conversations_student_all on conversations;
create policy conversations_student_all on conversations for all
  using (student_id = auth.uid())
  with check (
    student_id = auth.uid()
    and exists (select 1 from situations s where s.id = situation_id and can_view_unit(s.unit_id))
  );
drop policy if exists messages_student_all on messages;
create policy messages_student_all on messages for all
  using (exists (select 1 from conversations c where c.id = conversation_id and c.student_id = auth.uid()))
  with check (exists (select 1 from conversations c where c.id = conversation_id and c.student_id = auth.uid()));

-- ──────────────── v2 Phase 3: Sentence Builder · Boss · 진척 ────────────────
create table if not exists sentence_items (
  id uuid primary key default gen_random_uuid(),
  situation_id uuid not null references situations(id) on delete cascade,
  target_zh text not null,
  target_ko text,
  tokens text[] not null default '{}',
  difficulty text not null default 'normal',
  ord int not null default 0
);
create table if not exists boss_missions (
  id uuid primary key default gen_random_uuid(),
  situation_id uuid not null references situations(id) on delete cascade unique,
  description text,
  steps text[] not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists level_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  situation_id uuid not null references situations(id) on delete cascade,
  activity text not null,
  cleared boolean not null default false,
  score int not null default 0,
  updated_at timestamptz not null default now(),
  unique (student_id, situation_id, activity)
);
create index if not exists idx_sentence_items_situation on sentence_items(situation_id, ord);
create index if not exists idx_level_progress_student on level_progress(student_id, situation_id);

alter table sentence_items enable row level security;
alter table boss_missions  enable row level security;
alter table level_progress enable row level security;

drop policy if exists sentence_items_teacher_all on sentence_items;
create policy sentence_items_teacher_all on sentence_items for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));

drop policy if exists boss_missions_teacher_all on boss_missions;
create policy boss_missions_teacher_all on boss_missions for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));
drop policy if exists boss_missions_student_read on boss_missions;
create policy boss_missions_student_read on boss_missions for select
  using (exists (select 1 from situations s where s.id = situation_id and can_view_unit(s.unit_id)));

drop policy if exists level_progress_student_all on level_progress;
create policy level_progress_student_all on level_progress for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- ──────────────── 교사 API 키(BYOK) — 암호화 저장 ────────────────
-- 교사가 본인 Anthropic API 키를 입력하면, 그 교사/학생의 AI 채점 비용은
-- 그 키(교사 계정)로 과금된다. 운영자 단일 키 부담 제거(무료 배포 목적).
-- 값은 앱 서버에서 AES-256-GCM으로 암호화한 ciphertext만 저장. 평문 미저장.
create table if not exists teacher_secrets (
  teacher_id uuid primary key references profiles(id) on delete cascade,
  anthropic_key_encrypted text not null,   -- base64(iv|tag|ciphertext)
  key_last4 text,                          -- 표시용(평문 아님)
  updated_at timestamptz not null default now()
);

alter table teacher_secrets enable row level security;

-- 본인 행만 접근(교사). 암호문은 APP_SECRET_KEY 없이는 복호화 불가하므로
-- 행 소유자에게 노출되어도 무방하며, 타인은 RLS로 차단됨.
drop policy if exists teacher_secrets_owner_all on teacher_secrets;
create policy teacher_secrets_owner_all on teacher_secrets for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

-- ──────────────── AI 채점 결과 캐시 (PRD §11 비용 절감) ────────────────
-- 동일 (한자, 학생답안, 허용정답/예문) 입력의 AI 판정을 재사용해 호출·비용을 줄인다.
-- key는 입력 해시. 정답키 자체가 아니라 판정 결과만 담으며, 서비스 롤로만 접근.
create table if not exists ai_cache (
  key text primary key,
  kind text not null,           -- 'meaning' | 'grammar'
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table ai_cache enable row level security;
-- 정책 없음 = anon/authenticated 차단. 채점 서버(service role)만 RLS 우회로 접근.

-- ──────────────── 신규 가입 시 프로필 자동 생성 ────────────────
-- 자가 회원가입은 기본 '교사'(학생 계정은 교사가 일괄 발급).
-- 일괄 발급(admin)은 user_metadata.role='student'를 넘겨 학생으로 생성된다.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', ''),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'teacher')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
