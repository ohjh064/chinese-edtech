-- v2 Phase 2: AI 롤플레이 회화 (대화 + 메시지)
--
-- 학생이 상황(situation)으로 AI와 역할극 대화. 매 학생 발화에 AI 응답 + 1오류 피드백을 저장.
-- 모범답안(questions)은 교사 전용이며 대화 채점/그라운딩은 서버(admin)에서만 읽는다.
create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  situation_id uuid not null references situations(id) on delete cascade,
  mode text not null default 'roleplay',
  status text not null default 'active',   -- 'active' | 'done'
  turns int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  role text not null,                      -- 'student' | 'ai'
  content_zh text,
  content_ko text,
  feedback jsonb,                          -- AI 턴: {goodPoint, correction, natural, encourage}
  scaffold_level int,                      -- 학생 힌트 요청 레벨(0~5)
  created_at timestamptz not null default now()
);

create index if not exists idx_conversations_student on conversations(student_id, situation_id);
create index if not exists idx_messages_conversation on messages(conversation_id, created_at);

alter table conversations enable row level security;
alter table messages      enable row level security;

-- 학생 본인 대화만 관리(읽기/쓰기). 교사 분석용 read는 Phase 4.
-- with check에 상황 열람 가능 조건을 추가 → 직접 INSERT/UPDATE로 비공개 상황을 가리키는 것 차단(심층 방어).
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
