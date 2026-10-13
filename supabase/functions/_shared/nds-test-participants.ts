import { secureShuffle } from "./crypto.ts";

const surnames = [..."김이박최정강조윤장임한오서신권황안송류홍전고문양손배백허남심노하곽성차주우구민진"];
const givenNames = ["민준", "서준", "도윤", "예준", "시우", "주원", "하준", "지호", "준우", "준서", "건우", "현우", "도현", "지훈", "우진", "선우", "서진", "유준", "연우", "정우", "승우", "승현", "시윤", "준혁", "지환", "수호", "성민", "태윤", "재윤", "은우", "서연", "서윤", "지우", "서현", "민서", "하은", "하윤", "윤서", "지유", "지민", "채원", "수아", "지아", "지윤", "다은", "은서", "예은", "수빈", "소율", "예린", "소윤", "지원", "유나", "채은", "다인", "민지", "혜원", "나연", "수진", "유진"];

export function testNames(existing: string[]) {
  const occupied = new Set(existing.map((value) => value.trim().replace(/\s+/g, " ").toLowerCase()));
  const all = surnames.flatMap((surname) => givenNames.map((given) => surname + given));
  return secureShuffle([...new Set(all)].filter((name) => !occupied.has(name)));
}
