-- ============================================================
--  Instituto Universe — Documento del alumno y vínculos familiares
--  Ejecutar en: Supabase → SQL Editor → Run (¡en la base lracmvuaynyhiqokknra!)
--  Idempotente.
-- ============================================================

-- 1) Documento (DNI) en los perfiles. Lo usan los alumnos; los padres
--    vinculan a sus hijos ingresando este documento.
alter table public.perfiles add column if not exists documento text;

-- Único cuando está presente (permite varios NULL para quienes no lo cargan).
create unique index if not exists perfiles_documento_unico
  on public.perfiles (documento) where documento is not null;

-- 2) Padre/Tutor también requiere código de aprobación de Secretaría.
alter table public.codigos_aprobacion drop constraint if exists codigos_aprobacion_rol_destino_check;
alter table public.codigos_aprobacion add constraint codigos_aprobacion_rol_destino_check
  check (rol_destino in ('alumno', 'padre', 'profesor', 'preceptor', 'secretaria'));

-- 3) Vínculos familiares: qué padre/tutor está asociado a qué alumno.
create table if not exists public.vinculos (
  id        serial primary key,
  padre_id  uuid not null references auth.users (id) on delete cascade,
  alumno_id uuid not null references auth.users (id) on delete cascade,
  creado_en timestamptz not null default now(),
  unique (padre_id, alumno_id)
);

alter table public.vinculos enable row level security;

-- Cada usuario puede ver los vínculos donde participa (como padre o como alumno).
drop policy if exists "vinculos_propios" on public.vinculos;
create policy "vinculos_propios" on public.vinculos
  for select using (auth.uid() = padre_id or auth.uid() = alumno_id);

grant all privileges on table public.vinculos to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on table public.vinculos to authenticated;
