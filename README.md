# 진주랭킹

진주 관련 주제를 이상형 월드컵으로 고르고, 참여자들의 선택을 순위로 모으는 웹사이트입니다.
「진주랭킹 개발설계서 v0.1」과 ChatGPT로 만든 이전 버전(jinju-ranking.greyokapi.chatgpt.site)의 화면·기능을 바탕으로 새로 만들었습니다.

- 화면: Vite + React (모바일 우선)
- DB·로그인·사진: Supabase (카카오 로그인)
- 배포: Vercel

## 지금 들어 있는 기능

| 구분 | 내용 |
| --- | --- |
| 홈 | 광고 배너 4칸, 로고와 「진주사람들의 취향, 데이터가 되다!」, 검색(제목·설명·후보·숨은 키워드), 최신순/인기순, 랭킹 제안 카드, 썸네일 카드(모바일 2열·태블릿 3열·PC 4열), 이어서 플레이하기 |
| 플레이 | 로그인 없이 끝까지, 모바일 위아래·PC 좌우, 라운드 전환 연출, 진행바, 되돌리기, 그만하기(이 기기에 저장) |
| 결과 | 트로피 J, 「[랭킹 제목] 1위는!」, 2위 표시, PC에서는 댓글이 사진 왼쪽·모바일은 아래 |
| 순위 반영 | 로그인 사용자 1인 1표. 처음이면 바로 반영, 다시 플레이하면 「이번 결과를 기록에 반영할까요?」(예=교체, 아니오=유지). 로그인하러 갔다 와도 처음부터 다시 하지 않음 |
| 전체 순위 | 로그인 필요. 우승 → 결승 진출 → 승률 순, 내 1위 표시 |
| 참여 | 댓글(1인 1댓글, 삭제 후 재작성, 익명, 신고), 의견 보내기(후보 추천·이의 제기, 하루 5건) |
| 랭킹 제안 | 로그인 사용자가 후보·사진까지 구성해 제안 → 운영자 승인 후 공개 |
| 설문조사 | 게시판(전체/진행 중/만료/내 글, 검색), 게시일·만료일, 수정·삭제는 운영자 승인 후 반영 |
| 진주기록 | 준비 중 페이지 |
| 운영자(/admin) | 랭킹 관리(업로드 날짜·조회수·참여자 수·순위 반영·댓글 수), 랭킹 에디터, 제안함, 의견함(신고 처리), 댓글 관리, 광고·문의 설정, 설문 승인함 |
| 랭킹 에디터 | 한 줄 추가, 끌어서 순서 바꾸기, 한꺼번에 추가(회색 「예)」 안내), 후보 사진(4:3, 2MB, 자동 WebP 변환), 대표 썸네일(비우면 후보 사진 2장 자동), 후보 수·중복·글자 수 검사, 플레이 미리보기, 초안/공개/보관, 새 시즌 |
| 공통 | 개인정보처리방침, 이용약관, 문의, 만 14세 안내, 카카오톡 공유 미리보기 이미지, 홈 화면에 추가(PWA) |

중요한 규칙(1인 1표, 1인 1댓글, 운영자 권한, 하루 작성 제한)은 화면이 아니라 **DB 안에서** 지켜집니다. (`supabase/schema.sql`)

---

## 0. 내 컴퓨터에서 바로 보기 (데모 모드)

Supabase 키를 넣기 전에는 **데모 모드**로 동작합니다. 모든 기능을 써볼 수 있지만, 데이터는 지금 쓰는 브라우저에만 저장됩니다.
로그인 화면에 「데모 사용자로 로그인」 「데모 운영자로 로그인」 버튼이 나옵니다.

터미널에서 이 폴더로 이동한 뒤:

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다.

> Node.js는 `~/.local/node` 에 설치되어 있습니다. `npm` 명령을 찾을 수 없다고 나오면 먼저 `export PATH="$HOME/.local/node/bin:$PATH"` 를 실행하세요.

---

## 1. Supabase 준비

1. https://supabase.com 에 가입하고 **New project** 를 만듭니다. (지역은 Northeast Asia (Seoul) 추천, DB 비밀번호는 안전한 곳에 보관)
2. 왼쪽 메뉴 **SQL Editor** → **New query** → `supabase/schema.sql` 파일 내용을 전부 붙여 넣고 **Run**.
   - 표(랭킹, 후보, 투표, 댓글, 의견, 제안, 설문, 광고 등), 접근 규칙(RLS), 투표·집계 함수, 사진 저장소가 한 번에 만들어집니다.
   - 여러 번 실행해도 안전합니다.
3. (선택) 같은 방법으로 `supabase/seed.sql` 을 실행하면 예시 랭킹 6개가 **초안**으로 들어갑니다.
4. **Project Settings → API** 에서 두 값을 복사해 둡니다.
   - Project URL → `VITE_SUPABASE_URL`
   - **Publishable key**(또는 anon public key) → `VITE_SUPABASE_PUBLISHABLE_KEY`

> ⚠️ **secret / service_role 키는 절대 코드, GitHub, Vercel, 채팅창에 넣지 마세요.** 이 사이트에는 필요 없습니다.

## 2. 카카오 로그인 연결

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가하기**.
2. **앱 설정 → 플랫폼 → Web** 에 사이트 도메인 등록: 배포 주소(예: `https://jinju-ranking.vercel.app`)와 `http://localhost:5173`.
3. **제품 설정 → 카카오 로그인** 을 **활성화**하고, Redirect URI 에 다음을 등록:
   `https://<프로젝트ID>.supabase.co/auth/v1/callback`
4. **동의항목**: 닉네임을 설정합니다. 이메일은 아래 「알려진 문제」를 참고하세요.
5. **앱 키 → REST API 키**, **보안 → Client Secret**(코드 생성 후 활성화)을 복사합니다.
6. Supabase **Authentication → Sign In / Providers → Kakao** 를 켜고, REST API 키를 Client ID 에, Client Secret 을 붙여 넣고 저장합니다.
7. Supabase **Authentication → URL Configuration**
   - Site URL: 배포 주소 (예: `https://jinju-ranking.vercel.app`)
   - Redirect URLs 에 추가: `https://jinju-ranking.vercel.app/**`, `http://localhost:5173/**`

**알려진 문제 (KOE205)**: Supabase가 카카오에 이메일 항목을 함께 요청해서, 이메일 동의항목이 설정되지 않으면 KOE205 오류가 난다는 사례가 있습니다. 이메일 동의항목을 켜려면 비즈 앱 전환(개인 개발자는 본인인증)이 필요할 수 있어요. 카카오·Supabase 화면은 바뀔 수 있으니 실제 화면 기준으로 확인하세요. 이 사이트는 이메일을 어디에도 표시하거나 복사하지 않습니다.

**구글 로그인**은 카카오톡 인앱 브라우저에서 막힐 수 있어 기본으로 꺼 두었습니다. 실기기 테스트 후 쓰려면 Supabase에서 Google을 켜고 `VITE_ENABLE_GOOGLE=true` 로 설정하세요.

## 3. 내 컴퓨터에서 Supabase로 실행

`.env.example` 을 복사해 `.env` 를 만들고 값을 채웁니다. (`.env` 는 GitHub에 올라가지 않습니다)

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://프로젝트ID.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_SITE_URL=https://jinju-ranking.vercel.app
VITE_ENABLE_GOOGLE=false
```

`npm run dev` 를 다시 실행하면 데모 모드 띠가 사라지고 실제 DB에 연결됩니다.

## 4. 운영자 등록 (처음 한 번)

1. 사이트에서 카카오로 로그인합니다.
2. `/admin` 에 들어가면 「관리자 전용 페이지예요」와 함께 **내 계정용 SQL**이 보입니다. 「SQL 복사」를 누릅니다.
3. Supabase **SQL Editor** 에 붙여 넣고 Run. (`insert into public.admins (user_id) values ('…');`)
4. 새로고침하면 관리 페이지가 열립니다. 이후 **광고·문의 설정** 탭에서 문의 이메일을 꼭 등록하세요. (개인정보처리방침의 문의처로도 쓰입니다)

## 5. Vercel에 배포

1. GitHub에 새 저장소를 만들고 이 폴더를 올립니다. (`node_modules`, `dist`, `.env` 는 자동으로 제외됩니다)
2. https://vercel.com → **Add New → Project** → GitHub 저장소 선택. Framework 는 Vite 로 자동 인식됩니다.
3. **Environment Variables** 에 `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SITE_URL` 을 넣고 **Deploy**.
4. 배포 주소가 정해지면 카카오 플랫폼 도메인, Supabase Site URL / Redirect URLs 를 그 주소로 맞춥니다.
5. 이후 GitHub에 올릴 때마다 자동으로 다시 배포됩니다.

> 💡 **Vercel 무료(Hobby) 요금제는 개인·비상업용만 허용**합니다. 광고 배너로 수익을 내기 시작하면 Pro 요금제가 필요할 수 있어요. 설계서처럼 Cloudflare Pages(무료 상업 이용 가능)로 옮기려면 빌드 명령 `npm run build`, 출력 폴더 `dist` 로 그대로 배포하면 됩니다. (화면 경로 처리는 Cloudflare Pages가 자동으로 해 줍니다)

---

## 공개 전 확인할 것

- [ ] `src/pages/StaticPages.tsx` 의 `EFFECTIVE_DATE`(시행일)와 개인정보처리방침·이용약관 문구 검토 (법률 검토를 거치지 않은 초안입니다)
- [ ] 광고·문의 설정에서 문의 이메일 등록
- [ ] 모든 표에 RLS 가 켜져 있는지 (schema.sql 이 켭니다)
- [ ] secret / service_role 키가 어디에도 노출되지 않았는지
- [ ] 같은 계정으로 다시 반영해도 표가 2개가 되지 않고, 예=교체·아니오=유지
- [ ] 비로그인 상태에서 순위·댓글이 보이지 않는지
- [ ] 운영자가 아닌 계정으로 `/admin` 에서 랭킹을 만들 수 없는지
- [ ] 카카오톡 인앱 브라우저, 안드로이드 크롬, 아이폰 사파리에서 홈·플레이 화면이 가로 스크롤 없이 맞는지
- [ ] Supabase, Vercel, 카카오 계정에 2단계 인증
- [ ] Supabase 무료 프로젝트는 7일 동안 활동이 없으면 일시중지될 수 있어요

## 다음에 할 일 (아직 없는 것)

- 카카오톡 공유 미리보기를 **랭킹별** 썸네일·제목으로 (지금은 사이트 공통 이미지)
- 자동 탈퇴(기록 삭제) 기능 — 지금은 문의 이메일로 받아 대시보드에서 삭제
- 진주기록(통계·인포그래픽) 내용
- 도메인 구매·연결

---

## 개발용 명령어

```bash
npm run dev       # 개발 서버 (http://localhost:5173)
npm run build     # 타입 검사 + 배포용 빌드 (dist/)
npm test          # 대결·검증 규칙 단위 테스트
npm run test:db   # schema.sql 을 내장 Postgres(PGlite)에 올려 투표·댓글·권한 규칙 76가지 확인
```

## 폴더 구조

```
supabase/schema.sql      DB 표·접근 규칙·함수·사진 저장소 (Supabase SQL Editor 에서 실행)
supabase/seed.sql        (선택) 예시 랭킹 6개
scripts/test-db.mjs      DB 규칙 자동 확인
src/lib/api/             데이터 연결 (supabase.ts = 실제, demo.ts = 데모 모드)
src/lib/tournament.ts    대결 진행 규칙
src/pages/               화면 (홈, 플레이, 결과, 순위, 설문, 로그인, 관리 등)
src/components/          공통 부품 (상단 메뉴, 에디터, 모달 등)
src/styles.css           디자인
public/images/           로고와 예시 썸네일
```

## 커뮤니티 기능 변경안 (수정 브랜치)

닉네임·공감·제안 보완·양자택일·유튜브 TV 변경 사항과 배포 순서는
[`docs/community-update.md`](docs/community-update.md)에 정리했습니다.
기존 운영 DB용 SQL은 `supabase/migrations/20261012_community.sql`입니다.
사용자 요청 전에는 운영 DB 적용이나 main 병합을 하지 않습니다.
