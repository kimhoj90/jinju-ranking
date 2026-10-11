-- =====================================================================
-- 진주랭킹 Supabase 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여 넣고 Run 하세요.
-- 여러 번 실행해도 안전하도록 작성했습니다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. 공통 함수
-- ---------------------------------------------------------------------

-- 한국 시간 기준 오늘 날짜
create or replace function public.kst_today()
returns date
language sql
stable
as $$ select (now() at time zone 'Asia/Seoul')::date $$;

-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 운영자 목록. 처음 한 번 SQL로 직접 등록한다 (README 참고).
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 랭킹(월드컵)
create table if not exists public.worldcups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 160),
  keywords text not null default '' check (char_length(keywords) <= 1230),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  candidate_count int not null default 0,
  thumbnail_url text not null default '',
  featured boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- 후보. 이름을 고쳐도 기록이 유지되도록 id로 관리하고, 지우지 않고 active=false 로 바꾼다.
create table if not exists public.candidates (
  id uuid primary key default gen_random_uuid(),
  worldcup_id uuid not null references public.worldcups (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 30),
  sub text not null default '' check (char_length(sub) <= 60),
  image_url text not null default '',
  sort_order int not null default 0,
  active boolean not null default true
);
create unique index if not exists candidates_active_name_uniq
  on public.candidates (worldcup_id, lower(btrim(name))) where active;
create index if not exists candidates_worldcup_idx on public.candidates (worldcup_id);

-- 투표 기록: 로그인 사용자가 월드컵마다 반영한 결과 1개
create table if not exists public.ballots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  worldcup_id uuid not null references public.worldcups (id) on delete cascade,
  champion_id uuid not null references public.candidates (id),
  runner_up_id uuid not null references public.candidates (id),
  matches jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, worldcup_id)
);
create index if not exists ballots_worldcup_idx on public.ballots (worldcup_id);

-- 댓글: 월드컵마다 1인 1댓글
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worldcup_id uuid not null references public.worldcups (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 200),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, worldcup_id)
);

-- 의견(후보 추천, 이의 제기, 댓글 신고)
create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  worldcup_id uuid not null references public.worldcups (id) on delete cascade,
  candidate_id uuid references public.candidates (id) on delete set null,
  comment_id uuid references public.comments (id) on delete set null,
  type text not null check (type in ('suggest', 'objection', 'report')),
  body text not null default '' check (char_length(body) <= 300),
  status text not null default 'new' check (status in ('new', 'reviewed', 'done')),
  created_at timestamptz not null default now()
);
create index if not exists feedback_worldcup_idx on public.feedback (worldcup_id, created_at desc);

-- 랭킹 제안: 승인 전에는 제안자와 운영자만 볼 수 있다
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 160),
  keywords text not null default '' check (char_length(keywords) <= 1230),
  thumbnail_path text not null default '',
  candidates jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  worldcup_id uuid references public.worldcups (id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- 설문조사 게시판
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  url text not null default '' check (url = '' or url ~* '^https?://'),
  publish_on date not null,
  expires_on date not null,
  consent_at timestamptz not null,
  deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (expires_on >= publish_on)
);

-- 설문 게시글 수정·삭제 요청 (운영자 승인 후 반영)
create table if not exists public.survey_requests (
  id uuid primary key default gen_random_uuid(),
  survey_id uuid not null references public.surveys (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('edit', 'delete')),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  payload jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

-- 상단 광고 배너 4칸
create table if not exists public.ad_banners (
  slot int primary key check (slot between 1 and 4),
  title text not null default '' check (char_length(title) <= 60),
  image_url text not null default '',
  link_url text not null default '' check (link_url = '' or link_url ~* '^https?://'),
  active boolean not null default false
);
insert into public.ad_banners (slot) values (1), (2), (3), (4) on conflict do nothing;

-- 사이트 설정 (한 줄)
create table if not exists public.site_settings (
  id int primary key default 1 check (id = 1),
  contact_email text not null default ''
);
insert into public.site_settings (id) values (1) on conflict do nothing;

-- 통계: 조회(브라우저별 하루 1회), 완주(브라우저별 1회). 방문자 값은 해시로만 저장한다.
create table if not exists public.worldcup_views (
  worldcup_id uuid not null references public.worldcups (id) on delete cascade,
  visitor_hash text not null,
  day date not null,
  primary key (worldcup_id, visitor_hash, day)
);
create table if not exists public.play_completions (
  worldcup_id uuid not null references public.worldcups (id) on delete cascade,
  visitor_hash text not null,
  champion_id uuid references public.candidates (id) on delete set null,
  runner_up_id uuid references public.candidates (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (worldcup_id, visitor_hash)
);

-- ---------------------------------------------------------------------
-- 2. 운영자 확인
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;

-- ---------------------------------------------------------------------
-- 3. 행 단위 접근 규칙(RLS)
-- ---------------------------------------------------------------------
alter table public.admins enable row level security;
alter table public.worldcups enable row level security;
alter table public.candidates enable row level security;
alter table public.ballots enable row level security;
alter table public.comments enable row level security;
alter table public.feedback enable row level security;
alter table public.proposals enable row level security;
alter table public.surveys enable row level security;
alter table public.survey_requests enable row level security;
alter table public.ad_banners enable row level security;
alter table public.site_settings enable row level security;
alter table public.worldcup_views enable row level security;
alter table public.play_completions enable row level security;

-- admins, worldcup_views, play_completions: 정책 없음 = 직접 접근 불가 (함수로만)

drop policy if exists worldcups_read on public.worldcups;
create policy worldcups_read on public.worldcups for select
  using (status = 'published' or public.is_admin());
drop policy if exists worldcups_admin_write on public.worldcups;
create policy worldcups_admin_write on public.worldcups for all
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists candidates_read on public.candidates;
create policy candidates_read on public.candidates for select
  using (
    public.is_admin()
    or exists (select 1 from public.worldcups w where w.id = worldcup_id and w.status = 'published')
  );
drop policy if exists candidates_admin_write on public.candidates;
create policy candidates_admin_write on public.candidates for all
  using (public.is_admin()) with check (public.is_admin());

-- 투표: 본인 행만 조회. 추가·수정·삭제는 submit_ballot 함수로만.
drop policy if exists ballots_read_own on public.ballots;
create policy ballots_read_own on public.ballots for select
  using (user_id = auth.uid());

-- 댓글: 본인 행만 직접 조회(목록은 get_comments 함수), 본인만 추가, 본인·운영자만 삭제, 운영자만 숨김
drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and hidden = false
    and exists (select 1 from public.worldcups w where w.id = worldcup_id and w.status = 'published')
  );
drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists comments_admin_update on public.comments;
create policy comments_admin_update on public.comments for update
  using (public.is_admin()) with check (public.is_admin());

-- 의견: 본인 user_id 로만 추가, 본인·운영자만 조회, 운영자만 상태 변경
drop policy if exists feedback_insert on public.feedback;
create policy feedback_insert on public.feedback for insert
  with check (auth.uid() is not null and user_id = auth.uid() and status = 'new');
drop policy if exists feedback_read on public.feedback;
create policy feedback_read on public.feedback for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists feedback_admin_update on public.feedback;
create policy feedback_admin_update on public.feedback for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists feedback_admin_delete on public.feedback;
create policy feedback_admin_delete on public.feedback for delete
  using (public.is_admin());

-- 제안: 본인만 추가, 본인·운영자만 조회, 운영자만 처리
drop policy if exists proposals_insert on public.proposals;
create policy proposals_insert on public.proposals for insert
  with check (auth.uid() is not null and user_id = auth.uid() and status = 'pending' and worldcup_id is null);
drop policy if exists proposals_read on public.proposals;
create policy proposals_read on public.proposals for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists proposals_admin_update on public.proposals;
create policy proposals_admin_update on public.proposals for update
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists proposals_admin_delete on public.proposals;
create policy proposals_admin_delete on public.proposals for delete
  using (public.is_admin());

-- 설문: 목록은 list_surveys 함수로(작성자 id를 숨김). 직접 조회는 본인·운영자만.
drop policy if exists surveys_read on public.surveys;
create policy surveys_read on public.surveys for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists surveys_insert on public.surveys;
create policy surveys_insert on public.surveys for insert
  with check (auth.uid() is not null and user_id = auth.uid() and deleted = false and publish_on >= public.kst_today() - 1);
drop policy if exists surveys_admin_update on public.surveys;
create policy surveys_admin_update on public.surveys for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists survey_requests_insert on public.survey_requests;
create policy survey_requests_insert on public.survey_requests for insert
  with check (
    auth.uid() is not null
    and user_id = auth.uid()
    and status = 'pending'
    and exists (select 1 from public.surveys s where s.id = survey_id and s.user_id = auth.uid() and not s.deleted)
  );
drop policy if exists survey_requests_read on public.survey_requests;
create policy survey_requests_read on public.survey_requests for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists survey_requests_admin_update on public.survey_requests;
create policy survey_requests_admin_update on public.survey_requests for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists ad_banners_read on public.ad_banners;
create policy ad_banners_read on public.ad_banners for select using (true);
drop policy if exists ad_banners_admin_update on public.ad_banners;
create policy ad_banners_admin_update on public.ad_banners for update
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings for select using (true);
drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings for update
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. 하루 작성 건수 제한 (스팸 방지)
-- ---------------------------------------------------------------------
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
  if public.is_admin() then
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

drop trigger if exists feedback_limit on public.feedback;
create trigger feedback_limit before insert on public.feedback
  for each row execute function public.enforce_daily_limit();
drop trigger if exists proposals_limit on public.proposals;
create trigger proposals_limit before insert on public.proposals
  for each row execute function public.enforce_daily_limit();
drop trigger if exists surveys_limit on public.surveys;
create trigger surveys_limit before insert on public.surveys
  for each row execute function public.enforce_daily_limit();
drop trigger if exists survey_requests_limit on public.survey_requests;
create trigger survey_requests_limit before insert on public.survey_requests
  for each row execute function public.enforce_daily_limit();

-- 제안 후보 목록 형식 검사 (최대 128개, 이름 30자, 설명 60자)
create or replace function public.check_proposal()
returns trigger
language plpgsql
as $$
declare
  c jsonb;
begin
  if jsonb_typeof(new.candidates) <> 'array' or jsonb_array_length(new.candidates) > 128 then
    raise exception 'invalid_candidates';
  end if;
  for c in select * from jsonb_array_elements(new.candidates) loop
    if char_length(btrim(coalesce(c->>'name', ''))) not between 1 and 30
       or char_length(coalesce(c->>'sub', '')) > 60
       or char_length(coalesce(c->>'image_path', '')) > 300 then
      raise exception 'invalid_candidates';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists proposals_check on public.proposals;
create trigger proposals_check before insert or update on public.proposals
  for each row execute function public.check_proposal();

-- ---------------------------------------------------------------------
-- 5. 투표 제출: submit_ballot
--    user_id는 서버가 auth.uid()로 채우고, 대결 기록 전체를 검증한 뒤
--    우승자와 2위를 서버가 계산한다.
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 6. 집계: get_ranking (로그인 사용자만, 집계 결과만)
-- ---------------------------------------------------------------------
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

-- ---------------------------------------------------------------------
-- 7. 댓글 목록: get_comments (로그인 사용자만, user_id 제외, 내 댓글 여부만)
-- ---------------------------------------------------------------------
create or replace function public.get_comments(p_worldcup_id uuid)
returns table (id uuid, body text, created_at timestamptz, is_mine boolean, hidden boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'login_required';
  end if;
  return query
    select c.id, c.body, c.created_at, (c.user_id = auth.uid()) as is_mine, c.hidden
    from public.comments c
    where c.worldcup_id = p_worldcup_id
      and (not c.hidden or c.user_id = auth.uid())
    order by c.created_at desc
    limit 300;
end;
$$;

-- ---------------------------------------------------------------------
-- 8. 통계 기록 (로그인 없이 호출 가능, 방문자 값은 해시만 저장)
-- ---------------------------------------------------------------------
create or replace function public.record_view(p_worldcup_id uuid, p_visitor text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor is null or char_length(p_visitor) not between 8 and 100 then
    return;
  end if;
  if not exists (select 1 from public.worldcups where id = p_worldcup_id and status = 'published') then
    return;
  end if;
  insert into public.worldcup_views (worldcup_id, visitor_hash, day)
    values (p_worldcup_id, encode(sha256(convert_to('jr:' || p_visitor, 'UTF8')), 'hex'), public.kst_today())
    on conflict do nothing;
end;
$$;

create or replace function public.record_completion(p_worldcup_id uuid, p_visitor text, p_champion uuid, p_runner uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_visitor is null or char_length(p_visitor) not between 8 and 100 or p_champion = p_runner then
    return;
  end if;
  if not exists (select 1 from public.worldcups where id = p_worldcup_id and status = 'published') then
    return;
  end if;
  if (select count(*) from public.candidates
      where worldcup_id = p_worldcup_id and active and id in (p_champion, p_runner)) <> 2 then
    return;
  end if;
  insert into public.play_completions (worldcup_id, visitor_hash, champion_id, runner_up_id)
    values (p_worldcup_id, encode(sha256(convert_to('jr:' || p_visitor, 'UTF8')), 'hex'), p_champion, p_runner)
    on conflict (worldcup_id, visitor_hash)
    do update set champion_id = excluded.champion_id, runner_up_id = excluded.runner_up_id, updated_at = now();
end;
$$;

-- 홈 화면용 공개 통계: 완주 수와 자동 썸네일용 후보 2개(우승 횟수, 2위 횟수 순)
create or replace function public.public_worldcup_stats()
returns table (worldcup_id uuid, completions int, top_ids uuid[])
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    (select count(*) from public.play_completions p where p.worldcup_id = w.id)::int,
    array(
      select c.id
      from public.candidates c
      where c.worldcup_id = w.id and c.active and c.image_url <> ''
      order by
        (select count(*) from public.play_completions p where p.worldcup_id = w.id and p.champion_id = c.id) desc,
        (select count(*) from public.play_completions p where p.worldcup_id = w.id and p.runner_up_id = c.id) desc,
        c.sort_order
      limit 2
    )
  from public.worldcups w
  where w.status = 'published'
$$;

-- 설문 목록 (작성자 id 대신 내 글 여부만)
create or replace function public.list_surveys()
returns table (
  id uuid, title text, body text, url text, publish_on date, expires_on date,
  created_at timestamptz, is_mine boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, s.title, s.body, s.url, s.publish_on, s.expires_on, s.created_at,
         (auth.uid() is not null and s.user_id = auth.uid())
  from public.surveys s
  where not s.deleted
    and (s.publish_on <= public.kst_today() or s.user_id = auth.uid() or public.is_admin())
  order by s.publish_on desc, s.created_at desc
  limit 500
$$;

-- ---------------------------------------------------------------------
-- 9. 운영자 함수
-- ---------------------------------------------------------------------

-- 랭킹 저장(새로 만들기·수정). 후보 목록 전체를 받아 한 번에 저장한다.
-- p: { id?, title, description, keywords, status, featured, sort_order, thumbnail_url,
--      candidates: [{ id?, name, sub, image_url }] }
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
  if not public.is_admin() then
    raise exception 'admin_only';
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

-- 랭킹 관리 화면 통계
create or replace function public.admin_worldcup_stats()
returns table (worldcup_id uuid, views int, completions int, participants int, comments int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  return query
    select w.id,
      (select count(*) from public.worldcup_views v where v.worldcup_id = w.id)::int,
      (select count(*) from public.play_completions p where p.worldcup_id = w.id)::int,
      (select count(*) from public.ballots b where b.worldcup_id = w.id)::int,
      (select count(*) from public.comments c where c.worldcup_id = w.id)::int
    from public.worldcups w;
end;
$$;

-- 설문 수정·삭제 요청 승인/반려
create or replace function public.admin_review_survey_request(p_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.survey_requests%rowtype;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  select * into r from public.survey_requests where id = p_id and status = 'pending' for update;
  if not found then
    raise exception 'not_found';
  end if;
  if p_action = 'approve' then
    if r.kind = 'delete' then
      update public.surveys set deleted = true where id = r.survey_id;
    else
      update public.surveys set
        title = btrim(r.payload ->> 'title'),
        body = btrim(r.payload ->> 'body'),
        url = coalesce(btrim(r.payload ->> 'url'), ''),
        publish_on = (r.payload ->> 'publish_on')::date,
        expires_on = (r.payload ->> 'expires_on')::date
      where id = r.survey_id;
    end if;
    update public.survey_requests set status = 'approved', reviewed_at = now() where id = p_id;
  elsif p_action = 'reject' then
    update public.survey_requests set status = 'rejected', reviewed_at = now() where id = p_id;
  else
    raise exception 'invalid_action';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 10. 권한 (Data API)
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.worldcups, public.candidates, public.ad_banners, public.site_settings to anon, authenticated;
grant select, insert, update, delete on
  public.worldcups, public.candidates, public.comments, public.feedback, public.proposals,
  public.surveys, public.survey_requests, public.ad_banners, public.site_settings
  to authenticated;
grant select on public.ballots to authenticated;
revoke all on public.admins, public.worldcup_views, public.play_completions from anon, authenticated;
revoke insert, update, delete on public.ballots from anon, authenticated;

revoke execute on all functions in schema public from public;
revoke execute on function
  public.submit_ballot(uuid, jsonb, boolean), public.get_ranking(uuid), public.get_comments(uuid),
  public.admin_save_worldcup(jsonb, uuid), public.admin_worldcup_stats(),
  public.admin_review_survey_request(uuid, text)
  from anon;
grant execute on function
  public.kst_today(), public.is_admin(),
  public.record_view(uuid, text), public.record_completion(uuid, text, uuid, uuid),
  public.public_worldcup_stats(), public.list_surveys()
  to anon, authenticated;
grant execute on function
  public.submit_ballot(uuid, jsonb, boolean), public.get_ranking(uuid), public.get_comments(uuid),
  public.admin_save_worldcup(jsonb, uuid), public.admin_worldcup_stats(),
  public.admin_review_survey_request(uuid, text)
  to authenticated;
-- 트리거 함수는 트리거로만 실행된다
grant execute on function public.enforce_daily_limit(), public.check_proposal() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 11. 사진 저장소 (Supabase Storage)
--   media: 공개 읽기, 운영자만 올리기·지우기 (썸네일, 후보 사진, 광고 배너)
--   proposal-media: 비공개, 로그인 사용자가 자기 폴더에만 올림, 본인·운영자만 읽기
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('media', 'media', true, 2097152, array['image/webp', 'image/png', 'image/jpeg', 'image/gif']),
  ('proposal-media', 'proposal-media', false, 2097152, array['image/webp', 'image/png', 'image/jpeg', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media public read" on storage.objects;
create policy "media public read" on storage.objects for select
  using (bucket_id = 'media');
drop policy if exists "media admin insert" on storage.objects;
create policy "media admin insert" on storage.objects for insert
  with check (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin update" on storage.objects;
create policy "media admin update" on storage.objects for update
  using (bucket_id = 'media' and public.is_admin());
drop policy if exists "media admin delete" on storage.objects;
create policy "media admin delete" on storage.objects for delete
  using (bucket_id = 'media' and public.is_admin());

drop policy if exists "proposal media insert own" on storage.objects;
create policy "proposal media insert own" on storage.objects for insert
  with check (
    bucket_id = 'proposal-media'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "proposal media read" on storage.objects;
create policy "proposal media read" on storage.objects for select
  using (
    bucket_id = 'proposal-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
drop policy if exists "proposal media delete" on storage.objects;
create policy "proposal media delete" on storage.objects for delete
  using (
    bucket_id = 'proposal-media'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
