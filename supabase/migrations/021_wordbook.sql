-- 내 단어장(개인 약점 컬렉션): 학생이 플래시카드·단어학습·회화 핵심표현에서 직접 담는 단어/표현.
-- 자동 집계 오답노트(mistakes)와 별개. 원본은 soft 참조, 표시 값은 스냅샷 저장(원본 삭제돼도 유지).
create table if not exists wordbook_items (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  kind text not null default 'word',            -- 'word' | 'expression'
  hanzi text not null,
  pinyin text,
  meaning text,
  example text,
  word_id uuid references words(id) on delete set null,
  situation_id uuid references situations(id) on delete set null,
  source text,                                  -- flashcard | study | expression | manual
  created_at timestamptz not null default now(),
  unique (student_id, kind, hanzi)              -- 같은 단어/표현 중복 방지(멱등 담기)
);
create index if not exists idx_wordbook_student on wordbook_items(student_id, created_at desc);
alter table wordbook_items enable row level security;
drop policy if exists wordbook_items_student_all on wordbook_items;
create policy wordbook_items_student_all on wordbook_items for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());
