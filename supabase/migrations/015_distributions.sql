-- 단어 세트 배부(distribution): 다중 반 + 개별 학생
--
-- 기존엔 assessments.class_id(단일 반)로만 노출했다. 이 테이블로 한 세트를
-- 여러 반 · 특정 학생에게 배부할 수 있다. can_take_assessment를 가산 확장(비파괴).
create table if not exists assessment_distributions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references assessments(id) on delete cascade,
  class_id uuid references classes(id) on delete cascade,
  student_id uuid references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((class_id is not null) <> (student_id is not null))   -- 정확히 하나의 대상
);
-- nullable 조합 유일성(부분 유니크 인덱스)
create unique index if not exists uniq_dist_class on assessment_distributions(assessment_id, class_id) where student_id is null;
create unique index if not exists uniq_dist_student on assessment_distributions(assessment_id, student_id) where class_id is null;
create index if not exists idx_dist_assessment on assessment_distributions(assessment_id);
create index if not exists idx_dist_student on assessment_distributions(student_id);

alter table assessment_distributions enable row level security;
-- 교사만(소유 평가). 학생 직접 접근 정책 없음 → can_take_assessment(SECURITY DEFINER)가 대신 조회.
drop policy if exists dist_teacher_all on assessment_distributions;
create policy dist_teacher_all on assessment_distributions for all
  using (owns_assessment(assessment_id)) with check (owns_assessment(assessment_id));

-- can_take_assessment 확장(가산): 레거시 class_id + 배부(반/학생) 중 하나면 응시/학습 가능
create or replace function can_take_assessment(a_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from assessments a
    where a.id = a_id and a.status = 'published' and (
      exists (select 1 from enrollments e where e.class_id = a.class_id and e.student_id = auth.uid())
      or exists (
        select 1 from assessment_distributions d
        join enrollments e on e.class_id = d.class_id
        where d.assessment_id = a.id and e.student_id = auth.uid()
      )
      or exists (
        select 1 from assessment_distributions d
        where d.assessment_id = a.id and d.student_id = auth.uid()
      )
    )
  );
$$;
