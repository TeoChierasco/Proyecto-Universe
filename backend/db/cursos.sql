-- ============================================================
--  Instituto Universe — Cursos (año + división)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Idempotente: se puede volver a correr sin duplicar datos.
-- ============================================================
--  Un "curso" es la combinación de un año y una división (ej.: 1.º A).
--  Es la base para inscribir alumnos, tomar asistencia y cargar notas.
--  Las divisiones se cargan A, B y C para los 5 años; Secretaría puede
--  agregar o quitar divisiones desde la app.
-- ============================================================

create table if not exists public.cursos (
  id       serial primary key,
  anio     int  not null check (anio between 1 and 5),
  division text not null,
  unique (anio, division)
);

-- ----- Seguridad -----
alter table public.cursos enable row level security;

drop policy if exists "cursos_leer" on public.cursos;
create policy "cursos_leer" on public.cursos
  for select using (auth.uid() is not null);

grant all privileges on table public.cursos to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on table public.cursos to authenticated;

-- ============================================================
--  DATOS — Divisiones A, B y C para 1.º a 5.º año
-- ============================================================
insert into public.cursos (anio, division)
select a, d
from generate_series(1, 5) as a
cross join (values ('A'), ('B'), ('C')) as v(d)
on conflict (anio, division) do nothing;
