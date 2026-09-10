-- An installation runs over several days, not one.
--
-- `scheduled_date` becomes the start and gains a matching finish date. Existing
-- rows are backfilled to end on the day they started, which is exactly what a
-- single-date schedule meant, so the column can be NOT NULL from the outset —
-- nullable would leave every reader writing `coalesce(end, start)` forever and
-- one of them would eventually forget.

begin;

alter table public.installations
    add column if not exists scheduled_end_date date;

update public.installations
   set scheduled_end_date = scheduled_date
 where scheduled_end_date is null;

alter table public.installations
    alter column scheduled_end_date set not null;

alter table public.installations
    drop constraint if exists installations_schedule_range_check;

alter table public.installations
    add constraint installations_schedule_range_check
    check (scheduled_end_date >= scheduled_date);

comment on column public.installations.scheduled_date is
    'First day of the installation. The calendar spans start..scheduled_end_date.';
comment on column public.installations.scheduled_end_date is
    'Last day of the installation, inclusive. Equals scheduled_date for a one-day job.';

commit;
