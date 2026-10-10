begin;
alter table public.scout_history add column if not exists rating text check(rating in('Excellent','Good','Average','Poor'));
alter table public.scout_history add column if not exists storage_path text;
alter table public.scout_history alter column source_url drop not null;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('scout-seeds','scout-seeds',false,2500000,array['image/jpeg','image/png','image/webp'])
on conflict(id) do nothing;
create policy scout_seed_insert on storage.objects for insert to authenticated
with check(bucket_id='scout-seeds' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy scout_seed_read on storage.objects for select to authenticated
using(bucket_id='scout-seeds' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy scout_seed_delete on storage.objects for delete to authenticated
using(bucket_id='scout-seeds' and (storage.foldername(name))[1]=(select auth.uid())::text);
grant usage on schema extensions to authenticated;
create or replace function public.match_scout(query_embedding extensions.vector(1536),exclude_id uuid)
returns table(id uuid,kind text,status text,similarity double precision)
language sql stable security invoker set search_path=public,extensions,pg_temp as $$
 select x.id,x.kind,x.status,1-(x.embedding <=> query_embedding) as similarity from (
 select h.id,'history'::text kind,coalesce(h.rating,'Average') status,h.embedding from public.scout_history h where h.embedding is not null and h.id<>exclude_id
 union all
 select i.id,'candidate'::text kind,i.status,i.embedding from public.scout_items i where i.embedding is not null and i.id<>exclude_id and i.status in('approved','rejected')
 ) x order by x.embedding <=> query_embedding limit 30;
$$;
commit;
