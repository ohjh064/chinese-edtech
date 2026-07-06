-- 문제 은행: 유형 영속화(type_id) + 시험지 학생 공유(배부 + 자격 판정 + 학생 read).

-- 1) 문항에 유형 참조(보관함/시험지 편집의 유형변경 영속화). 유형 삭제 시 null.
alter table qbank_items add column if not exists type_id uuid references qbank_types(id) on delete set null;

-- 2) 시험지 배부(다중 반 + 개별 학생) — assessment_distributions 미러.
create table if not exists qbank_distributions (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references qbank_sets(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((class_id is not null) <> (student_id is not null))
);
create unique index if not exists uniq_qdist_class on qbank_distributions(set_id, class_id) where student_id is null;
create unique index if not exists uniq_qdist_student on qbank_distributions(set_id, student_id) where class_id is null;
create index if not exists idx_qdist_set on qbank_distributions(set_id);
create index if not exists idx_qdist_student on qbank_distributions(student_id);
alter table qbank_distributions enable row level security;
drop policy if exists qbank_dist_teacher_all on qbank_distributions;
create policy qbank_dist_teacher_all on qbank_distributions for all
  using (exists (select 1 from qbank_sets s where s.id = set_id and s.teacher_id = auth.uid()))
  with check (exists (select 1 from qbank_sets s where s.id = set_id and s.teacher_id = auth.uid()));

-- 3) 학생 열람 자격 판정(공유 + 반배부/개별배부/레거시 class_id). can_take_assessment 구조 복제.
create or replace function can_view_qset(p_set uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from qbank_sets s
    where s.id = p_set and s.shared = true and (
      exists (select 1 from enrollments e where e.class_id = s.class_id and e.student_id = auth.uid())
      or exists (
        select 1 from qbank_distributions d
        join enrollments e on e.class_id = d.class_id
        where d.set_id = s.id and e.student_id = auth.uid()
      )
      or exists (
        select 1 from qbank_distributions d
        where d.set_id = s.id and d.student_id = auth.uid()
      )
    )
  );
$$;

-- 4) 세트 메타(정답 없음)만 학생 read 허용. 문항(qbank_items)은 owner-only 유지(정답 보호) →
--    학생은 서버액션(admin+자격검사)로만 정답 제거된 문항을 받는다.
drop policy if exists qbank_sets_student_read on qbank_sets;
create policy qbank_sets_student_read on qbank_sets for select
  using (can_view_qset(id));
