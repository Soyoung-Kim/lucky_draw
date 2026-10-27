# 은지 예약 페이지

- 공개 달력: `/reserves-ej/`
- 관리자: `/reserves-ej-admin/`
- 기존 GitHub Pages + Supabase 설정(`scripts/config.js`)을 사용합니다.

## 서버 적용

1. Supabase SQL Editor에서 `supabase/migrations/202610260001_reserves_ej.sql`을 실행합니다. 2026-10-26부터 2027-05-31까지 218일을 생성합니다. 기존 추첨 테이블은 변경하지 않습니다.
2. 은지 전용 계정은 Supabase Edge Functions Secrets의 `EJ_ADMIN`(아이디), `EJ_ADMIN_PASS`(비밀번호)를 사용합니다. 기존 `ADMIN_ID`와 `ADMIN_PASSWORD`는 기존 관리자용으로 유지합니다. 서명에는 기존 `ADMIN_SESSION_SECRET`을 사용하되 은지 전용 서명 컨텍스트와 역할로 분리하여 서로의 세션은 사용할 수 없습니다. 필수 설정이 없으면 은지 관리자 기능만 닫힙니다. 계정 변경 또는 이번 인증 분리 적용 후에는 다시 로그인해야 합니다.
3. 연결된 프로젝트에서 `npx supabase functions deploy reserves-ej`를 실행합니다. 기존 프론트엔드와 동일한 anon JWT를 전달합니다.
4. 정적 파일을 기존 GitHub Pages 배포에 포함합니다. 저장소 하위 경로에서도 상대 링크가 작동합니다.

## 동작

한국 시간의 오늘부터 신청할 수 있고 당일에도 이미 지난 시간은 선택할 수 없습니다. 1·2순위는 **선택한 날짜 안의 서로 다른 시작·종료 시간대**이며 둘 다 필수입니다. 자정을 넘는 약속은 지원하지 않습니다. 요청자 이름과 사유는 필수이고 관리자에게만 공개됩니다. 승인 전 요청끼리는 시간이 겹칠 수 있습니다.

은지가 한 순위를 승인하면 공개 달력에 시간과 ‘약속 있어요’만 표시됩니다. 공개 화면은 30초마다 갱신하고 탭 복귀 시에도 갱신합니다. 날짜가 바뀌면 전날 신청 버튼과 열린 신청 창을 닫습니다. 서버도 한국 시간과 예약 가능 기간을 검증합니다. 같은 날짜의 신청·승인·휴무 변경은 DB 행 잠금으로 순서대로 처리하여 중복 승인을 방지합니다.

관리자는 거절, 확정 취소, 날짜별 예약 열기/닫기, 공휴일 이름 및 공개 메모를 관리합니다. 휴무 설정은 기존 확정 약속을 취소하지 않습니다. 공휴일도 기본적으로 신청 가능하며 개인 휴무는 별도로 닫아 주세요. 요청자에게 보내는 문자/이메일 알림은 없으며 승인 여부는 달력에서 확인합니다.

공휴일 데이터 출처: [한국천문연구원 2027년 월력요항](https://astro.kasi.re.kr/kor/life/post/calendarData?year=2027), [우주항공청 2027년 월력요항](https://www.kasa.go.kr/bbs/BBSMSTR_000000000018/B000000003234Li6nD2.do?mno=sub01_03_03). 임시공휴일 등 추후 변경은 날짜 관리에서 수정할 수 있습니다.

## 검증

`node --test scripts/tests/reserves-ej.test.mjs`

DB 통합 테스트: `EJ_PGLITE_MODULE` 환경변수에 설치된 `@electric-sql/pglite`의 모듈 경로를 지정한 뒤 `node --test scripts/tests/reserves-ej-db.test.mjs`. 테스트는 메모리 DB만 사용합니다.

로컬 화면 테스트: 같은 환경변수로 `node scripts/tests/reserves-ej-preview.mjs`를 실행하고 `http://127.0.0.1:4174/reserves-ej/`를 엽니다. 메모리 DB와 테스트 계정 `preview / preview`를 사용하며 운영 API·데이터에는 접근하지 않습니다. 서버를 종료하면 테스트 데이터는 사라집니다.
