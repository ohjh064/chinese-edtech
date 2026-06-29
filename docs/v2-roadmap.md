# AI Chinese Role Play Coach — v2 로드맵 / 설계

> 출처: 사용자 제공 **PRD v2.0**. 본 문서는 PRD를 현재 코드베이스(핀마스터, 어휘 수행평가)에
> 매핑하여 데이터 모델·아키텍처·단계별 실행 계획으로 정리한 설계 문서다. (구현 전 합의용)

## 0. 방향 요약
현재 앱은 **어휘 수행평가 플랫폼**(MC/타이핑 채점)이다. v2는 **AI 회화·상황학습(Role Play) 코칭
플랫폼**으로 확장한다 — 학생은 AI와 대화하며 연습하고, 교사는 단원/상황을 직접 설계한다.
핵심 전환: *채점기 → 코치*(스캐폴딩·1오류 피드백·다시 말하기·성공 경험, PRD §16).
v2는 기존 평가 기능을 **대체하지 않고 추가**한다(앱이 "평가" + "회화학습" 두 축).

## 1. 현재 자산 → v2 매핑 (재사용/신규)

| PRD 영역 | 현재 재사용 | 신규 필요 |
|---|---|---|
| 단원/상황 선택(§3) | classes/enrollments, 학생/교사 라우팅 | units·situations 데이터모델, 선택 UI |
| Teacher Studio(§4) | 출제 폼·diff 수정·`updateAssessment` 패턴 | 상황/질문/모범답안/롤플레이/보스미션 CRUD |
| AI 콘텐츠 생성(§15) | `generateWordsFromKorean`(BYOK·구조화 출력) | 상황→표현·질문20·답변·문장배열·보스미션·대본 생성 |
| Role Play/자유회화/보스(§8·9) | BYOK 키, Claude SDK, TTS(SpeakButton) | **대화형(스트리밍) 엔진**, 역할 프롬프트, 대화 저장 |
| Scaffolding(§7) | — | 힌트 0~5단계 런타임 엔진 |
| AI 피드백(§10·16) | meaning/sentence 구조화 채점 | **1오류·대화형** 피드백(잘한점/수정/자연표현/다시/추가질문) |
| Sentence Builder(§6) | 퀴즈·빈칸·`quiz-gen`·결정론 채점 | 단어 배열 게임 + 난이도 + 스캐폴딩 |
| 5레벨 학습(§5) | — | Listening→Builder→Guided→RolePlay→Free→Boss 흐름·진척 |
| 성조 음성코칭(§11, v2) | TTS, 성조 표시(`toDisplayWord`) | **ASR + 피치 분석**(난이도 최상) |
| 듀얼 롤플레이(§12, v2) | 대화 엔진(2단계) | AI↔AI 턴 오케스트레이션 |
| AI 오답노트(§13, v2) | practice_logs, analytics | mistakes 누적·유형분석·전용 문제 자동생성 |
| 교사 리포트(§14, v2) | analytics/monitor 집계 | 학습시간·레벨클리어·발음·힌트율 등 + 추천 |
| 시스템 원칙(§16) | — | 프롬프트/엔진에 내재화 |

**플랫폼 토대(그대로 사용)**: 인증·역할·RLS, BYOK(`teacher_secrets` AES-256-GCM), Claude
구조화 출력(`src/grading/ai/*`), `ai_cache`, TTS(`SpeakButton`), Next 15 + Supabase.

## 2. 데이터 모델 (제안)
교과서 단원은 **공유 템플릿 → 교사별 편집본**으로 둔다(교사가 자유 수정/추가, PRD §4).

```
units(id, teacher_id, title, subtitle, ord, culture_note, created_at)
situations(id, unit_id, title, description, role_student, role_ai,
           difficulty 'easy|normal|hard', ord)
expressions(id, situation_id, hanzi, pinyin, meaning, ord)          -- 핵심표현/단어
questions(id, situation_id, prompt_zh, prompt_ko, model_answer_zh,
          model_answer_ko, ord)                                      -- AI 질문+모범답안
roleplay_scripts(situation_id, turns jsonb)                          -- 역할/대본(시드)
boss_missions(situation_id, description, steps jsonb)                -- 실전 미션 단계
sentence_items(id, situation_id, target_zh, target_ko, difficulty)   -- 문장배열 정답

-- 학습/진척/대화
conversations(id, student_id, situation_id, mode 'roleplay|free|boss',
              level int, status, created_at)
messages(id, conversation_id, role 'student|ai|ai2|system', content,
         feedback jsonb, scaffold_level int, created_at)
level_progress(student_id, situation_id, level, cleared bool, score,
               hints_used, attempts, updated_at)
mistakes(id, student_id, kind 'word|grammar|tone|expression',
         detail, situation_id, count, last_at)                       -- 오답노트(§13)
pronunciation_attempts(id, student_id, target_text, target_tones int[],
         detected jsonb, score)                                       -- §11(v2)
```
- RLS: 교사=본인 units 트리 전체, 학생=배포된(반 소속) units read + 본인 conversations/진척/오답.
- 정답키(모범답안)는 평가처럼 학생 직접 read 제한 가능 → 회화는 admin 서버에서 채점/코칭.

## 3. 아키텍처 핵심
- **대화 엔진(신규)**: Claude `messages.stream`(현재는 `parse`만 사용). Next **Route Handler**
  (`app/api/chat/route.ts`, ReadableStream) 로 스트리밍(서버 액션은 스트리밍 부적합).
  시스템 프롬프트에 역할·레벨·스캐폴딩·§16 7원칙·1오류 규칙 인코딩. BYOK=단원 작성 교사 키.
- **피드백**: 학생 턴마다 구조화 출력(`messages.parse`)으로 {잘한점,수정1개,자연표현,다시말하기,
  추가질문} 산출 + 다음 회화 턴(stream). 비용상 모델 티어(haiku/sonnet) 선택지.
- **스캐폴딩 엔진**: 질문별 hint level(0~5) 상태. 학생 오답/도움요청 시 단계 상승(§7).
- **Sentence Builder**: 기존 `quiz-gen`/결정론 채점 재사용 + 토큰 셔플·난이도(2/5/7~8/조사).
- **성조 코칭(§11, v2)**: 브라우저 `SpeechRecognition`(무료, zh-CN 지원 편차) + Web Audio
  피치 검출로 성조 근사 비교. **연구 스파이크 필요**(정확도 한계 → 외부 ASR는 비용). 최하위 우선.
- **비용 가드레일**: 턴 수 제한, 모델 티어, 캐시 불가(대화 고유) → 교사 키 사용량 경고.

## 4. 단계별 로드맵
> 권장: PR #1(핀마스터) 머지 후, v2는 새 브랜치/트랙. 각 단계는 typecheck+test+수동검증으로 마감.

### Phase 1 — 콘텐츠 토대 (Teacher Studio + AI 생성기)
- units/situations/expressions/questions 스키마 + RLS, 8단원 시드(§3).
- Teacher Studio CRUD(단원·상황·표현·질문·모범답안·난이도, §4) — `updateAssessment` diff 패턴 재사용.
- AI 상황 생성기(§15): 설명 입력 → 상황·표현·질문20·예상답변·문장배열·보스미션·대본 생성
  (`generateWordsFromKorean` 확장). 교사 검토 후 배포.
- 학생 단원/상황 선택 화면.
- 산출: 회화 없이도 "콘텐츠 제작·배포"가 도는 토대.

### Phase 2 — 회화 코어 (Role Play + 스캐폴딩 + 1오류 피드백)
- conversations/messages 모델 + 스트리밍 챗 Route Handler.
- Role Play(§8): 역할 프롬프트, 실제 회화 흐름. 스캐폴딩 0~5(§7). 1오류 피드백(§10·16).
- TTS 재사용(AI 발음 듣기). 레벨 흐름 뼈대(§5)와 연결.
- 산출: 학생이 한 상황을 AI와 끝까지 대화 + 코칭 수령.

### Phase 3 — 학습 흐름 완성 (Sentence Builder + 5레벨 + Boss)
- Sentence Builder 게임(§6) + 난이도/스캐폴딩.
- 5레벨 진척(§5): Listening→Builder→Guided Speaking→Role Play→Free→Boss Mission(§9) + `level_progress`.
- 산출: 단원을 게임처럼 레벨 클리어하는 학습 루프.

### Phase 4 — v2 고급
- AI 오답노트 자동출제(§13): mistakes 누적·유형분석·전용 문제 생성.
- 교사 심화 리포트(§14): 학습시간·레벨클리어율·발음·힌트율·반 취약표현·추천.
- AI 듀얼 롤플레이(§12).
- 성조 음성 코칭(§11) — 스파이크 결과에 따라 범위 확정.

## 5. 선행 결정 사항 (Phase 1 착수 전 확정 필요)
1. **단원 모델**: 공유 템플릿+교사 편집본(권장) vs 교사별 독립 vs 전역 고정.
2. **앱 통합 방식**: 기존 평가와 한 앱에서 모드 분리 vs 별도 섹션.
3. **회화 모델 티어/비용 한도**: haiku vs sonnet, 학생당 턴/일일 한도.
4. **음성/성조(§11) 범위**: v2 후반 스파이크로 분리(브라우저 ASR 한계 인지).

## 6. 리스크
- **비용**: 대화는 캐시 불가 → BYOK 교사 키 사용량 급증 가능(가드레일 필수).
- **스트리밍**: 서버 액션 한계 → Route Handler 필요(아키텍처 신규 패턴).
- **성조 분석 정확도**: 브라우저 ASR/피치 검출 한계 → 근사 또는 외부 서비스(비용) 트레이드오프.
- **스코프**: 단계별 출시 엄수(한 번에 전부 X). 각 Phase는 독립 가치 제공하도록 설계.
