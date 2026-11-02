/**
 * Gestión de alumnos e inscripciones (solo Secretaría y Dirección).
 *   - Lista los alumnos con su curso asignado.
 *   - Crea cuentas de alumno directamente (sin código: la Secretaría es la autoridad).
 *   - Asigna / cambia / quita el curso de un alumno.
 *   - Registra bajas y pases (y reincorporaciones), con historial.
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

  const [aluRes, insRes, curRes, movRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, email, documento, creado_en, situacion').eq('rol', 'alumno').order('apellido').order('nombre'),
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id'),
    supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division'),
    supabaseAdmin.from('movimientos_alumnos').select('alumno_id, tipo, fecha, motivo, escuela_destino, creado_en').order('creado_en', { ascending: false }),
  ]);

  if (aluRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los alumnos. ¿Corriste backend/db/bajas.sql en Supabase?' });
  }
  if (insRes.error || curRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los alumnos.' });
  }

  const cursoDe = {};
  insRes.data.forEach((i) => { cursoDe[i.alumno_id] = i.curso_id; });
  // Último movimiento de cada alumno (la lista viene ordenada del más nuevo al más viejo).
  const ultimoMov = {};
  (movRes.error ? [] : movRes.data).forEach((m) => { if (!ultimoMov[m.alumno_id]) ultimoMov[m.alumno_id] = m; });

  const alumnos = aluRes.data.map((a) => {
    const m = ultimoMov[a.id];
    return {
      ...a,
      situacion: a.situacion || 'activo',
      cursoId: cursoDe[a.id] || null,
      movimiento: m && a.situacion !== 'activo'
        ? { tipo: m.tipo, fecha: m.fecha, motivo: m.motivo, escuelaDestino: m.escuela_destino }
        : null,
    };
  });

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
    .from('perfiles').select('rol, situacion').eq('id', req.params.id).maybeSingle();
  if (buscarError) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el curso.' });
  if (!perfil || perfil.rol !== 'alumno') {
    return res.status(400).json({ ok: false, error: 'Esa cuenta no es de un alumno.' });
  }
  if (cursoId !== null && perfil.situacion && perfil.situacion !== 'activo') {
    return res.status(400).json({ ok: false, error: 'El alumno está dado de baja. Reincorporalo antes de asignarle un curso.' });
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

// ------------------------------------------------------------
//  Bajas, pases y reincorporaciones
// ------------------------------------------------------------
const TIPOS_SALIDA = ['baja', 'pase'];

function fechaValida(v) {
  const t = String(v || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10);
}

async function buscarAlumno(id) {
  const { data, error } = await supabaseAdmin
    .from('perfiles').select('id, nombre, apellido, rol, situacion').eq('id', id).maybeSingle();
  if (error) throw error;
  return data && data.rol === 'alumno' ? data : null;
}

// POST /api/alumnos/:id/baja — registra una baja o un pase a otra escuela.
// body: { tipo: 'baja' | 'pase', fecha, motivo, escuelaDestino }
router.post('/:id/baja', requireAuth, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });

  const tipo = req.body.tipo;
  const motivo = (req.body.motivo || '').trim().slice(0, 500) || null;
  const escuelaDestino = (req.body.escuelaDestino || '').trim().slice(0, 200) || null;
  if (!TIPOS_SALIDA.includes(tipo)) return res.status(400).json({ ok: false, error: 'Elegí si es baja o pase.' });
  if (tipo === 'pase' && !escuelaDestino) {
    return res.status(400).json({ ok: false, error: 'Para un pase indicá la escuela de destino.' });
  }

  try {
    const alumno = await buscarAlumno(req.params.id);
    if (!alumno) return res.status(404).json({ ok: false, error: 'Alumno no encontrado.' });
    if (alumno.situacion && alumno.situacion !== 'activo') {
      return res.status(400).json({ ok: false, error: 'El alumno ya figura con baja o pase.' });
    }

    const { data: ins } = await supabaseAdmin
      .from('inscripciones').select('curso_id').eq('alumno_id', alumno.id).maybeSingle();

    const { error: movError } = await supabaseAdmin.from('movimientos_alumnos').insert({
      alumno_id: alumno.id,
      tipo,
      fecha: fechaValida(req.body.fecha),
      motivo,
      escuela_destino: tipo === 'pase' ? escuelaDestino : null,
      curso_id: ins ? ins.curso_id : null,
      registrado_por: req.userId,
    });
    if (movError) throw movError;

    const { error: perError } = await supabaseAdmin
      .from('perfiles').update({ situacion: tipo }).eq('id', alumno.id);
    if (perError) throw perError;

    // Sale de su curso: deja de aparecer en asistencia y planillas.
    await supabaseAdmin.from('inscripciones').delete().eq('alumno_id', alumno.id);

    return res.json({
      ok: true,
      message: tipo === 'pase'
        ? `Pase registrado: ${alumno.nombre} ${alumno.apellido} → ${escuelaDestino}.`
        : `Baja registrada para ${alumno.nombre} ${alumno.apellido}.`,
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos registrar el movimiento. ¿Corriste backend/db/bajas.sql en Supabase?' });
  }
});

// POST /api/alumnos/:id/reincorporar — vuelve a activo (opcionalmente con curso).
router.post('/:id/reincorporar', requireAuth, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const cursoId = req.body.cursoId ? Number(req.body.cursoId) : null;

  try {
    const alumno = await buscarAlumno(req.params.id);
    if (!alumno) return res.status(404).json({ ok: false, error: 'Alumno no encontrado.' });
    if (!alumno.situacion || alumno.situacion === 'activo') {
      return res.status(400).json({ ok: false, error: 'El alumno ya está activo.' });
    }

    const { error: movError } = await supabaseAdmin.from('movimientos_alumnos').insert({
      alumno_id: alumno.id,
      tipo: 'reincorporacion',
      fecha: fechaValida(req.body.fecha),
      motivo: (req.body.motivo || '').trim().slice(0, 500) || null,
      curso_id: cursoId,
      registrado_por: req.userId,
    });
    if (movError) throw movError;

    const { error: perError } = await supabaseAdmin
      .from('perfiles').update({ situacion: 'activo' }).eq('id', alumno.id);
    if (perError) throw perError;

    if (cursoId) {
      await supabaseAdmin.from('inscripciones').upsert({ alumno_id: alumno.id, curso_id: cursoId });
    }

    return res.json({ ok: true, message: `${alumno.nombre} ${alumno.apellido} fue reincorporado/a.` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos reincorporar al alumno.' });
  }
});

// GET /api/alumnos/:id/movimientos — historial de bajas, pases y reincorporaciones.
router.get('/:id/movimientos', requireAuth, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const { data, error } = await supabaseAdmin
    .from('movimientos_alumnos')
    .select('id, tipo, fecha, motivo, escuela_destino, curso_id, creado_en')
    .eq('alumno_id', req.params.id)
    .order('creado_en', { ascending: false });
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos cargar el historial.' });
  return res.json({ ok: true, movimientos: data });
});

module.exports = router;
