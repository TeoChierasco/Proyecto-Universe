/**
 * Vínculos familiares: un padre/tutor asocia a sus hijos ingresando el
 * documento (DNI) del alumno. Luego puede ver sus datos (curso, etc.).
 * Solo el rol 'padre' gestiona sus propios hijos.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const esPadre = (req) => req.perfil.rol === 'padre';

// GET /api/familia/hijos — lista los hijos vinculados al padre, con su curso.
router.get('/hijos', requireAuth, async (req, res) => {
  if (!esPadre(req)) {
    return res.status(403).json({ ok: false, error: 'Solo los padres/tutores pueden ver sus hijos.' });
  }

  const { data: vinculos, error: vErr } = await supabaseAdmin
    .from('vinculos').select('alumno_id').eq('padre_id', req.userId);
  if (vErr) return res.status(500).json({ ok: false, error: 'No pudimos cargar tus hijos.' });

  const ids = vinculos.map((v) => v.alumno_id);
  if (ids.length === 0) return res.json({ ok: true, hijos: [] });

  const [perfilesRes, insRes, cursosRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, documento').in('id', ids),
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id').in('alumno_id', ids),
    supabaseAdmin.from('cursos').select('id, anio, division'),
  ]);
  if (perfilesRes.error || insRes.error || cursosRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar tus hijos.' });
  }

  const cursoDeId = {};
  cursosRes.data.forEach((c) => { cursoDeId[c.id] = `${c.anio}.º ${c.division}`; });
  const cursoDeAlumno = {};
  insRes.data.forEach((i) => { cursoDeAlumno[i.alumno_id] = cursoDeId[i.curso_id] || null; });

  const hijos = perfilesRes.data.map((p) => ({
    id: p.id, nombre: p.nombre, apellido: p.apellido,
    curso: cursoDeAlumno[p.id] || null,
  }));

  return res.json({ ok: true, hijos });
});

// POST /api/familia/hijos — vincula un hijo por su documento.
router.post('/hijos', requireAuth, async (req, res) => {
  if (!esPadre(req)) {
    return res.status(403).json({ ok: false, error: 'Solo los padres/tutores pueden agregar hijos.' });
  }

  const documento = (req.body.documento || '').trim();
  if (!documento) {
    return res.status(400).json({ ok: false, error: 'Ingresá el documento (DNI) del alumno.' });
  }

  // Buscar al alumno por documento.
  const { data: alumno, error: buscarError } = await supabaseAdmin
    .from('perfiles').select('id, rol, nombre, apellido').eq('documento', documento).maybeSingle();
  if (buscarError) return res.status(500).json({ ok: false, error: 'No pudimos buscar al alumno.' });
  if (!alumno || alumno.rol !== 'alumno') {
    return res.status(404).json({ ok: false, error: 'No encontramos un alumno con ese documento.' });
  }

  const { error: insertError } = await supabaseAdmin
    .from('vinculos').insert({ padre_id: req.userId, alumno_id: alumno.id });
  if (insertError) {
    if (/duplicate|unique/i.test(insertError.message || '')) {
      return res.status(400).json({ ok: false, error: 'Ese alumno ya está vinculado a tu cuenta.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos vincular al alumno.' });
  }

  return res.status(201).json({ ok: true, message: `${alumno.nombre} ${alumno.apellido} fue vinculado a tu cuenta.` });
});

// DELETE /api/familia/hijos/:alumnoId — quita un vínculo.
router.delete('/hijos/:alumnoId', requireAuth, async (req, res) => {
  if (!esPadre(req)) {
    return res.status(403).json({ ok: false, error: 'No autorizado.' });
  }
  const { error } = await supabaseAdmin
    .from('vinculos').delete().eq('padre_id', req.userId).eq('alumno_id', req.params.alumnoId);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos quitar el vínculo.' });
  return res.json({ ok: true });
});

module.exports = router;
