/**
 * Calificaciones y boletines.
 *
 *   Profesor:
 *     - GET  /mis-cursos            → sus materias y cursos asignados.
 *     - GET  /planilla/:asignacion  → alumnos del curso + notas de esa materia.
 *     - PUT  /planilla/:asignacion  → guarda notas (solo de SUS asignaciones).
 *   Secretaría / Dirección: pueden ver y corregir cualquier planilla.
 *   Boletín (GET /boletin/:alumnoId):
 *     - el propio alumno, sus padres/tutores con vínculo APROBADO,
 *       Secretaría y Dirección.
 *
 * Tabla: calificaciones (ver backend/db/calificaciones.sql).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// ---------- Configuración ----------
const PERIODOS = [
  { id: '1', nombre: '1.er trimestre', corto: '1.º T' },
  { id: '2', nombre: '2.º trimestre',  corto: '2.º T' },
  { id: '3', nombre: '3.er trimestre', corto: '3.º T' },
];
const NOTA_APROBACION = 6;
// ------------------------------------

const ADMINS = ['secretaria', 'director'];
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);
const IDS_PERIODO = PERIODOS.map((p) => p.id);

function cicloDe(req) {
  const c = parseInt(req.query.ciclo || (req.body && req.body.ciclo), 10);
  return c >= 2000 && c <= 2100 ? c : new Date().getFullYear();
}

function promedio(notas) {
  const v = notas.filter((n) => typeof n === 'number');
  if (!v.length) return null;
  return Math.round((v.reduce((s, n) => s + n, 0) / v.length) * 100) / 100;
}

const cursoLabel = (c) => (c ? `${c.anio}.º ${c.division}` : null);

// Carga una asignación y verifica que quien pide pueda usarla.
async function asignacionAutorizada(req, res) {
  const { data: asig, error } = await supabaseAdmin
    .from('docente_asignaciones')
    .select('id, profesor_id, materia_id, curso_id')
    .eq('id', req.params.asignacion)
    .maybeSingle();
  if (error) { res.status(500).json({ ok: false, error: 'No pudimos cargar la materia.' }); return null; }
  if (!asig) { res.status(404).json({ ok: false, error: 'Asignación no encontrada.' }); return null; }
  if (!esAdmin(req) && asig.profesor_id !== req.userId) {
    res.status(403).json({ ok: false, error: 'Solo podés cargar notas de tus materias.' });
    return null;
  }
  return asig;
}

// GET /api/calificaciones/mis-cursos — materias y cursos del profesor.
router.get('/mis-cursos', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'profesor') {
    return res.status(403).json({ ok: false, error: 'Esta sección es para profesores.' });
  }
  const ciclo = cicloDe(req);

  const { data: asig, error } = await supabaseAdmin
    .from('docente_asignaciones')
    .select('id, materia_id, curso_id, horas_semanales')
    .eq('profesor_id', req.userId);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos cargar tus cursos. ¿Está creada la tabla de asignaciones?' });
  if (!asig.length) return res.json({ ok: true, asignaciones: [], periodos: PERIODOS, ciclo });

  const materiaIds = [...new Set(asig.map((a) => a.materia_id))];
  const cursoIds = [...new Set(asig.map((a) => a.curso_id))];
  const [matRes, curRes, insRes, notRes] = await Promise.all([
    supabaseAdmin.from('materias').select('id, nombre').in('id', materiaIds),
    supabaseAdmin.from('cursos').select('id, anio, division').in('id', cursoIds),
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id').in('curso_id', cursoIds),
    supabaseAdmin.from('calificaciones').select('materia_id, curso_id, periodo').in('materia_id', materiaIds).eq('ciclo', ciclo),
  ]);
  if (matRes.error || curRes.error || insRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar tus cursos.' });
  }
  const notas = notRes.error ? [] : notRes.data;

  const asignaciones = asig.map((a) => {
    const curso = curRes.data.find((c) => c.id === a.curso_id);
    const alumnos = insRes.data.filter((i) => i.curso_id === a.curso_id).length;
    // Cuántas notas hay cargadas en cada período (para mostrar el avance).
    const cargadas = {};
    PERIODOS.forEach((p) => {
      cargadas[p.id] = notas.filter((n) => n.materia_id === a.materia_id && n.curso_id === a.curso_id && n.periodo === p.id).length;
    });
    return {
      id: a.id,
      materia: (matRes.data.find((m) => m.id === a.materia_id) || {}).nombre || 'Materia',
      curso: cursoLabel(curso),
      anio: curso ? curso.anio : null,
      horas: a.horas_semanales,
      alumnos,
      cargadas,
    };
  }).sort((x, y) => (x.anio - y.anio) || String(x.curso).localeCompare(String(y.curso)) || x.materia.localeCompare(y.materia));

  return res.json({ ok: true, asignaciones, periodos: PERIODOS, ciclo });
});

// GET /api/calificaciones/planilla/:asignacion — alumnos + notas de una materia en un curso.
router.get('/planilla/:asignacion', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'profesor' && !esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no carga calificaciones.' });
  }
  const asig = await asignacionAutorizada(req, res);
  if (!asig) return;
  const ciclo = cicloDe(req);

  const [matRes, curRes, insRes, profRes] = await Promise.all([
    supabaseAdmin.from('materias').select('id, nombre').eq('id', asig.materia_id).maybeSingle(),
    supabaseAdmin.from('cursos').select('id, anio, division').eq('id', asig.curso_id).maybeSingle(),
    supabaseAdmin.from('inscripciones').select('alumno_id').eq('curso_id', asig.curso_id),
    supabaseAdmin.from('perfiles').select('nombre, apellido').eq('id', asig.profesor_id).maybeSingle(),
  ]);
  if (insRes.error) return res.status(500).json({ ok: false, error: 'No pudimos cargar los alumnos.' });

  const ids = insRes.data.map((i) => i.alumno_id);
  const [aluRes, notRes] = await Promise.all([
    ids.length
      ? supabaseAdmin.from('perfiles').select('id, nombre, apellido').in('id', ids).order('apellido').order('nombre')
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabaseAdmin.from('calificaciones').select('alumno_id, periodo, nota, observacion')
        .eq('materia_id', asig.materia_id).eq('ciclo', ciclo).in('alumno_id', ids)
      : Promise.resolve({ data: [] }),
  ]);
  if (aluRes.error || notRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar las notas. ¿Corriste backend/db/calificaciones.sql?' });
  }

  const alumnos = aluRes.data.map((a) => {
    const notas = {};
    notRes.data.filter((n) => n.alumno_id === a.id).forEach((n) => { notas[n.periodo] = Number(n.nota); });
    return { id: a.id, nombre: a.nombre, apellido: a.apellido, notas, promedio: promedio(Object.values(notas)) };
  });

  return res.json({
    ok: true,
    ciclo,
    periodos: PERIODOS,
    notaAprobacion: NOTA_APROBACION,
    materia: matRes.data ? matRes.data.nombre : 'Materia',
    curso: cursoLabel(curRes.data),
    profesor: profRes.data ? `${profRes.data.apellido}, ${profRes.data.nombre}` : null,
    puedeEditar: true,
    alumnos,
  });
});

// PUT /api/calificaciones/planilla/:asignacion — guarda varias notas a la vez.
// body: { ciclo, notas: [{ alumnoId, periodo, nota }] }  (nota vacía/null = borrar)
router.put('/planilla/:asignacion', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'profesor' && !esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no carga calificaciones.' });
  }
  const asig = await asignacionAutorizada(req, res);
  if (!asig) return;
  const ciclo = cicloDe(req);
  const cambios = Array.isArray(req.body.notas) ? req.body.notas : [];
  if (!cambios.length) return res.status(400).json({ ok: false, error: 'No hay notas para guardar.' });
  if (cambios.length > 500) return res.status(400).json({ ok: false, error: 'Demasiadas notas en un solo envío.' });

  // Solo alumnos inscriptos en ese curso.
  const { data: ins, error: insErr } = await supabaseAdmin
    .from('inscripciones').select('alumno_id').eq('curso_id', asig.curso_id);
  if (insErr) return res.status(500).json({ ok: false, error: 'No pudimos validar los alumnos.' });
  const delCurso = new Set(ins.map((i) => i.alumno_id));

  const guardar = [];
  const borrar = [];
  for (const c of cambios) {
    if (!delCurso.has(c.alumnoId)) {
      return res.status(400).json({ ok: false, error: 'Hay un alumno que no pertenece a este curso.' });
    }
    if (!IDS_PERIODO.includes(String(c.periodo))) {
      return res.status(400).json({ ok: false, error: 'Período no válido.' });
    }
    if (c.nota === null || c.nota === '' || c.nota === undefined) {
      borrar.push(c);
      continue;
    }
    const nota = Number(String(c.nota).replace(',', '.'));
    if (!Number.isFinite(nota) || nota < 1 || nota > 10) {
      return res.status(400).json({ ok: false, error: 'Las notas deben estar entre 1 y 10.' });
    }
    guardar.push({
      alumno_id: c.alumnoId,
      materia_id: asig.materia_id,
      curso_id: asig.curso_id,
      ciclo,
      periodo: String(c.periodo),
      nota: Math.round(nota * 100) / 100,
      cargado_por: req.userId,
      actualizado_en: new Date().toISOString(),
    });
  }

  if (guardar.length) {
    const { error } = await supabaseAdmin
      .from('calificaciones')
      .upsert(guardar, { onConflict: 'alumno_id,materia_id,ciclo,periodo' });
    if (error) return res.status(500).json({ ok: false, error: 'No pudimos guardar las notas.' });
  }
  for (const b of borrar) {
    const { error } = await supabaseAdmin.from('calificaciones').delete()
      .eq('alumno_id', b.alumnoId).eq('materia_id', asig.materia_id)
      .eq('ciclo', ciclo).eq('periodo', String(b.periodo));
    if (error) return res.status(500).json({ ok: false, error: 'No pudimos borrar una nota.' });
  }

  return res.json({ ok: true, message: `Notas guardadas (${guardar.length + borrar.length}).` });
});

// ¿Puede el usuario ver el boletín de este alumno?
async function puedeVerBoletin(req, alumnoId) {
  const rol = req.perfil.rol;
  if (esAdmin(req)) return true;
  if (rol === 'alumno') return alumnoId === req.userId;
  if (rol === 'padre') {
    const { data } = await supabaseAdmin.from('vinculos').select('id')
      .eq('padre_id', req.userId).eq('alumno_id', alumnoId).eq('estado', 'aprobado').maybeSingle();
    return !!data;
  }
  return false;
}

// GET /api/calificaciones/boletin/:alumnoId?ciclo= — boletín del alumno.
// Con alumnoId = "yo" el alumno ve el suyo.
router.get('/boletin/:alumnoId', requireAuth, async (req, res) => {
  const alumnoId = req.params.alumnoId === 'yo' ? req.userId : req.params.alumnoId;
  if (!(await puedeVerBoletin(req, alumnoId))) {
    return res.status(403).json({ ok: false, error: 'No podés ver el boletín de este alumno.' });
  }
  const ciclo = cicloDe(req);

  const [perRes, insRes, notRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, documento, rol').eq('id', alumnoId).maybeSingle(),
    supabaseAdmin.from('inscripciones').select('curso_id').eq('alumno_id', alumnoId).maybeSingle(),
    supabaseAdmin.from('calificaciones').select('materia_id, periodo, nota').eq('alumno_id', alumnoId).eq('ciclo', ciclo),
  ]);
  if (perRes.error || !perRes.data || perRes.data.rol !== 'alumno') {
    return res.status(404).json({ ok: false, error: 'Alumno no encontrado.' });
  }
  if (notRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar las notas. ¿Corriste backend/db/calificaciones.sql?' });
  }

  const cursoId = insRes.data ? insRes.data.curso_id : null;
  const curso = cursoId
    ? (await supabaseAdmin.from('cursos').select('id, anio, division').eq('id', cursoId).maybeSingle()).data
    : null;

  // Materias del año del curso + cualquier materia con nota (por si cambió de curso).
  const materiaIdsConNota = [...new Set(notRes.data.map((n) => n.materia_id))];
  const [matAnio, matNota] = await Promise.all([
    curso ? supabaseAdmin.from('materias').select('id, nombre').eq('anio', curso.anio).order('nombre') : Promise.resolve({ data: [] }),
    materiaIdsConNota.length ? supabaseAdmin.from('materias').select('id, nombre').in('id', materiaIdsConNota) : Promise.resolve({ data: [] }),
  ]);
  const materiasMap = new Map();
  [...(matAnio.data || []), ...(matNota.data || [])].forEach((m) => materiasMap.set(m.id, m));

  const materias = [...materiasMap.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((m) => {
      const notas = {};
      notRes.data.filter((n) => n.materia_id === m.id).forEach((n) => { notas[n.periodo] = Number(n.nota); });
      const prom = promedio(Object.values(notas));
      return { id: m.id, nombre: m.nombre, notas, promedio: prom };
    });

  const promedios = materias.map((m) => m.promedio).filter((p) => p !== null);
  return res.json({
    ok: true,
    ciclo,
    periodos: PERIODOS,
    notaAprobacion: NOTA_APROBACION,
    alumno: { id: perRes.data.id, nombre: perRes.data.nombre, apellido: perRes.data.apellido, documento: perRes.data.documento },
    curso: cursoLabel(curso),
    materias,
    promedioGeneral: promedio(promedios),
    materiasDesaprobadas: materias.filter((m) => m.promedio !== null && m.promedio < NOTA_APROBACION).length,
  });
});

module.exports = router;
