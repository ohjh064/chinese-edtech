# 배포 가이드 — 핀마스터(PinMaster)

무료 티어(Supabase Free + Vercel Hobby)로 배포하는 절차입니다. AI 키는 서버 환경변수
**`ANTHROPIC_API_KEY`**(.env.local)에서만 읽으며, 없으면 AI 기능만 비활성화됩니다.

---

## 1. Supabase 프로젝트 준비

1. [supabase.com](https://supabase.com)에서 새 프로젝트 생성(무료 플랜).
2. **SQL Editor**에서 [`supabase/schema.sql`](supabase/schema.sql) 전체를 붙여넣고 실행.
   - 테이블, RLS 정책, 트리거(가입 시 프로필 자동 생성)가 한 번에 생성됩니다(멱등).
   - 이후 스키마 변경분은 `supabase/migrations/*.sql`을 순서대로 실행.
3. **Project Settings → API**에서 다음 값 확보:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` 키 → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` 키 → `SUPABASE_SERVICE_ROLE_KEY` (**절대 클라이언트 노출 금지**)
4. (선택) **Authentication → Providers → Google** 활성화 후, 승인 리디렉션 URL에
   `https://<배포도메인>/auth/callback` 추가. 구글 로그인을 안 쓰면 이메일/비밀번호만으로 동작.
5. (선택) **Authentication → Providers → Email**: 자동 생성 학생 이메일은 실제 수신함이
   없으므로, "Confirm email"을 꺼두거나 무시해도 됩니다(계정은 `email_confirm`으로 즉시 활성).

---

## 2. 환경변수

`.env.example` 참고. 배포 플랫폼(아래 Vercel)과 로컬 `.env.local`에 동일하게 설정합니다.

| 변수 | 필수 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | service_role 키(서버 전용 — 정답키 읽기·계정 생성·캐시) |
| `ANTHROPIC_API_KEY` | 선택 | Anthropic Claude 키(서버 전용). AI 채점·문항 생성·회화에 사용. 비우면 AI 비활성화(의미·문장은 교사 검토) |

> AI 키는 **서버 환경변수로만** 받는다(웹 입력 없음). 비워두면 AI 기능이 꺼지고 나머지는 정상 동작한다.

---

## 3. Vercel 배포

1. 이 저장소를 GitHub에 푸시.
2. [vercel.com](https://vercel.com)에서 **Import Project** → 해당 저장소 선택.
   - Framework: **Next.js** 자동 감지(별도 설정 불필요).
3. **Environment Variables**에 위 2번 표의 값을 모두 추가(Production/Preview).
4. Deploy. 빌드 명령은 `next build`(기본).
5. 배포 도메인 확인 후, 구글 OAuth를 쓴다면 Supabase 리디렉션 URL에 도메인 반영(1-4).

> 로컬 확인: `npm install` → `.env.local` 작성 → `npm run dev` → http://localhost:3000

---

## 4. 첫 교사 계정 만들기

가입 시 기본 역할은 **학생**입니다. 첫 교사는 SQL로 승격합니다.

1. 앱에서 교사가 될 계정으로 회원가입.
2. Supabase **SQL Editor**에서:
   ```sql
   update profiles set role = 'teacher' where email = 'teacher@example.com';
   ```
3. 다시 로그인하면 교사 화면(`/teacher`)으로 이동.

---

## 5. 운영 흐름 점검(스모크 테스트)

1. 운영자: 서버 환경변수 **`ANTHROPIC_API_KEY`**(.env.local) 설정(없으면 의미·문장은 교사 수동 검토).
2. 교사: `/teacher/classes`에서 **반 생성 → 학생 일괄 발급**(임시 비번 배부).
3. 교사: **새 평가 출제**(한자 입력 → 병음·성조 자동추천) → 대상 반 지정 → **공개**.
4. 학생: 발급 계정으로 로그인 → **첫 로그인 시 비밀번호 강제 변경**.
5. 학생: 연습(즉시 피드백) / 응시(자동 임시저장) → 제출(병음·성조 즉시 자동채점).
6. 교사: **검수**에서 의미·문장 확인/수정 → **확정** → 학생 결과 공개.
7. 교사: **분석**(오류 히트맵) / **엑셀 내보내기(NEIS)**.

---

## 6. 비용 메모

- 병음·성조 채점: 100% 로컬 로직 → **AI 비용 0**.
- 의미·문장 채점: 교사 키로만 호출, **batch + 캐싱(`ai_cache`)**로 동일 답안 재호출 방지.
- Supabase/Vercel 무료 티어로 소규모 학급 운영에 충분. 트래픽 증가 시 각 플랜 상향.

---

## 7. 보안 체크리스트

- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`는 서버 환경변수로만(클라이언트 노출 금지).
- [ ] RLS가 켜져 있는지 확인(스키마에 포함). 정답키(`word_keys`)·점수(`grades`)·AI 캐시(`ai_cache`)는 학생 비노출.
- [ ] Anthropic 키는 웹 입력을 받지 않고 서버 환경변수에서만 읽힘(코드상 BYOK 폐지).
