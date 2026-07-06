-- 교사 API 키(BYOK) 폐지: Anthropic 키는 서버 환경변수 ANTHROPIC_API_KEY(.env.local)에서만 읽는다.
-- 웹에서 키를 입력받아 DB에 저장하는 방식은 보안상 제거한다. 저장돼 있던 키도 함께 삭제된다.
drop table if exists teacher_secrets cascade;
