-- ============================================================
--  Instituto Universe — Estructura académica (Nivel Secundario)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Idempotente: se puede volver a correr sin duplicar datos.
-- ============================================================
--  El secundario tiene 5 años (1.º a 5.º). Las divisiones (A/B/C…)
--  todavía no están definidas → quedan para más adelante.
--  Por ahora se cargan las materias de 1.º año.
-- ============================================================

-- Talleres (agrupan sub-materias; ej.: Robótica e Informática).
create table if not exists public.talleres (
  id     serial primary key,
  nombre text not null,
  anio   int  not null check (anio between 1 and 5),
  unique (nombre, anio)
);

-- Materias (una fila por materia de cada año).
-- taller_id: si la materia forma parte de un taller, apunta a él.
create table if not exists public.materias (
  id        serial primary key,
  nombre    text not null,
  anio      int  not null check (anio between 1 and 5),
  taller_id int  references public.talleres (id) on delete set null,
  unique (nombre, anio)
);

-- ------------------------------------------------------------
--  Seguridad (RLS): datos de referencia, lectura para usuarios
--  autenticados. El backend (service_role) gestiona las altas.
-- ------------------------------------------------------------
alter table public.talleres enable row level security;
alter table public.materias enable row level security;

drop policy if exists "talleres_leer" on public.talleres;
create policy "talleres_leer" on public.talleres
  for select using (auth.uid() is not null);

drop policy if exists "materias_leer" on public.materias;
create policy "materias_leer" on public.materias
  for select using (auth.uid() is not null);

-- Permisos (auto-expose está OFF, se otorgan a mano).
grant all privileges on table public.talleres to service_role;
grant all privileges on table public.materias to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on table public.talleres to authenticated;
grant select on table public.materias to authenticated;

-- ============================================================
--  DATOS — Materias de 1.º año
-- ============================================================

-- Taller de 1.º año
insert into public.talleres (nombre, anio) values
  ('Taller de Robótica e Informática', 1)
on conflict (nombre, anio) do nothing;

-- Materias regulares de 1.º año
insert into public.materias (nombre, anio) values
  ('Ciencias Sociales', 1),
  ('Área Científica', 1),
  ('Lengua y Literatura', 1),
  ('Matemáticas', 1),
  ('Artes Visuales y Teatro', 1),
  ('Educación Física', 1),
  ('Inglés', 1),
  ('Italiano', 1)
on conflict (nombre, anio) do nothing;

-- Materias del taller (Informática y Robótica), enlazadas al taller
insert into public.materias (nombre, anio, taller_id)
select v.nombre, 1, t.id
from (values ('Informática'), ('Robótica')) as v(nombre)
cross join (select id from public.talleres
            where nombre = 'Taller de Robótica e Informática' and anio = 1) as t
on conflict (nombre, anio) do nothing;
