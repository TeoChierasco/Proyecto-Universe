-- ============================================================
--  Instituto Universe — Actas de reunión y citaciones
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: schema.sql, cursos.sql y familia.sql.  Idempotente.
-- ============================================================
--  tipo:
--    citacion → se cita a la familia de un alumno (fecha, hora, lugar, motivo).
--    reunion  → reunión registrada (con familias, docentes, equipo directivo…).
--  estado: programada → realizada | cancelada.
--  Al marcarla "realizada" se completa el acta: desarrollo y acuerdos.
--  Las familias (con vínculo aprobado) ven las citaciones de sus hijos y
--  confirman que se notificaron (y si van a asistir).
-- ============================================================

create table if not exists public.actas (
  id             serial primary key,
  tipo           text not null check (tipo in ('citacion', 'reunion')),
  estado         text not null default 'programada' check (estado in ('programada', 'realizada', 'cancelada')),
  fecha          date not null,
  hora           text,
  lugar          text,
  asunto         text not null,
  alumno_id      uuid references auth.users (id) on delete set null,
  curso_id       int  references public.cursos (id) on delete set null,
  convocados     text,
  presentes      text,
  desarrollo     text,
  acuerdos       text,
  creado_por     uuid references auth.users (id) on delete set null,
  creado_nombre  text,
  creado_rol     text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create index if not exists idx_actas_fecha  on public.actas (fecha desc);
create index if not exists idx_actas_alumno on public.actas (alumno_id);

-- Notificación de cada familia (padre/tutor) a una citación.
create table if not exists public.acta_notificaciones (
  acta_id       int  not null references public.actas (id) on delete cascade,
  padre_id      uuid not null references auth.users (id) on delete cascade,
  respuesta     text check (respuesta in ('asistire', 'no_puedo')),
  comentario    text,
  notificado_en timestamptz not null default now(),
  primary key (acta_id, padre_id)
);

-- ----- Seguridad -----
-- Todo pasa por el backend, que filtra por rol y por vínculo aprobado.
alter table public.actas               enable row level security;
alter table public.acta_notificaciones enable row level security;

grant all privileges on table public.actas               to service_role;
grant all privileges on table public.acta_notificaciones to service_role;
grant usage, select on all sequences in schema public to service_role;
