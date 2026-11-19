\set ON_ERROR_STOP on
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create table auth.sessions(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade);
create table auth.identities(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade);
create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
\ir ../supabase/migrations/001_shared_reviews.sql
\ir ../supabase/migrations/002_review_controls.sql
-- Re-applying the second migration must preserve records and ACLs.
\ir ../supabase/migrations/002_review_controls.sql
insert into auth.users values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003');
insert into auth.sessions values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002');
insert into auth.identities values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001');
insert into public.stock_reviews(id,author,name,category,comment,stars,used,published,created_at) values
 ('30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','自分のレビュー','水','感想',5,true,true,now()-interval '1 day'),
 ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','他人のレビュー','食料','感想',4,true,true,now()-interval '1 day');
insert into public.stock_review_votes values ('30000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001');
create function public.test_assert(ok boolean) returns void language plpgsql as $$ begin if ok is distinct from true then raise exception 'ASSERTION FAILED'; end if; end $$;
create function public.test_denied(statement text) returns void language plpgsql as $$ begin
 begin execute statement; exception when others then return; end;
 raise exception 'Expected denial: %',statement;
end $$;
set role anon;
select public.test_assert(public.stock_review_controls()=2);
select public.test_assert((select count(*) from public.list_stock_reviews())=2);
select public.test_denied('select public.delete_my_stock_review_account()');
select public.test_denied('select * from public.stock_review_blocks');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","session_id":"10000000-0000-0000-0000-000000000001"}',false);
set role authenticated;
select public.test_denied('select public.require_stock_review_actor()');
select public.test_assert((select count(*) from public.list_my_stock_reviews())=1);
select public.test_denied($$select public.delete_my_stock_review('30000000-0000-0000-0000-000000000002')$$);
select public.test_assert(public.set_stock_review_author_block('30000000-0000-0000-0000-000000000002'));
select public.test_assert((select count(*) from public.list_stock_reviews())=1);
select public.test_assert((select count(*) from public.read_stock_review('30000000-0000-0000-0000-000000000002'))=0);
select public.test_denied($$select public.set_stock_review_helpful('30000000-0000-0000-0000-000000000002',true)$$);
select public.test_assert(public.clear_my_stock_review_blocks());
select public.test_assert((select count(*) from public.list_stock_reviews())=2);
select public.test_denied($$select public.submit_stock_review_v2('用品','水','感想',5,'{}',true,'wrong')$$);
select public.submit_stock_review_v2('用品','水','感想',5,'{}',true,'2026-11-19');
reset role;
select public.test_assert((select count(*) from public.stock_reviews where author='00000000-0000-0000-0000-000000000001' and rules_version='2026-11-19')=1);
insert into public.stock_review_suspensions(author) values ('00000000-0000-0000-0000-000000000001');
set role authenticated;
select public.test_denied($$select public.submit_stock_review('停止中','水','感想',5,'{}',true)$$);
select public.test_denied($$select public.set_stock_review_helpful('30000000-0000-0000-0000-000000000002',true)$$);
reset role;
select set_config('request.jwt.claims','',false);
set role anon;
select public.test_assert((select count(*) from public.list_stock_reviews())=1);
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","session_id":"10000000-0000-0000-0000-000000000001"}',false);
set role authenticated;
select public.test_denied('select public.delete_my_stock_review_account()');
reset role;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","session_id":"10000000-0000-0000-0000-000000000001"}',false);
set role authenticated;
select public.test_assert(public.delete_my_stock_review('30000000-0000-0000-0000-000000000001'));
select public.test_assert(public.delete_my_stock_review_account());
select public.test_denied('select public.delete_my_stock_review_account()');
select public.test_denied($$select public.submit_stock_review('削除済み','水','感想',5,'{}',true)$$);
reset role;
select public.test_assert(not exists(select 1 from auth.users where id='00000000-0000-0000-0000-000000000001'));
select public.test_assert(not exists(select 1 from auth.sessions where user_id='00000000-0000-0000-0000-000000000001'));
select public.test_assert(not exists(select 1 from auth.identities where user_id='00000000-0000-0000-0000-000000000001'));
select public.test_assert(not exists(select 1 from public.stock_reviews where author='00000000-0000-0000-0000-000000000001'));
select public.test_assert(not exists(select 1 from public.stock_review_votes where voter='00000000-0000-0000-0000-000000000001'));
select public.test_assert((select count(*) from auth.users)=2);
select public.test_assert((select count(*) from public.stock_reviews)=1);
\echo PASS: anonymous denial, actor/session isolation, blocks, rules, suspensions and own-only cascading deletion
