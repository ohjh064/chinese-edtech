-- v2 Phase 1: 단원(unit) → 상황(situation) → 핵심표현/질문 (AI 롤플레이 코치 토대)
--
-- 단원은 교사별 편집본. 학생은 배포(published)된 + 본인 반(class_id) 단원의 상황·표현을 열람.
-- 질문(모범답안)은 교사 전용(word_keys와 동일 원칙) — 학생용 노출은 Phase 2 회화에서 admin 경유.

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
  difficulty text not null default 'normal',  -- 'easy' | 'normal' | 'hard'
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

-- ── 헬퍼(정책 재귀 방지: SECURITY DEFINER) ──
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

-- units: 교사 본인 것 전체, 학생은 배포+소속 반 read
drop policy if exists units_teacher_all on units;
create policy units_teacher_all on units for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
drop policy if exists units_student_read on units;
create policy units_student_read on units for select
  using (published and can_view_unit(id));

-- situations: 상위 unit 소유 교사 전체, 학생은 열람 가능 단원의 상황 read
drop policy if exists situations_teacher_all on situations;
create policy situations_teacher_all on situations for all
  using (owns_unit(unit_id)) with check (owns_unit(unit_id));
drop policy if exists situations_student_read on situations;
create policy situations_student_read on situations for select
  using (can_view_unit(unit_id));

-- expressions: 교사 전체, 학생 열람(학습 자료)
drop policy if exists expressions_teacher_all on expressions;
create policy expressions_teacher_all on expressions for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));
drop policy if exists expressions_student_read on expressions;
create policy expressions_student_read on expressions for select
  using (exists (select 1 from situations s where s.id = situation_id and can_view_unit(s.unit_id)));

-- questions: 교사 전용(모범답안 보호 — 학생 정책 없음 = 접근 불가)
drop policy if exists questions_teacher_all on questions;
create policy questions_teacher_all on questions for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));
