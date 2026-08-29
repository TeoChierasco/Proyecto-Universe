-- ============================================================
--  Instituto Universe — Comunicados / Cartelera
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Idempotente: se puede volver a correr sin problemas.
-- ============================================================
--  audiencia: a quién va dirigido el aviso.
--    todos    → toda la comunidad
--    alumnos  → alumnos
--    familias → padres / tutores
--    docentes → profesores y preceptores
--  El filtrado por audiencia según el rol lo hace el backend.
-- ============================================================

create table if not exists public.comunicados (
  id           serial primary key,
  titulo       text not null,
  cuerpo       text not null,
  audiencia    text not null default 'todos'
               check (audiencia in ('todos', 'alumnos', 'familias', 'docentes')),
  autor_id     uuid references auth.users (id) on delete set null,
  autor_nombre text not null,   -- snapshot del nombre del autor
  autor_rol    text not null,   -- snapshot del rol del autor
  creado_en    timestamptz not null default now()
);

create index if not exists idx_comunicados_fecha on public.comunicados (creado_en desc);

-- Seguridad: RLS activa. Solo el backend (service_role) accede a la tabla;
-- el filtrado por audiencia lo aplica el backend según el rol del usuario.
alter table public.comunicados enable row level security;

grant all privileges on table public.comunicados to service_role;
grant usage, select on all sequences in schema public to service_role;
