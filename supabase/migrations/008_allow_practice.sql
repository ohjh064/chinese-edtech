-- 학생 연습 허용 토글 (PRD §6.1 확장)
--
-- 교사가 세트별로 "학생 연습 허용"을 켜면, 시험용(exam) 세트도 학생이
-- 무제한 연습 모드(병음·성조·의미·문장 + AI 피드백)로 풀 수 있다.
-- 시험 문제 사전 노출을 막기 위해 시험 세트는 응시 제출 전에는 정답 비공개로 처리한다.
alter table assessments add column if not exists allow_practice boolean not null default false;
