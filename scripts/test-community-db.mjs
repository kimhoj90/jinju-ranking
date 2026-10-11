import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
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
const sql = readFileSync(new URL('../supabase/migrations/20261012_community.sql', import.meta.url), 'utf8');
await db.exec(stubs);
await db.exec(readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8'));
await db.exec(sql);
await db.exec(sql);
let tests = 0;
const q = async (s, p) => (await db.query(s, p)).rows;
const ids = Array.from({ length: 16 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
const [admin, a, b, c, noNick] = ids;
await q('insert into auth.users(id) select unnest($1::uuid[])', [ids]);
await q('insert into admins(user_id) values($1)', [admin]);
async function as(u, fn) {
  await db.exec('reset role');
  await q("select set_config('request.jwt.claim.sub',$1,false)", [u || '']);
  await db.exec(u ? 'set role authenticated' : 'set role anon');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
async function reject(u, s, p, pattern) {
  await assert.rejects(
    as(u, () => q(s, p)),
    pattern,
  );
  tests++;
}
function ok(v, label) {
  assert.ok(v, label);
  tests++;
  console.log('✓ ' + label);
}
const rpc = async (u, name, args = []) =>
  as(u, () =>
    q(
      `select ${name === 'get_comments' ? '* from ' : ''}public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) ${name === 'get_comments' ? '' : 'as value'}`,
      args,
    ),
  ).then((r) => (name === 'get_comments' ? r : r[0].value));
await reject(null, 'select save_nickname($1)', ['손님'], /permission denied/);
await rpc(admin, 'save_nickname', ['관리계정']);
await rpc(a, 'save_nickname', ['진주사람']);
await reject(b, 'select save_nickname($1)', ['진주사람'], /nickname_taken/);
await reject(b, 'select save_nickname($1)', ['운영자'], /banned_nickname/);
for (const bad of ['', '공백 이름', '12345678901', 'hello!']) await reject(b, 'select save_nickname($1)', [bad], /invalid_nickname/);
await rpc(b, 'save_nickname', ['Jinju']);
await reject(c, 'select save_nickname($1)', ['jinju'], /nickname_taken/);
await rpc(c, 'save_nickname', ['동네친구']);
await reject(a, 'select save_nickname($1)', ['새이름'], /nickname_cooldown/);
await q("update profiles set nickname_changed_at=now()-interval '31 days' where user_id=$1", [a]);
await rpc(a, 'save_nickname', ['새이름']);
ok((await rpc(a, 'my_profile')).nickname === '새이름', '30일 이후 닉네임 변경');
ok((await as(a, () => q('select * from profiles'))).length === 1, 'profiles 직접 조회는 자기 계정만');
ok((await as(b, () => q('select * from profiles where user_id=$1', [a]))).length === 0, '다른 계정 식별 정보 차단');
await reject(a, 'update profiles set blocked=false', [], /permission denied/);
await reject(a, 'select admin_accounts()', [], /admin_only/);
const candidates = ['하나', '둘', '셋', '넷'].map((name) => ({
  name,
  sub: '',
  image_url: '',
}));
const draft = { title: '테스트랭킹', status: 'published', candidates };
const cup = await rpc(admin, 'admin_save_worldcup', [draft]);
await reject(noNick, "insert into comments(worldcup_id,body) values($1,'안녕')", [cup], /nickname_required/);
await reject(null, "insert into comments(worldcup_id,body) values($1,'안녕')", [cup], /permission denied/);
await as(a, () => q("insert into comments(worldcup_id,body) values($1,'첫 의견')", [cup]));
const comment = (await rpc(a, 'get_comments', [cup]))[0];
ok(comment.nickname === '새이름' && !('user_id' in comment), '댓글 닉네임만 공개');
await reject(a, "insert into comments(worldcup_id,body) values($1,'두 의견')", [cup], /unique/);
await rpc(a, 'set_comment_like', [comment.id, true]);
await rpc(b, 'set_comment_like', [comment.id, true]);
let comments = await rpc(a, 'get_comments', [cup]);
ok(Number(comments[0].likes) === 2 && comments[0].liked, '두 계정 공감 2개 / 재조회 유지');
await rpc(a, 'set_comment_like', [comment.id, true]);
ok(Number((await rpc(a, 'get_comments', [cup]))[0].likes) === 2, '중복 공감 멱등');
await rpc(a, 'set_comment_like', [comment.id, false]);
ok(Number((await rpc(a, 'get_comments', [cup]))[0].likes) === 1, '공감 취소');
await reject(null, 'select set_comment_like($1,true)', [comment.id], /permission denied/);
await reject(noNick, 'select set_comment_like($1,true)', [comment.id], /nickname_required/);
await as(admin, () => q('update comments set hidden=true where id=$1', [comment.id]));
ok((await rpc(b, 'get_comments', [cup])).length === 0, '운영자 숨김');
await reject(b, 'select set_comment_like($1,true)', [comment.id], /not_found/);
await as(a, () => q('delete from comments where id=$1', [comment.id]));
await as(a, () => q("insert into comments(worldcup_id,body) values($1,'새 의견')", [cup]));
ok(true, '자기 댓글 삭제 후 재작성');
const proposal = candidates.map(({ name, sub }) => ({
  name,
  sub,
  image_path: '',
}));
const propose = async (u, title = '제안') =>
  as(u, () => q('insert into proposals(title,candidates) values($1,$2) returning id', [title, JSON.stringify(proposal)])).then((r) => r[0].id);
const pid = await propose(a);
ok((await as(b, () => q('select id from proposals where id=$1', [pid]))).length === 0, '제안 타인 비공개');
await reject(b, 'select admin_save_worldcup($1,$2)', [draft, pid], /admin_only/);
await reject(a, 'select reject_proposal($1,$2)', [pid, '반려'], /admin_only/);
await rpc(admin, 'admin_save_worldcup', [{ ...draft, title: '승인된 제안' }, pid]);
ok((await q('select status from proposals where id=$1', [pid]))[0].status === 'approved', '관리자 승인 후 게시');
await reject(admin, 'select admin_save_worldcup($1,$2)', [draft, pid], /not_pending/);
const cancel = await propose(a);
await rpc(a, 'cancel_proposal', [cancel]);
await propose(a);
await reject(a, 'insert into proposals(title,candidates) values($1,$2)', ['한도초과', JSON.stringify(proposal)], /daily_limit/);
await reject(b, 'insert into proposals(title,candidates) values($1,$2)', ['부족', JSON.stringify(proposal.slice(0, 3))], /invalid_candidate_count/);
await reject(
  b,
  'insert into proposals(title,candidates,thumbnail_path) values($1,$2,$3)',
  ['남의사진', JSON.stringify(proposal), a + '/image.webp'],
  /invalid_image_path/,
);
await as(a, () => q("insert into storage.objects(bucket_id,name) values('proposal-media',$1)", [a + '/image.webp']));
ok((await as(b, () => q("select * from storage.objects where bucket_id='proposal-media'"))).length === 0, '제안 이미지 타인 비공개');
await reject(
  null,
  "insert into surveys(title,body,publish_on,expires_on,consent_at) values('설문','내용',current_date,current_date,now())",
  [],
  /permission denied/,
);
await reject(
  noNick,
  "insert into surveys(title,body,publish_on,expires_on,consent_at) values('설문','내용',current_date,current_date,now())",
  [],
  /nickname_required/,
);
await as(a, () => q("insert into surveys(title,body,publish_on,expires_on,consent_at) values('설문','내용',current_date,current_date,now())"));
ok(true, '로그인·닉네임 설정 후 설문 등록');
const duel = (await as(admin, () => q("insert into duels(question,option_a,option_b) values('어느 쪽?','A안','B안') returning id")))[0].id;
await reject(a, "insert into duels(question,option_a,option_b) values('해킹','A','B')", [], /row-level security/);
ok((await rpc(a, 'duel_result', [duel])).total === undefined, '투표 전 서버도 결과 미공개');
await reject(null, 'select vote_duel($1,$2)', [duel, 'A'], /permission denied/);
await reject(noNick, 'select vote_duel($1,$2)', [duel, 'A'], /nickname_required/);
await rpc(a, 'vote_duel', [duel, 'A']);
await rpc(b, 'vote_duel', [duel, 'B']);
const tally = await rpc(a, 'duel_result', [duel]);
ok(tally.total === 2 && tally.a === 1 && tally.b === 1 && tally.choice === 'A', '양자택일 두 계정 집계·내 선택');
await reject(a, 'select vote_duel($1,$2)', [duel, 'B'], /already_voted/);
await reject(a, 'select * from duel_votes', [], /permission denied/);
await as(admin, () => q("update duels set status='archived' where id=$1", [duel]));
await reject(c, 'select vote_duel($1,$2)', [duel, 'A'], /voting_closed/);
const video = 'dQw4w9WgXcQ';
for (const link of [`https://youtu.be/${video}`, `https://www.youtube.com/watch?v=${video}&t=2`, `https://youtube.com/shorts/${video}`])
  ok((await q('select youtube_id($1) id', [link]))[0].id === video, '유튜브 허용 링크 검증');
for (const link of [
  'https://youtube.com.evil.test/watch?v=' + video,
  'https://evil.test/' + video,
  'https://youtube.com/embed/' + video,
  'https://youtu.be/short',
])
  await assert.rejects(q('select youtube_id($1)', [link]), /invalid_youtube_url/);
ok((await q("select tv_week('2026-10-12T08:59:59+09:00')=tv_week('2026-10-05T09:00:00+09:00') as valid"))[0].valid, '월요일 오전 9시 직전 이전 주');
ok((await q("select tv_week('2026-10-12T09:00:00+09:00')='2026-10-12T09:00:00+09:00'::timestamptz as valid"))[0].valid, '월요일 오전 9시 갱신');
await rpc(a, 'recommend_video', ['https://youtu.be/' + video]);
await rpc(b, 'recommend_video', ['https://youtu.be/' + video]);
let tv = await rpc(null, 'tv_page');
ok(tv.items.length === 2 && tv.items[0].nickname === '새이름' && tv.items[1].nickname === 'Jinju', 'TV 두 칸 순차 표시 / 중복 영상 허용');
ok(!('user_id' in tv.items[0]), '공개 TV에 계정 식별값 미포함');
await reject(a, 'select recommend_video($1)', ['https://youtu.be/' + video], /weekly_limit/);
await rpc(admin, 'admin_moderate_video', [tv.items[0].id, 'deleted']);
await reject(a, 'select recommend_video($1)', ['https://youtu.be/' + video], /weekly_limit/);
ok((await rpc(null, 'tv_page')).items[0].off, '삭제된 칸 유지');
ok((await q('select video_id from tv_videos where id=$1', [tv.items[0].id]))[0].video_id === null, '삭제 시 영상 ID 제거');
await reject(admin, 'select admin_moderate_video($1,$2)', [tv.items[0].id, 'restored'], /deleted_video/);
const vid = tv.items[1].id;
await rpc(a, 'report_video', [vid]);
await rpc(b, 'report_video', [vid]);
await rpc(c, 'report_video', [vid]);
ok((await rpc(null, 'tv_page')).items[1].off, '신고 세 건 자동 숨김');
await reject(a, 'select report_video($1)', [vid], /already_reported/);
await reject(null, 'select report_video($1)', [vid], /permission denied/);
await rpc(admin, 'admin_moderate_video', [vid, 'restored']);
ok(!(await rpc(null, 'tv_page')).items[1].off, '운영자 복구');
await rpc(admin, 'admin_moderate_video', [vid, 'hidden']);
ok((await rpc(null, 'tv_page')).items[1].off, '운영자 수동 숨김');
await reject(a, 'select admin_moderate_video($1,$2)', [vid, 'restored'], /admin_only/);
await rpc(admin, 'admin_block_account', [c, true]);
for (const [sql, args] of [
  ['select recommend_video($1)', ['https://youtu.be/' + video]],
  ["insert into comments(worldcup_id,body) values($1,'차단')", [cup]],
  ['insert into proposals(title,candidates) values($1,$2)', ['차단', JSON.stringify(proposal)]],
])
  await reject(c, sql, args, /account_blocked/);
await reject(a, 'select admin_block_account($1,true)', [b], /admin_only/);
await rpc(admin, 'admin_block_account', [c, false]);
await rpc(c, 'recommend_video', ['https://youtu.be/' + video]);
for (let i = 5; i < 15; i++) {
  await rpc(ids[i], 'save_nickname', ['사람' + i]);
  await rpc(ids[i], 'recommend_video', ['https://youtu.be/' + video]);
}
tv = await rpc(null, 'tv_page');
ok(tv.page === 2 && tv.pages === 2 && tv.items.length === 1, '13번째 추천은 최신 2페이지');
ok((await rpc(null, 'tv_page', [1])).items.length === 12, '이전 페이지 12칸 유지');
await reject(a, 'select * from tv_videos', [], /permission denied/);
await reject(a, 'select * from tv_reports', [], /permission denied/);
console.log(`community DB checks: ${tests} passed`);
await db.close();
