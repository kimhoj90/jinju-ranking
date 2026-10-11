-- 기존 운영 데이터 보존. schema.sql 설치 후 이 파일 실행. 재실행 가능.
begin;
create table if not exists public.profiles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 nickname text not null check(nickname ~ '^[가-힣A-Za-z0-9]{1,10}$'),
 nickname_changed_at timestamptz not null default now(), blocked boolean not null default false
);
create unique index if not exists profiles_nickname_unique on public.profiles(lower(nickname));
alter table public.profiles enable row level security;
drop policy if exists profiles_own on public.profiles;
create policy profiles_own on public.profiles for select to authenticated using(user_id=auth.uid());
grant select on public.profiles to authenticated;
revoke insert,update,delete on public.profiles from anon,authenticated;
create table if not exists public.community_settings (
 id int primary key check(id=1), banned_words text[] not null default array['시발','씨발','병신','개새끼','운영자','관리자'],
 nickname_days int not null default 30 check(nickname_days>=1), report_threshold int not null default 3 check(report_threshold>=1)
);
insert into public.community_settings(id) values(1) on conflict do nothing;
alter table public.community_settings enable row level security;
grant select,update on public.community_settings to authenticated;
drop policy if exists community_settings_admin on public.community_settings;
create policy community_settings_admin on public.community_settings for all to authenticated using(public.is_admin()) with check(public.is_admin());

create or replace function public.require_member() returns void language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype;
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 select * into p from public.profiles where user_id=auth.uid();
 if not found then raise exception 'nickname_required'; end if;
 if p.blocked then raise exception 'account_blocked'; end if;
end $$;
create or replace function public.save_nickname(p_nickname text) returns void language plpgsql security definer set search_path=public as $$
declare p public.profiles%rowtype; cfg public.community_settings%rowtype; n text:=btrim(p_nickname);
begin
 if auth.uid() is null then raise exception 'login_required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,11));
 select * into cfg from community_settings where id=1;
 if n is null or n !~ '^[가-힣A-Za-z0-9]{1,10}$' then raise exception 'invalid_nickname'; end if;
 if exists(select 1 from unnest(cfg.banned_words) w where w<>'' and strpos(lower(n),lower(w))>0) then raise exception 'banned_nickname'; end if;
 select * into p from profiles where user_id=auth.uid() for update;
 if found then
  if p.blocked then raise exception 'account_blocked'; end if;
  if p.nickname=n then return; end if;
  if p.nickname_changed_at + make_interval(days=>cfg.nickname_days)>now() then raise exception 'nickname_cooldown'; end if;
 end if;
 if exists(select 1 from profiles where lower(nickname)=lower(n) and user_id<>auth.uid()) then raise exception 'nickname_taken'; end if;
 begin
 insert into profiles(user_id,nickname) values(auth.uid(),n) on conflict(user_id) do update set nickname=n,nickname_changed_at=now();
 exception when unique_violation then raise exception 'nickname_taken'; end;
end $$;
create or replace function public.my_profile() returns jsonb language sql stable security definer set search_path=public as $$
 select jsonb_build_object('nickname',p.nickname,'blocked',p.blocked,'nickname_changed_at',p.nickname_changed_at,
 'next_change_at',p.nickname_changed_at+make_interval(days=>s.nickname_days)) from profiles p cross join community_settings s where p.user_id=auth.uid() and s.id=1
$$;
create or replace function public.admin_accounts() returns jsonb language plpgsql security definer set search_path=public as $$
begin if not public.is_admin() then raise exception 'admin_only'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('user_id',user_id,'nickname',nickname,'blocked',blocked) order by nickname) from profiles),'[]'::jsonb); end $$;
create or replace function public.admin_block_account(p_user_id uuid,p_blocked boolean) returns void language plpgsql security definer set search_path=public as $$
begin if not public.is_admin() then raise exception 'admin_only'; end if;
 if p_user_id=auth.uid() then raise exception '본인 계정은 차단할 수 없어요.'; end if;
 update profiles set blocked=p_blocked where user_id=p_user_id; end $$;
-- 기존 쓰기 경로에도 닉네임/차단 규칙 적용. created_at 조작 및 동시 일일제한 우회 방지.
create or replace function public.member_insert_guard() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform public.require_member();
 if new.user_id<>auth.uid() then raise exception 'forbidden'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,12));
 new.created_at:=now();
 return new;
end $$;
do $$ declare t text; begin foreach t in array array['comments','feedback','proposals','surveys','survey_requests'] loop
 execute format('drop trigger if exists a_member_guard on public.%I',t);
 execute format('create trigger a_member_guard before insert on public.%I for each row execute function public.member_insert_guard()',t);
end loop; end $$;

create table if not exists public.comment_likes (
 comment_id uuid references public.comments(id) on delete cascade, user_id uuid references auth.users(id) on delete cascade,
 primary key(comment_id,user_id)
);
alter table public.comment_likes enable row level security;
revoke all on public.comment_likes from anon,authenticated;
create or replace function public.set_comment_like(p_comment_id uuid,p_liked boolean) returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_member();
 if not exists(select 1 from comments c join worldcups w on w.id=c.worldcup_id where c.id=p_comment_id and not c.hidden and w.status='published') then raise exception 'not_found'; end if;
 if p_liked then insert into comment_likes values(p_comment_id,auth.uid()) on conflict do nothing;
 else delete from comment_likes where comment_id=p_comment_id and user_id=auth.uid(); end if;
end $$;
drop function if exists public.get_comments(uuid);
create function public.get_comments(p_worldcup_id uuid)
returns table(id uuid,body text,created_at timestamptz,is_mine boolean,hidden boolean,nickname text,likes bigint,liked boolean)
language plpgsql stable security definer set search_path=public as $$
begin perform public.require_member();
 return query select c.id,c.body,c.created_at,c.user_id=auth.uid(),c.hidden,coalesce(p.nickname,'닉네임 미설정'),
 (select count(*) from comment_likes l where l.comment_id=c.id),exists(select 1 from comment_likes l where l.comment_id=c.id and l.user_id=auth.uid())
 from comments c left join profiles p on p.user_id=c.user_id
 where c.worldcup_id=p_worldcup_id and (not c.hidden or c.user_id=auth.uid())
 and exists(select 1 from worldcups w where w.id=p_worldcup_id and w.status='published') order by c.created_at desc limit 300;
end $$;
-- 제안 취소는 행을 보존하여 일일 한도를 복구하지 않는다.
alter table public.proposals drop constraint if exists proposals_status_check;
alter table public.proposals add constraint proposals_status_check check(status in ('pending','approved','rejected','cancelled'));
alter table public.proposals add column if not exists review_note text not null default '' check(char_length(review_note)<=500);
create or replace function public.cancel_proposal(p_id uuid) returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_member(); update proposals set status='cancelled',reviewed_at=now() where id=p_id and user_id=auth.uid() and status='pending';
 if not found then raise exception 'not_pending'; end if; end $$;
create or replace function public.reject_proposal(p_id uuid,p_note text default '') returns void language plpgsql security definer set search_path=public as $$
begin if not public.is_admin() then raise exception 'admin_only'; end if;
 update proposals set status='rejected',review_note=coalesce(p_note,''),reviewed_at=now() where id=p_id and status='pending';
 if not found then raise exception 'not_pending'; end if; end $$;
create or replace function public.check_proposal() returns trigger language plpgsql set search_path=public as $$
declare c jsonb;
begin
 if jsonb_typeof(new.candidates) is distinct from 'array' then raise exception 'invalid_candidates'; end if;
 if jsonb_array_length(new.candidates) not in(4,8,16,32,64,128) then raise exception 'invalid_candidate_count'; end if;
 if new.thumbnail_path<>'' and (split_part(new.thumbnail_path,'/',1)<>new.user_id::text or new.thumbnail_path like '%..%') then raise exception 'invalid_image_path'; end if;
 for c in select * from jsonb_array_elements(new.candidates) loop
  if char_length(btrim(coalesce(c->>'name',''))) not between 1 and 30 or char_length(coalesce(c->>'sub',''))>60 then raise exception 'invalid_candidates'; end if;
  if coalesce(c->>'image_path','')<>'' and (split_part(c->>'image_path','/',1)<>new.user_id::text or (c->>'image_path') like '%..%') then raise exception 'invalid_image_path'; end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(new.candidates) x group by lower(btrim(x->>'name')) having count(*)>1) then raise exception 'duplicate_name'; end if;
 return new; end $$;
-- 비공개 버킷의 기존 접근 정책을 유지하고 업로드만 닉네임/차단 규칙 추가
create or replace function public.member_ready() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from profiles where user_id=auth.uid() and not blocked)
$$;
drop policy if exists "proposal media insert own" on storage.objects;
create policy "proposal media insert own" on storage.objects for insert to authenticated with check(bucket_id='proposal-media' and public.member_ready() and (storage.foldername(name))[1]=auth.uid()::text);
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp'],file_size_limit=2097152 where id='proposal-media';

create table if not exists public.duels (
 id uuid primary key default gen_random_uuid(), question text not null check(char_length(btrim(question)) between 1 and 100),
 option_a text not null check(char_length(btrim(option_a)) between 1 and 60), option_b text not null check(char_length(btrim(option_b)) between 1 and 60),
 description_a text not null default '' check(char_length(description_a)<=160), description_b text not null default '' check(char_length(description_b)<=160),
 status text not null default 'published' check(status in ('published','archived')),created_at timestamptz not null default now()
);
create table if not exists public.duel_votes (
 user_id uuid references auth.users(id) on delete cascade,duel_id uuid references duels(id) on delete cascade,
 choice text not null check(choice in ('A','B')),primary key(user_id,duel_id)
);
alter table duels enable row level security; alter table duel_votes enable row level security;
grant select,insert,update on duels to anon,authenticated;
drop policy if exists duels_read on duels; create policy duels_read on duels for select using(true);
drop policy if exists duels_admin on duels; create policy duels_admin on duels for all to authenticated using(public.is_admin()) with check(public.is_admin());
revoke all on duel_votes from anon,authenticated;
create or replace function public.duel_result(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare mine text; a bigint; b bigint;
begin perform public.require_member(); select choice into mine from duel_votes where duel_id=p_id and user_id=auth.uid();
 if mine is null then return jsonb_build_object('choice',null); end if;
 select count(*) filter(where choice='A'),count(*) filter(where choice='B') into a,b from duel_votes where duel_id=p_id;
 return jsonb_build_object('choice',mine,'a',a,'b',b,'total',a+b); end $$;
create or replace function public.vote_duel(p_id uuid,p_choice text) returns jsonb language plpgsql security definer set search_path=public as $$
begin perform public.require_member(); perform 1 from duels where id=p_id and status='published' for share;
 if not found then raise exception 'voting_closed'; end if;
 if p_choice is null or p_choice not in('A','B') then raise exception 'invalid_choice'; end if;
 begin insert into duel_votes values(auth.uid(),p_id,p_choice); exception when unique_violation then raise exception 'already_voted'; end;
 return public.duel_result(p_id); end $$;

create table if not exists public.tv_videos (
 id bigint generated always as identity primary key,user_id uuid not null references auth.users(id) on delete cascade,
 video_id text check(video_id ~ '^[A-Za-z0-9_-]{11}$'),week_start timestamptz not null,
 created_at timestamptz not null default now(),moderation text not null default 'visible' check(moderation in ('visible','hidden','restored','deleted')),
 unique(user_id,week_start)
);
alter table public.tv_videos alter column video_id drop not null;
create table if not exists public.tv_reports (
 video_id bigint references tv_videos(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,
 primary key(video_id,user_id)
);
alter table tv_videos enable row level security; alter table tv_reports enable row level security;
revoke all on tv_videos,tv_reports from anon,authenticated;
create or replace function public.tv_week(p_time timestamptz default now()) returns timestamptz language sql immutable as $$
 select (date_trunc('week',(p_time at time zone 'Asia/Seoul')-interval '9 hours')+interval '9 hours') at time zone 'Asia/Seoul'
$$;
create or replace function public.youtube_id(p_url text) returns text language plpgsql immutable as $$
declare id text; u text:=btrim(p_url);
begin
 if u ~ '^https://(www\.)?youtu\.be/[A-Za-z0-9_-]{11}([?][^#[:space:]]*)?(#[^[:space:]]*)?$' then id:=substring(u from 'youtu\.be/([A-Za-z0-9_-]{11})');
 elsif u ~ '^https://(www\.|m\.)?youtube\.com/shorts/[A-Za-z0-9_-]{11}([?][^#[:space:]]*)?(#[^[:space:]]*)?$' then id:=substring(u from '/shorts/([A-Za-z0-9_-]{11})');
 elsif u ~ '^https://(www\.|m\.)?youtube\.com/watch\?[^#[:space:]]+(#[^[:space:]]*)?$' then id:=substring(u from '[?&]v=([A-Za-z0-9_-]{11})(&|#|$)');
 end if;
 if id is null then raise exception 'invalid_youtube_url'; end if; return id; end $$;
create or replace function public.tv_eligibility() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin perform public.require_member(); return jsonb_build_object('can_recommend',not exists(select 1 from tv_videos where user_id=auth.uid() and week_start=tv_week()),'next_reset',tv_week()+interval '7 days'); end $$;
create or replace function public.recommend_video(p_url text) returns void language plpgsql security definer set search_path=public as $$
declare v text;
begin perform public.require_member(); v:=public.youtube_id(p_url);
 begin insert into tv_videos(user_id,video_id,week_start) values(auth.uid(),v,tv_week()); exception when unique_violation then raise exception 'weekly_limit'; end;
end $$;
create or replace function public.tv_page(p_page int default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare pages int; page int; items jsonb;
begin
 select greatest(1,ceil(count(*)/12.0)::int) into pages from tv_videos;
 page:=greatest(1,least(coalesce(p_page,pages),pages));
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'video_id',case when off then null else v.video_id end,'nickname',case when off then '' else coalesce(p.nickname,'닉네임 미설정') end,'off',off) order by v.id),'[]'::jsonb) into items
 from (select v.*, (v.moderation in ('hidden','deleted') or (v.moderation<>'restored' and (select count(*) from tv_reports r where r.video_id=v.id)>=(select report_threshold from community_settings where id=1))) as off
 from tv_videos v order by id limit 12 offset (page-1)*12) v left join profiles p on p.user_id=v.user_id;
 return jsonb_build_object('page',page,'pages',pages,'items',items); end $$;
create or replace function public.report_video(p_id bigint) returns void language plpgsql security definer set search_path=public as $$
begin perform public.require_member();
 perform 1 from tv_videos where id=p_id and moderation<>'deleted' for update; if not found then raise exception 'not_found'; end if;
 begin insert into tv_reports values(p_id,auth.uid()); exception when unique_violation then raise exception 'already_reported'; end;
end $$;
create or replace function public.admin_tv() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin if not is_admin() then raise exception 'admin_only'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.id desc) from (select t.*,p.nickname,(select count(*) from tv_reports r where r.video_id=t.id) reports from tv_videos t left join profiles p on p.user_id=t.user_id) v),'[]'::jsonb); end $$;
create or replace function public.admin_moderate_video(p_id bigint,p_action text) returns void language plpgsql security definer set search_path=public as $$
begin if not is_admin() then raise exception 'admin_only'; end if;
 if p_action not in('hidden','restored','deleted') or p_action is null then raise exception 'invalid_action'; end if;
 -- 삭제도 자리와 주간 사용 기록을 남김
 if exists(select 1 from tv_videos where id=p_id and moderation='deleted') then raise exception 'deleted_video'; end if;
 update tv_videos set moderation=p_action,video_id=case when p_action='deleted' then null else video_id end where id=p_id; end $$;

create or replace function public.submit_ballot(p_worldcup_id uuid, p_matches jsonb, p_replace boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  wc public.worldcups%rowtype;
  ids uuid[];
  n int;
  idx int := 0;
  k int;
  m jsonb;
  a uuid;
  b uuid;
  w uuid;
  seen uuid[] := '{}';
  cur uuid[];
  nxt uuid[] := '{}';
  clean jsonb := '[]'::jsonb;
  champion uuid;
  runner uuid;
  existing_id uuid;
begin
  perform public.require_member();
  if uid is null then
    raise exception 'login_required';
  end if;

  select * into wc from public.worldcups where id = p_worldcup_id and status = 'published';
  if not found then
    raise exception 'worldcup_not_found';
  end if;

  select array_agg(id) into ids from public.candidates where worldcup_id = p_worldcup_id and active;
  n := coalesce(array_length(ids, 1), 0);
  if n not in (4, 8, 16, 32, 64, 128) then
    raise exception 'invalid_worldcup';
  end if;

  if p_matches is null or jsonb_typeof(p_matches) <> 'array' or jsonb_array_length(p_matches) <> n - 1 then
    raise exception 'invalid_matches';
  end if;

  -- 첫 라운드: 모든 후보가 정확히 한 번씩 등장해야 한다
  for k in 0 .. (n / 2 - 1) loop
    m := p_matches -> idx;
    begin
      a := (m ->> 'a')::uuid;
      b := (m ->> 'b')::uuid;
      w := (m ->> 'winner')::uuid;
    exception when others then
      raise exception 'invalid_matches';
    end;
    if a is null or b is null or a = b
       or not (a = any (ids)) or not (b = any (ids))
       or a = any (seen) or b = any (seen)
       or w is null or w not in (a, b) then
      raise exception 'invalid_matches';
    end if;
    seen := seen || a || b;
    nxt := nxt || w;
    clean := clean || jsonb_build_array(jsonb_build_object('a', a, 'b', b, 'winner', w));
    idx := idx + 1;
  end loop;

  -- 다음 라운드부터: 이전 라운드 승자가 순서대로 둘씩 맞붙는다
  while array_length(nxt, 1) > 1 loop
    cur := nxt;
    nxt := '{}';
    for k in 0 .. (array_length(cur, 1) / 2 - 1) loop
      m := p_matches -> idx;
      begin
        a := (m ->> 'a')::uuid;
        b := (m ->> 'b')::uuid;
        w := (m ->> 'winner')::uuid;
      exception when others then
        raise exception 'invalid_matches';
      end;
      if a is distinct from cur[2 * k + 1] or b is distinct from cur[2 * k + 2]
         or w is null or w not in (a, b) then
        raise exception 'invalid_matches';
      end if;
      nxt := nxt || w;
      clean := clean || jsonb_build_array(jsonb_build_object('a', a, 'b', b, 'winner', w));
      idx := idx + 1;
    end loop;
  end loop;

  champion := nxt[1];
  runner := case when a = champion then b else a end;

  select id into existing_id from public.ballots where user_id = uid and worldcup_id = p_worldcup_id;
  if found then
    if not coalesce(p_replace, false) then
      return jsonb_build_object('status', 'exists');
    end if;
    update public.ballots
      set champion_id = champion, runner_up_id = runner, matches = clean, updated_at = now()
      where id = existing_id;
    return jsonb_build_object('status', 'replaced', 'champion_id', champion, 'runner_up_id', runner);
  end if;

  insert into public.ballots (user_id, worldcup_id, champion_id, runner_up_id, matches)
    values (uid, p_worldcup_id, champion, runner, clean);
  return jsonb_build_object('status', 'created', 'champion_id', champion, 'runner_up_id', runner);
end;
$$;

create or replace function public.get_ranking(p_worldcup_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
  participants int;
begin
  perform public.require_member();
  if auth.uid() is null then
    raise exception 'login_required';
  end if;
  if not exists (select 1 from public.worldcups where id = p_worldcup_id and (status = 'published' or public.is_admin())) then
    raise exception 'worldcup_not_found';
  end if;

  select count(*) into participants from public.ballots where worldcup_id = p_worldcup_id;

  with m as (
    select (x ->> 'a')::uuid as a, (x ->> 'b')::uuid as b, (x ->> 'winner')::uuid as winner
    from public.ballots bl, jsonb_array_elements(bl.matches) x
    where bl.worldcup_id = p_worldcup_id
  ),
  played as (
    select a as cid, (winner = a)::int as won from m
    union all
    select b as cid, (winner = b)::int as won from m
  ),
  agg as (
    select cid, sum(won)::int as match_wins, count(*)::int as match_count from played group by cid
  ),
  ranked as (
    select
      c.id, c.name, c.sub, c.image_url,
      (select count(*) from public.ballots bl where bl.worldcup_id = p_worldcup_id and bl.champion_id = c.id)::int as wins,
      (select count(*) from public.ballots bl where bl.worldcup_id = p_worldcup_id and (bl.champion_id = c.id or bl.runner_up_id = c.id))::int as finals,
      coalesce(agg.match_wins, 0) as match_wins,
      coalesce(agg.match_count, 0) as match_count,
      case when coalesce(agg.match_count, 0) = 0 then 0
           else round(agg.match_wins::numeric / agg.match_count, 4) end as win_rate
    from public.candidates c
    left join agg on agg.cid = c.id
    where c.worldcup_id = p_worldcup_id and c.active
  )
  select coalesce(jsonb_agg(to_jsonb(ranked) order by wins desc, finals desc, win_rate desc, name), '[]'::jsonb)
    into result from ranked;

  return jsonb_build_object('participants', participants, 'rows', result);
end;
$$;

create or replace function public.admin_save_worldcup(p jsonb, p_proposal_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  wid uuid := nullif(p ->> 'id', '')::uuid;
  old public.worldcups%rowtype;
  new_status text := coalesce(p ->> 'status', 'draft');
  c jsonb;
  cid uuid;
  keep uuid[] := '{}';
  pos int := 0;
  n int;
  was_published boolean := false;
  dup text;
begin
  perform public.require_member();
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  if p_proposal_id is not null then
    perform 1 from public.proposals where id=p_proposal_id and status='pending' for update;
    if not found then raise exception 'not_pending'; end if;
    if new_status <> 'published' then raise exception 'invalid_status'; end if;
  end if;
  if new_status not in ('draft', 'published', 'archived') then
    raise exception 'invalid_status';
  end if;
  if jsonb_typeof(p -> 'candidates') <> 'array' or jsonb_array_length(p -> 'candidates') > 128 then
    raise exception 'invalid_candidates';
  end if;

  if wid is not null then
    select * into old from public.worldcups where id = wid for update;
    if found then
      was_published := old.published_at is not null;
    end if;
  end if;

  if wid is null or old.id is null then
    insert into public.worldcups (id, title, description, keywords, status, featured, sort_order, thumbnail_url)
    values (
      coalesce(wid, gen_random_uuid()),
      btrim(p ->> 'title'),
      coalesce(p ->> 'description', ''),
      coalesce(p ->> 'keywords', ''),
      'draft',
      coalesce((p ->> 'featured')::boolean, false),
      coalesce((p ->> 'sort_order')::int, 0),
      coalesce(p ->> 'thumbnail_url', '')
    )
    returning id into wid;
  else
    update public.worldcups set
      title = btrim(p ->> 'title'),
      description = coalesce(p ->> 'description', ''),
      keywords = coalesce(p ->> 'keywords', ''),
      featured = coalesce((p ->> 'featured')::boolean, false),
      sort_order = coalesce((p ->> 'sort_order')::int, 0),
      thumbnail_url = coalesce(p ->> 'thumbnail_url', ''),
      updated_at = now()
    where id = wid;
  end if;

  select string_agg(nm, ', ') into dup from (
    select lower(btrim(x ->> 'name')) as nm
    from jsonb_array_elements(p -> 'candidates') x
    group by 1 having count(*) > 1
  ) d;
  if dup is not null then
    raise exception 'duplicate_name' using detail = dup;
  end if;

  -- 공개된 적 있는 랭킹은 후보 구성을 바꿀 수 없다 (이름·설명·사진만 수정, 구성 변경은 새 시즌)
  select coalesce(array_agg(nullif(x ->> 'id', '')::uuid), '{}') into keep
    from jsonb_array_elements(p -> 'candidates') x where nullif(x ->> 'id', '') is not null;
  if was_published and exists (
    select 1 from public.candidates where worldcup_id = wid and active and not (id = any (keep))) then
    raise exception 'published_locked';
  end if;
  -- 모두 잠시 비활성으로 돌린 뒤 목록 순서대로 다시 활성화한다 (이름을 서로 바꿔도 충돌하지 않게)
  update public.candidates set active = false where worldcup_id = wid and active;

  for c in select * from jsonb_array_elements(p -> 'candidates') loop
    cid := nullif(c ->> 'id', '')::uuid;
    if cid is not null and exists (select 1 from public.candidates where id = cid and worldcup_id = wid) then
      update public.candidates set
        name = btrim(c ->> 'name'),
        sub = coalesce(btrim(c ->> 'sub'), ''),
        image_url = coalesce(c ->> 'image_url', ''),
        sort_order = pos,
        active = true
      where id = cid;
    else
      if was_published then
        raise exception 'published_locked';
      end if;
      insert into public.candidates (id, worldcup_id, name, sub, image_url, sort_order)
      values (coalesce(cid, gen_random_uuid()), wid, btrim(c ->> 'name'), coalesce(btrim(c ->> 'sub'), ''),
              coalesce(c ->> 'image_url', ''), pos);
    end if;
    pos := pos + 1;
  end loop;

  select count(*) into n from public.candidates where worldcup_id = wid and active;
  if new_status = 'published' and n not in (4, 8, 16, 32, 64, 128) then
    raise exception 'invalid_candidate_count' using detail = n::text;
  end if;

  update public.worldcups set
    status = new_status,
    candidate_count = n,
    published_at = case when new_status = 'published' then coalesce(published_at, now()) else published_at end
  where id = wid;

  if p_proposal_id is not null then
    update public.proposals set status = 'approved', worldcup_id = wid, reviewed_at = now()
      where id = p_proposal_id;
  end if;

  return wid;
end;
$$;
revoke all on function public.require_member() from public,anon,authenticated;
revoke all on function public.save_nickname(text) from public,anon,authenticated;
revoke all on function public.my_profile() from public,anon,authenticated;
revoke all on function public.admin_accounts() from public,anon,authenticated;
revoke all on function public.admin_block_account(uuid,boolean) from public,anon,authenticated;
revoke all on function public.member_insert_guard() from public,anon,authenticated;
revoke all on function public.set_comment_like(uuid,boolean) from public,anon,authenticated;
revoke all on function public.get_comments(uuid) from public,anon,authenticated;
revoke all on function public.cancel_proposal(uuid) from public,anon,authenticated;
revoke all on function public.reject_proposal(uuid,text) from public,anon,authenticated;
revoke all on function public.member_ready() from public,anon,authenticated;
revoke all on function public.duel_result(uuid) from public,anon,authenticated;
revoke all on function public.vote_duel(uuid,text) from public,anon,authenticated;
revoke all on function public.tv_week(timestamptz) from public,anon,authenticated;
revoke all on function public.youtube_id(text) from public,anon,authenticated;
revoke all on function public.tv_eligibility() from public,anon,authenticated;
revoke all on function public.recommend_video(text) from public,anon,authenticated;
revoke all on function public.tv_page(int) from public,anon,authenticated;
revoke all on function public.report_video(bigint) from public,anon,authenticated;
revoke all on function public.admin_tv() from public,anon,authenticated;
revoke all on function public.admin_moderate_video(bigint,text) from public,anon,authenticated;
grant execute on function public.require_member() to authenticated;
grant execute on function public.save_nickname(text) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.admin_accounts() to authenticated;
grant execute on function public.admin_block_account(uuid,boolean) to authenticated;
grant execute on function public.set_comment_like(uuid,boolean) to authenticated;
grant execute on function public.get_comments(uuid) to authenticated;
grant execute on function public.cancel_proposal(uuid) to authenticated;
grant execute on function public.reject_proposal(uuid,text) to authenticated;
grant execute on function public.member_ready() to authenticated;
grant execute on function public.duel_result(uuid) to authenticated;
grant execute on function public.vote_duel(uuid,text) to authenticated;
grant execute on function public.tv_eligibility() to authenticated;
grant execute on function public.recommend_video(text) to authenticated;
grant execute on function public.tv_page(int) to authenticated;
grant execute on function public.report_video(bigint) to authenticated;
grant execute on function public.admin_tv() to authenticated;
grant execute on function public.admin_moderate_video(bigint,text) to authenticated;
grant execute on function public.tv_page(int) to anon;
create or replace function public.enforce_daily_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
  lim int;
  since timestamptz := (public.kst_today()::timestamp at time zone 'Asia/Seoul');
begin
  if public.is_admin() and tg_table_name <> 'proposals' then
    return new;
  end if;
  if tg_table_name = 'feedback' then
    lim := 5;
    select count(*) into n from public.feedback
      where user_id = new.user_id and worldcup_id = new.worldcup_id and created_at >= since;
    -- 신고는 같은 월드컵의 댓글만, 이의 제기 대상은 같은 월드컵의 후보만
    if new.comment_id is not null and not exists (
      select 1 from public.comments c where c.id = new.comment_id and c.worldcup_id = new.worldcup_id) then
      raise exception 'invalid_comment';
    end if;
    if new.candidate_id is not null and not exists (
      select 1 from public.candidates c where c.id = new.candidate_id and c.worldcup_id = new.worldcup_id) then
      raise exception 'invalid_candidate';
    end if;
    if new.type = 'report' and new.comment_id is null then
      raise exception 'invalid_comment';
    end if;
    if new.type <> 'report' and char_length(btrim(new.body)) = 0 then
      raise exception 'empty_body';
    end if;
  elsif tg_table_name = 'proposals' then
    lim := 3;
    select count(*) into n from public.proposals where user_id = new.user_id and created_at >= since;
  elsif tg_table_name = 'surveys' then
    lim := 3;
    select count(*) into n from public.surveys where user_id = new.user_id and created_at >= since;
  elsif tg_table_name = 'survey_requests' then
    lim := 5;
    select count(*) into n from public.survey_requests where user_id = new.user_id and created_at >= since;
  else
    return new;
  end if;
  if n >= lim then
    raise exception 'daily_limit' using detail = lim::text;
  end if;
  return new;
end;
$$;
commit;
