-- 어법 판단형(O/X) 문항 지원 (PRD §5.4 추가 옵션)
--
-- 교사가 "그 단어를 활용한 문장이 어법에 맞는가?"를 제시하고 학생이 O/X로 판단한다.
--  - 제시 문장은 words.error_prompt(학생 read 가능)에 저장(find_error와 공용).
--  - 정답(어법에 맞음 여부)·해설은 word_keys(교사 전용, RLS 보호)에 저장.
--  - 학생 답(O/X)은 answers.student_sentence 재사용.
-- 채점은 완전 자동(결정론) — AI·교사확정 불필요. 오류수→점수는 기존 척도(scale.ts) 재사용.

-- 1) enum 값 추가 (기존 DB)
alter type sentence_task_type add value if not exists 'judge';

-- 2) 정답/해설 컬럼
alter table word_keys add column if not exists is_grammatical boolean;  -- true=맞음(O), false=안맞음(X)
alter table word_keys add column if not exists explanation text;        -- 판단 근거/해설(교사 전용)
