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
await db.exec(readFileSync(new URL('../supabase/migrations/20261012_seasons_records.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261012_seasons_records.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261012_media_duel_updates.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261012_media_duel_updates.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261012_engagement.sql', import.meta.url), 'utf8'));
await db.exec(readFileSync(new URL('../supabase/migrations/20261012_engagement.sql', import.meta.url), 'utf8'));
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

await rpc(admin, 'save_nickname', ['관리계정']);
await rpc(a, 'save_nickname', ['동네친구']);
await rpc(b, 'save_nickname', ['두번째']);
const names = ['가', '나', '다', '라', '마', '바', '사', '아'];
const draft = { title: '시즌1', status: 'published', candidates: names.map((name) => ({ name, sub: '', image_url: '' })) };
const cup = await rpc(admin, 'admin_save_worldcup', [draft]);
const candidates = await q('select * from candidates where worldcup_id=$1 order by sort_order', [cup]);
function matches(ids) {
  let r = [...ids],
    m = [];
  while (r.length > 1) {
    const n = [];
    for (let i = 0; i < r.length; i += 2) {
      m.push({ a: r[i], b: r[i + 1], winner: r[i] });
      n.push(r[i]);
    }
    r = n;
  }
  return m;
}
await rpc(a, 'submit_ballot', [cup, matches(candidates.map((c) => c.id)), false]);
await rpc(b, 'submit_ballot', [cup, matches(candidates.slice(0, 4).map((c) => c.id)), false]);
ok((await rpc(a, 'get_ranking', [cup])).participants === 2, '8후보의 8강/4강 기록 모두 반영');
await reject(
  a,
  'select submit_ballot($1,$2,true)',
  [cup, matches([candidates[0].id, candidates[0].id, candidates[1].id, candidates[2].id])],
  /invalid_matches/,
);
const edited = {
  ...draft,
  id: cup,
  candidates: [...candidates.slice(0, 7), { name: '새후보', sub: '', image_url: '' }, { name: '추가후보', sub: '', image_url: '' }],
};
await rpc(admin, 'admin_save_worldcup', [edited]);
ok((await q('select active from candidates where id=$1', [candidates[7].id]))[0].active === false, '시즌 중 제외는 소프트 삭제');
ok((await q('select count(*) n from ballots where worldcup_id=$1', [cup]))[0].n === 2, '후보 변경 후 기존 두 표 보존');
ok((await q('select count(*) n from candidates where worldcup_id=$1 and active', [cup]))[0].n === 9, '한 명씩 추가해서 9후보 공개');
await reject(b, 'select submit_ballot($1,$2,true)', [cup, matches(candidates.map((c) => c.id))], /invalid_matches/);
await reject(a, 'select admin_save_worldcup($1)', [edited], /admin_only/);
const active = await q('select * from candidates where worldcup_id=$1 and active order by sort_order', [cup]);
const season2 = await rpc(admin, 'admin_save_worldcup', [
  {
    ...draft,
    title: '시즌2',
    source_season_id: cup,
    candidates: active.map((c) => ({ name: c.name, sub: '', image_url: '', source_candidate_id: c.id })),
  },
]);
const current = await q('select * from candidates where worldcup_id=$1 order by sort_order', [season2]);
ok(current[0].lineage_id === candidates[0].lineage_id, '새 시즌 후보의 연결 ID 유지');
ok(
  (await q('select series_id from worldcups where id=$1', [cup]))[0].series_id ===
    (await q('select series_id from worldcups where id=$1', [season2]))[0].series_id,
  '시즌 계열 연결',
);
await rpc(a, 'submit_ballot', [season2, matches([current[1].id, current[0].id, current[2].id, current[3].id]), false]);
const integrated = await rpc(a, 'get_season_ranks', [season2]);
ok(integrated.season_count === 2, '통합 시즌 수');
ok(integrated.ranks.find((r) => r.candidate_id === current[0].id).rank === 1, '이전 시즌 2승 후보가 통합1위');
ok((await rpc(a, 'get_ranking', [season2])).rows[0].id === current[1].id, '현재 시즌1위는 별도 유지');
await rpc(admin, 'admin_save_worldcup', [
  { ...draft, id: season2, title: '시즌2', candidates: current.map((c, i) => ({ ...c, name: i === 0 ? '이름수정' : c.name })) },
]);
ok((await rpc(a, 'get_season_ranks', [season2])).ranks.find((r) => r.candidate_id === current[0].id).rank === 1, '이름 변경해도 통합 기록 유지');
await as(admin, () => q("update worldcups set status='archived' where id=$1", [cup]));
ok((await rpc(a, 'get_season_ranks', [season2])).ranks.find((r) => r.candidate_id === current[0].id).wins === 2, '보관 시즌도 집계');
await reject(null, 'select get_season_ranks($1)', [season2], /permission denied/);
const duel = (await as(admin, () => q("insert into duels(question,option_a,option_b) values('주제','찬성','반대') returning id")))[0].id;
await reject(a, 'select add_duel_comment($1,$2)', [duel, '투표 전'], /vote_first/);
await rpc(a, 'vote_duel', [duel, 'A']);
await rpc(b, 'vote_duel', [duel, 'B']);
await rpc(a, 'add_duel_comment', [duel, '찬성하는 이유']);
await rpc(b, 'add_duel_comment', [duel, '반대하는 이유']);
const comments = await rpc(a, 'get_duel_comments', [duel]);
ok(
  comments.length === 2 && comments.some((c) => c.choice === 'A' && c.is_mine) && comments.some((c) => c.choice === 'B' && !c.is_mine),
  '선택별 댓글 / 다른 쪽 읽기',
);
ok(
  comments.every((c) => !('user_id' in c)),
  '댓글에 내부 회원 ID 제외',
);
await reject(a, 'select add_duel_comment($1,$2)', [duel, '중복'], /duel_comment_exists/);
await reject(null, 'select add_duel_comment($1,$2)', [duel, '비로그인'], /permission denied/);
await rpc(c, 'save_nickname', ['세번째']);
await rpc(c, 'vote_duel', [duel, 'A']);
await reject(c, 'select add_duel_comment($1,$2)', [duel, '가'.repeat(151)], /check/);
await reject(a, "insert into duel_comments(duel_id,user_id,choice,body) values($1,$2,'B','선택위조')", [duel, a], /permission denied/);
await reject(a, "insert into records(title,image_url) values('도용','https://example.com/a.png')", [], /row-level security/);
await reject(null, "insert into records(title,image_url) values('도용','https://example.com/a.png')", [], /permission denied/);
await as(admin, () => q("insert into records(title,image_url) values('인포그래픽','https://example.com/a.png')"));
ok((await as(null, () => q('select title from records')))[0].title === '인포그래픽', '관리자 등록 기록은 공개 열람');
await as(a, () => q('delete from records'));
ok((await q('select count(*) n from records'))[0].n === 1, '일반계정 삭제 차단');
await as(admin, () => q('delete from records'));
ok((await q('select count(*) n from records'))[0].n === 0, '관리자만 기록 삭제');
console.log(`season DB checks: ${tests} passed`);

const beforeChange = await rpc(a, 'duel_result', [duel]);
await rpc(a, 'vote_duel', [duel, 'A']);
ok((await rpc(a,'get_duel_comments',[duel])).some(x=>x.is_mine), '동일 선택은 댓글 유지');
const changed = await rpc(a,'vote_duel',[duel,'B']);
ok(changed.total===beforeChange.total && changed.choice==='B', '선택 변경에도 참여 인원 유지');
ok(!(await rpc(a,'get_duel_comments',[duel])).some(x=>x.is_mine), '선택 변경 시 본인 댓글 삭제');
ok((await rpc(b,'get_duel_comments',[duel])).some(x=>x.is_mine), '다른 사람 댓글 보존');
await rpc(a,'add_duel_comment',[duel,'생각을 바꿨어요']);
ok((await rpc(a,'get_duel_comments',[duel])).find(x=>x.is_mine)?.choice==='B','변경한 선택에 새 댓글');
await reject(null,'select vote_duel($1,$2)',[duel,'A'],/permission denied/);
await as(admin,()=>q("insert into ad_contacts(slot,contact) values(1,'010-1234-5678')"));
ok((await as(null,()=>q('select * from ad_contacts'))).length===0,'비로그인 광고 연락처 숨김');
ok((await as(a,()=>q('select * from ad_contacts'))).length===0,'일반회원 광고 연락처 숨김');
ok((await as(admin,()=>q('select * from ad_contacts'))).length===1,'관리자 광고 연락처 열람');
ok((await as(a,()=>q("update duels set thumbnail_url='https://example.com/a.jpg' where id=$1 returning id",[duel]))).length===0,'일반회원 썸네일 편집 차단');
await as(admin,()=>q("update duels set thumbnail_url='https://example.com/a.jpg' where id=$1",[duel]));
ok((await as(null,()=>q('select thumbnail_url from duels where id=$1',[duel])))[0].thumbnail_url==='https://example.com/a.jpg','관리자 썸네일 저장 및 공개');
console.log(`media/season DB checks: ${tests} passed`);

await rpc(null,'record_duel_view',[duel,'visitor-example']);
await rpc(null,'record_duel_view',[duel,'visitor-example']);
await rpc(null,'record_duel_view',[duel,'visitor-second']);
const metric=(await rpc(admin,'admin_duel_stats')).find(x=>x.id===duel);
ok(metric.views===2 && metric.participants===3 && metric.comments===2,'양자택일 조회 중복 제거/참여/댓글 집계');
await reject(a,'select admin_duel_stats()',[],/admin_only/);
await rpc(a,'recommend_video',['https://youtu.be/abcdefghijk']);
const vid=(await rpc(null,'tv_page')).items[0].id;
await reject(null,'select react_video($1,$2)',[vid,'like'],/permission denied/);
await rpc(a,'react_video',[vid,'like']);await rpc(a,'react_video',[vid,'like']);
await rpc(b,'react_video',[vid,'like']);
let tv=(await rpc(a,'tv_page')).items[0];
ok(tv.likes===2&&tv.dislikes===0&&tv.reaction==='like','계정당 반응 하나/두 계정 합계');
await rpc(a,'react_video',[vid,'dislike']);tv=(await rpc(a,'tv_page')).items[0];
ok(tv.likes===1&&tv.dislikes===1&&tv.reaction==='dislike','반응 전환 시 이전 반응 제거');
await rpc(a,'react_video',[vid,null]);tv=(await rpc(a,'tv_page')).items[0];
ok(tv.likes===1&&tv.dislikes===0&&tv.reaction===null,'반응 취소 및 다시 조회');
ok((await rpc(null,'tv_page')).items[0].reaction===null,'비로그인 개별 반응 비공개');
await reject(a,'select * from tv_reactions',[],/permission denied/);
await reject(a,'select react_video($1,$2)',[vid,'invalid'],/invalid_choice/);
console.log(`engagement DB checks: ${tests} passed`);

await db.close();
