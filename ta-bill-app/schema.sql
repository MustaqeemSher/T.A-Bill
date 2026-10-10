-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Email-only login (no verification). Bills are stored against the employee's email.
-- The table cannot be read directly; the app can only use the three functions below,
-- and each one needs the exact email, so nobody can download everyone's bills at once.

create table if not exists public.ta_bills_email (
  id           uuid primary key default gen_random_uuid(),
  email        text not null,
  bill_date    date,
  name         text,
  designation  text,
  purpose      text,
  advance      numeric default 0,
  da_days      numeric default 0,
  da_rate      numeric default 0,
  rows         jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists ta_bills_email_idx on public.ta_bills_email (email, created_at desc);

alter table public.ta_bills_email enable row level security;   -- no policies = no direct access
revoke all on table public.ta_bills_email from anon, authenticated;

create or replace function public.ta_list(p_email text)
returns setof public.ta_bills_email
language sql security definer set search_path = public as $$
  select * from public.ta_bills_email
  where email = lower(trim(p_email))
  order by created_at desc;
$$;

create or replace function public.ta_save(p_email text, p_id uuid, p_bill jsonb)
returns public.ta_bills_email
language plpgsql security definer set search_path = public as $$
declare
  e text := lower(trim(p_email));
  r public.ta_bills_email;
begin
  if e is null or e !~ '^\S+@\S+\.\S+$' then raise exception 'Invalid email'; end if;

  if p_id is null then
    insert into public.ta_bills_email (email, bill_date, name, designation, purpose, advance, da_days, da_rate, rows)
    values (e,
      nullif(p_bill->>'bill_date', '')::date,
      p_bill->>'name', p_bill->>'designation', p_bill->>'purpose',
      coalesce((p_bill->>'advance')::numeric, 0),
      coalesce((p_bill->>'da_days')::numeric, 0),
      coalesce((p_bill->>'da_rate')::numeric, 0),
      coalesce(p_bill->'rows', '[]'::jsonb))
    returning * into r;
  else
    update public.ta_bills_email set
      bill_date   = nullif(p_bill->>'bill_date', '')::date,
      name        = p_bill->>'name',
      designation = p_bill->>'designation',
      purpose     = p_bill->>'purpose',
      advance     = coalesce((p_bill->>'advance')::numeric, 0),
      da_days     = coalesce((p_bill->>'da_days')::numeric, 0),
      da_rate     = coalesce((p_bill->>'da_rate')::numeric, 0),
      rows        = coalesce(p_bill->'rows', '[]'::jsonb),
      updated_at  = now()
    where id = p_id and email = e
    returning * into r;
    if not found then raise exception 'Bill not found'; end if;
  end if;
  return r;
end;
$$;

create or replace function public.ta_delete(p_email text, p_id uuid)
returns void
language sql security definer set search_path = public as $$
  delete from public.ta_bills_email where id = p_id and email = lower(trim(p_email));
$$;

grant execute on function public.ta_list(text)              to anon, authenticated;
grant execute on function public.ta_save(text, uuid, jsonb) to anon, authenticated;
grant execute on function public.ta_delete(text, uuid)      to anon, authenticated;
