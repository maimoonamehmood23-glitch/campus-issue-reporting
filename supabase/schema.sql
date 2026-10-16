-- =====================================================================
-- Campus Issue Reporting System - Database Schema (Phase 1)
-- Run this whole file in: Supabase Dashboard -> SQL Editor -> New query
-- =====================================================================

-- ---------- 1. TABLES ----------

create table if not exists public.locations (
  id        uuid primary key default gen_random_uuid(),
  building  text not null,
  floor     text,
  room      text,
  unique (building, floor, room)
);

create table if not exists public.admin_profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null,
  role       text not null default 'admin' check (role in ('admin', 'super_admin')),
  created_at timestamptz not null default now()
);

create sequence if not exists public.complaint_seq start 1;

create table if not exists public.complaints (
  id               uuid primary key default gen_random_uuid(),
  complaint_code   text unique not null default '',
  category         text not null check (category in ('Computer','Projector','Fan','Light','Wi-Fi','Other')),
  description      text not null check (char_length(description) between 10 and 1000),
  location_id      uuid not null references public.locations(id),
  image_url        text,
  priority         text not null default 'Medium' check (priority in ('Low','Medium','High')),
  status           text not null default 'Pending' check (status in ('Pending','In Progress','Resolved')),
  reporter_name    text check (char_length(reporter_name) <= 100),
  reporter_contact text check (char_length(reporter_contact) <= 100),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  resolved_at      timestamptz
);

create table if not exists public.complaint_history (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  old_status   text,
  new_status   text not null,
  note         text,
  changed_by   uuid references auth.users(id),
  changed_at   timestamptz not null default now()
);

create index if not exists idx_complaints_status   on public.complaints(status);
create index if not exists idx_complaints_category on public.complaints(category);
create index if not exists idx_complaints_created  on public.complaints(created_at desc);
create index if not exists idx_history_complaint   on public.complaint_history(complaint_id);

-- ---------- 2. HELPER FUNCTIONS AND TRIGGERS ----------

-- Is the current logged-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.admin_profiles where id = auth.uid());
$$;

-- Build the public complaint code, e.g. CMP-2026-00042
create or replace function public.set_complaint_code()
returns trigger
language plpgsql
as $$
begin
  new.complaint_code := 'CMP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.complaint_seq')::text, 5, '0');
  return new;
end;
$$;

drop trigger if exists trg_set_complaint_code on public.complaints;
create trigger trg_set_complaint_code
  before insert on public.complaints
  for each row execute function public.set_complaint_code();

-- Keep updated_at / resolved_at correct
create or replace function public.touch_complaint()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if new.status = 'Resolved' and old.status <> 'Resolved' then
    new.resolved_at := now();
  elsif new.status <> 'Resolved' then
    new.resolved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_touch_complaint on public.complaints;
create trigger trg_touch_complaint
  before update on public.complaints
  for each row execute function public.touch_complaint();

-- ---------- 3. PUBLIC FUNCTIONS (used by reporters, no login) ----------

-- Submit a complaint. Returns only the new complaint code.
create or replace function public.submit_complaint(
  p_category         text,
  p_description      text,
  p_location_id      uuid,
  p_priority         text default 'Medium',
  p_image_url        text default null,
  p_reporter_name    text default null,
  p_reporter_contact text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_id   uuid;
  v_code text;
begin
  insert into public.complaints
    (category, description, location_id, priority, image_url, reporter_name, reporter_contact)
  values
    (p_category, p_description, p_location_id, p_priority, p_image_url, p_reporter_name, p_reporter_contact)
  returning id, complaint_code into v_id, v_code;

  insert into public.complaint_history (complaint_id, old_status, new_status, note)
  values (v_id, null, 'Pending', 'Complaint submitted');

  return v_code;
end;
$$;

-- Track one complaint by its code. Hides reporter contact info and admin notes.
create or replace function public.track_complaint(p_code text)
returns json
language plpgsql security definer set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'complaint_code', c.complaint_code,
    'category',       c.category,
    'description',    c.description,
    'priority',       c.priority,
    'status',         c.status,
    'created_at',     c.created_at,
    'updated_at',     c.updated_at,
    'resolved_at',    c.resolved_at,
    'location',       concat_ws(' / ', l.building, l.floor, l.room),
    'history', coalesce((
      select json_agg(json_build_object('status', h.new_status, 'changed_at', h.changed_at) order by h.changed_at)
      from public.complaint_history h where h.complaint_id = c.id
    ), '[]'::json)
  )
  into v_result
  from public.complaints c
  join public.locations l on l.id = c.location_id
  where c.complaint_code = upper(trim(p_code));

  return v_result;  -- null if not found
end;
$$;

grant execute on function public.submit_complaint(text,text,uuid,text,text,text,text) to anon, authenticated;
grant execute on function public.track_complaint(text) to anon, authenticated;

-- ---------- 4. ADMIN FUNCTION ----------

-- Change status and write a history row in one safe step.
create or replace function public.update_complaint_status(
  p_complaint_id uuid,
  p_new_status   text,
  p_note         text default null
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_old text;
begin
  if not public.is_admin() then
    raise exception 'Not allowed';
  end if;

  select status into v_old from public.complaints where id = p_complaint_id for update;
  if v_old is null then
    raise exception 'Complaint not found';
  end if;

  update public.complaints set status = p_new_status where id = p_complaint_id;

  insert into public.complaint_history (complaint_id, old_status, new_status, note, changed_by)
  values (p_complaint_id, v_old, p_new_status, p_note, auth.uid());
end;
$$;

revoke execute on function public.update_complaint_status(uuid,text,text) from public, anon;
grant  execute on function public.update_complaint_status(uuid,text,text) to authenticated;

-- ---------- 5. ROW LEVEL SECURITY ----------

alter table public.locations         enable row level security;
alter table public.complaints        enable row level security;
alter table public.complaint_history enable row level security;
alter table public.admin_profiles    enable row level security;

-- Locations: everyone can read (needed for the form dropdown); only admins can change.
drop policy if exists "locations read"   on public.locations;
drop policy if exists "locations manage" on public.locations;
create policy "locations read"   on public.locations for select using (true);
create policy "locations manage" on public.locations for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Complaints: NO public access to the table. Admins can read and update. Nobody can delete.
drop policy if exists "complaints admin read"   on public.complaints;
drop policy if exists "complaints admin update" on public.complaints;
create policy "complaints admin read"   on public.complaints for select to authenticated using (public.is_admin());
create policy "complaints admin update" on public.complaints for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- History: admins can read. Rows are written only by the functions above.
drop policy if exists "history admin read" on public.complaint_history;
create policy "history admin read" on public.complaint_history for select to authenticated using (public.is_admin());

-- Admin profiles: an admin can read their own profile.
drop policy if exists "profile read own" on public.admin_profiles;
create policy "profile read own" on public.admin_profiles for select to authenticated using (id = auth.uid());

-- ---------- 6. IMAGE STORAGE ----------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-images', 'complaint-images', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "images public upload" on storage.objects;
drop policy if exists "images public read"   on storage.objects;
create policy "images public upload" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'complaint-images');
create policy "images public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'complaint-images');

-- ---------- 7. SAMPLE DATA (replace with your real campus locations) ----------

insert into public.locations (building, floor, room) values
  ('Main Block',    'Ground Floor', 'Room 101'),
  ('Main Block',    'Ground Floor', 'Room 102'),
  ('Main Block',    'First Floor',  'Room 201'),
  ('Science Block', 'Ground Floor', 'Computer Lab 1'),
  ('Science Block', 'First Floor',  'Computer Lab 2'),
  ('Library',       'Ground Floor', 'Reading Hall'),
  ('Cafeteria',     null,           'Main Hall')
on conflict do nothing;

-- ---------- 8. CREATE YOUR FIRST ADMIN (do this after the steps above) ----------
-- 1) Supabase Dashboard -> Authentication -> Users -> Add user (email + password).
-- 2) Copy that user's UID, then run:
--
--   insert into public.admin_profiles (id, full_name, role)
--   values ('PASTE-USER-UID-HERE', 'Your Name', 'super_admin');
