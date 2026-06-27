-- classes ↔ enrollments RLS 정책 상호참조로 인한 무한 재귀 수정.
-- 증상: "infinite recursion detected in policy for relation classes"
--       (반 목록 조회/생성이 조용히 실패하거나 500).
-- 해결: 교차 참조를 SECURITY DEFINER 함수로 감싸 재귀를 끊는다.
-- 새 프로젝트는 schema.sql에 이미 반영됨. 기존 DB는 이 파일을 SQL Editor에서 실행.

create or replace function is_enrolled(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from enrollments where class_id = c_id and student_id = auth.uid());
$$;

create or replace function owns_class(c_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from classes where id = c_id and teacher_id = auth.uid());
$$;

drop policy if exists classes_student_read on classes;
create policy classes_student_read on classes for select
  using (is_enrolled(id));

drop policy if exists enrollments_teacher_all on enrollments;
create policy enrollments_teacher_all on enrollments for all
  using (owns_class(class_id)) with check (owns_class(class_id));
