-- v2 Phase 3: Sentence Builder + Boss Mission + 학습 진척
--
-- sentence_items: 단어 배열 게임. 정답(토큰 순서)은 교사 전용 — 학생은 서버(admin)에서 셔플 토큰만 받아 채점.
-- boss_missions: 상황당 1개 실전 미션(브리핑은 학생 노출).
-- level_progress: 학생별·상황별·활동별 클리어/점수.
create table if not exists sentence_items (
  id uuid primary key default gen_random_uuid(),
  situation_id uuid not null references situations(id) on delete cascade,
  target_zh text not null,
  target_ko text,
  tokens text[] not null default '{}',     -- 단어 단위 정답 토큰(순서대로)
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
  activity text not null,                  -- 'builder' | 'roleplay' | 'boss'
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

-- sentence_items: 교사 전용(정답 순서 보호 — 학생 접근은 서버 admin)
drop policy if exists sentence_items_teacher_all on sentence_items;
create policy sentence_items_teacher_all on sentence_items for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));

-- boss_missions: 교사 all / 학생은 열람 가능 상황의 미션 read(브리핑)
drop policy if exists boss_missions_teacher_all on boss_missions;
create policy boss_missions_teacher_all on boss_missions for all
  using (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)))
  with check (exists (select 1 from situations s where s.id = situation_id and owns_unit(s.unit_id)));
drop policy if exists boss_missions_student_read on boss_missions;
create policy boss_missions_student_read on boss_missions for select
  using (exists (select 1 from situations s where s.id = situation_id and can_view_unit(s.unit_id)));

-- level_progress: 학생 본인 것만
drop policy if exists level_progress_student_all on level_progress;
create policy level_progress_student_all on level_progress for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
