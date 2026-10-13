# NDS LUCKY 100 서버 적용

기존 Supabase 프로젝트에 적용한다. 기존 schema.sql/policies.sql을 다시 실행하지 않는다.

1. SQL Editor에서 `migrations/202610120001_nds_lucky_100.sql`을 한 번 실행한다.
   이미 초기 SQL을 적용한 환경에서는 `migrations/202610130001_fix_nds_admin_board_alias.sql`을 실행해 관리자 번호판 조회의 변수/별칭 충돌을 수정한다. 이 수정은 함수만 교체하며 데이터를 보존한다.
2. Supabase secrets에 `ADMIN_ID`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`을 설정한다. 기존 관리자도 같은 환경변수를 사용하므로 기존 운영 계정 설정을 유지한다. 비밀번호·세션 비밀키는 Git에 저장하지 않는다.
3. 아래 네 함수를 각각 배포한다.

```powershell
npx supabase functions deploy nds-lucky-100-lookup
npx supabase functions deploy nds-lucky-100-board
npx supabase functions deploy nds-lucky-100-register
npx supabase functions deploy nds-lucky-100-admin
```

각 요청은 POST JSON이며 기존 anon API key를 apikey 및 Authorization Bearer 헤더로 전달한다. 관리자 요청은 추가로 JSON의 admin_session_token을 사용한다. DB RPC는 service_role만 실행 가능하며 공개 테이블 조회/쓰기는 허용하지 않는다. 참가자 테이블은 공개 Realtime에 추가하지 않는다.

## 행사 준비

행사 생성의 max_slots는 기본100, 최소2~최대150이다. 생성 후 add_slots 작업(amount 양의 정수)은 접수 중에서만 가능하며 기존 번호를 유지하고 빈 번호만 추가한다. 줄이거나 추첨 이후 추가할 수 없다. 기존 DB는 migrations/202610130003_variable_slots.sql을 실행하고 관리자 API와 공개 lookup/board/register API를 재배포한다. 최신 repair-nds-admin.sql에도 해당 변경이 포함된다.

관리자 화면은 `/nds_lucky_100_result/`이다. `/nds-lucky-100-admin/`으로 접속해도 같은 화면으로 이동한다.
로그인 후 행사 이름을 입력해 생성하고 참가 링크를 복사한다. 행사 ID는 관리자 URL의 `?event=`에 보존되므로 이 URL을 저장하면 재접속 시 로그인 후 불러올 수 있다. 로그인 토큰은 현재 탭의 sessionStorage에 보관해 새로고침 시 복원한다. 서버 발급 세션 만료(8시간), 로그아웃 또는 탭 종료 시 재로그인이 필요하다. 비밀번호는 저장하지 않는다.
접수 중 번호를 클릭해 이름을 수정하거나 등록을 삭제한다. 마감 후 1~10명을 설정하고 추첨 시작을 누른다. 결과 CSV와 발표 모드를 지원하며 새로고침 후 저장된 결과를 다시 조회한다.

`nds-lucky-100-admin`에 `{ "action": "login", "admin_id": "운영 ID", "password": "운영 비밀번호" }`를 전송한다.
반환된 `admin_session_token`을 넣고 `{ "action": "create", "title": "NDS LUCKY 100", "admin_session_token": "…" }`을 전송한다.
반환된 `event.id`로 `/nds_lucky_100/?event=<UUID>` 참가 링크와 QR을 만든다.

## API 계약

추첨 시 결과는 서버에 먼저 저장하고 첫 당첨자부터 번호 팝업으로 공개한다. 다음 당첨자 공개 버튼으로 한 명씩 진행한다. 발표 모드의 번호판 위에서도 추첨 시작/다음 공개를 실행할 수 있다. 공개 진행은 현재 탭의 sessionStorage에 보관해 새로고침 시 이어간다. 이는 발표 연출의 진행 상태이며 서버에 저장된 당첨 결과는 변하지 않는다.

추첨에서 DB 오류 23514가 발생하고 예전 2~3명 제약이 남은 경우 최신 repair-nds-admin.sql을 실행한다. 함수뿐 아니라 winner_limit/prize_rank 제약도 1~10명으로 교체한다.

관리자 번호판 아래의 테스트 참가자 넣기는 `action: seed`, `count: 1~100`을 사용한다. 관리자 인증 후 중복 없는 세 글자 한국인 이름과 빈 번호를 무작위로 정해 실제 register RPC로 한 명씩 등록한다. 기존 참가자를 덮어쓰지 않으며 접수 중에만 가능하다. 빈칸 부족은 사전에 거부한다. 동시 등록·마감으로 일부만 등록되면 inserted_count와 stopped_reason을 반환한다. 테스트 참가자도 실제 추첨 대상에 포함된다. 새 SQL 적용 없이 nds-lucky-100-admin API 재배포와 Pages 배포만 필요하다.

| 함수/작업 | 추가 입력 | 반환 |
|---|---|---|
| lookup | event_id, name | is_registered, own_slot, event_status |
| board | event_id | occupied_slots, event_status |
| register | event_id, name, slot_number | own_slot, event_status |
| admin / board | event_id, admin_session_token | event, participants, winners |
| admin / close | event_id, admin_session_token | event(마감 시각·인원), winners |
| admin / update | event_id, participant_id, name, admin_session_token | event, winners |
| admin / delete | event_id, participant_id, admin_session_token | event, winners |
| admin / draw | event_id, winner_count(1~10), admin_session_token | event, winners |
| admin / finish | event_id, admin_session_token | event, winners |

관리자 작업은 모두 `action`을 지정한다. 성공 응답에 success:true, 실패 응답에 success:false 및 error가 포함된다. 참가 API의 주요 오류: ALREADY_NAME, SLOT_TAKEN, CLOSED, EVENT_NOT_FOUND, INVALID_NAME, INVALID_SLOT. 수정·삭제는 접수 중에만 가능하다. 접수 재개(reopen)는 추첨 전 closed 상태에서만 가능하며 관리자 확인과 감사 로그를 남긴다. 재추첨은 제공하지 않는다. 당첨자 이름은 admin / board로 조회한다.

번호와 이름은 행사별 유일하다. 이름은 서버·DB에서 공백을 정규화하고 DB에서 소문자로 비교한다. 마감·등록·수정·추첨은 같은 행사 행 잠금을 사용한다. 추첨 선정은 Edge Function의 crypto.getRandomValues 기반 편향 없는 셔플을 사용하며 DB에서 행사 내 후보와 중복을 재검증해 결과·상태·감사 로그를 한 트랜잭션으로 저장한다.

## 요청 제한

IP의 해시별 1분 제한: 조회/등록 합계 300회, 번호판 2400회, 관리자 로그인 10회. 행사 Wi-Fi의 공유 IP와 100명의 5초 폴링을 고려한 값이다. 게이트웨이가 x-forwarded-for를 덮어쓰는지 배포 환경에서 확인한다. 한 IP에서 남의 이름을 조회하는 것을 완전히 방지하는 신원 확인 수단은 아니다.

## 적용 후 검증

`tests/nds-lucky-100.sql`을 SQL Editor에서 실행한다(테스트 데이터는 rollback).
두 클라이언트가 같은 번호/이름을 동시에 제출해 한 건만 성공하는지, 등록과 마감을 동시에 요청해 마감 이후 등록이 없는지 확인한다.
관리자 미로그인 차단, 일반 anon의 테이블 및 RPC 직접 접근 차단, 다른 참가자 이름이 공개 응답에 없는지 확인한다.
75명 등록 후 1~10명 추첨에서 빈 번호가 제외되는지, 반복 추첨과 새로고침에 결과가 유지되는지 확인한다.

로컬 파일 생성은 원격 DB 적용이나 Edge Function 배포를 수행하지 않는다.

## 1~10명 추첨 및 접수 재개 업데이트

기존 DB에는 migrations/202610130002_winner_range_and_reopen.sql을 적용한다. 이전 별칭 충돌 수정도 포함한다. nds-lucky-100-admin API를 재배포하고 Pages 변경을 반영한다. 초기 테이블 생성 SQL은 재실행하지 않는다. 접수 마감 버튼이 마감 상태에서는 접수 재개로 전환되며 drawing/completed에서는 비활성화된다. tests/nds-lucky-100-reopen.sql로 검증한다.
