-- ============================================================
--  Instituto Universe — Calificaciones
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: academico.sql, cursos.sql y secretaria.sql.
--  Idempotente: se puede volver a correr sin duplicar datos.
-- ============================================================
--  Una fila por alumno, materia, período y ciclo lectivo.
--  Períodos: '1', '2', '3' (trimestres). La lista de períodos y la
--  nota mínima de aprobación se configuran en
--  backend/routes/calificaciones.js.
--  Carga: el profesor asignado a esa materia en ese curso
--  (docente_asignaciones). Secretaría y Dirección pueden corregir.
-- ============================================================

create table if not exists public.calificaciones (
  id             serial primary key,
  alumno_id      uuid not null references auth.users (id) on delete cascade,
  materia_id     int  not null references public.materias (id) on delete cascade,
  curso_id       int  references public.cursos (id) on delete set null,
  ciclo          int  not null check (ciclo between 2000 and 2100),
  periodo        text not null,
  nota           numeric(4, 2) not null check (nota >= 1 and nota <= 10),
  observacion    text,
  cargado_por    uuid references auth.users (id) on delete set null,
  actualizado_en timestamptz not null default now(),
  unique (alumno_id, materia_id, ciclo, periodo)
);

create index if not exists idx_calificaciones_alumno  on public.calificaciones (alumno_id, ciclo);
create index if not exists idx_calificaciones_materia on public.calificaciones (materia_id, curso_id, ciclo);

-- ----- Seguridad -----
-- Cada alumno puede leer sus propias notas. Todo lo demás pasa por el
-- backend (service_role), que valida rol, asignación docente y vínculos.
alter table public.calificaciones enable row level security;

drop policy if exists "calificaciones_leer_propias" on public.calificaciones;
create policy "calificaciones_leer_propias" on public.calificaciones
  for select using (auth.uid() = alumno_id);

grant all privileges on table public.calificaciones to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on table public.calificaciones to authenticated;
