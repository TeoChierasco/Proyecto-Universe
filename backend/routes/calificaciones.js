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
 *   Cierre y emisión (Secretaría / Dirección):
 *     - GET /periodos                → estado de cada trimestre + avance de carga.
 *     - PUT /periodos/:periodo       → cerrar / reabrir / publicar / despublicar / fecha límite.
 *     - GET /boletines-curso/:curso  → todos los boletines de un curso (para imprimir).
 *   Un período cerrado (o con la fecha límite vencida) ya no lo puede editar el
 *   profesor. Alumnos y familias solo ven las notas de períodos PUBLICADOS.
 *
 * Tablas: calificaciones (calificaciones.sql) y periodos_estado (cierre.sql).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const { traerTodo } = require('../utils/consultas');

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

/**
 * Estado de los períodos de un ciclo: { '1': { cerrado, publicado, fechaLimite, vencido, bloqueado } }.
 * Si la tabla periodos_estado no existe (falta cierre.sql), todo queda
 * abierto y publicado, como funcionaba antes.
 */
async function estadoPeriodos(ciclo) {
  const { data, error } = await supabaseAdmin
    .from('periodos_estado').select('periodo, fecha_limite, cerrado, publicado, cerrado_en, publicado_en').eq('ciclo', ciclo);
  const sinTabla = !!error;
  const hoy = new Date().toISOString().slice(0, 10);
  const r = {};
  PERIODOS.forEach((p) => {
    const f = (data || []).find((x) => x.periodo === p.id) || {};
    const vencido = !!(f.fecha_limite && hoy > f.fecha_limite);
    r[p.id] = {
      cerrado: !!f.cerrado,
      publicado: sinTabla ? true : !!f.publicado,
      fechaLimite: f.fecha_limite || null,
      vencido,
      bloqueado: !!f.cerrado || vencido,
      cerradoEn: f.cerrado_en || null,
      publicadoEn: f.publicado_en || null,
    };
  });
  return { estados: r, sinTabla };
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
  const { estados } = await estadoPeriodos(ciclo);
  const periodosConEstado = PERIODOS.map((p) => ({ ...p, ...estados[p.id] }));
  if (!asig.length) return res.json({ ok: true, asignaciones: [], periodos: periodosConEstado, ciclo });

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

  return res.json({ ok: true, asignaciones, periodos: periodosConEstado, ciclo });
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

  const { estados } = await estadoPeriodos(ciclo);
  return res.json({
    ok: true,
    ciclo,
    periodos: PERIODOS.map((p) => ({ ...p, ...estados[p.id], editable: esAdmin(req) || !estados[p.id].bloqueado })),
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

  // Períodos cerrados o vencidos: el profesor ya no puede modificarlos.
  const { estados } = await estadoPeriodos(ciclo);
  if (!esAdmin(req)) {
    const bloqueado = cambios.find((c) => estados[String(c.periodo)] && estados[String(c.periodo)].bloqueado);
    if (bloqueado) {
      const p = PERIODOS.find((x) => x.id === String(bloqueado.periodo));
      return res.status(400).json({ ok: false, error: `La carga del ${p ? p.nombre : 'período'} está cerrada. Pedí a Secretaría que la reabra si necesitás corregir.` });
    }
  }

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

/**
 * Arma el boletín de un alumno. Con soloPublicados, las notas de los
 * períodos no publicados se ocultan (alumnos y familias).
 */
function armarBoletin({ alumno, curso, notas, materiasAnio, materiasConNota, estados, soloPublicados, ciclo }) {
  const visibles = notas.filter((n) => !soloPublicados || (estados[n.periodo] && estados[n.periodo].publicado));
  const materiasMap = new Map();
  [...materiasAnio, ...materiasConNota].forEach((m) => materiasMap.set(m.id, m));

  const materias = [...materiasMap.values()]
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
    .map((m) => {
      const ns = {};
      visibles.filter((n) => n.materia_id === m.id).forEach((n) => { ns[n.periodo] = Number(n.nota); });
      return { id: m.id, nombre: m.nombre, notas: ns, promedio: promedio(Object.values(ns)) };
    });

  const promedios = materias.map((m) => m.promedio).filter((p) => p !== null);
  return {
    ciclo,
    periodos: PERIODOS.map((p) => ({ ...p, publicado: estados[p.id].publicado, cerrado: estados[p.id].cerrado })),
    notaAprobacion: NOTA_APROBACION,
    alumno: { id: alumno.id, nombre: alumno.nombre, apellido: alumno.apellido, documento: alumno.documento },
    curso: cursoLabel(curso),
    materias,
    promedioGeneral: promedio(promedios),
    materiasDesaprobadas: materias.filter((m) => m.promedio !== null && m.promedio < NOTA_APROBACION).length,
    soloPublicados,
  };
}

// GET /api/calificaciones/boletin/:alumnoId?ciclo= — boletín del alumno.
// Con alumnoId = "yo" el alumno ve el suyo.
router.get('/boletin/:alumnoId', requireAuth, async (req, res) => {
  const alumnoId = req.params.alumnoId === 'yo' ? req.userId : req.params.alumnoId;
  if (!(await puedeVerBoletin(req, alumnoId))) {
    return res.status(403).json({ ok: false, error: 'No podés ver el boletín de este alumno.' });
  }
  const ciclo = cicloDe(req);

  const [perRes, insRes, notRes, est] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, documento, rol').eq('id', alumnoId).maybeSingle(),
    supabaseAdmin.from('inscripciones').select('curso_id').eq('alumno_id', alumnoId).maybeSingle(),
    supabaseAdmin.from('calificaciones').select('materia_id, periodo, nota').eq('alumno_id', alumnoId).eq('ciclo', ciclo),
    estadoPeriodos(ciclo),
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

  return res.json({
    ok: true,
    ...armarBoletin({
      alumno: perRes.data, curso, notas: notRes.data,
      materiasAnio: matAnio.data || [], materiasConNota: matNota.data || [],
      estados: est.estados, soloPublicados: !esAdmin(req), ciclo,
    }),
  });
});

// ============================================================
//  Cierre de notas y emisión de boletines (Secretaría / Dirección)
// ============================================================

// GET /api/calificaciones/periodos?ciclo= — estado y avance de carga de cada período.
router.get('/periodos', requireAuth, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'Solo Secretaría y Dirección.' });
  const ciclo = cicloDe(req);
  try {
    const [{ estados, sinTabla }, asig, ins, notas, cursos, materias] = await Promise.all([
      estadoPeriodos(ciclo),
      traerTodo(() => supabaseAdmin.from('docente_asignaciones').select('id, profesor_id, materia_id, curso_id')),
      traerTodo(() => supabaseAdmin.from('inscripciones').select('alumno_id, curso_id')),
      traerTodo(() => supabaseAdmin.from('calificaciones').select('alumno_id, materia_id, curso_id, periodo').eq('ciclo', ciclo)),
      traerTodo(() => supabaseAdmin.from('cursos').select('id, anio, division')),
      traerTodo(() => supabaseAdmin.from('materias').select('id, nombre')),
    ]);
    const profIds = [...new Set(asig.map((a) => a.profesor_id))];
    const profs = profIds.length ? (await supabaseAdmin.from('perfiles').select('id, nombre, apellido').in('id', profIds)).data || [] : [];

    const alumnosDe = {};
    ins.forEach((i) => { (alumnosDe[i.curso_id] = alumnosDe[i.curso_id] || new Set()).add(i.alumno_id); });

    const periodos = PERIODOS.map((p) => {
      let esperadas = 0;
      let cargadas = 0;
      const incompletas = [];
      asig.forEach((a) => {
        const alumnos = alumnosDe[a.curso_id] || new Set();
        if (!alumnos.size) return;
        const conNota = new Set(notas
          .filter((n) => n.periodo === p.id && n.materia_id === a.materia_id && alumnos.has(n.alumno_id))
          .map((n) => n.alumno_id)).size;
        esperadas += alumnos.size;
        cargadas += conNota;
        if (conNota < alumnos.size) {
          const c = cursos.find((x) => x.id === a.curso_id);
          const pr = profs.find((x) => x.id === a.profesor_id);
          incompletas.push({
            asignacionId: a.id,
            curso: cursoLabel(c),
            anio: c ? c.anio : 99,
            materia: (materias.find((m) => m.id === a.materia_id) || {}).nombre || 'Materia',
            profesor: pr ? `${pr.apellido}, ${pr.nombre}` : '—',
            cargadas: conNota,
            alumnos: alumnos.size,
          });
        }
      });
      incompletas.sort((x, y) => x.anio - y.anio || x.curso.localeCompare(y.curso) || x.materia.localeCompare(y.materia, 'es'));
      return {
        ...p, ...estados[p.id],
        esperadas, cargadas,
        avance: esperadas ? Math.round((cargadas / esperadas) * 1000) / 10 : null,
        incompletas,
      };
    });

    return res.json({ ok: true, ciclo, sinTabla, periodos });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar el estado de los períodos.' });
  }
});

// PUT /api/calificaciones/periodos/:periodo — body: { ciclo, accion, fechaLimite }
//   accion: 'cerrar' | 'reabrir' | 'publicar' | 'despublicar' | 'fecha'
router.put('/periodos/:periodo', requireAuth, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'Solo Secretaría y Dirección.' });
  const periodo = String(req.params.periodo);
  const p = PERIODOS.find((x) => x.id === periodo);
  if (!p) return res.status(400).json({ ok: false, error: 'Período no válido.' });
  const ciclo = cicloDe(req);
  const accion = req.body.accion;
  const ahora = new Date().toISOString();

  const { data: actual, error: errActual } = await supabaseAdmin
    .from('periodos_estado').select('*').eq('ciclo', ciclo).eq('periodo', periodo).maybeSingle();
  if (errActual) {
    return res.status(500).json({ ok: false, error: 'Falta crear la tabla de períodos (corré backend/db/cierre.sql en Supabase).' });
  }
  const fila = { ciclo, periodo, ...(actual || {}) };

  let mensaje = '';
  if (accion === 'cerrar') {
    Object.assign(fila, { cerrado: true, cerrado_por: req.userId, cerrado_en: ahora });
    mensaje = `Carga del ${p.nombre} cerrada.`;
  } else if (accion === 'reabrir') {
    Object.assign(fila, { cerrado: false, cerrado_por: null, cerrado_en: null, publicado: false, publicado_por: null, publicado_en: null });
    mensaje = `${p.nombre} reabierto. Se despublicó el boletín hasta que lo vuelvas a emitir.`;
  } else if (accion === 'publicar') {
    if (!fila.cerrado) return res.status(400).json({ ok: false, error: 'Primero cerrá la carga de notas del período.' });
    Object.assign(fila, { publicado: true, publicado_por: req.userId, publicado_en: ahora });
    mensaje = `Boletines del ${p.nombre} emitidos: ya los ven alumnos y familias.`;
  } else if (accion === 'despublicar') {
    Object.assign(fila, { publicado: false, publicado_por: null, publicado_en: null });
    mensaje = `Se ocultaron los boletines del ${p.nombre}.`;
  } else if (accion === 'fecha') {
    const f = String(req.body.fechaLimite || '');
    fila.fecha_limite = /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : null;
    mensaje = fila.fecha_limite ? 'Fecha límite guardada.' : 'Se quitó la fecha límite.';
  } else {
    return res.status(400).json({ ok: false, error: 'Acción no válida.' });
  }

  const { error } = await supabaseAdmin.from('periodos_estado').upsert(fila, { onConflict: 'ciclo,periodo' });
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el período.' });

  // Al emitir boletines, aviso en la cartelera para alumnos y familias.
  if (accion === 'publicar' && req.body.avisar !== false) {
    await supabaseAdmin.from('comunicados').insert({
      titulo: `Boletines del ${p.nombre} ${ciclo}`,
      cuerpo: `Ya están disponibles las calificaciones del ${p.nombre}. Podés verlas en "Calificaciones" (alumnos) o en "Mis hijos/as → Ver boletín" (familias).`,
      audiencia: 'todos',
      autor_id: req.userId,
      autor_nombre: `${req.perfil.nombre} ${req.perfil.apellido}`,
      autor_rol: req.perfil.rol,
    });
  }

  return res.json({ ok: true, message: mensaje });
});

// GET /api/calificaciones/boletines-curso/:cursoId?ciclo= — todos los boletines de un curso.
router.get('/boletines-curso/:cursoId', requireAuth, async (req, res) => {
  if (!esAdmin(req)) return res.status(403).json({ ok: false, error: 'Solo Secretaría y Dirección.' });
  const ciclo = cicloDe(req);
  const cursoId = Number(req.params.cursoId);
  try {
    const { data: curso } = await supabaseAdmin.from('cursos').select('id, anio, division').eq('id', cursoId).maybeSingle();
    if (!curso) return res.status(404).json({ ok: false, error: 'El curso no existe.' });
    const { data: ins } = await supabaseAdmin.from('inscripciones').select('alumno_id').eq('curso_id', cursoId);
    const ids = (ins || []).map((i) => i.alumno_id);
    if (!ids.length) return res.json({ ok: true, curso: cursoLabel(curso), boletines: [] });

    const [alumnos, notas, materiasAnio, est] = await Promise.all([
      traerTodo(() => supabaseAdmin.from('perfiles').select('id, nombre, apellido, documento').in('id', ids).order('apellido').order('nombre')),
      traerTodo(() => supabaseAdmin.from('calificaciones').select('alumno_id, materia_id, periodo, nota').in('alumno_id', ids).eq('ciclo', ciclo)),
      traerTodo(() => supabaseAdmin.from('materias').select('id, nombre').eq('anio', curso.anio).order('nombre')),
      estadoPeriodos(ciclo),
    ]);
    const soloPublicados = req.query.soloPublicados === '1';
    const boletines = alumnos.map((a) => armarBoletin({
      alumno: a, curso, notas: notas.filter((n) => n.alumno_id === a.id),
      materiasAnio, materiasConNota: [], estados: est.estados, soloPublicados, ciclo,
    }));
    return res.json({ ok: true, curso: cursoLabel(curso), ciclo, boletines });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos armar los boletines del curso.' });
  }
});

module.exports = router;
