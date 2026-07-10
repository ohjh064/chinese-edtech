-- 대본 미션 상황을 교사가 설정할 수 있게: assessments에 자유 텍스트 컬럼 추가.
-- 값이 있으면 학생은 그 상황을 고정 미션으로 받고, 비어 있으면 기존처럼 AI가 배정한다.
alter table assessments add column if not exists script_situation text;
