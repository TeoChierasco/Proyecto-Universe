/**
 * Profesores y sus asignaciones (materia + curso + horas semanales).
 *   - Secretaría y Dirección ven a todos los profesores y gestionan asignaciones.
 *   - Cada profesor puede consultar sus propias asignaciones (GET /mias).
 * Tabla: docente_asignaciones (ver backend/db/secretaria.sql).
 * Las cuentas de profesor se crean con código de aprobación (codigos.html).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const ADMINS = ['secretaria', 'director'];
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);

function soloAdmin(req, res, next) {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar profesores.' });
  }
  next();
}

async function cargarAsignaciones(filtroProfesor) {
  let q = supabaseAdmin
    .from('docente_asignaciones')
    .select('id, profesor_id, materia_id, curso_id, horas_semanales')
    .order('curso_id');
  if (filtroProfesor) q = q.eq('profesor_id', filtroProfesor);
  return q;
}

// GET /api/profesores — profesores con sus asignaciones + catálogo de materias y cursos.
router.get('/', requireAuth, soloAdmin, async (req, res) => {
  const [profRes, asiRes, matRes, curRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, email').eq('rol', 'profesor').order('apellido').order('nombre'),
    cargarAsignaciones(),
    supabaseAdmin.from('materias').select('id, nombre, anio').order('anio').order('nombre'),
    supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division'),
  ]);

  if (profRes.error || matRes.error || curRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los profesores.' });
  }
  if (asiRes.error) {
    return res.status(500).json({ ok: false, error: 'Falta crear la tabla de asignaciones (corré backend/db/secretaria.sql en Supabase).' });
  }

  const profesores = profRes.data.map((p) => ({
    ...p,
    asignaciones: asiRes.data
      .filter((a) => a.profesor_id === p.id)
      .map((a) => ({ id: a.id, materiaId: a.materia_id, cursoId: a.curso_id, horas: a.horas_semanales })),
  }));

  return res.json({ ok: true, profesores, materias: matRes.data, cursos: curRes.data });
});

// GET /api/profesores/mias — asignaciones del profesor que consulta.
router.get('/mias', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'profesor') {
    return res.status(403).json({ ok: false, error: 'Solo para profesores.' });
  }
  const { data, error } = await cargarAsignaciones(req.userId);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos cargar tus cursos.' });
  return res.json({ ok: true, asignaciones: data });
});

// POST /api/profesores/asignaciones — asigna una materia de un curso a un profesor.
router.post('/asignaciones', requireAuth, soloAdmin, async (req, res) => {
  const profesorId = req.body.profesorId;
  const materiaId = Number(req.body.materiaId);
  const cursoId = Number(req.body.cursoId);
  const horas = req.body.horas === '' || req.body.horas == null ? null : Number(req.body.horas);

  if (!profesorId || !materiaId || !cursoId) {
    return res.status(400).json({ ok: false, error: 'Elegí profesor, materia y curso.' });
  }
  if (horas !== null && (!Number.isInteger(horas) || horas < 0 || horas > 40)) {
    return res.status(400).json({ ok: false, error: 'Las horas semanales deben ser un número entre 0 y 40.' });
  }

  // Validaciones: que sea un profesor y que la materia sea del mismo año que el curso.
  const [profRes, matRes, curRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('rol').eq('id', profesorId).maybeSingle(),
    supabaseAdmin.from('materias').select('anio').eq('id', materiaId).maybeSingle(),
    supabaseAdmin.from('cursos').select('anio').eq('id', cursoId).maybeSingle(),
  ]);
  if (!profRes.data || profRes.data.rol !== 'profesor') {
    return res.status(400).json({ ok: false, error: 'La cuenta elegida no es de un profesor.' });
  }
  if (!matRes.data || !curRes.data) {
    return res.status(400).json({ ok: false, error: 'Materia o curso inexistente.' });
  }
  if (matRes.data.anio !== curRes.data.anio) {
    return res.status(400).json({ ok: false, error: 'La materia no corresponde al año de ese curso.' });
  }

  const { data, error } = await supabaseAdmin
    .from('docente_asignaciones')
    .insert({ profesor_id: profesorId, materia_id: materiaId, curso_id: cursoId, horas_semanales: horas })
    .select('id, materia_id, curso_id, horas_semanales')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      return res.status(400).json({ ok: false, error: 'Esa materia ya tiene un profesor asignado en ese curso.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos guardar la asignación.' });
  }

  return res.status(201).json({
    ok: true,
    asignacion: { id: data.id, materiaId: data.materia_id, cursoId: data.curso_id, horas: data.horas_semanales },
  });
});

// DELETE /api/profesores/asignaciones/:id — quita una asignación.
router.delete('/asignaciones/:id', requireAuth, soloAdmin, async (req, res) => {
  const { error } = await supabaseAdmin.from('docente_asignaciones').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos quitar la asignación.' });
  return res.json({ ok: true });
});

module.exports = router;
