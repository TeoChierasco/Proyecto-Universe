/**
 * Resumen general y reportes (Dirección y Secretaría).
 *   GET /api/reportes/resumen       → indicadores del día y alertas.
 *   GET /api/reportes/asistencia    → presentismo por curso y por alumno (rango de fechas).
 *   GET /api/reportes/rendimiento   → promedios por materia y alumnos en riesgo (ciclo/período).
 *   GET /api/reportes/movimientos   → bajas, pases y reincorporaciones del ciclo.
 *
 * Solo lectura. Las tablas que todavía no existan se toman como vacías,
 * así el resumen funciona aunque falte correr algún SQL.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');
const { traerTodo } = require('../utils/consultas');
const reglasAsistencia = require('../config/asistencia');

const router = express.Router();

const ADMINS = ['director', 'secretaria'];
const NOTA_APROBACION = 6;       // igual que en calificaciones.js
const UMBRAL_RIESGO = 2;         // materias por debajo de la nota de aprobación
const TOTAL_DOCUMENTOS = 6;      // igual que en legajos.js

router.use(requireAuth, (req, res, next) => {
  if (!ADMINS.includes(req.perfil.rol)) {
    return res.status(403).json({ ok: false, error: 'Los reportes son para Dirección y Secretaría.' });
  }
  next();
});

const hoyISO = () => new Date().toISOString().slice(0, 10);
function haceDias(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fechaParam(v, porDefecto) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : porDefecto;
}
function cicloParam(v) {
  const c = parseInt(v, 10);
  return c >= 2000 && c <= 2100 ? c : new Date().getFullYear();
}
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const prom = (arr) => (arr.length ? Math.round((arr.reduce((s, n) => s + n, 0) / arr.length) * 100) / 100 : null);
const cursoLabel = (c) => (c ? `${c.anio}.º ${c.division}` : 'Sin curso');

// Datos base que usan casi todos los reportes.
async function base() {
  // Si todavía no se corrió bajas.sql no existe la columna "situacion": todos cuentan como activos.
  const perfilesConSituacion = () => traerTodo(() => supabaseAdmin.from('perfiles').select('id, nombre, apellido, rol, situacion'))
    .catch(() => traerTodo(() => supabaseAdmin.from('perfiles').select('id, nombre, apellido, rol')));
  const [perfiles, inscripciones, cursos] = await Promise.all([
    perfilesConSituacion(),
    traerTodo(() => supabaseAdmin.from('inscripciones').select('alumno_id, curso_id')),
    traerTodo(() => supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division')),
  ]);
  const cursoDe = {};
  inscripciones.forEach((i) => { cursoDe[i.alumno_id] = i.curso_id; });
  const perfil = {};
  perfiles.forEach((p) => { perfil[p.id] = p; });
  const curso = {};
  cursos.forEach((c) => { curso[c.id] = c; });
  const activos = perfiles.filter((p) => p.rol === 'alumno' && (p.situacion || 'activo') === 'activo');
  return { perfiles, perfil, inscripciones, cursos, curso, cursoDe, activos };
}

// Promedio por alumno y materia en un ciclo (opcionalmente un solo período).
function promediosPorAlumnoMateria(notas, periodo) {
  const grupos = {};
  notas
    .filter((n) => !periodo || n.periodo === periodo)
    .forEach((n) => {
      const k = `${n.alumno_id}|${n.materia_id}`;
      (grupos[k] = grupos[k] || { alumnoId: n.alumno_id, materiaId: n.materia_id, cursoId: n.curso_id, notas: [] }).notas.push(Number(n.nota));
    });
  return Object.values(grupos).map((g) => ({ ...g, promedio: prom(g.notas) }));
}

// ------------------------------------------------------------
//  GET /api/reportes/resumen
// ------------------------------------------------------------
router.get('/resumen', async (req, res) => {
  try {
    const ciclo = new Date().getFullYear();
    const desde30 = haceDias(30);
    const b = await base();

    const [materias, asignaciones, docs, vinculosPend, asist30, notas, movs] = await Promise.all([
      traerTodo(() => supabaseAdmin.from('materias').select('id, anio')),
      traerTodo(() => supabaseAdmin.from('docente_asignaciones').select('materia_id, curso_id'), { opcional: true }),
      traerTodo(() => supabaseAdmin.from('legajo_documentos').select('alumno_id, estado'), { opcional: true }),
      traerTodo(() => supabaseAdmin.from('vinculos').select('id').eq('estado', 'pendiente'), { opcional: true }),
      traerTodo(() => supabaseAdmin.from('asistencias').select('alumno_id, fecha, estado').gte('fecha', desde30), { opcional: true }),
      traerTodo(() => supabaseAdmin.from('calificaciones').select('alumno_id, materia_id, curso_id, periodo, nota').eq('ciclo', ciclo), { opcional: true }),
      traerTodo(() => supabaseAdmin.from('movimientos_alumnos').select('tipo, fecha').gte('fecha', `${ciclo}-01-01`), { opcional: true }),
    ]);
    const asistCiclo = await traerTodo(() => supabaseAdmin.from('asistencias')
      .select('alumno_id, estado, justificada').gte('fecha', `${ciclo}-01-01`).lte('fecha', `${ciclo}-12-31`), { opcional: true });

    const idsActivos = new Set(b.activos.map((a) => a.id));
    const sinCurso = b.activos.filter((a) => !b.cursoDe[a.id]).length;

    // Asistencia de hoy y de los últimos 30 días.
    const hoy = hoyISO();
    const deHoy = asist30.filter((a) => a.fecha === hoy && idsActivos.has(a.alumno_id));
    const asistentes = (lista) => lista.filter((a) => a.estado !== 'ausente').length;
    const enRango = asist30.filter((a) => idsActivos.has(a.alumno_id));

    // Presentismo por curso (30 días).
    const porCurso = b.cursos.map((c) => {
      const regs = enRango.filter((a) => b.cursoDe[a.alumno_id] === c.id);
      return {
        id: c.id,
        curso: cursoLabel(c),
        alumnos: b.activos.filter((a) => b.cursoDe[a.id] === c.id).length,
        registros: regs.length,
        presentismo: pct(asistentes(regs), regs.length),
      };
    }).filter((c) => c.alumnos > 0);

    // Legajos incompletos (solo alumnos activos).
    const completosDe = {};
    docs.forEach((d) => { if (d.estado !== 'pendiente') completosDe[d.alumno_id] = (completosDe[d.alumno_id] || 0) + 1; });
    const legajosIncompletos = b.activos.filter((a) => (completosDe[a.id] || 0) < TOTAL_DOCUMENTOS).length;

    // Materias sin docente: cada curso con alumnos × materias de su año.
    const asignadas = new Set(asignaciones.map((a) => `${a.curso_id}|${a.materia_id}`));
    let materiasSinDocente = 0;
    b.cursos.forEach((c) => {
      if (!b.activos.some((a) => b.cursoDe[a.id] === c.id)) return;
      materias.filter((m) => m.anio === c.anio).forEach((m) => {
        if (!asignadas.has(`${c.id}|${m.id}`)) materiasSinDocente += 1;
      });
    });

    // Alumnos en riesgo académico.
    const desaprobadasDe = {};
    promediosPorAlumnoMateria(notas).forEach((p) => {
      if (p.promedio !== null && p.promedio < NOTA_APROBACION && idsActivos.has(p.alumnoId)) {
        desaprobadasDe[p.alumnoId] = (desaprobadasDe[p.alumnoId] || 0) + 1;
      }
    });
    const enRiesgo = Object.values(desaprobadasDe).filter((n) => n >= UMBRAL_RIESGO).length;
    const conAlgunaDesaprobada = Object.keys(desaprobadasDe).length;

    // Cómputo de inasistencias del ciclo: alumnos cerca o por encima del tope.
    const regsDe = {};
    asistCiclo.forEach((r) => { if (idsActivos.has(r.alumno_id)) (regsDe[r.alumno_id] = regsDe[r.alumno_id] || []).push(r); });
    const niveles = Object.values(regsDe).map((regs) => reglasAsistencia.computar(regs).nivel);
    const excedidos = niveles.filter((n) => n === 'excedido').length;
    const criticos = niveles.filter((n) => n === 'critico').length;

    const kpis = {
      alumnosActivos: b.activos.length,
      profesores: b.perfiles.filter((p) => p.rol === 'profesor').length,
      preceptores: b.perfiles.filter((p) => p.rol === 'preceptor').length,
      cursos: porCurso.length,
      hoy: { registrados: deHoy.length, presentes: asistentes(deHoy), ausentes: deHoy.filter((a) => a.estado === 'ausente').length },
      presentismo30: pct(asistentes(enRango), enRango.length),
      legajosIncompletos,
      vinculosPendientes: vinculosPend.length,
      materiasSinDocente,
      sinCurso,
      enRiesgo,
      conAlgunaDesaprobada,
      inasistenciasExcedidas: excedidos,
      inasistenciasCriticas: criticos,
      bajas: movs.filter((m) => m.tipo === 'baja').length,
      pases: movs.filter((m) => m.tipo === 'pase').length,
    };

    // Alertas: lo que alguien tiene que resolver.
    const alertas = [];
    if (excedidos) alertas.push({ nivel: 'serious', texto: `${excedidos} alumno(s) superaron el tope de ${reglasAsistencia.LIMITE_ANUAL} inasistencias`, link: '/reportes.html#asistencia' });
    if (criticos) alertas.push({ nivel: 'warning', texto: `${criticos} alumno(s) con ${reglasAsistencia.NIVEL_CRITICO} o más inasistencias (cerca del tope)`, link: '/reportes.html#asistencia' });
    if (kpis.vinculosPendientes) alertas.push({ nivel: 'warning', texto: `${kpis.vinculosPendientes} solicitud(es) de vínculo familiar pendientes`, link: '/vinculos.html' });
    if (sinCurso) alertas.push({ nivel: 'warning', texto: `${sinCurso} alumno(s) activos sin curso asignado`, link: '/alumnos.html' });
    if (materiasSinDocente) alertas.push({ nivel: 'warning', texto: `${materiasSinDocente} materia(s) sin docente asignado`, link: '/cursos.html' });
    if (enRiesgo) alertas.push({ nivel: 'serious', texto: `${enRiesgo} alumno(s) con ${UMBRAL_RIESGO} o más materias por debajo de ${NOTA_APROBACION}`, link: '/reportes.html#rendimiento' });
    if (legajosIncompletos) alertas.push({ nivel: 'info', texto: `${legajosIncompletos} legajo(s) con documentación pendiente`, link: '/legajos.html' });
    const cursosSinLista = porCurso.filter((c) => !deHoy.some((a) => b.cursoDe[a.alumno_id] === c.id)).length;
    const diaSemana = new Date().getDay();
    if (diaSemana >= 1 && diaSemana <= 5 && cursosSinLista) {
      alertas.push({ nivel: 'info', texto: `${cursosSinLista} curso(s) todavía sin asistencia tomada hoy`, link: '/asistencia.html' });
    }

    return res.json({ ok: true, ciclo, fecha: hoy, kpis, asistenciaPorCurso: porCurso, alertas, notaAprobacion: NOTA_APROBACION, limiteInasistencias: reglasAsistencia.LIMITE_ANUAL });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos armar el resumen.' });
  }
});

// ------------------------------------------------------------
//  GET /api/reportes/asistencia?desde=&hasta=
// ------------------------------------------------------------
router.get('/asistencia', async (req, res) => {
  try {
    const desde = fechaParam(req.query.desde, haceDias(30));
    const hasta = fechaParam(req.query.hasta, hoyISO());
    const b = await base();
    const regs = await traerTodo(() => supabaseAdmin.from('asistencias')
      .select('alumno_id, fecha, estado, justificada').gte('fecha', desde).lte('fecha', hasta));
    // Cómputo anual (ciclo de la fecha "hasta"), para comparar con el tope.
    const cicloHasta = parseInt(hasta.slice(0, 4), 10);
    const anual = await traerTodo(() => supabaseAdmin.from('asistencias')
      .select('alumno_id, estado, justificada').gte('fecha', `${cicloHasta}-01-01`).lte('fecha', hasta));
    const anualDe = {};
    anual.forEach((r) => { (anualDe[r.alumno_id] = anualDe[r.alumno_id] || []).push(r); });

    const idsActivos = new Set(b.activos.map((a) => a.id));
    const validos = regs.filter((r) => idsActivos.has(r.alumno_id));
    const contar = (lista) => ({
      registros: lista.length,
      presentes: lista.filter((r) => r.estado === 'presente').length,
      ausentes: lista.filter((r) => r.estado === 'ausente').length,
      tardes: lista.filter((r) => r.estado === 'tarde').length,
      retirados: lista.filter((r) => r.estado === 'retirado').length,
      faltas: reglasAsistencia.computar(lista).faltas,
      justificadas: lista.filter((r) => r.estado === 'ausente' && r.justificada).length,
    });

    const porCurso = b.cursos.map((c) => {
      const lista = validos.filter((r) => b.cursoDe[r.alumno_id] === c.id);
      const t = contar(lista);
      return { curso: cursoLabel(c), alumnos: b.activos.filter((a) => b.cursoDe[a.id] === c.id).length, ...t, presentismo: pct(t.registros - t.ausentes, t.registros) };
    }).filter((c) => c.alumnos > 0);

    const porAlumno = b.activos.map((a) => {
      const t = contar(validos.filter((r) => r.alumno_id === a.id));
      const anio = reglasAsistencia.computar(anualDe[a.id] || []);
      return {
        id: a.id,
        alumno: `${a.apellido}, ${a.nombre}`,
        curso: cursoLabel(b.curso[b.cursoDe[a.id]]),
        ...t,
        injustificadas: t.ausentes - t.justificadas,
        presentismo: pct(t.registros - t.ausentes, t.registros),
        faltasCiclo: anio.faltas,
        nivel: anio.nivel,
      };
    }).filter((a) => a.ausentes > 0 || a.retirados > 0 || a.tardes > 0 || a.faltasCiclo > 0)
      .sort((x, y) => y.faltasCiclo - x.faltasCiclo || y.faltas - x.faltas);

    const total = contar(validos);
    return res.json({ ok: true, desde, hasta, limite: reglasAsistencia.LIMITE_ANUAL, ciclo: cicloHasta, total: { ...total, presentismo: pct(total.registros - total.ausentes, total.registros) }, porCurso, porAlumno });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos armar el reporte de asistencia. ¿Está creada la tabla de asistencia?' });
  }
});

// ------------------------------------------------------------
//  GET /api/reportes/rendimiento?ciclo=&periodo=
// ------------------------------------------------------------
router.get('/rendimiento', async (req, res) => {
  try {
    const ciclo = cicloParam(req.query.ciclo);
    const periodo = ['1', '2', '3'].includes(req.query.periodo) ? req.query.periodo : null;
    const b = await base();
    const [notas, materias, asignaciones] = await Promise.all([
      traerTodo(() => supabaseAdmin.from('calificaciones').select('alumno_id, materia_id, curso_id, periodo, nota').eq('ciclo', ciclo)),
      traerTodo(() => supabaseAdmin.from('materias').select('id, nombre')),
      traerTodo(() => supabaseAdmin.from('docente_asignaciones').select('materia_id, curso_id, profesor_id'), { opcional: true }),
    ]);
    const materia = {};
    materias.forEach((m) => { materia[m.id] = m.nombre; });
    const profesorDe = {};
    asignaciones.forEach((a) => {
      const p = b.perfil[a.profesor_id];
      profesorDe[`${a.curso_id}|${a.materia_id}`] = p ? `${p.apellido}, ${p.nombre}` : '';
    });

    const proms = promediosPorAlumnoMateria(notas, periodo);

    // Por curso y materia.
    const grupos = {};
    proms.forEach((p) => {
      const k = `${p.cursoId}|${p.materiaId}`;
      (grupos[k] = grupos[k] || { cursoId: p.cursoId, materiaId: p.materiaId, valores: [] }).valores.push(p.promedio);
    });
    const porMateria = Object.values(grupos).map((g) => {
      const c = b.curso[g.cursoId];
      const desap = g.valores.filter((v) => v < NOTA_APROBACION).length;
      return {
        curso: cursoLabel(c),
        anio: c ? c.anio : 99,
        materia: materia[g.materiaId] || 'Materia',
        profesor: profesorDe[`${g.cursoId}|${g.materiaId}`] || '—',
        alumnosConNota: g.valores.length,
        promedio: prom(g.valores),
        desaprobados: desap,
        pctDesaprobados: pct(desap, g.valores.length),
      };
    }).sort((x, y) => x.anio - y.anio || x.curso.localeCompare(y.curso) || x.materia.localeCompare(y.materia, 'es'));

    // Alumnos en riesgo (activos con UMBRAL_RIESGO o más materias por debajo).
    const idsActivos = new Set(b.activos.map((a) => a.id));
    const porAlumno = {};
    proms.forEach((p) => {
      if (!idsActivos.has(p.alumnoId)) return;
      const r = (porAlumno[p.alumnoId] = porAlumno[p.alumnoId] || { desaprobadas: [], promedios: [] });
      r.promedios.push(p.promedio);
      if (p.promedio < NOTA_APROBACION) r.desaprobadas.push(`${materia[p.materiaId] || 'Materia'} (${String(p.promedio).replace('.', ',')})`);
    });
    const enRiesgo = Object.entries(porAlumno)
      .filter(([, r]) => r.desaprobadas.length >= UMBRAL_RIESGO)
      .map(([id, r]) => {
        const a = b.perfil[id];
        return {
          id,
          alumno: a ? `${a.apellido}, ${a.nombre}` : '—',
          curso: cursoLabel(b.curso[b.cursoDe[id]]),
          cantidad: r.desaprobadas.length,
          materias: r.desaprobadas.join(' · '),
          promedioGeneral: prom(r.promedios),
        };
      })
      .sort((x, y) => y.cantidad - x.cantidad || x.promedioGeneral - y.promedioGeneral);

    return res.json({ ok: true, ciclo, periodo, notaAprobacion: NOTA_APROBACION, umbralRiesgo: UMBRAL_RIESGO, porMateria, enRiesgo });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos armar el reporte de rendimiento. ¿Corriste backend/db/calificaciones.sql?' });
  }
});

// ------------------------------------------------------------
//  GET /api/reportes/movimientos?ciclo=
// ------------------------------------------------------------
router.get('/movimientos', async (req, res) => {
  try {
    const ciclo = cicloParam(req.query.ciclo);
    const b = await base();
    const movs = await traerTodo(() => supabaseAdmin.from('movimientos_alumnos')
      .select('alumno_id, tipo, fecha, motivo, escuela_destino, curso_id')
      .gte('fecha', `${ciclo}-01-01`).lte('fecha', `${ciclo}-12-31`)
      .order('fecha', { ascending: false }));
    const TIPO = { baja: 'Baja', pase: 'Pase', reincorporacion: 'Reincorporación' };
    const lista = movs.map((m) => {
      const a = b.perfil[m.alumno_id];
      return {
        fecha: m.fecha,
        tipo: TIPO[m.tipo] || m.tipo,
        alumno: a ? `${a.apellido}, ${a.nombre}` : '—',
        curso: m.curso_id ? cursoLabel(b.curso[m.curso_id]) : '—',
        destino: m.escuela_destino || '',
        motivo: m.motivo || '',
      };
    });
    return res.json({ ok: true, ciclo, movimientos: lista });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los movimientos. ¿Corriste backend/db/bajas.sql?' });
  }
});

module.exports = router;
