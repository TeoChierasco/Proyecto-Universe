/**
 * Gestión de alumnos e inscripciones (solo Secretaría y Dirección).
 *   - Lista los alumnos con su curso asignado.
 *   - Crea cuentas de alumno directamente (sin código: la Secretaría es la autoridad).
 *   - Asigna / cambia / quita el curso de un alumno.
 * Los alumnos que se registran solos también aparecen acá para asignarles curso.
 */
const crypto = require('crypto');
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const ADMINS = ['secretaria', 'director'];
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);

// GET /api/alumnos — lista alumnos con su curso, y la lista de cursos disponibles.
router.get('/', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar alumnos.' });
  }

  const [aluRes, insRes, curRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, email, documento, creado_en').eq('rol', 'alumno').order('apellido').order('nombre'),
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id'),
    supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division'),
  ]);

  if (aluRes.error || insRes.error || curRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los alumnos.' });
  }

  const cursoDe = {};
  insRes.data.forEach((i) => { cursoDe[i.alumno_id] = i.curso_id; });
  const alumnos = aluRes.data.map((a) => ({ ...a, cursoId: cursoDe[a.id] || null }));

  return res.json({ ok: true, alumnos, cursos: curRes.data });
});

// POST /api/alumnos — crea una cuenta de alumno con contraseña temporal.
router.post('/', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede crear alumnos.' });
  }

  const nombre = (req.body.nombre || '').trim();
  const apellido = (req.body.apellido || '').trim();
  const email = (req.body.email || '').trim();
  const documento = (req.body.documento || '').trim();
  const cursoId = req.body.cursoId || null;

  if (!nombre || !apellido || !email || !documento) {
    return res.status(400).json({ ok: false, error: 'Nombre, apellido, email y documento son obligatorios.' });
  }

  // Contraseña temporal (el alumno la cambia luego desde Mi perfil).
  const passwordTemporal = 'IU-' + crypto.randomBytes(4).toString('hex');

  const { data: creado, error: crearError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: passwordTemporal,
    email_confirm: true,
    user_metadata: { nombre, apellido, rol: 'alumno', nivel: 'secundario' },
  });
  if (crearError) {
    const msg = /already been registered|already exists|duplicate/i.test(crearError.message || '')
      ? 'Ya existe una cuenta con ese email.'
      : 'No pudimos crear la cuenta.';
    return res.status(400).json({ ok: false, error: msg });
  }

  const alumnoId = creado.user.id;

  const { error: perfilError } = await supabaseAdmin.from('perfiles').insert({
    id: alumnoId, nombre, apellido, email, rol: 'alumno', nivel: 'secundario', documento,
  });
  if (perfilError) {
    await supabaseAdmin.auth.admin.deleteUser(alumnoId);
    if (/duplicate|unique/i.test(perfilError.message || '')) {
      return res.status(400).json({ ok: false, error: 'Ya existe un alumno con ese documento.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos crear el perfil del alumno.' });
  }

  if (cursoId) {
    await supabaseAdmin.from('inscripciones').upsert({ alumno_id: alumnoId, curso_id: cursoId });
  }

  return res.status(201).json({
    ok: true,
    alumnoId,
    passwordTemporal,
    message: `Cuenta creada para ${nombre} ${apellido}.`,
  });
});

// PATCH /api/alumnos/:id/curso — asigna, cambia o quita (cursoId: null) el curso.
router.patch('/:id/curso', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'No autorizado.' });
  }

  const cursoId = req.body.cursoId || null;

  const { data: perfil, error: buscarError } = await supabaseAdmin
    .from('perfiles').select('rol').eq('id', req.params.id).maybeSingle();
  if (buscarError) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el curso.' });
  if (!perfil || perfil.rol !== 'alumno') {
    return res.status(400).json({ ok: false, error: 'Esa cuenta no es de un alumno.' });
  }

  if (cursoId === null) {
    const { error } = await supabaseAdmin.from('inscripciones').delete().eq('alumno_id', req.params.id);
    if (error) return res.status(500).json({ ok: false, error: 'No pudimos quitar el curso.' });
  } else {
    const { error } = await supabaseAdmin.from('inscripciones').upsert({ alumno_id: req.params.id, curso_id: cursoId });
    if (error) return res.status(500).json({ ok: false, error: 'No pudimos asignar el curso.' });
  }

  return res.json({ ok: true, message: 'Curso actualizado.' });
});

module.exports = router;
