/**
 * Horarios.
 *   GET /api/horarios/curso/:cursoId   → grilla de un curso (con profesor de cada clase).
 *   PUT /api/horarios/curso/:cursoId   → Secretaría/Dirección asignan o vacían un módulo.
 *   GET /api/horarios/mio              → alumno: su curso · profesor: sus clases en todos los cursos.
 *   GET /api/horarios/alumno/:id       → padre (vínculo aprobado) o personal: horario del curso del alumno.
 *   GET /api/horarios/mis-materias     → alumno: materias del año con profesor y módulos semanales.
 *   PUT /api/horarios/curso/:cursoId/jornada → Secretaría/Dirección: módulos que se cursan cada día.
 *
 * Coherencia con Cursos y divisiones: cada curso tiene una jornada por día
 * (tabla curso_jornadas). El horario de ese día debe cubrir exactamente esos
 * módulos: no se aceptan clases fuera de la jornada y el control de cada día
 * indica si faltan módulos. Además, una materia no puede tener más módulos
 * que las horas semanales asignadas a su profesor.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');
const { DIAS, MODULOS, RECREOS } = require('../config/horarios');

const router = express.Router();

const EDITORES = ['secretaria', 'director'];
const PERSONAL = ['secretaria', 'director', 'preceptor', 'profesor'];
const cursoLabel = (c) => (c ? `${c.anio}.º ${c.division}` : '');
const config = { dias: DIAS, modulos: MODULOS, recreos: RECREOS };

// ---------- Jornada y control de horas ----------
const aMinutos = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
const duracion = (m) => aMinutos(m.fin) - aMinutos(m.inicio);
const moduloPorId = (id) => MODULOS.find((m) => m.id === id);
function textoHoras(min) {
  const h = Math.floor(min / 60);
  const r = min % 60;
  return h && r ? `${h} h ${r} min` : h ? `${h} h` : `${r} min`;
}
function rangoTexto(j) {
  const a = moduloPorId(j.desde); const b = moduloPorId(j.hasta);
  return a && b ? `${a.inicio} – ${b.fin}` : '';
}

async function jornadasDe(cursoId) {
  const { data, error } = await supabaseAdmin.from('curso_jornadas')
    .select('dia, modulo_desde, modulo_hasta').eq('curso_id', cursoId);
  if (error) return { jornadas: [], sinTabla: true };
  return { jornadas: data.map((j) => ({ dia: j.dia, desde: j.modulo_desde, hasta: j.modulo_hasta })), sinTabla: false };
}

/**
 * Control de cada día: módulos y horas de la jornada contra lo cargado en el horario.
 * estado: 'completo' | 'incompleto' | 'sin_jornada' | 'fuera' (hay clases fuera de la jornada).
 */
function controlDias(clases, jornadas) {
  const dias = DIAS.map((d) => {
    const j = jornadas.find((x) => x.dia === d.id);
    const delDia = clases.filter((c) => c.dia === d.id);
    const minCargados = delDia.reduce((s, c) => s + (moduloPorId(c.modulo) ? duracion(moduloPorId(c.modulo)) : 0), 0);
    if (!j) {
      return {
        dia: d.id, nombre: d.nombre, jornada: null,
        modulosJornada: 0, modulosCargados: delDia.length, horasJornada: '', horasCargadas: textoHoras(minCargados),
        minJornada: 0, minCargados,
        faltan: 0, fuera: 0, estado: delDia.length ? 'fuera' : 'sin_jornada',
      };
    }
    const enJornada = MODULOS.filter((m) => m.id >= j.desde && m.id <= j.hasta);
    const minJornada = enJornada.reduce((s, m) => s + duracion(m), 0);
    const fuera = delDia.filter((c) => c.modulo < j.desde || c.modulo > j.hasta).length;
    const dentro = delDia.length - fuera;
    const faltan = enJornada.length - dentro;
    return {
      dia: d.id, nombre: d.nombre, jornada: { ...j, texto: rangoTexto(j) },
      modulosJornada: enJornada.length, modulosCargados: delDia.length,
      horasJornada: textoHoras(minJornada), horasCargadas: textoHoras(minCargados),
      minJornada, minCargados,
      faltan, fuera,
      estado: fuera ? 'fuera' : faltan ? 'incompleto' : 'completo',
    };
  });
  const conJornada = dias.filter((d) => d.jornada);
  const totalJ = conJornada.reduce((s, d) => s + d.modulosJornada, 0);
  const totalC = dias.reduce((s, d) => s + d.modulosCargados, 0);
  return {
    dias,
    semana: {
      modulosJornada: totalJ,
      modulosCargados: totalC,
      definida: conJornada.length > 0,
      completo: conJornada.length > 0 && dias.every((d) => d.estado === 'completo' || d.estado === 'sin_jornada'),
    },
  };
}

async function nombres(ids) {
  if (!ids.length) return {};
  const { data } = await supabaseAdmin.from('perfiles').select('id, nombre, apellido').in('id', ids);
  const r = {};
  (data || []).forEach((p) => { r[p.id] = `${p.apellido}, ${p.nombre}`; });
  return r;
}

// Grilla completa de un curso + carga horaria por materia.
async function grillaCurso(cursoId) {
  const { data: curso } = await supabaseAdmin.from('cursos').select('id, anio, division').eq('id', cursoId).maybeSingle();
  if (!curso) return null;

  const [horRes, matRes, asiRes] = await Promise.all([
    supabaseAdmin.from('horarios').select('id, dia, modulo, materia_id, aula').eq('curso_id', cursoId),
    supabaseAdmin.from('materias').select('id, nombre').eq('anio', curso.anio).order('nombre'),
    supabaseAdmin.from('docente_asignaciones').select('materia_id, profesor_id, horas_semanales').eq('curso_id', cursoId),
  ]);
  if (horRes.error) throw new Error('tabla');

  const asig = asiRes.error ? [] : asiRes.data;
  const prof = await nombres([...new Set(asig.map((a) => a.profesor_id))]);
  const materia = {};
  (matRes.data || []).forEach((m) => { materia[m.id] = m.nombre; });

  const clases = horRes.data.map((h) => {
    const a = asig.find((x) => x.materia_id === h.materia_id);
    return {
      id: h.id, dia: h.dia, modulo: h.modulo, aula: h.aula,
      materiaId: h.materia_id, materia: materia[h.materia_id] || 'Materia',
      profesor: a ? prof[a.profesor_id] || null : null,
    };
  });

  const carga = (matRes.data || []).map((m) => {
    const a = asig.find((x) => x.materia_id === m.id);
    return {
      materiaId: m.id,
      materia: m.nombre,
      profesor: a ? prof[a.profesor_id] || null : null,
      horasAsignadas: a ? a.horas_semanales : null,
      modulos: clases.filter((c) => c.materiaId === m.id).length,
    };
  });

  const { jornadas, sinTabla } = await jornadasDe(cursoId);
  return {
    curso: { id: curso.id, label: cursoLabel(curso), anio: curso.anio },
    clases, carga, jornadas, sinTablaJornadas: sinTabla, control: controlDias(clases, jornadas),
  };
}

function errorTabla(res) {
  return res.status(500).json({ ok: false, error: 'No pudimos cargar el horario. ¿Corriste backend/db/horarios.sql en Supabase?' });
}

// ¿Puede ver el horario del curso de este alumno?
async function puedeVerAlumno(req, alumnoId) {
  if (PERSONAL.includes(req.perfil.rol)) return true;
  if (req.perfil.rol === 'alumno') return alumnoId === req.userId;
  if (req.perfil.rol === 'padre') {
    const { data } = await supabaseAdmin.from('vinculos').select('id')
      .eq('padre_id', req.userId).eq('alumno_id', alumnoId).eq('estado', 'aprobado').maybeSingle();
    return !!data;
  }
  return false;
}

async function cursoDelAlumno(alumnoId) {
  const { data } = await supabaseAdmin.from('inscripciones').select('curso_id').eq('alumno_id', alumnoId).maybeSingle();
  return data ? data.curso_id : null;
}

// GET /api/horarios/curso/:cursoId
router.get('/curso/:cursoId', requireAuth, async (req, res) => {
  const cursoId = Number(req.params.cursoId);
  if (!PERSONAL.includes(req.perfil.rol)) {
    // Alumnos y padres usan /mio o /alumno/:id.
    return res.status(403).json({ ok: false, error: 'No podés ver este horario.' });
  }
  try {
    const g = await grillaCurso(cursoId);
    if (!g) return res.status(404).json({ ok: false, error: 'El curso no existe.' });
    const puedeEditar = EDITORES.includes(req.perfil.rol);
    // Para asignar docentes desde el mismo editor.
    let profesores = [];
    if (puedeEditar) {
      const { data } = await supabaseAdmin.from('perfiles').select('id, nombre, apellido')
        .eq('rol', 'profesor').order('apellido').order('nombre');
      profesores = (data || []).map((p) => ({ id: p.id, nombre: `${p.apellido}, ${p.nombre}` }));
    }
    return res.json({ ok: true, ...config, ...g, puedeEditar, profesores });
  } catch (e) {
    return errorTabla(res);
  }
});

// PUT /api/horarios/curso/:cursoId — body: { dia, modulo, materiaId | null, aula }
router.put('/curso/:cursoId', requireAuth, async (req, res) => {
  if (!EDITORES.includes(req.perfil.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo Secretaría y Dirección editan horarios.' });
  }
  const cursoId = Number(req.params.cursoId);
  const dia = Number(req.body.dia);
  const modulo = Number(req.body.modulo);
  const materiaId = req.body.materiaId ? Number(req.body.materiaId) : null;
  const aula = (req.body.aula || '').trim().slice(0, 30) || null;

  if (!DIAS.some((d) => d.id === dia) || !MODULOS.some((m) => m.id === modulo)) {
    return res.status(400).json({ ok: false, error: 'Día o módulo no válido.' });
  }

  try {
    if (!materiaId) {
      const { error } = await supabaseAdmin.from('horarios').delete()
        .eq('curso_id', cursoId).eq('dia', dia).eq('modulo', modulo);
      if (error) throw error;
      return res.json({ ok: true, message: 'Módulo libre.' });
    }

    const [curRes, matRes] = await Promise.all([
      supabaseAdmin.from('cursos').select('anio').eq('id', cursoId).maybeSingle(),
      supabaseAdmin.from('materias').select('anio, nombre').eq('id', materiaId).maybeSingle(),
    ]);
    if (!curRes.data || !matRes.data) return res.status(400).json({ ok: false, error: 'Curso o materia inexistente.' });
    if (curRes.data.anio !== matRes.data.anio) {
      return res.status(400).json({ ok: false, error: 'La materia no corresponde al año del curso.' });
    }

    // La clase tiene que estar dentro de la jornada del curso para ese día.
    const { jornadas } = await jornadasDe(cursoId);
    const j = jornadas.find((x) => x.dia === dia);
    const nombreDia = DIAS.find((d) => d.id === dia).nombre.toLowerCase();
    if (jornadas.length && !j) {
      return res.status(400).json({ ok: false, error: `El curso no cursa los ${nombreDia}s. Definí la jornada en Cursos y divisiones.` });
    }
    if (j && (modulo < j.desde || modulo > j.hasta)) {
      return res.status(400).json({ ok: false, error: `Ese módulo está fuera de la jornada del ${nombreDia} (${rangoTexto(j)}).` });
    }

    // Choque de horario del profesor: ¿ya da clase en otro curso a esa hora?
    const { data: asig } = await supabaseAdmin.from('docente_asignaciones')
      .select('profesor_id, horas_semanales').eq('curso_id', cursoId).eq('materia_id', materiaId).maybeSingle();

    // No más módulos que las horas semanales asignadas al profesor de esa materia.
    if (asig && asig.horas_semanales != null) {
      const { data: actuales } = await supabaseAdmin.from('horarios')
        .select('dia, modulo').eq('curso_id', cursoId).eq('materia_id', materiaId);
      const otros = (actuales || []).filter((h) => !(h.dia === dia && h.modulo === modulo)).length;
      if (otros + 1 > asig.horas_semanales) {
        return res.status(400).json({
          ok: false,
          error: `${matRes.data.nombre} ya tiene ${otros} de ${asig.horas_semanales} módulos semanales asignados al profesor. Ajustá las horas en Profesores o quitá un módulo.`,
        });
      }
    }
    if (asig) {
      const { data: otras } = await supabaseAdmin.from('docente_asignaciones')
        .select('curso_id, materia_id').eq('profesor_id', asig.profesor_id);
      const otrasClases = (otras || []).filter((o) => !(o.curso_id === cursoId && o.materia_id === materiaId));
      if (otrasClases.length) {
        const { data: ocupados } = await supabaseAdmin.from('horarios')
          .select('curso_id, materia_id').eq('dia', dia).eq('modulo', modulo)
          .in('curso_id', [...new Set(otrasClases.map((o) => o.curso_id))]);
        const choque = (ocupados || []).find((h) => otrasClases.some((o) => o.curso_id === h.curso_id && o.materia_id === h.materia_id));
        if (choque) {
          const { data: c } = await supabaseAdmin.from('cursos').select('anio, division').eq('id', choque.curso_id).maybeSingle();
          const prof = (await nombres([asig.profesor_id]))[asig.profesor_id] || 'El profesor';
          return res.status(400).json({ ok: false, error: `${prof} ya tiene clase en ${cursoLabel(c)} ese día y módulo.` });
        }
      }
    }

    const { error } = await supabaseAdmin.from('horarios')
      .upsert({ curso_id: cursoId, dia, modulo, materia_id: materiaId, aula }, { onConflict: 'curso_id,dia,modulo' });
    if (error) throw error;
    return res.json({ ok: true, message: `${matRes.data.nombre} asignada.` });
  } catch (e) {
    return errorTabla(res);
  }
});

// PUT /api/horarios/curso/:cursoId/jornada — body: { dia, desde, hasta } (desde/hasta = número de módulo, o null para "no cursa")
router.put('/curso/:cursoId/jornada', requireAuth, async (req, res) => {
  if (!EDITORES.includes(req.perfil.rol)) {
    return res.status(403).json({ ok: false, error: 'Solo Secretaría y Dirección definen la jornada.' });
  }
  const cursoId = Number(req.params.cursoId);
  const dia = Number(req.body.dia);
  const desde = req.body.desde ? Number(req.body.desde) : null;
  const hasta = req.body.hasta ? Number(req.body.hasta) : null;
  if (!DIAS.some((d) => d.id === dia)) return res.status(400).json({ ok: false, error: 'Día no válido.' });
  if ((desde && !moduloPorId(desde)) || (hasta && !moduloPorId(hasta))) return res.status(400).json({ ok: false, error: 'Módulo no válido.' });
  if ((desde && !hasta) || (!desde && hasta)) return res.status(400).json({ ok: false, error: 'Indicá el módulo de inicio y el de fin.' });
  if (desde && hasta < desde) return res.status(400).json({ ok: false, error: 'El fin no puede ser antes que el inicio.' });

  try {
    // No se puede achicar la jornada si quedan clases afuera.
    const { data: clases, error: hErr } = await supabaseAdmin.from('horarios')
      .select('modulo').eq('curso_id', cursoId).eq('dia', dia);
    if (hErr) throw hErr;
    const afuera = (clases || []).filter((c) => !desde || c.modulo < desde || c.modulo > hasta).length;
    if (afuera) {
      return res.status(400).json({ ok: false, error: `Hay ${afuera} clase(s) cargadas fuera de ese horario. Quitalas primero en Horarios.` });
    }

    if (!desde) {
      const { error } = await supabaseAdmin.from('curso_jornadas').delete().eq('curso_id', cursoId).eq('dia', dia);
      if (error) throw error;
      return res.json({ ok: true, message: 'Ese día queda sin clases.' });
    }
    const { error } = await supabaseAdmin.from('curso_jornadas')
      .upsert({ curso_id: cursoId, dia, modulo_desde: desde, modulo_hasta: hasta }, { onConflict: 'curso_id,dia' });
    if (error) throw error;
    const nombreDia = DIAS.find((d) => d.id === dia).nombre;
    const n = MODULOS.filter((m) => m.id >= desde && m.id <= hasta);
    return res.json({ ok: true, message: `${nombreDia}: ${rangoTexto({ desde, hasta })} · ${n.length} módulos (${textoHoras(n.reduce((s, m) => s + duracion(m), 0))}).` });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos guardar la jornada. ¿Corriste backend/db/jornadas.sql en Supabase?' });
  }
});

// GET /api/horarios/mio — alumno: su curso · profesor: sus clases.
router.get('/mio', requireAuth, async (req, res) => {
  try {
    if (req.perfil.rol === 'alumno') {
      const cursoId = await cursoDelAlumno(req.userId);
      if (!cursoId) return res.json({ ok: true, ...config, curso: null, clases: [], carga: [], titulo: 'Sin curso asignado' });
      const g = await grillaCurso(cursoId);
      return res.json({ ok: true, ...config, ...g, titulo: g.curso.label });
    }

    if (req.perfil.rol === 'profesor') {
      const { data: asig, error } = await supabaseAdmin.from('docente_asignaciones')
        .select('materia_id, curso_id').eq('profesor_id', req.userId);
      if (error) throw error;
      if (!asig.length) return res.json({ ok: true, ...config, clases: [], titulo: 'Sin materias asignadas' });
      const cursoIds = [...new Set(asig.map((a) => a.curso_id))];
      const [horRes, curRes, matRes] = await Promise.all([
        supabaseAdmin.from('horarios').select('dia, modulo, materia_id, curso_id, aula').in('curso_id', cursoIds),
        supabaseAdmin.from('cursos').select('id, anio, division').in('id', cursoIds),
        supabaseAdmin.from('materias').select('id, nombre').in('id', [...new Set(asig.map((a) => a.materia_id))]),
      ]);
      if (horRes.error) throw horRes.error;
      const clases = horRes.data
        .filter((h) => asig.some((a) => a.curso_id === h.curso_id && a.materia_id === h.materia_id))
        .map((h) => ({
          dia: h.dia, modulo: h.modulo, aula: h.aula,
          materia: ((matRes.data || []).find((m) => m.id === h.materia_id) || {}).nombre || 'Materia',
          curso: cursoLabel((curRes.data || []).find((c) => c.id === h.curso_id)),
        }));
      return res.json({ ok: true, ...config, clases, titulo: `${clases.length} módulo(s) por semana` });
    }

    return res.status(400).json({ ok: false, error: 'Elegí un curso o un alumno.' });
  } catch (e) {
    return errorTabla(res);
  }
});

// GET /api/horarios/alumno/:id — horario del curso de un alumno.
router.get('/alumno/:id', requireAuth, async (req, res) => {
  if (!(await puedeVerAlumno(req, req.params.id))) {
    return res.status(403).json({ ok: false, error: 'No podés ver el horario de este alumno.' });
  }
  try {
    const { data: p } = await supabaseAdmin.from('perfiles').select('nombre, apellido').eq('id', req.params.id).maybeSingle();
    const cursoId = await cursoDelAlumno(req.params.id);
    const quien = p ? `${p.nombre} ${p.apellido}` : 'Alumno/a';
    if (!cursoId) return res.json({ ok: true, ...config, curso: null, clases: [], titulo: `${quien} · sin curso` });
    const g = await grillaCurso(cursoId);
    return res.json({ ok: true, ...config, ...g, titulo: `${quien} · ${g.curso.label}` });
  } catch (e) {
    return errorTabla(res);
  }
});

// GET /api/horarios/mis-materias — materias del alumno con profesor, módulos y promedio.
router.get('/mis-materias', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'alumno') return res.status(403).json({ ok: false, error: 'Esta sección es para alumnos.' });
  const cursoId = await cursoDelAlumno(req.userId);
  if (!cursoId) return res.json({ ok: true, curso: null, materias: [] });

  let g;
  try {
    g = await grillaCurso(cursoId);
  } catch (e) {
    // Sin tabla de horarios igual mostramos materias y profesores.
    const { data: curso } = await supabaseAdmin.from('cursos').select('id, anio, division').eq('id', cursoId).maybeSingle();
    const { data: mats } = await supabaseAdmin.from('materias').select('id, nombre').eq('anio', curso.anio).order('nombre');
    g = { curso: { id: curso.id, label: cursoLabel(curso) }, clases: [], carga: (mats || []).map((m) => ({ materiaId: m.id, materia: m.nombre, profesor: null, modulos: 0 })) };
  }

  const ciclo = new Date().getFullYear();
  const [{ data: notas }, perRes] = await Promise.all([
    supabaseAdmin.from('calificaciones').select('materia_id, periodo, nota').eq('alumno_id', req.userId).eq('ciclo', ciclo),
    supabaseAdmin.from('periodos_estado').select('periodo, publicado').eq('ciclo', ciclo),
  ]);
  // Solo cuentan los períodos con boletín emitido (si existe la tabla de cierre).
  const publicados = perRes.error ? null : new Set((perRes.data || []).filter((p) => p.publicado).map((p) => p.periodo));
  const materias = g.carga.map((c) => {
    const ns = (notas || [])
      .filter((n) => n.materia_id === c.materiaId && (!publicados || publicados.has(n.periodo)))
      .map((n) => Number(n.nota));
    const dias = [...new Set(g.clases.filter((x) => x.materiaId === c.materiaId).map((x) => x.dia))];
    return {
      ...c,
      dias: dias.sort().map((d) => (DIAS.find((x) => x.id === d) || {}).corto),
      notas: ns.length,
      promedio: ns.length ? Math.round((ns.reduce((s, n) => s + n, 0) / ns.length) * 100) / 100 : null,
    };
  });
  return res.json({ ok: true, curso: g.curso, ciclo, materias, notaAprobacion: 6 });
});

module.exports = router;
module.exports.grillaCurso = grillaCurso;
module.exports.controlDias = controlDias;
