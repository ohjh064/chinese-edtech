-- 단어장 학습 추적(교사용) + 교사↔학생 1:1 메시지
--
-- study_logs: 단어장 학습 각 단계(1~5)에서 학생이 학습/오답한 단어를 단어별로 기록.
--   각 단계 완료 시점에 그 판의 단어별 결과를 배치 insert(play당 단어별 1행). step 1(듣기)은 correct=null.
--   교사는 담당 평가(owns_assessment)만 read.
-- student_messages: 교사-학생 한 쌍당 하나의 대화(1:1 스레드). 교사가 학습 현황을 보며 메시지,
--   학생은 대시보드에서 읽고 답글. sender_role로 방향 구분. admin 우회 없이 RLS로 양방향 처리.

create table if not exists study_logs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  assessment_id uuid not null references assessments(id) on delete cascade,
  word_id uuid not null references words(id) on delete cascade,
  step int not null,                  -- 1..5 (1=듣기,2=매칭,3=딕테이션,4=스피드,5=Writing)
  correct boolean,                    -- null = 정오답 없음(1단계 듣기)
  attempt_at timestamptz not null default now()
);
create index if not exists idx_study_logs_lookup on study_logs(assessment_id, student_id, step);
create index if not exists idx_study_logs_student on study_logs(student_id, attempt_at desc);

alter table study_logs enable row level security;
drop policy if exists study_logs_student_ins on study_logs;
create policy study_logs_student_ins on study_logs for insert
  with check (student_id = auth.uid());
drop policy if exists study_logs_student_read on study_logs;
create policy study_logs_student_read on study_logs for select
  using (student_id = auth.uid());
drop policy if exists study_logs_teacher_read on study_logs;
create policy study_logs_teacher_read on study_logs for select
  using (owns_assessment(assessment_id));

create table if not exists student_messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references profiles(id) on delete cascade,
  student_id uuid not null references profiles(id) on delete cascade,
  assessment_id uuid references assessments(id) on delete set null,  -- 선택적 맥락(어느 세트를 보다 보냈는지)
  sender_role text not null check (sender_role in ('teacher','student')),
  body text not null,
  read_at timestamptz,                -- 수신자가 읽은 시각(선택)
  created_at timestamptz not null default now()
);
create index if not exists idx_student_messages_thread on student_messages(teacher_id, student_id, created_at);
create index if not exists idx_student_messages_student on student_messages(student_id, created_at desc);

alter table student_messages enable row level security;
-- 교사: 본인이 교사인 스레드 전권(보내는 것은 teacher role만)
drop policy if exists sm_teacher_all on student_messages;
create policy sm_teacher_all on student_messages for all
  using (teacher_id = auth.uid() and is_teacher())
  with check (teacher_id = auth.uid() and is_teacher() and sender_role = 'teacher');
-- 학생: 본인 스레드 read + 답글(student role)만 insert
drop policy if exists sm_student_read on student_messages;
create policy sm_student_read on student_messages for select
  using (student_id = auth.uid());
drop policy if exists sm_student_reply on student_messages;
create policy sm_student_reply on student_messages for insert
  with check (student_id = auth.uid() and sender_role = 'student');
-- 학생이 받은 교사 메시지 read_at 갱신 허용(대시보드 진입 시)
drop policy if exists sm_student_mark_read on student_messages;
create policy sm_student_mark_read on student_messages for update
  using (student_id = auth.uid())
  with check (student_id = auth.uid());
