-- 문제 은행: 기출 예시에 원래 시험지의 문항 번호(qnum) 보관.
alter table qbank_examples add column if not exists qnum text;
