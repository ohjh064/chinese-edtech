-- AI 채점 결과 캐시 증분 적용 (PRD §11 비용 절감). schema.sql에도 포함.

create table if not exists ai_cache (
  key text primary key,
  kind text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table ai_cache enable row level security;
-- 정책 없음 = service role만 접근.
