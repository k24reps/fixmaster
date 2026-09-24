select 'auth.users', count(*) from auth.users
union all select 'vault terbaca', count(*) from vault.decrypted_secrets where decrypted_secret is not null
union all select 'cron jobs', count(*) from cron.job
union all select 'tabel realtime', count(*) from pg_publication_tables where pubname='supabase_realtime'
union all select format('public.%s', c.relname), (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', c.relname), false, true, '')))[1]::text::bigint
  from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'
order by 1;
