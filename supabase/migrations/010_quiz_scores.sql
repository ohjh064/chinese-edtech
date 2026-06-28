-- 영역별 퀴즈 게임 점수/리더보드 (PRD §6.1 확장)
--
-- 학생이 병음·성조·의미·문장을 영역별 4지선다 게임으로 연습하고 점수를 기록한다.
-- 리더보드(타 학생 점수·이름)는 admin 서버 액션으로만 조회하며 이름은 마스킹한다.
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

-- 학생: 본인 것 insert/read. 교사: 본인 평가 read. 리더보드 타인 조회는 admin(service role).
drop policy if exists quiz_scores_student_ins on quiz_scores;
create policy quiz_scores_student_ins on quiz_scores for insert
  with check (student_id = auth.uid());
drop policy if exists quiz_scores_student_read on quiz_scores;
create policy quiz_scores_student_read on quiz_scores for select
  using (student_id = auth.uid());
drop policy if exists quiz_scores_teacher_read on quiz_scores;
create policy quiz_scores_teacher_read on quiz_scores for select
  using (owns_assessment(assessment_id));
