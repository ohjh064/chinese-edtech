-- 기존 DB에 BYOK(교사 API 키) 테이블 증분 적용 (PRD 후속)
-- schema.sql에도 동일 내용 포함. 새 프로젝트는 schema.sql만 실행하면 됨.

create table if not exists teacher_secrets (
  teacher_id uuid primary key references profiles(id) on delete cascade,
  anthropic_key_encrypted text not null,
  key_last4 text,
  updated_at timestamptz not null default now()
);

alter table teacher_secrets enable row level security;

drop policy if exists teacher_secrets_owner_all on teacher_secrets;
create policy teacher_secrets_owner_all on teacher_secrets for all
  using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
