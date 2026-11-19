begin;

create table if not exists public.stock_review_blocks (
  blocker uuid not null references auth.users(id) on delete cascade,
  author uuid not null references auth.users(id) on delete cascade,
  primary key (blocker, author), check (blocker <> author)
);
create table if not exists public.stock_review_suspensions (
  author uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.stock_review_blocks enable row level security;
alter table public.stock_review_suspensions enable row level security;
revoke all on public.stock_review_blocks, public.stock_review_suspensions from public, anon, authenticated;
alter table public.stock_reviews add column if not exists rules_version text;
alter table public.stock_reviews add column if not exists rules_accepted_at timestamptz;

create or replace function public.stock_review_controls()
returns integer language sql stable set search_path = '' as $$ select 2 $$;

-- Require an existing account and live session even if a deleted account's JWT has not expired.
create or replace function public.require_stock_review_actor()
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := auth.uid(); session_id uuid;
begin
  session_id := nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'session_id';
  if actor is null or not exists(select 1 from auth.users u where u.id=actor)
    or not exists(select 1 from auth.sessions s where s.id=session_id and s.user_id=actor)
  then raise exception 'Sign in again'; end if;
  return actor;
end; $$;
revoke all on function public.require_stock_review_actor() from public, anon, authenticated;

create or replace function public.list_stock_reviews(p_search text default '', p_offset integer default 0)
returns table(id uuid, name text, category text, stars integer, photo_count integer, helpful bigint, voted boolean)
language sql stable security definer set search_path = '' as $$
 select r.id,r.name,r.category,r.stars,cardinality(r.photos),
 (select count(*) from public.stock_review_votes v where v.review_id=r.id),
 exists(select 1 from public.stock_review_votes v where v.review_id=r.id and v.voter=auth.uid())
 from public.stock_reviews r
 where r.published
 and not exists(select 1 from public.stock_review_suspensions s where s.author=r.author)
 and not exists(select 1 from public.stock_review_blocks b where b.blocker=auth.uid() and b.author=r.author)
 and strpos(lower(r.name || ' ' || r.category || ' ' || r.comment),lower(left(trim(coalesce(p_search,'')),100)))>0
 order by r.created_at desc,r.id desc limit 16 offset greatest(0,least(coalesce(p_offset,0),10000));
$$;
create or replace function public.read_stock_review(p_review uuid)
returns table(comment text, photos text[])
language sql stable security definer set search_path = '' as $$
 select r.comment,r.photos from public.stock_reviews r where r.id=p_review and r.published
 and not exists(select 1 from public.stock_review_suspensions s where s.author=r.author)
 and not exists(select 1 from public.stock_review_blocks b where b.blocker=auth.uid() and b.author=r.author);
$$;

create or replace function public.set_stock_review_author_block(p_review uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor(); target uuid;
begin
 select r.author into target from public.stock_reviews r where r.id=p_review and r.published;
 if target is null or target=actor then raise exception 'Cannot block this author'; end if;
 insert into public.stock_review_blocks(blocker,author) values(actor,target) on conflict do nothing;
 return true;
end; $$;
create or replace function public.clear_my_stock_review_blocks()
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor();
begin delete from public.stock_review_blocks b where b.blocker=actor; return true; end; $$;

create or replace function public.list_my_stock_reviews()
returns table(id uuid,name text,published boolean,created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor();
begin return query select r.id,r.name,r.published,r.created_at from public.stock_reviews r where r.author=actor order by r.created_at desc; end; $$;
create or replace function public.delete_my_stock_review(p_review uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor(); removed uuid;
begin
 delete from public.stock_reviews r where r.id=p_review and r.author=actor returning r.id into removed;
 if removed is null then raise exception 'Review not owned or unavailable'; end if;
 return true;
end; $$;

-- No caller-supplied account ID. Associated reviews, votes, blocks and sessions cascade.
create or replace function public.delete_my_stock_review_account()
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor();
begin
 delete from auth.users u where u.id=actor;
 if not found then raise exception 'Account unavailable'; end if;
 return true;
end; $$;

-- Preserve the existing endpoint for older clients, including moderation restrictions.
create or replace function public.submit_stock_review(p_name text,p_category text,p_comment text,p_stars integer,p_photos text[],p_used boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor(); result uuid;
begin
 if exists(select 1 from public.stock_review_suspensions s where s.author=actor) then raise exception 'Posting suspended'; end if;
 if p_used is distinct from true then raise exception 'Usage confirmation required'; end if;
 if p_photos is null or cardinality(p_photos)>3 or exists(select 1 from unnest(p_photos) photo where photo is null or char_length(photo)>200000 or photo !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$') then raise exception 'Invalid review photos'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
 if exists(select 1 from public.stock_reviews r where r.author=actor and r.created_at>now()-interval '30 seconds') then raise exception 'Please wait before posting again'; end if;
 insert into public.stock_reviews(author,name,category,comment,stars,photos,used) values(actor,trim(p_name),p_category,trim(p_comment),p_stars,p_photos,true) returning id into result;
 return result;
end; $$;
create or replace function public.submit_stock_review_v2(p_name text,p_category text,p_comment text,p_stars integer,p_photos text[],p_used boolean,p_rules_version text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare result uuid;
begin
 if p_rules_version is distinct from '2026-11-19' then raise exception 'Accept current posting rules'; end if;
 result:=public.submit_stock_review(p_name,p_category,p_comment,p_stars,p_photos,p_used);
 update public.stock_reviews set rules_version=p_rules_version,rules_accepted_at=now() where id=result;
 return result;
end; $$;
create or replace function public.set_stock_review_helpful(p_review uuid,p_vote boolean)
returns table(helpful bigint,voted boolean) language plpgsql security definer set search_path = '' as $$
declare actor uuid := public.require_stock_review_actor();
begin
 if p_vote is null then raise exception 'Vote required'; end if;
 if exists(select 1 from public.stock_review_suspensions s where s.author=actor) then raise exception 'Voting suspended'; end if;
 if not exists(select 1 from public.read_stock_review(p_review)) then raise exception 'Review unavailable'; end if;
 if p_vote then insert into public.stock_review_votes(review_id,voter) values(p_review,actor) on conflict do nothing;
 else delete from public.stock_review_votes v where v.review_id=p_review and v.voter=actor; end if;
 return query select count(*),coalesce(bool_or(v.voter=actor),false) from public.stock_review_votes v where v.review_id=p_review;
end; $$;

revoke all on function public.stock_review_controls(),public.set_stock_review_author_block(uuid),public.clear_my_stock_review_blocks(),public.list_my_stock_reviews(),public.delete_my_stock_review(uuid),public.delete_my_stock_review_account(),public.submit_stock_review_v2(text,text,text,integer,text[],boolean,text) from public,anon,authenticated;
grant execute on function public.stock_review_controls() to anon,authenticated;
grant execute on function public.set_stock_review_author_block(uuid),public.clear_my_stock_review_blocks(),public.list_my_stock_reviews(),public.delete_my_stock_review(uuid),public.delete_my_stock_review_account(),public.submit_stock_review_v2(text,text,text,integer,text[],boolean,text) to authenticated;
-- Original function ACLs are preserved by CREATE OR REPLACE.
notify pgrst,'reload schema';
commit;
