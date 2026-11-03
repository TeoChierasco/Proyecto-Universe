-- ============================================================
--  Instituto Universe — Jornada de cada curso
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: cursos.sql y horarios.sql.  Idempotente.
-- ============================================================
--  Para cada curso y día se indica desde qué módulo hasta qué módulo
--  se cursa (las horas de cada módulo están en backend/config/horarios.js).
--  Ejemplo: lunes del módulo 3 (09:00) al módulo 8 (13:20).
--  El horario de ese día tiene que cubrir EXACTAMENTE esos módulos:
--  no se pueden cargar clases fuera de la jornada y el sistema avisa
--  si faltan módulos por asignar.
-- ============================================================

create table if not exists public.curso_jornadas (
  curso_id     int not null references public.cursos (id) on delete cascade,
  dia          int not null check (dia between 1 and 7),
  modulo_desde int not null check (modulo_desde between 1 and 20),
  modulo_hasta int not null check (modulo_hasta between 1 and 20),
  primary key (curso_id, dia),
  check (modulo_hasta >= modulo_desde)
);

alter table public.curso_jornadas enable row level security;

drop policy if exists "jornadas_leer" on public.curso_jornadas;
create policy "jornadas_leer" on public.curso_jornadas
  for select using (auth.uid() is not null);

grant all privileges on table public.curso_jornadas to service_role;
grant select on table public.curso_jornadas to authenticated;
