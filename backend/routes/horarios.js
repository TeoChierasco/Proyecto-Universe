/**
 * Horarios.
 *   GET /api/horarios/curso/:cursoId   → grilla de un curso (con profesor de cada clase).
 *   PUT /api/horarios/curso/:cursoId   → Secretaría/Dirección asignan o vacían un módulo.
 *   GET /api/horarios/mio              → alumno: su curso · profesor: sus clases en todos los cursos.
 *   GET /api/horarios/alumno/:id       → padre (vínculo aprobado) o personal: horario del curso del alumno.
 *   GET /api/horarios/mis-materias     → alumno: materias del año con profesor y módulos semanales.
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

  return { curso: { id: curso.id, label: cursoLabel(curso), anio: curso.anio }, clases, carga };
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
    return res.json({ ok: true, ...config, ...g, puedeEditar: EDITORES.includes(req.perfil.rol) });
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

    // Choque de horario del profesor: ¿ya da clase en otro curso a esa hora?
    const { data: asig } = await supabaseAdmin.from('docente_asignaciones')
      .select('profesor_id').eq('curso_id', cursoId).eq('materia_id', materiaId).maybeSingle();
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
