// supabase/schema.sql 을 실제 Postgres(PGlite)에 올려 투표·댓글·권한 규칙을 확인한다.
// 실행: npm run test:db
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../supabase/seed.sql', import.meta.url), 'utf8');

// Supabase에만 있는 auth, storage 스키마를 흉내 낸다
const stubs = `
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create schema storage;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated;
grant all on storage.objects to anon, authenticated;
`;

const db = new PGlite();
let failures = 0;
let passes = 0;

function ok(cond, label) {
  if (cond) {
    passes++;
    console.log('  ✓ ' + label);
  } else {
    failures++;
    console.log('  ✗ ' + label);
  }
}

async function as(user, fn) {
  await db.exec('reset role');
  if (user === 'anon') {
    await db.exec(`select set_config('request.jwt.claim.sub', '', false); set role anon;`);
  } else {
    await db.exec(`select set_config('request.jwt.claim.sub', '${user}', false); set role authenticated;`);
  }
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

async function q(sql, params) {
  return (await db.query(sql, params)).rows;
}

async function fails(promise, pattern, label) {
  try {
    await promise;
    ok(false, label + ' (실패해야 하는데 성공함)');
  } catch (e) {
    ok(pattern ? new RegExp(pattern).test(e.message) : true, label + ' → ' + e.message);
  }
}

// 승자 함수를 받아 올바른 대결 기록을 만든다
function playBracket(ids, pick = (a, b) => a) {
  let round = [...ids];
  const matches = [];
  while (round.length > 1) {
    const next = [];
    for (let i = 0; i < round.length; i += 2) {
      const winner = pick(round[i], round[i + 1]);
      matches.push({ a: round[i], b: round[i + 1], winner });
      next.push(winner);
    }
    round = next;
  }
  return matches;
}

const ADMIN = '00000000-0000-4000-8000-00000000000a';
const U1 = '00000000-0000-4000-8000-000000000001';
const U2 = '00000000-0000-4000-8000-000000000002';

await db.exec(stubs);
await db.exec(schema);
console.log('스키마 1회차 적용 완료');
await db.exec(schema);
console.log('스키마 2회차 적용 완료 (반복 실행 안전)');
await db.exec(seed);
await db.exec(seed);
const seeded = await q("select slug, status, candidate_count from public.worldcups where slug like 'sample-%' order by slug");
console.log(`예시 데이터(seed.sql) 2회 실행: 랭킹 ${seeded.length}개, 모두 초안=${seeded.every((r) => r.status === 'draft')}, 후보 수 ${seeded.map((r) => r.candidate_count).join('/')}`);
if (seeded.length !== 6) failures++;

await db.exec(`insert into auth.users (id) values ('${ADMIN}'), ('${U1}'), ('${U2}');
               insert into public.admins (user_id) values ('${ADMIN}');`);

console.log('\n[운영자 에디터]');
const eight = ['진주냉면', '진주비빔밥', '육전', '장어구이', '소고기국밥', '돼지국밥', '칼국수', '수제비'];
const payload = (extra = {}) => ({
  title: '진주에서 딱 한 끼만 먹는다면?',
  description: '한 끼를 골라주세요.',
  keywords: '냉면, 점심',
  status: 'published',
  featured: true,
  sort_order: 0,
  thumbnail_url: '',
  candidates: eight.map((name) => ({ name, sub: '', image_url: '' })),
  ...extra,
});

await fails(
  as(U1, () => q('select public.admin_save_worldcup($1)', [payload()])),
  'admin_only',
  '운영자가 아니면 랭킹 저장 불가',
);
await fails(
  as('anon', () => q(`insert into public.worldcups (title) values ('해킹')`)),
  'row-level security|permission denied',
  '비로그인 사용자는 worldcups 직접 추가 불가',
);
await fails(
  as(ADMIN, () => q('select public.admin_save_worldcup($1)', [payload({ candidates: eight.slice(0, 7).map((name) => ({ name, sub: '' })) })])),
  'invalid_candidate_count',
  '후보 7개는 공개 불가',
);
await fails(
  as(ADMIN, () => q('select public.admin_save_worldcup($1)', [payload({ candidates: [...eight.slice(0, 7), '육전'].map((name) => ({ name, sub: '' })) })])),
  'duplicate_name',
  '같은 이름 후보 공개 불가',
);
const draftId = (await as(ADMIN, () => q('select public.admin_save_worldcup($1) as id', [payload({ status: 'draft', title: '초안 랭킹', candidates: [{ name: '하나', sub: '' }] })])))[0].id;
ok(!!draftId, '후보 1개짜리 초안 저장 가능');

const wid = (await as(ADMIN, () => q('select public.admin_save_worldcup($1) as id', [payload()])))[0].id;
ok(!!wid, '후보 8개 랭킹 공개');
const cands = await q('select id, name from public.candidates where worldcup_id = $1 and active order by sort_order', [wid]);
const ids = cands.map((c) => c.id);
ok(ids.length === 8, '후보 8개 저장됨');

const anonCups = await as('anon', () => q('select id, status from public.worldcups'));
ok(anonCups.length === 1 && anonCups[0].id === wid, '비로그인은 공개 랭킹만 보임 (초안 숨김)');
const anonDraftCands = await as('anon', () => q('select id from public.candidates where worldcup_id = $1', [draftId]));
ok(anonDraftCands.length === 0, '비로그인은 초안 후보를 볼 수 없음');

await fails(
  as(ADMIN, () => q('select public.admin_save_worldcup($1)', [{ ...payload(), id: wid, candidates: cands.slice(0, 7).map((c) => ({ id: c.id, name: c.name, sub: '' })) }])),
  'published_locked',
  '공개된 랭킹은 후보를 빼거나 더할 수 없음',
);
// 이름 서로 바꾸기 (0번과 1번)
const swapped = cands.map((c, i) => ({ id: c.id, name: i === 0 ? cands[1].name : i === 1 ? cands[0].name : c.name, sub: '수정' }));
await as(ADMIN, () => q('select public.admin_save_worldcup($1)', [{ ...payload(), id: wid, candidates: swapped }]));
const afterSwap = await q('select id, name, sub from public.candidates where worldcup_id = $1 and active order by sort_order', [wid]);
ok(afterSwap[0].id === cands[0].id && afterSwap[0].name === cands[1].name && afterSwap[0].sub === '수정', '공개 후에도 이름·설명 수정 가능 (서로 바꾸기 포함)');

console.log('\n[투표 submit_ballot]');
const m1 = playBracket(ids);
await fails(
  as('anon', () => q('select public.submit_ballot($1, $2)', [wid, JSON.stringify(m1)])),
  'login_required|permission denied',
  '비로그인 투표 불가',
);
const r1 = (await as(U1, () => q('select public.submit_ballot($1, $2) as r', [wid, JSON.stringify(m1)])))[0].r;
ok(r1.status === 'created' && r1.champion_id === ids[0], '첫 제출은 바로 반영, 우승자는 서버가 계산');
const r2 = (await as(U1, () => q('select public.submit_ballot($1, $2, false) as r', [wid, JSON.stringify(playBracket(ids, (a, b) => b))])))[0].r;
ok(r2.status === 'exists', '다시 제출하면서 아니오 → 이전 결과 유지');
const keep = await as(U1, () => q('select champion_id from public.ballots where worldcup_id = $1', [wid]));
ok(keep.length === 1 && keep[0].champion_id === ids[0], '표는 1개 그대로, 우승자도 그대로');
const r3 = (await as(U1, () => q('select public.submit_ballot($1, $2, true) as r', [wid, JSON.stringify(playBracket(ids, (a, b) => b))])))[0].r;
ok(r3.status === 'replaced', '예 → 이번 결과로 교체');
const replaced = await as(U1, () => q('select champion_id from public.ballots where worldcup_id = $1', [wid]));
ok(replaced.length === 1 && replaced[0].champion_id === ids[7], '교체 후에도 표는 1개');

const bad1 = playBracket(ids);
bad1[0] = { ...bad1[0], b: bad1[0].a };
await fails(as(U2, () => q('select public.submit_ballot($1, $2)', [wid, JSON.stringify(bad1)])), 'invalid_matches', '같은 후보끼리 대결 거부');
const bad2 = playBracket(ids);
bad2[4] = { ...bad2[4], a: ids[1] };
await fails(as(U2, () => q('select public.submit_ballot($1, $2)', [wid, JSON.stringify(bad2)])), 'invalid_matches', '진 후보가 다음 라운드에 나오면 거부');
await fails(as(U2, () => q('select public.submit_ballot($1, $2)', [wid, JSON.stringify(bad1.slice(0, 5))])), 'invalid_matches', '대결 수가 (후보 수 - 1)이 아니면 거부');
const bad3 = playBracket(ids);
bad3[6] = { ...bad3[6], winner: ids[3] };
await fails(as(U2, () => q('select public.submit_ballot($1, $2)', [wid, JSON.stringify(bad3)])), 'invalid_matches', '승자가 대결 당사자가 아니면 거부');
await fails(as(U2, () => q('select public.submit_ballot($1, $2)', [draftId, JSON.stringify(m1)])), 'worldcup_not_found', '초안 랭킹에는 투표 불가');
await fails(as(U2, () => q(`insert into public.ballots (user_id, worldcup_id, champion_id, runner_up_id, matches) values ($1, $2, $3, $4, '[]')`, [U2, wid, ids[0], ids[1]])), 'permission denied|row-level security', 'ballots 직접 추가 불가');
await as(U2, () => q('select public.submit_ballot($1, $2)', [wid, JSON.stringify(m1)]));
const u2sees = await as(U2, () => q('select user_id from public.ballots'));
ok(u2sees.length === 1 && u2sees[0].user_id === U2, '다른 사람의 투표는 보이지 않음');

console.log('\n[집계 get_ranking]');
await fails(as('anon', () => q('select public.get_ranking($1)', [wid])), 'login_required|permission denied', '비로그인은 순위 조회 불가');
const ranking = (await as(U2, () => q('select public.get_ranking($1) as r', [wid])))[0].r;
ok(ranking.participants === 2, '참여자 수 2');
ok(ranking.rows.length === 8, '후보 8개 모두 집계');
const top = ranking.rows[0];
ok(top.wins === 1 && top.finals >= 1, '1위는 우승 1회');
ok(ranking.rows.every((r) => !('user_id' in r)), '집계에 user_id 없음');
const winsTotal = ranking.rows.reduce((s, r) => s + r.wins, 0);
const finalsTotal = ranking.rows.reduce((s, r) => s + r.finals, 0);
ok(winsTotal === 2 && finalsTotal === 4, '우승 합계 2, 결승 진출 합계 4');
const winnerRow = ranking.rows.find((r) => r.id === ids[0]);
ok(winnerRow.match_count === 4 && winnerRow.match_wins === 3, '대결 수·승수 계산 (첫 후보: 첫 표 1전 0승 + 둘째 표 3전 3승)');

console.log('\n[댓글]');
const c1 = (await as(U1, () => q(`insert into public.comments (worldcup_id, body) values ($1, '냉면 최고') returning id`, [wid])))[0].id;
ok(!!c1, '로그인 사용자 댓글 작성');
await fails(as(U1, () => q(`insert into public.comments (worldcup_id, body) values ($1, '두 번째')`, [wid])), 'duplicate|unique', '같은 월드컵에 댓글 2개 불가');
await fails(as(U1, () => q(`insert into public.comments (worldcup_id, body) values ($1, $2)`, [wid, 'ㄱ'.repeat(201)])), 'check|violates', '201자 댓글 불가');
await fails(as('anon', () => q(`insert into public.comments (worldcup_id, body, user_id) values ($1, '익명', $2)`, [wid, U2])), 'row-level security|permission denied|null', '비로그인 댓글 불가');
await fails(as(U2, () => q(`insert into public.comments (worldcup_id, body, user_id) values ($1, '사칭', $2)`, [wid, U1])), 'row-level security', '다른 사람 이름으로 댓글 불가');
await fails(as(U2, () => q(`update public.comments set body = '수정' where id = $1`, [c1])).then(async () => {
  const r = await q('select body from public.comments where id = $1', [c1]);
  if (r[0].body !== '냉면 최고') throw new Error('changed');
  throw new Error('no-op ok');
}), 'no-op ok', '다른 사람 댓글 수정 불가');
const u2list = await as(U2, () => q('select * from public.get_comments($1)', [wid]));
ok(u2list.length === 1 && u2list[0].is_mine === false && !('user_id' in u2list[0]), '댓글 목록에 user_id 없음, 내 댓글 여부만');
await fails(as('anon', () => q('select * from public.get_comments($1)', [wid])), 'login_required|permission denied', '비로그인 댓글 조회 불가');
await as(ADMIN, () => q('update public.comments set hidden = true where id = $1', [c1]));
const hiddenForU2 = await as(U2, () => q('select * from public.get_comments($1)', [wid]));
ok(hiddenForU2.length === 0, '숨긴 댓글은 다른 사람에게 안 보임');
const hiddenForU1 = await as(U1, () => q('select * from public.get_comments($1)', [wid]));
ok(hiddenForU1.length === 1 && hiddenForU1[0].hidden === true, '작성자는 숨겨진 내 댓글을 볼 수 있음');
await as(U1, () => q('delete from public.comments where id = $1', [c1]));
const again = await as(U1, () => q(`insert into public.comments (worldcup_id, body) values ($1, '다시 씀') returning id`, [wid]));
ok(again.length === 1, '삭제하면 다시 쓸 수 있음');

console.log('\n[의견 보내기]');
for (let i = 0; i < 5; i++) {
  await as(U1, () => q(`insert into public.feedback (worldcup_id, type, body) values ($1, 'suggest', $2)`, [wid, '추천 ' + i]));
}
ok(true, '하루 5건까지 전송');
await fails(as(U1, () => q(`insert into public.feedback (worldcup_id, type, body) values ($1, 'suggest', '여섯 번째')`, [wid])), 'daily_limit', '6번째 의견은 거부');
await fails(as(U2, () => q(`insert into public.feedback (worldcup_id, type, body) values ($1, 'suggest', $2)`, [wid, 'ㄱ'.repeat(301)])), 'check|violates', '301자 의견 거부');
const u2fb = await as(U2, () => q('select * from public.feedback'));
ok(u2fb.length === 0, '다른 사람 의견은 안 보임');
const adminFb = await as(ADMIN, () => q('select * from public.feedback'));
ok(adminFb.length === 5, '운영자는 의견을 모두 봄');
await as(U2, () => q(`insert into public.feedback (worldcup_id, type, comment_id) values ($1, 'report', $2)`, [wid, again[0].id]));
ok(true, '댓글 신고는 의견함에 report로 들어감');
await fails(as(U2, () => q(`update public.feedback set status = 'done'`)).then(async () => {
  const r = await q(`select count(*)::int as n from public.feedback where status = 'done'`);
  if (r[0].n > 0) throw new Error('changed');
  throw new Error('no-op ok');
}), 'no-op ok', '일반 사용자는 의견 상태 변경 불가');

console.log('\n[통계]');
await as('anon', () => q('select public.record_view($1, $2)', [wid, 'visitor-aaaa-1111']));
await as('anon', () => q('select public.record_view($1, $2)', [wid, 'visitor-aaaa-1111']));
await as('anon', () => q('select public.record_view($1, $2)', [wid, 'visitor-bbbb-2222']));
await as('anon', () => q('select public.record_completion($1, $2, $3, $4)', [wid, 'visitor-aaaa-1111', ids[2], ids[3]]));
await as('anon', () => q('select public.record_completion($1, $2, $3, $4)', [wid, 'visitor-aaaa-1111', ids[2], ids[3]]));
await fails(as('anon', () => q('select * from public.worldcup_views')), 'permission denied', '조회 기록 테이블 직접 조회 불가');
await fails(as('anon', () => q('select public.admin_worldcup_stats()')), 'permission denied|admin_only', '비로그인은 운영 통계 불가');
const stats = await as(ADMIN, () => q('select * from public.admin_worldcup_stats() where worldcup_id = $1', [wid]));
ok(stats[0].views === 2 && stats[0].completions === 1 && stats[0].participants === 2 && stats[0].comments === 1, `운영 통계: 조회 2, 완주 1, 참여 2, 댓글 1 (실제 ${JSON.stringify(stats[0])})`);
const pub = await as('anon', () => q('select * from public.public_worldcup_stats()'));
ok(pub.length === 1 && pub[0].completions === 1, '홈 공개 통계: 완주 수');

console.log('\n[제안]');
const pid = (await as(U1, () => q(`insert into public.proposals (title, candidates) values ('카페 랭킹', $1) returning id`, [JSON.stringify([{ name: '창가', sub: '' }])])))[0].id;
ok(!!pid, '로그인 사용자 제안');
const u2p = await as(U2, () => q('select * from public.proposals'));
ok(u2p.length === 0, '다른 사람 제안은 안 보임');
const anonP = await as('anon', () => q('select * from public.proposals')).catch((e) => (/permission denied/.test(e.message) ? [] : Promise.reject(e)));
ok(anonP.length === 0, '비로그인은 제안을 못 봄');
await fails(as(U1, () => q(`insert into public.proposals (title, candidates) values ('x', $1)`, [JSON.stringify([{ name: '' }])])), 'invalid_candidates', '빈 이름 후보 제안 거부');
const fromProposal = (await as(ADMIN, () => q('select public.admin_save_worldcup($1, $2) as id', [payload({ title: '카페 랭킹', candidates: ['창가', '테라스', '루프탑', '한옥'].map((name) => ({ name, sub: '' })) }), pid])))[0].id;
const approved = await as(U1, () => q('select status, worldcup_id from public.proposals where id = $1', [pid]));
ok(approved[0].status === 'approved' && approved[0].worldcup_id === fromProposal, '승인하면 제안 상태가 approved, 랭킹과 연결');

console.log('\n[설문조사]');
const sid = (await as(U1, () => q(`insert into public.surveys (title, body, url, publish_on, expires_on, consent_at)
  values ('진주 버스 설문', '의견을 들려주세요', 'https://forms.gle/x', public.kst_today(), public.kst_today() + 7, now()) returning id`)))[0].id;
await as(U1, () => q(`insert into public.surveys (title, body, publish_on, expires_on, consent_at)
  values ('예약 글', '내일 공개', public.kst_today() + 1, public.kst_today() + 7, now())`));
const anonList = await as('anon', () => q('select * from public.list_surveys()'));
ok(anonList.length === 1 && anonList[0].is_mine === false && !('user_id' in anonList[0]), '비로그인: 게시일이 된 글만, 작성자 숨김');
const u1List = await as(U1, () => q('select * from public.list_surveys()'));
ok(u1List.length === 2 && u1List.every((s) => s.is_mine), '작성자: 예약 글도 보임, 내 글 표시');
await fails(as(U1, () => q(`insert into public.surveys (title, body, publish_on, expires_on, consent_at)
  values ('과거', '내용', public.kst_today() - 30, public.kst_today(), now())`)), 'row-level security', '게시일을 과거로 등록 불가');
await fails(as(U2, () => q(`insert into public.survey_requests (survey_id, kind, reason) values ($1, 'delete', '남의 글')`, [sid])), 'row-level security', '남의 설문에 삭제 요청 불가');
await fails(as(U1, () => q(`update public.surveys set title = '몰래 수정' where id = $1`, [sid])).then(async () => {
  const r = await q('select title from public.surveys where id = $1', [sid]);
  if (r[0].title !== '진주 버스 설문') throw new Error('changed');
  throw new Error('no-op ok');
}), 'no-op ok', '작성자도 직접 수정 불가 (승인 필요)');
const rid = (await as(U1, () => q(`insert into public.survey_requests (survey_id, kind, reason, payload) values ($1, 'edit', '오타', $2) returning id`, [sid, JSON.stringify({ title: '진주 시내버스 설문', body: '수정된 내용', url: '', publish_on: '2026-10-11', expires_on: '2026-10-30' })])))[0].id;
await as(ADMIN, () => q('select public.admin_review_survey_request($1, $2)', [rid, 'approve']));
const edited = await q('select title, url from public.surveys where id = $1', [sid]);
ok(edited[0].title === '진주 시내버스 설문' && edited[0].url === '', '운영자 승인 후 수정 반영');
const did = (await as(U1, () => q(`insert into public.survey_requests (survey_id, kind, reason) values ($1, 'delete', '마감') returning id`, [sid])))[0].id;
await as(ADMIN, () => q('select public.admin_review_survey_request($1, $2)', [did, 'approve']));
const afterDelete = await as('anon', () => q('select * from public.list_surveys()'));
ok(afterDelete.length === 0, '삭제 승인 후 목록에서 내려감');

console.log('\n[광고·설정]');
await fails(as(U1, () => q(`update public.ad_banners set title = '몰래' where slot = 1`)).then(async () => {
  const r = await q('select title from public.ad_banners where slot = 1');
  if (r[0].title !== '') throw new Error('changed');
  throw new Error('no-op ok');
}), 'no-op ok', '일반 사용자는 광고 수정 불가');
await as(ADMIN, () => q(`update public.ad_banners set title = '진주빵집', link_url = 'https://example.com', active = true where slot = 1`));
const ads = await as('anon', () => q('select * from public.ad_banners order by slot'));
ok(ads.length === 4 && ads[0].title === '진주빵집', '광고 4칸, 누구나 조회');
await fails(as(ADMIN, () => q(`update public.ad_banners set link_url = 'javascript:alert(1)' where slot = 2`)), 'check|violates', '광고 주소는 http(s)만');

console.log('\n[사진 저장소]');
await fails(as(U1, () => q(`insert into storage.objects (bucket_id, name) values ('media', 'thumbnails/x.webp')`)), 'row-level security', '일반 사용자는 공개 사진 업로드 불가');
await as(ADMIN, () => q(`insert into storage.objects (bucket_id, name) values ('media', 'thumbnails/x.webp')`));
ok(true, '운영자는 공개 사진 업로드 가능');
await as(U1, () => q(`insert into storage.objects (bucket_id, name) values ('proposal-media', $1)`, [U1 + '/a.webp']));
ok(true, '제안 사진은 내 폴더에 업로드 가능');
await fails(as(U1, () => q(`insert into storage.objects (bucket_id, name) values ('proposal-media', $1)`, [U2 + '/a.webp'])), 'row-level security', '다른 사람 폴더에는 업로드 불가');
const u2objs = await as(U2, () => q(`select * from storage.objects where bucket_id = 'proposal-media'`));
ok(u2objs.length === 0, '다른 사람의 제안 사진은 볼 수 없음');
const adminObjs = await as(ADMIN, () => q(`select * from storage.objects where bucket_id = 'proposal-media'`));
ok(adminObjs.length === 1, '운영자는 제안 사진을 볼 수 있음');

console.log('\n[운영자 표]');
await fails(as(U1, () => q('select * from public.admins')), 'permission denied', 'admins 표는 조회 불가');
await fails(as(U1, () => q(`insert into public.admins (user_id) values ($1)`, [U1])), 'permission denied', '스스로 운영자 등록 불가');

console.log(`\n결과: ${passes}개 통과, ${failures}개 실패`);
process.exit(failures ? 1 : 0);
