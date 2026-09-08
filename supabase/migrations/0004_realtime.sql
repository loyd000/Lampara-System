-- ═══════════════════════════════════════════════════════════════════════════
-- Lampara CRM — Realtime
--
-- Convex pushed query updates automatically; React Query does not. These tables
-- are published so the client can subscribe to postgres_changes and invalidate
-- the matching React Query keys (src/lib/supabase/realtime.ts).
--
-- Realtime respects RLS, so a sales rep is only notified about their own leads.
-- REPLICA IDENTITY FULL makes the OLD row available on UPDATE/DELETE, which is
-- what lets the client invalidate the *previous* lead's cache on a stage move.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
    t text;
begin
    foreach t in array array[
        'leads', 'properties', 'surveys', 'quotes', 'contracts',
        'permits', 'installations', 'service_tickets', 'activity_log', 'users'
    ]
    loop
        execute format('alter table public.%I replica identity full', t);

        if not exists (
            select 1 from pg_publication_tables
             where pubname = 'supabase_realtime'
               and schemaname = 'public'
               and tablename = t
        ) then
            execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
    end loop;
end;
$$;
