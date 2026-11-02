-- ============================================================
--  Instituto Universe — Inscripciones (alumno → curso)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Idempotente. ¡Corré esto en la base correcta (lracmvuaynyhiqokknra)!
-- ============================================================
--  Cada alumno pertenece a un curso (año + división). Un alumno tiene
--  una sola inscripción activa (por eso alumno_id es la clave primaria).
--  La carga de alumnos y la asignación de curso las hace la Secretaría.
-- ============================================================

create table if not exists public.inscripciones (
  alumno_id uuid primary key references auth.users (id) on delete cascade,
  curso_id  int  references public.cursos (id) on delete set null,
  creado_en timestamptz not null default now()
);

-- ----- Seguridad -----
alter table public.inscripciones enable row level security;

-- Cada alumno puede ver su propia inscripción; Secretaría/Dirección
-- gestionan todo desde el backend (service_role, que ignora RLS).
drop policy if exists "inscripciones_leer_propio" on public.inscripciones;
create policy "inscripciones_leer_propio" on public.inscripciones
  for select using (auth.uid() = alumno_id);

grant all privileges on table public.inscripciones to service_role;
grant select on table public.inscripciones to authenticated;

-- ============================================================
--  Códigos de aprobación también para ALUMNOS
--  Ahora el alumno que se registra solo necesita un código emitido
--  por Secretaría (para validar que sea una cuenta real).
--  (Incluye 'padre', que se agregó en familia.sql.)
-- ============================================================
alter table public.codigos_aprobacion drop constraint if exists codigos_aprobacion_rol_destino_check;
alter table public.codigos_aprobacion add constraint codigos_aprobacion_rol_destino_check
  check (rol_destino in ('alumno', 'padre', 'profesor', 'preceptor', 'secretaria'));
