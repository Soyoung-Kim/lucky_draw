# GitHub Pages + Supabase Instant Draw MVP

## 1. Supabase 프로젝트 설정

1. Supabase 프로젝트를 생성한다.
2. `Project Settings > API`에서 아래 값을 확인한다.
   - Project URL: `https://<PROJECT_REF>.supabase.co`
   - anon public key
   - service_role key
3. Supabase SQL Editor에서 아래 파일을 순서대로 실행한다.
   - `supabase/schema.sql`
   - `supabase/policies.sql`

## 2. Edge Function 환경변수

```powershell
supabase login
supabase link --project-ref <PROJECT_REF>

supabase secrets set `
  SUPABASE_URL=https://<PROJECT_REF>.supabase.co `
  SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY> `
  ADMIN_ID=super `
  ADMIN_PASSWORD=manager `
  ADMIN_SESSION_SECRET=<LONG_RANDOM_SECRET>
```

`ADMIN_ID`와 `ADMIN_PASSWORD`는 MVP 기본값으로 각각 `super`, `manager`를 사용한다.
운영 전에는 반드시 더 강한 값으로 바꾼다.

## 3. Edge Function 배포

```powershell
supabase functions deploy admin-login
supabase functions deploy create-room
supabase functions deploy submit-entry
supabase functions deploy close-room
supabase functions deploy create-draw
supabase functions deploy reveal-next
supabase functions deploy reveal-card
supabase functions deploy reveal-all
supabase functions deploy finish-draw
```

Function URL 형식:

```text
https://<PROJECT_REF>.supabase.co/functions/v1/<FUNCTION_NAME>
```

프론트엔드는 `supabase.functions.invoke()`를 사용하므로 Function URL을 직접 하드코딩하지 않는다.

## 4. 프론트엔드 Supabase 연결

`scripts/config.js`를 수정한다.

```js
export const CONFIG = {
  SUPABASE_URL: "https://<PROJECT_REF>.supabase.co",
  SUPABASE_ANON_KEY: "<ANON_PUBLIC_KEY>",
  PARTICIPANT_COUNT_REFRESH_MS: 5000,
  DRAW_REFRESH_MS: 3000,
  AUTO_REVEAL_DELAY_MS: 1500,
};
```

프론트엔드에는 anon key만 넣는다.
service_role key는 절대 넣지 않는다.

## 5. GitHub Pages 배포

1. 이 프로젝트 루트 전체를 GitHub repository에 올린다.
2. GitHub repository에서 `Settings > Pages`로 이동한다.
3. `Build and deployment`를 다음처럼 설정한다.
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
4. 저장 후 GitHub Pages URL로 접속한다.

진입 URL:

```text
https://<GITHUB_ID>.github.io/<REPOSITORY_NAME>/index.html
```

관리자 URL:

```text
https://<GITHUB_ID>.github.io/<REPOSITORY_NAME>/admin.html
```

## 6. 실행 흐름

1. 관리자가 `admin.html`에 접속한다.
2. `super / manager`로 로그인한다.
3. 신규 이벤트명, 이벤트 코드, 시작/마감 시간을 입력하고 이벤트를 연다.
4. 참여자에게 `index.html?room=<EVENT_CODE>` 링크를 공유한다.
5. 참여자는 이름과 사번으로 응모한다.
6. 관리자는 응모자 수를 확인하고 응모를 마감한다.
7. 당첨자 수, 추첨 UI, 공개 방식을 선택하고 추첨을 시작한다.
8. manual 모드는 다음 공개/카드 클릭/전체 공개로 진행한다.
9. auto 모드는 관리자 화면에서 서버 확정 결과를 순차 공개한다.
10. 추첨 종료를 누른다.

## 7. 보안 메모

- 당첨자 선정은 `create-draw` Edge Function에서만 수행한다.
- 프론트엔드는 shuffle이나 당첨자 계산을 하지 않는다.
- 중복 응모는 `participants` unique constraint로 막는다.
- 중복 당첨은 `draw_results` unique constraint로 막는다.
- `audit_logs`는 화면에서 조회하지 않고 Supabase DB에서 직접 확인한다.
- participant count는 `employee_no` 노출을 피하기 위해 공개 화면에서 주기적으로 count 조회한다.
