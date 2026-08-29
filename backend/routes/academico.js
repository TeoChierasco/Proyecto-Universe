/**
 * Rutas de la estructura académica (cursos, materias, talleres).
 * Protegidas: requieren sesión válida.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// GET /api/academico/estructura
// Devuelve el plan de estudios: años, materias y talleres.
router.get('/estructura', requireAuth, async (req, res) => {
  try {
    const [materiasRes, talleresRes, cursosRes] = await Promise.all([
      supabaseAdmin.from('materias').select('id, nombre, anio, taller_id').order('anio').order('nombre'),
      supabaseAdmin.from('talleres').select('id, nombre, anio').order('anio').order('nombre'),
      supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division'),
    ]);

    if (materiasRes.error) throw materiasRes.error;
    if (talleresRes.error) throw talleresRes.error;

    return res.json({
      ok: true,
      anios: [1, 2, 3, 4, 5],
      // Si la tabla cursos aún no existe (falta correr el SQL), devolvemos [].
      cursos: cursosRes.error ? [] : cursosRes.data,
      materias: materiasRes.data,
      talleres: talleresRes.data,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar el plan de estudios.' });
  }
});

// ------------------------------------------------------------
//  Gestión del plan de estudios (solo Secretaría y Dirección)
// ------------------------------------------------------------
const GESTORES = ['secretaria', 'director'];
const puedeGestionar = (req) => GESTORES.includes(req.perfil.rol);

function validarAnio(anio) {
  const n = parseInt(anio, 10);
  return n >= 1 && n <= 5 ? n : null;
}

// POST /api/academico/materias
router.post('/materias', requireAuth, async (req, res) => {
  if (!puedeGestionar(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede editar el plan de estudios.' });
  }
  const nombre = (req.body.nombre || '').trim();
  const anio = validarAnio(req.body.anio);
  const tallerId = req.body.tallerId || null;

  if (!nombre) return res.status(400).json({ ok: false, error: 'El nombre de la materia es obligatorio.' });
  if (!anio) return res.status(400).json({ ok: false, error: 'El año no es válido.' });

  const { data, error } = await supabaseAdmin
    .from('materias')
    .insert({ nombre, anio, taller_id: tallerId })
    .select('id, nombre, anio, taller_id')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      return res.status(400).json({ ok: false, error: 'Ya existe una materia con ese nombre en ese año.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos crear la materia.' });
  }
  return res.status(201).json({ ok: true, materia: data });
});

// DELETE /api/academico/materias/:id
router.delete('/materias/:id', requireAuth, async (req, res) => {
  if (!puedeGestionar(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const { error } = await supabaseAdmin.from('materias').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar la materia.' });
  return res.json({ ok: true });
});

// POST /api/academico/talleres
router.post('/talleres', requireAuth, async (req, res) => {
  if (!puedeGestionar(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede editar el plan de estudios.' });
  }
  const nombre = (req.body.nombre || '').trim();
  const anio = validarAnio(req.body.anio);

  if (!nombre) return res.status(400).json({ ok: false, error: 'El nombre del taller es obligatorio.' });
  if (!anio) return res.status(400).json({ ok: false, error: 'El año no es válido.' });

  const { data, error } = await supabaseAdmin
    .from('talleres')
    .insert({ nombre, anio })
    .select('id, nombre, anio')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      return res.status(400).json({ ok: false, error: 'Ya existe un taller con ese nombre en ese año.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos crear el taller.' });
  }
  return res.status(201).json({ ok: true, taller: data });
});

// DELETE /api/academico/talleres/:id
// (Sus materias no se borran: quedan como materias sueltas del año.)
router.delete('/talleres/:id', requireAuth, async (req, res) => {
  if (!puedeGestionar(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const { error } = await supabaseAdmin.from('talleres').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar el taller.' });
  return res.json({ ok: true });
});

// POST /api/academico/cursos — crea una división para un año (ej.: 1.º A).
router.post('/cursos', requireAuth, async (req, res) => {
  if (!puedeGestionar(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede editar los cursos.' });
  }
  const anio = validarAnio(req.body.anio);
  const division = (req.body.division || '').trim().toUpperCase();

  if (!anio) return res.status(400).json({ ok: false, error: 'El año no es válido.' });
  if (!division) return res.status(400).json({ ok: false, error: 'La división es obligatoria.' });
  if (division.length > 4) return res.status(400).json({ ok: false, error: 'La división es demasiado larga.' });

  const { data, error } = await supabaseAdmin
    .from('cursos')
    .insert({ anio, division })
    .select('id, anio, division')
    .single();

  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      return res.status(400).json({ ok: false, error: 'Esa división ya existe en ese año.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos crear la división.' });
  }
  return res.status(201).json({ ok: true, curso: data });
});

// DELETE /api/academico/cursos/:id — elimina una división.
router.delete('/cursos/:id', requireAuth, async (req, res) => {
  if (!puedeGestionar(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const { error } = await supabaseAdmin.from('cursos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar la división.' });
  return res.json({ ok: true });
});

module.exports = router;
