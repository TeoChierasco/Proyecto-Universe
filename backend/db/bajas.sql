-- ============================================================
--  Instituto Universe — Bajas, pases y reincorporaciones de alumnos
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: schema.sql, cursos.sql e inscripciones.sql.
--  Idempotente: se puede volver a correr sin duplicar datos.
-- ============================================================
--  Situación del alumno (solo tiene sentido para rol 'alumno'):
--    activo  → cursa normalmente.
--    baja    → dejó el instituto.
--    pase    → se fue a otra escuela (se registra la escuela de destino).
--  Al dar de baja o registrar un pase se quita al alumno de su curso,
--  así deja de aparecer en listas de asistencia y planillas de notas.
--  Su legajo, notas y asistencia anteriores se conservan.
-- ============================================================

alter table public.perfiles add column if not exists situacion text not null default 'activo';
alter table public.perfiles drop constraint if exists perfiles_situacion_check;
alter table public.perfiles add constraint perfiles_situacion_check
  check (situacion in ('activo', 'baja', 'pase'));

-- Historial de movimientos (nunca se borra: queda como registro).
create table if not exists public.movimientos_alumnos (
  id               serial primary key,
  alumno_id        uuid not null references auth.users (id) on delete cascade,
  tipo             text not null check (tipo in ('baja', 'pase', 'reincorporacion')),
  fecha            date not null default current_date,
  motivo           text,
  escuela_destino  text,
  curso_id         int references public.cursos (id) on delete set null,
  registrado_por   uuid references auth.users (id) on delete set null,
  creado_en        timestamptz not null default now()
);

create index if not exists idx_movimientos_alumno on public.movimientos_alumnos (alumno_id, creado_en desc);
create index if not exists idx_movimientos_fecha  on public.movimientos_alumnos (fecha);

-- ----- Seguridad -----
-- Solo el backend (Secretaría/Dirección) lee y escribe movimientos.
alter table public.movimientos_alumnos enable row level security;

grant all privileges on table public.movimientos_alumnos to service_role;
grant usage, select on all sequences in schema public to service_role;
