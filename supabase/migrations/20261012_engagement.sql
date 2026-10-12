begin;
create table if not exists public.duel_views(
 duel_id uuid references public.duels(id) on delete cascade,visitor_hash text not null,day date not null,
 primary key(duel_id,visitor_hash,day));
alter table public.duel_views enable row level security;
revoke all on public.duel_views from anon,authenticated;
create or replace function public.record_duel_view(p_id uuid,p_visitor text) returns void language plpgsql security definer set search_path=public as $$
begin
 if p_visitor is null or char_length(p_visitor) not between 8 and 100 then return;end if;
 if not exists(select 1 from duels where id=p_id and status='published') then return;end if;
 insert into duel_views values(p_id,encode(sha256(convert_to('jr:'||p_visitor,'UTF8')),'hex'),kst_today()) on conflict do nothing;
end $$;
create or replace function public.admin_duel_stats() returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'admin_only';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'views',(select count(*) from duel_views v where v.duel_id=d.id),'participants',(select count(*) from duel_votes v where v.duel_id=d.id),'comments',(select count(*) from duel_comments c where c.duel_id=d.id))) from duels d),'[]'::jsonb);
end $$;
create table if not exists public.tv_reactions(
 video_id bigint references public.tv_videos(id) on delete cascade,user_id uuid references auth.users(id) on delete cascade,
 reaction text not null check(reaction in('like','dislike')),primary key(video_id,user_id));
alter table public.tv_reactions enable row level security;
revoke all on public.tv_reactions from anon,authenticated;
create or replace function public.react_video(p_id bigint,p_reaction text) returns void language plpgsql security definer set search_path=public as $$
begin
 perform require_member();
 if p_reaction is not null and p_reaction not in('like','dislike') then raise exception 'invalid_choice';end if;
 perform 1 from tv_videos v where v.id=p_id and v.moderation not in('hidden','deleted') and (v.moderation='restored' or (select count(*) from tv_reports r where r.video_id=v.id)<(select report_threshold from community_settings where id=1)) for update;
 if not found then raise exception 'not_found';end if;
 if p_reaction is null then delete from tv_reactions where video_id=p_id and user_id=auth.uid();
 else insert into tv_reactions values(p_id,auth.uid(),p_reaction) on conflict(video_id,user_id) do update set reaction=excluded.reaction;end if;
end $$;
revoke all on function public.record_duel_view(uuid,text),public.admin_duel_stats(),public.react_video(bigint,text) from public,anon,authenticated;
grant execute on function public.record_duel_view(uuid,text) to anon,authenticated;
grant execute on function public.admin_duel_stats(),public.react_video(bigint,text) to authenticated;
create or replace function public.tv_page(p_page int default null) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare pages int; page int; items jsonb;
begin
 select greatest(1,ceil(count(*)/12.0)::int) into pages from tv_videos;
 page:=greatest(1,least(coalesce(p_page,pages),pages));
 select coalesce(jsonb_agg(jsonb_build_object('id',v.id,'video_id',case when off then null else v.video_id end,'nickname',case when off then '' else coalesce(p.nickname,'닉네임 미설정') end,'off',off,'likes',case when off then 0 else (select count(*) from tv_reactions r where r.video_id=v.id and r.reaction='like') end,'dislikes',case when off then 0 else (select count(*) from tv_reactions r where r.video_id=v.id and r.reaction='dislike') end,'reaction',case when off then null else (select reaction from tv_reactions r where r.video_id=v.id and r.user_id=auth.uid()) end) order by v.id),'[]'::jsonb) into items
 from (select v.*, (v.moderation in ('hidden','deleted') or (v.moderation<>'restored' and (select count(*) from tv_reports r where r.video_id=v.id)>=(select report_threshold from community_settings where id=1))) as off
 from tv_videos v order by id limit 12 offset (page-1)*12) v left join profiles p on p.user_id=v.user_id;
 return jsonb_build_object('page',page,'pages',pages,'items',items); end $$;

commit;
