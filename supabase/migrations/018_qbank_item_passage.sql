-- 문제 은행: 생성 문항에 제시문(지문) 추가.
-- 빈칸/밑줄 등 지문을 전제하는 발문이 성립하도록 문항별 passage를 저장한다.
alter table qbank_items add column if not exists passage text;
