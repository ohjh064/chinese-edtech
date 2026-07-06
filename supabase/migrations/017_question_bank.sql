-- 문제 은행 — 기출 예시(스타일 학습) + AI 문항 생성 + 보관함
--
-- qbank_types: 문항 유형(교사별). qbank_examples: 기출 예시(AI few-shot 스타일 참조).
-- qbank_settings: 교사별 출제 지침. qbank_sets/qbank_items: 생성·저장된 시험 세트(보관함).
-- 전부 teacher_id = auth.uid() 소유자 전권(RLS). 학생 공유·응시는 Phase 3에서 확장.

create table if not exists qbank_types (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  ord int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_qbank_types_teacher on qbank_types(teacher_id, ord);
alter table qbank_types enable row level security;
drop policy if exists qbank_types_owner_all on qbank_types;
create policy qbank_types_owner_all on qbank_types for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create table if not exists qbank_examples (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  type_id uuid references qbank_types(id) on delete set null,
  passage text,                       -- 지문(선택)
  stem text not null default '',      -- 발문
  choices jsonb not null default '[]',-- 선지 배열(문자열)
  answer_index int,                   -- 정답(0기반)
  explanation text,                   -- 해설
  source text,                        -- 기출 출처(선택)
  created_at timestamptz not null default now()
);
create index if not exists idx_qbank_examples_teacher on qbank_examples(teacher_id, type_id);
alter table qbank_examples enable row level security;
drop policy if exists qbank_examples_owner_all on qbank_examples;
create policy qbank_examples_owner_all on qbank_examples for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create table if not exists qbank_settings (
  teacher_id uuid primary key references profiles(id) on delete cascade,
  guidelines text,
  updated_at timestamptz not null default now()
);
alter table qbank_settings enable row level security;
drop policy if exists qbank_settings_owner_all on qbank_settings;
create policy qbank_settings_owner_all on qbank_settings for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create table if not exists qbank_sets (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  passage text,                       -- 생성에 사용한 지문(선택)
  spec jsonb,                         -- {typeId, count, difficulty, ...}
  shared boolean not null default false,          -- 학생 공유 여부(Phase 3)
  class_id uuid references classes(id) on delete set null,  -- 공유 대상 반(Phase 3)
  created_at timestamptz not null default now()
);
create index if not exists idx_qbank_sets_teacher on qbank_sets(teacher_id, created_at desc);
alter table qbank_sets enable row level security;
drop policy if exists qbank_sets_owner_all on qbank_sets;
create policy qbank_sets_owner_all on qbank_sets for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());

create table if not exists qbank_items (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references qbank_sets(id) on delete cascade,
  ord int not null default 0,
  stem text not null default '',
  choices jsonb not null default '[]',
  answer_index int not null default 0,
  explanation text,
  created_at timestamptz not null default now()
);
create index if not exists idx_qbank_items_set on qbank_items(set_id, ord);
alter table qbank_items enable row level security;
-- 상위 세트 소유 교사만(EXISTS 조인 — feedback 정책 패턴)
drop policy if exists qbank_items_owner_all on qbank_items;
create policy qbank_items_owner_all on qbank_items for all
  using (exists (select 1 from qbank_sets s where s.id = set_id and s.teacher_id = auth.uid()))
  with check (exists (select 1 from qbank_sets s where s.id = set_id and s.teacher_id = auth.uid()));
