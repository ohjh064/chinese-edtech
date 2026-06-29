-- v2 Phase 4: AI 오답노트(§13)
--
-- mistakes: 학생별 오답 누적. (student_id, kind, label)로 중복 합산(count++).
--   연습 채점(gradePracticeAttempt)에서 영역 오답 시 bump_mistake로 기록, 정답 시 resolved 처리.
--   word_id/teacher_id는 맞춤 출제(AI) 시 정답키 그라운딩·BYOK 키 해석에 사용(노출 아님).
create table if not exists mistakes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references profiles(id) on delete cascade,
  teacher_id uuid references profiles(id) on delete set null,  -- 콘텐츠 작성 교사(AI 키 그룹)
  word_id uuid references words(id) on delete set null,        -- 정답키 그라운딩(있으면)
  kind text not null,                  -- 'pinyin' | 'tone' | 'meaning' | 'grammar' | 'expression'
  label text not null,                 -- 표시용(한자/표현)
  detail text,                         -- 무엇이 틀렸는지(코칭, 정답 미포함)
  count int not null default 1,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  unique (student_id, kind, label)
);
create index if not exists idx_mistakes_student on mistakes(student_id, resolved, last_at desc);

alter table mistakes enable row level security;

-- 학생 본인 것만(읽기·수정·삭제). 기록(insert)은 bump_mistake(SECURITY DEFINER)로 일원화.
drop policy if exists mistakes_student_all on mistakes;
create policy mistakes_student_all on mistakes for all
  using (student_id = auth.uid()) with check (student_id = auth.uid());

-- 연습 1회 채점을 한 번에 동기화: 오답은 누적(count++), 정답은 해당 오답 resolved 처리.
-- 항상 호출자(auth.uid())의 것으로만 기록 → 위조 불가. items=[{kind,label,detail,word_id,wrong}].
create or replace function sync_practice_mistakes(p_teacher uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare it jsonb;
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    if coalesce((it->>'wrong')::boolean, false) then
      insert into mistakes (student_id, teacher_id, word_id, kind, label, detail, count, resolved, last_at)
      values (auth.uid(), p_teacher, nullif(it->>'word_id','')::uuid, it->>'kind', it->>'label', it->>'detail', 1, false, now())
      on conflict (student_id, kind, label) do update
        set count = mistakes.count + 1,
            resolved = false,
            last_at = now(),
            detail = excluded.detail,
            word_id = coalesce(excluded.word_id, mistakes.word_id),
            teacher_id = coalesce(excluded.teacher_id, mistakes.teacher_id);
    else
      update mistakes set resolved = true, last_at = now()
      where student_id = auth.uid() and kind = it->>'kind' and label = it->>'label' and not resolved;
    end if;
  end loop;
end; $$;
revoke all on function sync_practice_mistakes(uuid, jsonb) from public;
grant execute on function sync_practice_mistakes(uuid, jsonb) to authenticated;
