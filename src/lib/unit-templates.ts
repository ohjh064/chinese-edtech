/**
 * 교과서 8단원 템플릿(PRD §3) — shell(제목/부제/테마). 교사가 "8단원 불러오기"로
 * 본인 계정에 복제한 뒤 Teacher Studio에서 상황·표현·질문을 채운다.
 */
export interface UnitTemplate {
  title: string; // 한자 제목
  subtitle: string;
  theme: string;
}

export const UNIT_TEMPLATES: UnitTemplate[] = [
  { title: "你好！", subtitle: "1과", theme: "인사 / 감사 / 사과" },
  { title: "我是韩国人。", subtitle: "2과", theme: "이름 / 국적" },
  { title: "初中三年级。", subtitle: "3과", theme: "가족 / 나이 / 학년" },
  { title: "我三点半回家。", subtitle: "4과", theme: "날짜 / 요일 / 시간" },
  { title: "我想当厨师。", subtitle: "5과", theme: "취미 / 장래희망" },
  { title: "你吃饭了吗？", subtitle: "6과", theme: "식사 / 경험 / 맛" },
  { title: "我扫二维码。", subtitle: "7과", theme: "가격 / 구매 / QR결제" },
  { title: "你想去哪儿？", subtitle: "8과", theme: "장소 / 길 묻기 / 여행" },
];
