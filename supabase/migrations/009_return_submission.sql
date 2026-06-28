-- 제출물 돌려주기(반려) 지원
--
-- 교사가 제출물을 돌려주면 status→in_progress, grades.teacher_finalized→false로 되돌려
-- 학생이 답안을 고쳐 재제출하거나 그 세트를 연습 모드로 복습할 수 있다.
-- 반려 시각·교사 메모를 제출물에 기록한다(학생에게 노출, RLS는 본인 제출만).
alter table submissions add column if not exists returned_at timestamptz;
alter table submissions add column if not exists returned_note text;
