-- 대본 미션: 단어 세트에서 무작위 단어를 모두 써서 상황 대본 작성 → AI 루브릭 채점(50점).
-- 학생 제출·점수·피드백을 저장하고 교사가 열람한다.
create table if not exists script_submissions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  situation text,                       -- AI가 만든 상황(미션문)
  words jsonb not null default '[]',     -- [{hanzi,pinyin,meaning}]
  script text not null default '',
  usage_score int not null default 0,    -- 낱말 카드 활용 /30
  notation_score int not null default 0, -- 간화자·병음 기재 /20
  total int not null default 0,          -- /50
  feedback jsonb,                        -- {perWord, notationIssues, overall}
  created_at timestamptz not null default now()
);

create index if not exists idx_script_sub_assessment on script_submissions(assessment_id, created_at desc);
create index if not exists idx_script_sub_student on script_submissions(student_id, created_at desc);

alter table script_submissions enable row level security;

-- 학생: 본인 것 insert/read. 교사: 본인 평가 read.
drop policy if exists script_sub_student_all on script_submissions;
create policy script_sub_student_all on script_submissions for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
drop policy if exists script_sub_teacher_read on script_submissions;
create policy script_sub_teacher_read on script_submissions for select
  using (owns_assessment(assessment_id));
