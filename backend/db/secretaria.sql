-- ============================================================
--  Instituto Universe — Secretaría Pedagógica (1.ª etapa)
--  Legajos de alumnos · Documentación · Asignaciones docentes
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere haber corrido antes: schema.sql, academico.sql,
--  cursos.sql, familia.sql e inscripciones.sql.
--  Idempotente: se puede volver a correr sin duplicar datos.
-- ============================================================


-- ------------------------------------------------------------
--  Legajo del alumno: datos que la Secretaría guarda de cada alumno
--  (además de nombre, apellido, email y DNI, que están en perfiles).
-- ------------------------------------------------------------
create table if not exists public.legajos (
  alumno_id           uuid primary key references auth.users (id) on delete cascade,
  fecha_nacimiento    date,
  domicilio           text,
  telefono            text,
  contacto_emergencia text,
  observaciones       text,
  actualizado_en      timestamptz not null default now()
);

-- ------------------------------------------------------------
--  Documentación del legajo: un registro por alumno y por documento.
--  Los tipos de documento se definen en backend/routes/legajos.js.
--  Si un documento no tiene registro, se considera "pendiente".
-- ------------------------------------------------------------
create table if not exists public.legajo_documentos (
  alumno_id      uuid not null references auth.users (id) on delete cascade,
  tipo           text not null,
  estado         text not null default 'pendiente'
                 check (estado in ('pendiente', 'entregado', 'no_aplica')),
  fecha_entrega  date,
  observacion    text,
  actualizado_en timestamptz not null default now(),
  primary key (alumno_id, tipo)
);

-- ------------------------------------------------------------
--  Asignaciones docentes: qué profesor dicta qué materia en qué curso.
--  Una materia tiene un solo profesor por curso.
--  horas_semanales sirve como base para la futura liquidación.
-- ------------------------------------------------------------
create table if not exists public.docente_asignaciones (
  id              serial primary key,
  profesor_id     uuid not null references auth.users (id) on delete cascade,
  materia_id      int  not null references public.materias (id) on delete cascade,
  curso_id        int  not null references public.cursos (id) on delete cascade,
  horas_semanales int  check (horas_semanales between 0 and 40),
  creado_en       timestamptz not null default now(),
  unique (materia_id, curso_id)
);

create index if not exists idx_asignaciones_profesor on public.docente_asignaciones (profesor_id);
create index if not exists idx_asignaciones_curso    on public.docente_asignaciones (curso_id);


-- ------------------------------------------------------------
--  Seguridad (RLS)
--  Los legajos tienen datos personales: ningún cliente los lee
--  directo. Todo pasa por el backend (service_role), que valida
--  que quien consulta sea Secretaría o Dirección.
--  Cada profesor puede ver sus propias asignaciones.
-- ------------------------------------------------------------
alter table public.legajos              enable row level security;
alter table public.legajo_documentos    enable row level security;
alter table public.docente_asignaciones enable row level security;

drop policy if exists "asignaciones_leer_propias" on public.docente_asignaciones;
create policy "asignaciones_leer_propias" on public.docente_asignaciones
  for select using (auth.uid() = profesor_id);

grant all privileges on table public.legajos              to service_role;
grant all privileges on table public.legajo_documentos    to service_role;
grant all privileges on table public.docente_asignaciones to service_role;
grant usage, select on all sequences in schema public to service_role;
grant select on table public.docente_asignaciones to authenticated;
