-- community 마이그레이션 적용 후 실행. 기존 시즌/표/후보 행을 보존한다.
begin;
alter table public.worldcups add column if not exists series_id uuid not null default gen_random_uuid();
alter table public.candidates add column if not exists lineage_id uuid;
update public.candidates set lineage_id=id where lineage_id is null;
alter table public.candidates alter column lineage_id set not null;
alter table public.candidates alter column lineage_id set default gen_random_uuid();
create index if not exists worldcups_series_idx on public.worldcups(series_id);
create index if not exists candidates_lineage_idx on public.candidates(lineage_id);
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
  source_id uuid := nullif(p->>'source_season_id','')::uuid;
  family uuid;
  lineage uuid;
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
    family:=gen_random_uuid();
    if source_id is not null then
      select series_id into family from public.worldcups where id=source_id;
      if not found then raise exception 'invalid_source_season'; end if;
    end if;
    insert into public.worldcups (id, title, description, keywords, status, featured, sort_order, thumbnail_url,series_id)
    values (
      coalesce(wid, gen_random_uuid()),
      btrim(p ->> 'title'),
      coalesce(p ->> 'description', ''),
      coalesce(p ->> 'keywords', ''),
      'draft',
      coalesce((p ->> 'featured')::boolean, false),
      coalesce((p ->> 'sort_order')::int, 0),
      coalesce(p ->> 'thumbnail_url', ''),family
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

  -- 제외한 후보는 행을 지우지 않고 비활성화해 이전 표를 유지한다.
  select coalesce(array_agg(nullif(x ->> 'id', '')::uuid), '{}') into keep
    from jsonb_array_elements(p -> 'candidates') x where nullif(x ->> 'id', '') is not null;
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
      lineage := gen_random_uuid();
      if nullif(c->>'source_candidate_id','') is not null then
        select lineage_id into lineage from public.candidates where id=(c->>'source_candidate_id')::uuid and worldcup_id=source_id;
        if not found then raise exception 'invalid_source_candidate'; end if;
      end if;
      insert into public.candidates (id, worldcup_id, name, sub, image_url, sort_order, lineage_id)
      values (coalesce(cid, gen_random_uuid()), wid, btrim(c ->> 'name'), coalesce(btrim(c ->> 'sub'), ''),
              coalesce(c ->> 'image_url', ''), pos, lineage);
    end if;
    pos := pos + 1;
  end loop;

  select count(*) into n from public.candidates where worldcup_id = wid and active;
  if new_status = 'published' and n not between 4 and 128 then
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
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || p_worldcup_id::text,21));
  if uid is null then
    raise exception 'login_required';
  end if;

  select * into wc from public.worldcups where id = p_worldcup_id and status = 'published' for share;
  if not found then
    raise exception 'worldcup_not_found';
  end if;

  select array_agg(id) into ids from public.candidates where worldcup_id = p_worldcup_id and active;
  if p_matches is null or jsonb_typeof(p_matches) <> 'array' then raise exception 'invalid_matches'; end if;
  n:=jsonb_array_length(p_matches)+1;
  if n not in (4,8,16,32,64,128) or n>coalesce(array_length(ids,1),0) then raise exception 'invalid_matches'; end if;

  -- 첫 라운드: 선택된 라운드의 후보가 정확히 한 번씩 등장해야 한다
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

create or replace function public.get_season_ranks(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare family uuid; seasons int; ranks jsonb;
begin
 perform public.require_member();
 select series_id into family from worldcups where id=p_id and (status='published' or is_admin());
 if not found then raise exception 'worldcup_not_found'; end if;
 select count(*) into seasons from worldcups where series_id=family and published_at is not null;
 with members as (select c.* from candidates c join worldcups w on w.id=c.worldcup_id where w.series_id=family and w.published_at is not null),
 ballots_all as(select b.* from ballots b join worldcups w on w.id=b.worldcup_id where w.series_id=family and w.published_at is not null),
 games as(select (x->>'a')::uuid a,(x->>'b')::uuid b,(x->>'winner')::uuid winner from ballots_all bl,jsonb_array_elements(bl.matches) x),
 plays as(select a cid,(winner=a)::int won from games union all select b cid,(winner=b)::int won from games),
 totals as(select c.lineage_id,min(c.name) name,
 sum((select count(*) from ballots_all b where b.champion_id=c.id)) wins,
 sum((select count(*) from ballots_all b where b.champion_id=c.id or b.runner_up_id=c.id)) finals,
 sum((select coalesce(sum(won),0) from plays where cid=c.id)) mw,
 sum((select count(*) from plays where cid=c.id)) mc from members c group by c.lineage_id),
 ordered as(select *,row_number() over(order by wins desc,finals desc,case when mc=0 then 0 else mw/mc end desc,name,lineage_id) rank from totals)
 select coalesce(jsonb_agg(jsonb_build_object('candidate_id',c.id,'rank',r.rank,'wins',r.wins) order by r.rank),'[]'::jsonb) into ranks
 from candidates c join ordered r using(lineage_id) where c.worldcup_id=p_id and c.active;
 return jsonb_build_object('season_count',seasons,'ranks',ranks); end $$;

create table if not exists public.duel_comments (
 id uuid primary key default gen_random_uuid(),duel_id uuid not null references duels(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 choice text not null check(choice in ('A','B')),body text not null check(char_length(btrim(body)) between 1 and 150),
 created_at timestamptz not null default now(),unique(user_id,duel_id)
);
alter table duel_comments enable row level security;
revoke all on duel_comments from anon,authenticated;
create or replace function public.add_duel_comment(p_id uuid,p_body text) returns void language plpgsql security definer set search_path=public as $$
declare vote text;
begin perform require_member();
 select choice into vote from duel_votes where user_id=auth.uid() and duel_id=p_id;
 if vote is null then raise exception 'vote_first'; end if;
 if not exists(select 1 from duels where id=p_id and status='published') then raise exception 'voting_closed'; end if;
 begin insert into duel_comments(duel_id,user_id,choice,body) values(p_id,auth.uid(),vote,btrim(p_body));
 exception when unique_violation then raise exception 'duel_comment_exists'; end;
end $$;
create or replace function public.get_duel_comments(p_id uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 -- 투표 전에는 선택별 의견도 가려 결과가 새어나가지 않도록 한다.
 perform require_member();
 if not exists(select 1 from duel_votes where user_id=auth.uid() and duel_id=p_id) then raise exception 'vote_first'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'choice',c.choice,'body',c.body,'nickname',p.nickname,'created_at',c.created_at,'is_mine',c.user_id=auth.uid()) order by c.created_at desc) from duel_comments c left join profiles p using(user_id) where c.duel_id=p_id),'[]'::jsonb);
end $$;

create table if not exists public.records (
 id uuid primary key default gen_random_uuid(),title text not null check(char_length(btrim(title)) between 1 and 120),
 image_url text not null check(image_url ~ '^https://' or image_url ~ '^/images/'),created_at timestamptz not null default now()
);
alter table records enable row level security;
grant select on records to anon,authenticated; grant insert,update,delete on records to authenticated;
drop policy if exists records_read on records; create policy records_read on records for select using(true);
drop policy if exists records_admin on records; create policy records_admin on records for all to authenticated using(is_admin()) with check(is_admin());
revoke all on function public.get_season_ranks(uuid),public.add_duel_comment(uuid,text),public.get_duel_comments(uuid) from public,anon;
grant execute on function public.get_season_ranks(uuid),public.add_duel_comment(uuid,text),public.get_duel_comments(uuid) to authenticated;
commit;
