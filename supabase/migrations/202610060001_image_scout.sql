begin;
create schema if not exists extensions;
create extension if not exists vector with schema extensions;
create table if not exists public.scout_items (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null,image_url text not null,source_url text not null,source text not null,
 creator text default '',license text default '',license_url text,query text default '',
 status text not null default 'pending' check(status in ('pending','approved','later','rejected')),
 analysis jsonb,scores jsonb,embedding extensions.vector(1536),reviewed_at timestamptz,created_at timestamptz not null default now(),unique(owner_id,image_url)
);
create table if not exists public.scout_history (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null,image_url text not null,source_url text not null,source text not null default 'Instagram history',
 creator text default '',license text default '',license_url text,query text default '',caption text default '',
 likes numeric check(likes>=0),comments numeric check(comments>=0),saves numeric check(saves>=0),reach numeric check(reach>=0),
 analysis jsonb,embedding extensions.vector(1536),created_at timestamptz not null default now(),unique(owner_id,image_url)
);
create table if not exists public.scout_usage(owner_id uuid not null references auth.users(id) on delete cascade,day date not null,analyses integer not null default 0,primary key(owner_id,day));
alter table public.scout_items enable row level security;
alter table public.scout_history enable row level security;
alter table public.scout_usage enable row level security;
create policy scout_items_owner on public.scout_items for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy scout_history_owner on public.scout_history for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy scout_usage_read on public.scout_usage for select to authenticated using(owner_id=(select auth.uid()));
grant select,insert,update,delete on public.scout_items,public.scout_history to authenticated;
revoke all on public.scout_usage from authenticated;
grant select on public.scout_usage to authenticated;
revoke all on public.scout_items,public.scout_history,public.scout_usage from anon;
-- Budget reservations are atomic and never accepted from browser-supplied counts.
create or replace function public.reserve_analysis(daily_limit integer) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;
begin
 if auth.uid() is null or daily_limit<1 or daily_limit>1000 then return false; end if;
 insert into public.scout_usage(owner_id,day,analyses) values(auth.uid(),(now() at time zone 'UTC')::date,1)
 on conflict(owner_id,day) do update set analyses=scout_usage.analyses+1 where scout_usage.analyses<daily_limit returning analyses into n;
 return n is not null;
end $$;
-- Runs as caller so table RLS still applies. Embeddings are text-description vectors.
create or replace function public.match_scout(query_embedding extensions.vector(1536),exclude_id uuid)
returns table(id uuid,kind text,status text,similarity double precision)
language sql stable security invoker set search_path=public,extensions,pg_temp as $$
 select x.id,x.kind,x.status,1-(x.embedding <=> query_embedding) as similarity from (
 select h.id,'history'::text kind,'history'::text status,h.embedding from public.scout_history h where h.embedding is not null and h.id<>exclude_id
 union all
 select i.id,'candidate'::text kind,i.status,i.embedding from public.scout_items i where i.embedding is not null and i.id<>exclude_id and i.status in('approved','rejected')
 ) x order by x.embedding <=> query_embedding limit 30;
$$;
revoke all on function public.reserve_analysis(integer) from public,anon;
revoke all on function public.match_scout(extensions.vector,uuid) from public,anon;
grant execute on function public.reserve_analysis(integer) to authenticated;
grant execute on function public.match_scout(extensions.vector,uuid) to authenticated;
create index if not exists scout_items_owner_date on public.scout_items(owner_id,created_at desc);
create index if not exists scout_history_owner_date on public.scout_history(owner_id,created_at desc);
commit;
