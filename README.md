# 핀마스터 (PinMaster) — 중국어 어휘 수행평가 플랫폼

중국어 어휘(병음·성조·의미·문장) 수행평가를 학생 연습 → 응시 → 자동채점 → 교사 검수 → 피드백까지 처리하는 웹 플랫폼. 전체 기획은 [docs/PRD.md](docs/PRD.md) 참고.

## 현재 상태

- **채점 엔진** (PRD §5) — 외부 의존성 없는 TS 모듈, 41개 테스트 통과.
- **AI 공급자** (PRD §9, §11) — Claude(Sonnet) 의미·문장 채점, 주입식.
- **웹 앱** (Next.js + Supabase) — 인증, RLS 스키마, 교사 출제/검수, 학생 응시(§8 숫자 성조 입력), 자동채점, NEIS 엑셀 내보내기. `next build` 통과.
- **AI 키(서버 환경변수 전용)** — Anthropic 키는 서버 `ANTHROPIC_API_KEY`(.env.local)에서만 읽는다. 웹 입력·DB 저장(BYOK)은 보안상 폐지. 키가 없으면 AI 기능만 비활성화된다.
- **교사 검수 고도화** — 의미·문장 점수 인라인 수정 + 확정, **AI 재채점** 버튼, AI 지적 사항 표시.
- **연습 모드 즉시 피드백** (PRD §6.1) — 무제한 연습, 제출 즉시 병음·성조 결정론 채점(AI 비용 0)으로 어느 음절의 성모/운모/성조가 틀렸는지 표시. 정답 공개는 교사 설정(`reveal_answers_in_practice`)을 따름. 점수표를 거치지 않아 확정 게이팅과 무관.
- **반 관리 + 학생 계정 일괄 발급** (PRD §15-6) — 교사가 반 생성 → 명단(이름,번호[,이메일]) 붙여넣기로 학생 계정 일괄 생성(이메일 없으면 자동 생성 + 임시 비밀번호 1회 표시). 평가 출제 시 대상 반 지정 → 그 반 학생에게만 노출(RLS). 계정 생성은 service-role로 수행하되 교사 권한·반 소유를 먼저 검증.
- **한자→병음 자동추천** (PRD §7) — 출제 시 한자만 입력하면 pinyin-pro로 병음·성조 정답키를 자동 채움(행별 "자동"/blur, 전체 일괄). 교사 확인·수정 가능. 사전은 lazy-load로 초기 번들 영향 없음. [pinyin-suggest](src/lib/pinyin-suggest.ts).
- **분석 대시보드** (PRD §7) — `/teacher/[id]/analytics`: 채점 결과를 단어×영역 오류 **히트맵**으로 집계, 영역 평균 오류, 취약 단어 Top 5(복습 추천). 집계는 순수 함수 [analytics.ts](src/lib/analytics.ts)(테스트 포함).
- **응시 자동 임시저장** (PRD §12) — 12초 주기로 답안 자동 저장, "이어서 응시" 시 복원. 네트워크 끊김 대비.
- **비밀번호 변경/재설정** — 학생/교사 자가 변경(`/account/password`), 교사가 담당 반 학생 비밀번호 재설정(임시 비번 1회 표시).
- **AI 피드백 캐싱** (PRD §11) — 동일 (한자·답안·정답키) 입력의 AI 판정을 `ai_cache`에 저장·재사용해 호출/비용 절감. 채점 엔진은 그대로, 앱 레이어에서 [캐싱 프로바이더](src/lib/ai-cache.ts)로 래핑.
- **첫 로그인 비밀번호 강제 변경** — 일괄 발급·재설정된 학생은 `must_change_password` 플래그로 첫 로그인 시 `/account/password`로 강제 이동, 변경 후 해제.
- **연습 약점 복습 추천** (PRD §6.1) — `practice_logs`를 집계해 자주 틀린 단어를 학생 대시보드 "복습 추천"으로 노출(연습 가능 평가면 바로 연습 링크). 집계는 [analytics.ts](src/lib/analytics.ts)(테스트 포함).
- **배포 가이드** — [DEPLOY.md](DEPLOY.md): Supabase 스키마 적용 → 환경변수 → Vercel → 첫 교사 지정 → 스모크 테스트 → 보안 체크리스트.

### AI 키 (서버 환경변수 전용)
- Anthropic 키는 **서버 환경변수 `ANTHROPIC_API_KEY`(.env.local)에서만** 읽는다. 웹에서 키를 입력받아 저장하는 방식(BYOK)은 보안상 폐지했다.
- 키가 있으면 [grading-bridge](src/lib/grading-bridge.ts)가 AI 채점·코칭에 사용하고, 없으면 의미·문장은 교사 검토로 위임(결정론 채점은 항상 수행 → 제출은 항상 성공).
- 필요한 env: `ANTHROPIC_API_KEY`(AI 기능), Supabase 키들. `.env.example` 참고.

### 실행

```bash
npm install
cp .env.example .env.local        # Supabase·Anthropic 키 입력
# Supabase SQL Editor에 supabase/schema.sql 실행(테이블 + RLS)
npm run dev                        # http://localhost:3000
npm test                           # 채점 엔진 41 tests
npm run typecheck                  # 전체 타입체크
npm run build                      # 프로덕션 빌드
```

> 교사 권한: 가입 후 기본 역할은 `student`. Supabase에서 `profiles.role`을 `teacher`로 변경하면 교사 화면 사용 가능.

### 앱 구조
```
src/app/
  login/                    이메일·구글 로그인
  teacher/                  대시보드 / new(출제) / [id](검수·확정·내보내기) / classes(반·학생) / settings(API 키)
  student/                  목록 / take/[id](응시) / practice/[id](연습) / result/[id](결과)
  api/export/[id]/          NEIS 엑셀 다운로드
  actions/                  서버 액션(auth·teacher·student)
src/components/             Topbar, TakeForm(§8 입력기)
src/lib/supabase/           server·client·admin 클라이언트
src/lib/grading-bridge.ts   DB ↔ 채점 엔진 연결(서버, 정답키 읽기)
supabase/schema.sql         테이블 + RLS(정답키 분리 보호)

src/grading/
  types.ts          공용 타입 + GradingConfig(§15 옵션)
  scale.ts          오류→점수 척도(§5.0), 기본점수 하한(§5.5), 기본값
  pinyin.ts         병음 파싱(성모/운모/성조 분해, 부호·숫자·무성조 처리)
  pinyinGrader.ts   §5.1 병음표기정확성 (완전 자동)
  toneGrader.ts     §5.2 성조변별정확성 (완전 자동)
  meaningGrader.ts  §5.3 의미변별정확성 (규칙 매칭 + AI fallback)
  sentenceGrader.ts §5.4 오류판단정확성 (작문형 AI / 오류찾기형 자동)
  providers.ts      AI 공급자 인터페이스(주입식, batch 호출)
  ai/               Claude API 공급자 구현(주입식)
    schemas.ts      structured output(zod) 스키마 + 프롬프트 빌더(테스트 가능)
    claudeProvider.ts  createClaudeProvider() — Sonnet, thinking off + effort low
  index.ts          gradeSubmission() 통합 진입점
```

### AI 공급자 연결 (PRD §9, §11)
의미·문장 AI 채점은 `createClaudeProvider()`로 주입한다. 엔진 자체는 SDK에 의존하지 않으므로,
공급자를 넘기지 않으면 해당 항목은 교사 검토(`needsReview`)로 위임된다.

```ts
import { createClaudeProvider } from "./src/grading/ai/claudeProvider.js";

const ai = createClaudeProvider(); // ANTHROPIC_API_KEY 환경변수 사용, 모델 claude-sonnet-4-6
const result = await gradeSubmission({ answers, keys, ai, synonyms });
```

- **모델**: `claude-sonnet-4-6` (PRD §9에서 명시 — 비용 효율).
- **비용 효율(§11)**: `thinking` 비활성 + `effort: low`, 의미/문장 각각 **배치 1회** 호출.
- **신뢰성**: structured output(zod)으로 응답 파싱, 잘못된 형식은 거부.

### 설계 원칙 (PRD §11)
- **결정론적 채점은 AI 0회**: 병음·성조는 100% 로컬 로직, 즉시 응답.
- **AI는 fallback + batch**: 의미는 규칙 매칭 실패분만, 문장은 묶음 1회 호출.
- **공급자 주입**: 엔진은 AI 구현에 의존하지 않음(`AiGradingProvider`). 미주입 시 해당 항목은 교사 검토(`needsReview`)로 위임.

### 채점 옵션 기본값 (PRD §15 — 모두 교사 선택 가능)
| 옵션 | 값 | 기본값 |
|---|---|---|
| `pinyinErrorUnit` | `initial_final` / `syllable` / `word` | **`initial_final`** (성모·운모 각각, §5.1 권장) |
| `sentenceTaskType` | `compose` / `find_error` | **`compose`** (작문형) |
| `meaningPartialErrorWeight` | `1` / `0.5` | **`1`** (부분정답도 1개) |

기본점수 하한(§5.5): 응시자 `max(total, 20)`, 장기 미인정 결석 `10`, 미응시 `0`.

## 사용 예

```ts
import { gradeSubmission } from "./src/grading/index.js";

const result = await gradeSubmission({
  keys: [
    { id: "w1", hanzi: "你好", correctPinyin: "ni hao", correctTones: [3, 3],
      acceptableMeanings: ["안녕", "안녕하세요"] },
  ],
  answers: [
    { wordId: "w1", studentPinyin: "ni hao", studentTones: [2, 3], studentMeaning: "안녕" },
  ],
  // config, ai, synonyms, status 모두 선택
});
// result.pinyin.score=25, result.tone.score=20(성조 1개 오류), ...
```

## 개발

```bash
npm install
npm test          # vitest (33 tests)
npm run typecheck # tsc --noEmit
```

## 다음 단계 (PRD §13 로드맵)
- 2차: 의미 AI fallback / 문장 AI 어법검사 실제 공급자(Claude API) 연결, 연습 모드.
- 앱 셸: Next.js + Supabase(인증·RLS), 교사 출제/검수 화면, 학생 응시 화면(§8 숫자 성조 입력기), 엑셀 내보내기.
