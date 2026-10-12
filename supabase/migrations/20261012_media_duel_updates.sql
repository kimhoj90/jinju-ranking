begin;
alter table public.duels add column if not exists thumbnail_url text not null default '';
alter table public.ad_banners add column if not exists starts_on date;
alter table public.ad_banners add column if not exists ends_on date;
create table if not exists public.ad_contacts(slot int primary key references public.ad_banners(slot),contact text not null default '');
alter table public.ad_contacts enable row level security;
grant select on public.ad_contacts to anon;
grant select,insert,update on public.ad_contacts to authenticated;
drop policy if exists ad_contacts_admin on public.ad_contacts;
create policy ad_contacts_admin on public.ad_contacts for all to authenticated using(public.is_admin()) with check(public.is_admin());
create or replace function public.vote_duel(p_id uuid,p_choice text) returns jsonb language plpgsql security definer set search_path=public as $$
declare previous text;
begin
 perform public.require_member();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_id::text,1));
 perform 1 from duels where id=p_id and status='published' for share;
 if not found then raise exception 'voting_closed'; end if;
 if p_choice is null or p_choice not in('A','B') then raise exception 'invalid_choice'; end if;
 select choice into previous from duel_votes where user_id=auth.uid() and duel_id=p_id;
 if previous is not null and previous<>p_choice then delete from duel_comments where user_id=auth.uid() and duel_id=p_id; end if;
 insert into duel_votes(user_id,duel_id,choice) values(auth.uid(),p_id,p_choice)
 on conflict(user_id,duel_id) do update set choice=excluded.choice;
 return public.duel_result(p_id);
end $$;
create or replace function public.add_duel_comment(p_id uuid,p_body text) returns void language plpgsql security definer set search_path=public as $$
declare vote text;
begin
 perform require_member();
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||p_id::text,1));
 select choice into vote from duel_votes where user_id=auth.uid() and duel_id=p_id;
 if vote is null then raise exception 'vote_first'; end if;
 if not exists(select 1 from duels where id=p_id and status='published') then raise exception 'voting_closed'; end if;
 begin insert into duel_comments(duel_id,user_id,choice,body) values(p_id,auth.uid(),vote,btrim(p_body));
 exception when unique_violation then raise exception 'duel_comment_exists'; end;
end $$;
update storage.buckets set allowed_mime_types=array['image/webp','image/png','image/jpeg','image/gif'] where id='media';
commit;
