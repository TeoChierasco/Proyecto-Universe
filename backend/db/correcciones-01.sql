-- ============================================================
--  Instituto Universe — Correcciones 01 (noviembre 2026)
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Correr DESPUÉS de todos los demás archivos de backend/db/.
--  Idempotente: se puede volver a correr sin romper nada.
-- ============================================================


-- ------------------------------------------------------------
--  1) Códigos de aprobación para Padre/Tutor
--  inscripciones.sql redefinía la restricción sin incluir 'padre',
--  y si se corría después de familia.sql los padres no podían
--  registrarse. Se vuelve a definir con todos los roles.
-- ------------------------------------------------------------
alter table public.codigos_aprobacion drop constraint if exists codigos_aprobacion_rol_destino_check;
alter table public.codigos_aprobacion add constraint codigos_aprobacion_rol_destino_check
  check (rol_destino in ('alumno', 'padre', 'profesor', 'preceptor', 'secretaria'));


-- ------------------------------------------------------------
--  2) Vínculos familiares con aprobación de Secretaría
--  Antes, cualquier padre que conociera el DNI de un alumno podía
--  vincularse y ver sus datos. Ahora el padre envía una SOLICITUD
--  y Secretaría/Dirección la aprueba o rechaza.
--
--  IMPORTANTE: los vínculos que ya existían quedan como 'pendiente'
--  (no fueron verificados). Secretaría debe revisarlos desde
--  "Vínculos familiares" en el panel.
-- ------------------------------------------------------------
alter table public.vinculos add column if not exists estado text not null default 'pendiente';
alter table public.vinculos drop constraint if exists vinculos_estado_check;
alter table public.vinculos add constraint vinculos_estado_check
  check (estado in ('pendiente', 'aprobado', 'rechazado'));

alter table public.vinculos add column if not exists parentesco   text;
alter table public.vinculos add column if not exists revisado_por uuid references auth.users (id) on delete set null;
alter table public.vinculos add column if not exists revisado_en  timestamptz;

create index if not exists idx_vinculos_estado on public.vinculos (estado);
