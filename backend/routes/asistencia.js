/**
 * Asistencia.
 *   - Preceptor: toma lista por curso, justifica faltas, marca retiros.
 *   - Preceptor / Secretaría / Dirección: ven la asistencia de los alumnos.
 *   - Preceptor / Secretaría: emiten avisos a la familia por inasistencias.
 *   - Padre: ve la asistencia de sus hijos vinculados.
 *   - Alumno: ve su propia asistencia.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const ESTADOS = ['presente', 'ausente', 'retirado'];
const VER = ['preceptor', 'secretaria', 'director'];
const AVISAR = ['preceptor', 'secretaria'];

// ¿Puede el usuario ver la asistencia de este alumno?
async function puedeVerAlumno(req, alumnoId) {
  const rol = req.perfil.rol;
  if (VER.includes(rol)) return true;
  if (rol === 'padre') {
    const { data } = await supabaseAdmin.from('vinculos').select('id')
      .eq('padre_id', req.userId).eq('alumno_id', alumnoId).eq('estado', 'aprobado').maybeSingle();
    return !!data;
  }
  if (rol === 'alumno') return alumnoId === req.userId;
  return false;
}

// GET /api/asistencia/lista?cursoId=&fecha=  → alumnos del curso + su estado ese día.
router.get('/lista', requireAuth, async (req, res) => {
  if (!VER.includes(req.perfil.rol)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede ver la asistencia.' });
  }
  const cursoId = Number(req.query.cursoId);
  const fecha = req.query.fecha;
  if (!cursoId || !fecha) return res.status(400).json({ ok: false, error: 'Falta el curso o la fecha.' });

  const { data: curso } = await supabaseAdmin.from('cursos').select('id, anio, division').eq('id', cursoId).maybeSingle();
  if (!curso) return res.status(404).json({ ok: false, error: 'El curso no existe.' });

  const { data: ins } = await supabaseAdmin.from('inscripciones').select('alumno_id').eq('curso_id', cursoId);
  const ids = (ins || []).map((i) => i.alumno_id);

  let alumnos = [];
  if (ids.length) {
    const [perfRes, asisRes] = await Promise.all([
      supabaseAdmin.from('perfiles').select('id, nombre, apellido').in('id', ids).order('apellido').order('nombre'),
      supabaseAdmin.from('asistencias').select('id, alumno_id, estado, materia_id, justificada').eq('fecha', fecha).in('alumno_id', ids),
    ]);
    const asisDe = {};
    (asisRes.data || []).forEach((a) => { asisDe[a.alumno_id] = a; });
    alumnos = (perfRes.data || []).map((p) => ({ id: p.id, nombre: p.nombre, apellido: p.apellido, asistencia: asisDe[p.id] || null }));
  }

  const { data: materias } = await supabaseAdmin.from('materias').select('id, nombre').eq('anio', curso.anio).order('nombre');

  return res.json({
    ok: true,
    curso: { id: curso.id, label: `${curso.anio}.º ${curso.division}` },
    alumnos,
    materias: materias || [],
    puedeTomar: req.perfil.rol === 'preceptor',
  });
});

// POST /api/asistencia/lista  (preceptor) → guarda la lista de un curso/fecha.
router.post('/lista', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'preceptor') {
    return res.status(403).json({ ok: false, error: 'Solo el preceptor puede tomar lista.' });
  }
  const { cursoId, fecha, registros } = req.body || {};
  if (!cursoId || !fecha || !Array.isArray(registros)) {
    return res.status(400).json({ ok: false, error: 'Datos incompletos.' });
  }

  const { data: ins } = await supabaseAdmin.from('inscripciones').select('alumno_id').eq('curso_id', cursoId);
  const validos = new Set((ins || []).map((i) => i.alumno_id));

  // No incluimos justificada/observacion: así re-tomar lista no borra una justificación.
  const filas = registros
    .filter((r) => validos.has(r.alumnoId) && ESTADOS.includes(r.estado))
    .map((r) => ({
      alumno_id: r.alumnoId,
      fecha,
      estado: r.estado,
      materia_id: r.estado === 'retirado' ? (r.materiaId || null) : null,
      registrado_por: req.userId,
    }));

  if (!filas.length) return res.status(400).json({ ok: false, error: 'No hay registros válidos para guardar.' });

  const { error } = await supabaseAdmin.from('asistencias').upsert(filas, { onConflict: 'alumno_id,fecha' });
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos guardar la lista.' });

  return res.json({ ok: true, message: `Lista guardada (${filas.length} alumnos).` });
});

// GET /api/asistencia/alumno/:alumnoId  → historial + avisos de un alumno.
router.get('/alumno/:alumnoId', requireAuth, async (req, res) => {
  const alumnoId = req.params.alumnoId === 'mi' ? req.userId : req.params.alumnoId;

  if (!(await puedeVerAlumno(req, alumnoId))) {
    return res.status(403).json({ ok: false, error: 'No podés ver la asistencia de este alumno.' });
  }

  const { data: perfil } = await supabaseAdmin.from('perfiles').select('nombre, apellido, documento, rol').eq('id', alumnoId).maybeSingle();
  if (!perfil || perfil.rol !== 'alumno') return res.status(404).json({ ok: false, error: 'No es un alumno.' });

  const { data: insc } = await supabaseAdmin.from('inscripciones').select('curso_id').eq('alumno_id', alumnoId).maybeSingle();
  let curso = null;
  if (insc && insc.curso_id) {
    const { data: c } = await supabaseAdmin.from('cursos').select('anio, division').eq('id', insc.curso_id).maybeSingle();
    if (c) curso = `${c.anio}.º ${c.division}`;
  }

  const { data: asis } = await supabaseAdmin
    .from('asistencias').select('id, fecha, estado, materia_id, justificada, observacion')
    .eq('alumno_id', alumnoId).order('fecha', { ascending: false });

  const matIds = [...new Set((asis || []).filter((a) => a.materia_id).map((a) => a.materia_id))];
  const nombreMateria = {};
  if (matIds.length) {
    const { data: m } = await supabaseAdmin.from('materias').select('id, nombre').in('id', matIds);
    (m || []).forEach((x) => { nombreMateria[x.id] = x.nombre; });
  }
  const historial = (asis || []).map((a) => ({ ...a, materia: a.materia_id ? nombreMateria[a.materia_id] : null }));

  const { data: avisos } = await supabaseAdmin
    .from('avisos_asistencia').select('id, mensaje, emitido_rol, emitido_nombre, creado_en')
    .eq('alumno_id', alumnoId).order('creado_en', { ascending: false });

  return res.json({
    ok: true,
    alumno: { nombre: perfil.nombre, apellido: perfil.apellido, documento: perfil.documento, curso },
    historial,
    avisos: avisos || [],
    permisos: { justificar: req.perfil.rol === 'preceptor', avisar: AVISAR.includes(req.perfil.rol) },
  });
});

// PATCH /api/asistencia/:id/justificar  (preceptor)
router.patch('/:id/justificar', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'preceptor') {
    return res.status(403).json({ ok: false, error: 'Solo el preceptor puede justificar faltas.' });
  }
  const justificada = !!req.body.justificada;
  const observacion = (req.body.observacion || '').trim() || null;

  const { error } = await supabaseAdmin.from('asistencias')
    .update({ justificada, observacion }).eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos actualizar la justificación.' });

  return res.json({ ok: true, message: justificada ? 'Falta justificada.' : 'Se quitó la justificación.' });
});

// POST /api/asistencia/aviso  (preceptor / secretaría) → aviso a la familia.
router.post('/aviso', requireAuth, async (req, res) => {
  if (!AVISAR.includes(req.perfil.rol)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede enviar avisos.' });
  }
  const alumnoId = req.body.alumnoId;
  const mensaje = (req.body.mensaje || '').trim();
  if (!alumnoId || !mensaje) return res.status(400).json({ ok: false, error: 'Falta el alumno o el mensaje.' });
  if (mensaje.length > 500) return res.status(400).json({ ok: false, error: 'El mensaje es demasiado largo.' });

  const { data: p } = await supabaseAdmin.from('perfiles').select('rol').eq('id', alumnoId).maybeSingle();
  if (!p || p.rol !== 'alumno') return res.status(400).json({ ok: false, error: 'Esa cuenta no es de un alumno.' });

  const { error } = await supabaseAdmin.from('avisos_asistencia').insert({
    alumno_id: alumnoId,
    mensaje,
    emitido_por: req.userId,
    emitido_rol: req.perfil.rol,
    emitido_nombre: `${req.perfil.nombre} ${req.perfil.apellido}`,
  });
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos enviar el aviso.' });

  return res.status(201).json({ ok: true, message: 'Aviso enviado a la familia.' });
});

module.exports = router;
