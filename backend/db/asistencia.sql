-- ============================================================
--  Instituto Universe — Asistencia y avisos de inasistencia
--  Ejecutar en: Supabase → SQL Editor → Run (¡base lracmvuaynyhiqokknra!)
--  Idempotente.
-- ============================================================

-- Una fila por alumno por día. estado: presente / ausente / retirado.
-- Si 'retirado', materia_id indica en qué materia se retiró.
-- justificada + observacion: cuando el preceptor recibe el certificado.
create table if not exists public.asistencias (
  id             serial primary key,
  alumno_id      uuid not null references auth.users (id) on delete cascade,
  fecha          date not null,
  estado         text not null check (estado in ('presente', 'ausente', 'retirado')),
  materia_id     int references public.materias (id) on delete set null,
  justificada    boolean not null default false,
  observacion    text,
  registrado_por uuid references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now(),
  unique (alumno_id, fecha)
);
create index if not exists idx_asistencias_alumno on public.asistencias (alumno_id, fecha desc);

-- Avisos que Preceptor/Secretaría le envían a la familia por inasistencias.
create table if not exists public.avisos_asistencia (
  id             serial primary key,
  alumno_id      uuid not null references auth.users (id) on delete cascade,
  mensaje        text not null,
  emitido_por    uuid references auth.users (id) on delete set null,
  emitido_rol    text,
  emitido_nombre text,
  creado_en      timestamptz not null default now()
);
create index if not exists idx_avisos_alumno on public.avisos_asistencia (alumno_id, creado_en desc);

-- ----- Seguridad -----
alter table public.asistencias       enable row level security;
alter table public.avisos_asistencia enable row level security;

-- El alumno puede leer su propia asistencia y sus avisos (el resto va por backend).
drop policy if exists "asistencias_propias" on public.asistencias;
create policy "asistencias_propias" on public.asistencias
  for select using (auth.uid() = alumno_id);

drop policy if exists "avisos_propios" on public.avisos_asistencia;
create policy "avisos_propios" on public.avisos_asistencia
  for select using (auth.uid() = alumno_id);

grant all privileges on table public.asistencias       to service_role;
grant all privileges on table public.avisos_asistencia to service_role;
grant usage, select on all sequences in schema public  to service_role;
grant select on table public.asistencias       to authenticated;
grant select on table public.avisos_asistencia to authenticated;
