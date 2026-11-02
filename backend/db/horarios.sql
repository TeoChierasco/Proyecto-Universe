-- ============================================================
--  Instituto Universe — Horarios por curso
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: academico.sql y cursos.sql.  Idempotente.
-- ============================================================
--  Una fila por curso, día (1 = lunes … 5 = viernes) y módulo.
--  Las horas de cada módulo se configuran en backend/config/horarios.js.
--  El profesor de cada clase sale de docente_asignaciones
--  (materia + curso), así que no se repite acá.
-- ============================================================

create table if not exists public.horarios (
  id         serial primary key,
  curso_id   int  not null references public.cursos (id) on delete cascade,
  dia        int  not null check (dia between 1 and 7),
  modulo     int  not null check (modulo between 1 and 20),
  materia_id int  not null references public.materias (id) on delete cascade,
  aula       text,
  unique (curso_id, dia, modulo)
);

create index if not exists idx_horarios_curso on public.horarios (curso_id);

alter table public.horarios enable row level security;

drop policy if exists "horarios_leer" on public.horarios;
create policy "horarios_leer" on public.horarios
  for select using (auth.uid() is not null);

grant all privileges on table public.horarios to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on table public.horarios to authenticated;
