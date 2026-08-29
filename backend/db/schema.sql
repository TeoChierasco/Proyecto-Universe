-- ============================================================
--  Instituto Universe — Esquema de base de datos (Supabase / PostgreSQL)
-- ============================================================
--  Cómo ejecutarlo:
--    1. Entrá a tu proyecto en Supabase.
--    2. Menú lateral → SQL Editor → New query.
--    3. Pegá TODO este archivo y presioná "Run".
--  Es idempotente: se puede volver a ejecutar sin romper nada.
-- ============================================================


-- ------------------------------------------------------------
--  Tabla: perfiles
--  Un registro por usuario autenticado (auth.users), con su rol y nivel.
--  El id es el mismo uuid que Supabase Auth le asigna al usuario.
-- ------------------------------------------------------------
create table if not exists public.perfiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nombre     text not null,
  apellido   text not null,
  email      text,
  rol        text not null
             check (rol in ('alumno','padre','profesor','preceptor','secretaria','director')),
  nivel      text not null
             check (nivel in ('primario','secundario','terciario')),
  creado_en  timestamptz not null default now()
);

comment on table public.perfiles is 'Perfil de cada usuario: rol y nivel dentro del instituto.';


-- ------------------------------------------------------------
--  Tabla: codigos_aprobacion
--  Códigos de un solo uso que habilitan el registro de roles del personal.
--    rol_destino : qué rol habilita el código (profesor / preceptor / secretaria)
--    emitido_por : quién lo genera
--                    - 'secretaria' emite códigos de profesor y preceptor
--                    - 'direccion'  emite códigos de secretaria
-- ------------------------------------------------------------
create table if not exists public.codigos_aprobacion (
  id           uuid primary key default gen_random_uuid(),
  codigo       text not null unique,
  rol_destino  text not null
               check (rol_destino in ('profesor','preceptor','secretaria')),
  emitido_por  text not null
               check (emitido_por in ('secretaria','direccion')),
  usado        boolean not null default false,
  usado_por    uuid references auth.users (id) on delete set null,
  creado_por   uuid references auth.users (id) on delete set null,
  creado_en    timestamptz not null default now(),
  expira_en    timestamptz
);

comment on table public.codigos_aprobacion is 'Códigos de aprobación de un solo uso para registrar personal.';

-- Búsqueda rápida de códigos disponibles (todavía sin usar).
create index if not exists idx_codigos_disponibles
  on public.codigos_aprobacion (codigo)
  where usado = false;


-- ------------------------------------------------------------
--  Seguridad a nivel de fila (RLS)
--  Activamos RLS en ambas tablas. Con RLS activa, cualquier acceso
--  que no tenga una política que lo permita queda DENEGADO por defecto.
--  El backend usa la clave secreta (service_role), que ignora RLS y
--  puede hacer todo; el frontend (clave anon) queda muy limitado.
-- ------------------------------------------------------------
alter table public.perfiles           enable row level security;
alter table public.codigos_aprobacion enable row level security;

-- perfiles: cada usuario puede LEER únicamente su propio perfil.
drop policy if exists "perfiles_leer_propio" on public.perfiles;
create policy "perfiles_leer_propio"
  on public.perfiles
  for select
  using (auth.uid() = id);

-- (Sin políticas de INSERT/UPDATE/DELETE para clientes: las altas y
--  cambios de rol se hacen desde el backend con la clave secreta, para
--  que nadie pueda asignarse un rol por su cuenta.)

-- codigos_aprobacion: sin políticas para clientes ⇒ inaccesible desde el
-- frontend. Solo el backend (service_role) puede leer/crear/consumir códigos.


-- ------------------------------------------------------------
--  Permisos (GRANTS) para los roles de la API de Supabase
--  Necesario porque "exponer tablas nuevas automáticamente" está en OFF:
--  las tablas nuevas no reciben permisos solas, se los damos acá a mano.
-- ------------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- El backend (clave secreta = service_role) gestiona todo:
grant all privileges on table public.perfiles           to service_role;
grant all privileges on table public.codigos_aprobacion to service_role;

-- El frontend autenticado podrá leer perfiles (la política RLS lo limita a
-- su propia fila). Se usará cuando construyamos el panel interno.
grant select on table public.perfiles to authenticated;


-- ============================================================
--  DATOS INICIALES (opcional) — descomentar y completar
-- ============================================================

-- (A) Perfil del DIRECTOR
--     1. En Supabase: Authentication → Users → "Add user" (email + contraseña).
--     2. Copiá el "User UID" que te muestra.
--     3. Reemplazá <UID_DEL_DIRECTOR> y el email, y ejecutá:
--
-- insert into public.perfiles (id, nombre, apellido, email, rol, nivel)
-- values ('<UID_DEL_DIRECTOR>', 'Nombre', 'Apellido', 'director@instituto.edu', 'director', 'secundario')
-- on conflict (id) do nothing;


-- (B) Código para que se registre la SECRETARÍA (lo emite Dirección):
--
-- insert into public.codigos_aprobacion (codigo, rol_destino, emitido_por)
-- values ('SEC-2026-EJEMPLO', 'secretaria', 'direccion');


-- (C) Código para que se registre un PROFESOR o PRECEPTOR (lo emite Secretaría):
--
-- insert into public.codigos_aprobacion (codigo, rol_destino, emitido_por)
-- values ('PROF-2026-EJEMPLO', 'profesor', 'secretaria');
