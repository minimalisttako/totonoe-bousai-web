begin;

create table public.stock_reviews (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  category text not null check (category in ('水','食料','トイレ','その他')),
  comment text not null check (char_length(trim(comment)) between 1 and 600),
  stars integer not null check (stars between 0 and 5),
  photos text[] not null default '{}' check (cardinality(photos) <= 3),
  used boolean not null check (used),
  published boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.stock_review_votes (
  review_id uuid not null references public.stock_reviews(id) on delete cascade,
  voter uuid not null references auth.users(id) on delete cascade,
  primary key (review_id, voter)
);

create index stock_reviews_feed on public.stock_reviews(created_at desc, id desc) where published;
create index stock_reviews_author on public.stock_reviews(author, created_at desc);
alter table public.stock_reviews enable row level security;
alter table public.stock_review_votes enable row level security;
revoke all on public.stock_reviews, public.stock_review_votes from public, anon, authenticated;

create function public.list_stock_reviews(p_search text default '', p_offset integer default 0)
returns table(id uuid, name text, category text, stars integer, photo_count integer, helpful bigint, voted boolean)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.name, r.category, r.stars, cardinality(r.photos),
    (select count(*) from public.stock_review_votes v where v.review_id = r.id),
    exists(select 1 from public.stock_review_votes v where v.review_id = r.id and v.voter = auth.uid())
  from public.stock_reviews r
  where r.published and strpos(lower(r.name || ' ' || r.category || ' ' || r.comment),
    lower(left(trim(coalesce(p_search, '')),100))) > 0
  order by r.created_at desc, r.id desc
  limit 16 offset greatest(0, least(coalesce(p_offset, 0), 10000));
$$;

create function public.read_stock_review(p_review uuid)
returns table(comment text, photos text[])
language sql stable security definer set search_path = ''
as $$
  select r.comment, r.photos from public.stock_reviews r where r.id = p_review and r.published;
$$;

create function public.submit_stock_review(
  p_name text, p_category text, p_comment text, p_stars integer, p_photos text[], p_used boolean
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  result uuid;
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if p_used is distinct from true then raise exception 'Usage confirmation required'; end if;
  if p_photos is null or cardinality(p_photos) > 3 or exists (
    select 1 from unnest(p_photos) photo
    where photo is null or char_length(photo) > 200000 or photo !~ '^data:image/jpeg;base64,/9j/[A-Za-z0-9+/]+={0,2}$'
  ) then raise exception 'Invalid review photos'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text, 0));
  if exists (select 1 from public.stock_reviews where author = actor and created_at > now() - interval '30 seconds')
  then raise exception 'Please wait before posting again'; end if;
  insert into public.stock_reviews(author, name, category, comment, stars, photos, used)
    values(actor, trim(p_name), p_category, trim(p_comment), p_stars, p_photos, true)
    returning id into result;
  return result;
end;
$$;

create function public.set_stock_review_helpful(p_review uuid, p_vote boolean)
returns table(helpful bigint, voted boolean)
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then raise exception 'Sign in required'; end if;
  if p_vote is null then raise exception 'Vote required'; end if;
  if not exists(select 1 from public.stock_reviews r where r.id = p_review and r.published)
  then raise exception 'Review unavailable'; end if;
  if p_vote then
    insert into public.stock_review_votes(review_id, voter) values(p_review, actor) on conflict do nothing;
  else
    delete from public.stock_review_votes where review_id = p_review and voter = actor;
  end if;
  return query select count(*), coalesce(bool_or(voter = actor), false)
    from public.stock_review_votes where review_id = p_review;
end;
$$;

revoke all on function public.list_stock_reviews(text, integer),
  public.read_stock_review(uuid),
  public.submit_stock_review(text, text, text, integer, text[], boolean),
  public.set_stock_review_helpful(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.list_stock_reviews(text, integer), public.read_stock_review(uuid)
  to anon, authenticated;
grant execute on function public.submit_stock_review(text, text, text, integer, text[], boolean),
  public.set_stock_review_helpful(uuid, boolean) to authenticated;

commit;
