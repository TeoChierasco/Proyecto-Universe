-- ============================================================
--  Instituto Universe — Asistencia: llegadas tarde y avisos automáticos
--  Ejecutar en: Supabase → SQL Editor → New query → Run
--  Requiere: asistencia.sql.  Idempotente.
-- ============================================================
--  - Nuevo estado 'tarde' (llegada tarde). Cuánto suma cada estado al
--    cómputo se configura en backend/config/asistencia.js.
--  - Los avisos a la familia pueden ser automáticos (al llegar a 10, 15,
--    20 y 25 inasistencias). Se guarda el umbral y el ciclo para no
--    repetir el mismo aviso.
-- ============================================================

alter table public.asistencias drop constraint if exists asistencias_estado_check;
alter table public.asistencias add constraint asistencias_estado_check
  check (estado in ('presente', 'ausente', 'retirado', 'tarde'));

alter table public.avisos_asistencia add column if not exists automatico boolean not null default false;
alter table public.avisos_asistencia add column if not exists umbral     numeric(5, 2);
alter table public.avisos_asistencia add column if not exists ciclo      int;

create index if not exists idx_avisos_umbral on public.avisos_asistencia (alumno_id, ciclo, umbral) where automatico;
create index if not exists idx_asistencias_fecha on public.asistencias (fecha);
