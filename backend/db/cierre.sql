-- ============================================================
--  Instituto Universe — Cierre de notas y emisión de boletines
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: calificaciones.sql.  Idempotente.
-- ============================================================
--  Una fila por ciclo lectivo y período (trimestre):
--    fecha_limite → último día para que los profesores carguen notas.
--    cerrado      → los profesores ya no pueden modificar notas de ese
--                   período (Secretaría/Dirección sí, para correcciones).
--    publicado    → el boletín de ese período queda visible para
--                   alumnos y familias.
--  Si un período no tiene fila, está abierto y sin publicar.
-- ============================================================

create table if not exists public.periodos_estado (
  ciclo         int  not null check (ciclo between 2000 and 2100),
  periodo       text not null,
  fecha_limite  date,
  cerrado       boolean not null default false,
  cerrado_por   uuid references auth.users (id) on delete set null,
  cerrado_en    timestamptz,
  publicado     boolean not null default false,
  publicado_por uuid references auth.users (id) on delete set null,
  publicado_en  timestamptz,
  primary key (ciclo, periodo)
);

alter table public.periodos_estado enable row level security;

drop policy if exists "periodos_leer" on public.periodos_estado;
create policy "periodos_leer" on public.periodos_estado
  for select using (auth.uid() is not null);

grant all privileges on table public.periodos_estado to service_role;
grant select on table public.periodos_estado to authenticated;
