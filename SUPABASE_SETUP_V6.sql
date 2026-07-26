-- LEEFKE Bordtagebuch Version 6.0
-- Einmal vollständig im Supabase SQL Editor ausführen.
-- Der vorhandene Tabelleninhalt wird NICHT gelöscht.

-- 1) Realtime für leefke_records aktivieren.
alter table public.leefke_records replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'leefke_records'
  ) then
    alter publication supabase_realtime add table public.leefke_records;
  end if;
end $$;

-- 2) Privaten Speicher für Fotos und Dokumente anlegen.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'leefke-media',
  'leefke-media',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- 3) Nur der angemeldete Benutzer darf auf seinen eigenen Ordner zugreifen.
drop policy if exists "LEEFKE Medien lesen" on storage.objects;
drop policy if exists "LEEFKE Medien anlegen" on storage.objects;
drop policy if exists "LEEFKE Medien ändern" on storage.objects;
drop policy if exists "LEEFKE Medien löschen" on storage.objects;

create policy "LEEFKE Medien lesen"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'leefke-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "LEEFKE Medien anlegen"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'leefke-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "LEEFKE Medien ändern"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'leefke-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'leefke-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "LEEFKE Medien löschen"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'leefke-media'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
