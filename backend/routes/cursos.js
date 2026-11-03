/**
 * Cursos y divisiones (vista de Secretaría y Dirección).
 *   - Resumen de todos los cursos: cantidad de alumnos y materias con docente.
 *   - Detalle de un curso: nómina de alumnos (con estado del legajo)
 *     y las materias del año con el profesor asignado.
 * Las divisiones se crean/eliminan desde /api/academico/cursos (plan.html)
 * y los alumnos se asignan desde /api/alumnos.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');
const { grillaCurso, controlDias } = require('./horarios');

const router = express.Router();

const ADMINS = ['secretaria', 'director'];
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);

// Debe coincidir con la lista de documentos de routes/legajos.js
const TOTAL_DOCUMENTOS = 6;

function soloAdmin(req, res, next) {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede ver los cursos.' });
  }
  next();
}

// Las tablas nuevas (secretaria.sql) pueden no existir todavía:
// en ese caso devolvemos listas vacías para que la pantalla funcione igual.
const datos = (r) => (r.error ? [] : r.data);

// GET /api/cursos — resumen de cursos.
router.get('/', requireAuth, soloAdmin, async (req, res) => {
  const [curRes, insRes, matRes, asiRes] = await Promise.all([
    supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division'),
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id'),
    supabaseAdmin.from('materias').select('id, anio'),
    supabaseAdmin.from('docente_asignaciones').select('curso_id, materia_id'),
  ]);

  if (curRes.error || insRes.error || matRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los cursos.' });
  }

  const asignaciones = datos(asiRes);
  // Horario vs. jornada de cada curso (si las tablas existen).
  const [horRes, jorRes] = await Promise.all([
    supabaseAdmin.from('horarios').select('curso_id, dia, modulo'),
    supabaseAdmin.from('curso_jornadas').select('curso_id, dia, modulo_desde, modulo_hasta'),
  ]);
  const horarios = datos(horRes);
  const jornadas = datos(jorRes);
  const cursos = curRes.data.map((c) => {
    const control = controlDias(
      horarios.filter((h) => h.curso_id === c.id),
      jornadas.filter((j) => j.curso_id === c.id).map((j) => ({ dia: j.dia, desde: j.modulo_desde, hasta: j.modulo_hasta })),
    );
    return {
      ...c,
      alumnos: insRes.data.filter((i) => i.curso_id === c.id).length,
      materias: matRes.data.filter((m) => m.anio === c.anio).length,
      materiasConDocente: asignaciones.filter((a) => a.curso_id === c.id).length,
      horario: control.semana,
    };
  });

  const { count: totalAlumnos } = await supabaseAdmin
    .from('perfiles').select('id', { count: 'exact', head: true }).eq('rol', 'alumno').eq('situacion', 'activo');
  const inscriptos = insRes.data.filter((i) => i.curso_id).length;

  return res.json({ ok: true, cursos, alumnosSinCurso: Math.max(0, (totalAlumnos || 0) - inscriptos) });
});

// GET /api/cursos/:id — detalle de un curso.
router.get('/:id', requireAuth, soloAdmin, async (req, res) => {
  const id = Number(req.params.id);

  const { data: curso, error: cursoError } = await supabaseAdmin
    .from('cursos').select('id, anio, division').eq('id', id).maybeSingle();
  if (cursoError) return res.status(500).json({ ok: false, error: 'No pudimos cargar el curso.' });
  if (!curso) return res.status(404).json({ ok: false, error: 'Curso no encontrado.' });

  const { data: ins, error: insError } = await supabaseAdmin
    .from('inscripciones').select('alumno_id').eq('curso_id', id);
  if (insError) return res.status(500).json({ ok: false, error: 'No pudimos cargar los alumnos.' });
  const ids = ins.map((i) => i.alumno_id);

  const [aluRes, docRes, matRes, asiRes] = await Promise.all([
    ids.length
      ? supabaseAdmin.from('perfiles').select('id, nombre, apellido, documento').in('id', ids).order('apellido').order('nombre')
      : Promise.resolve({ data: [] }),
    ids.length
      ? supabaseAdmin.from('legajo_documentos').select('alumno_id, estado').in('alumno_id', ids)
      : Promise.resolve({ data: [] }),
    supabaseAdmin.from('materias').select('id, nombre, taller_id').eq('anio', curso.anio).order('nombre'),
    supabaseAdmin.from('docente_asignaciones').select('id, materia_id, profesor_id, horas_semanales').eq('curso_id', id),
  ]);

  if (aluRes.error || matRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar el curso.' });
  }

  const docsCompletos = {};
  datos(docRes).forEach((d) => {
    if (d.estado !== 'pendiente') docsCompletos[d.alumno_id] = (docsCompletos[d.alumno_id] || 0) + 1;
  });

  const asignaciones = datos(asiRes);
  const profIds = [...new Set(asignaciones.map((a) => a.profesor_id))];
  const profRes = profIds.length
    ? await supabaseAdmin.from('perfiles').select('id, nombre, apellido').in('id', profIds)
    : { data: [] };
  const profesor = {};
  datos(profRes).forEach((p) => { profesor[p.id] = `${p.apellido}, ${p.nombre}`; });

  const alumnos = aluRes.data.map((a) => ({
    ...a,
    legajoCompleto: (docsCompletos[a.id] || 0) >= TOTAL_DOCUMENTOS,
    documentosCompletos: docsCompletos[a.id] || 0,
  }));

  const materias = matRes.data.map((m) => {
    const asig = asignaciones.find((a) => a.materia_id === m.id);
    return {
      id: m.id,
      nombre: m.nombre,
      asignacionId: asig ? asig.id : null,
      profesor: asig ? profesor[asig.profesor_id] || 'Profesor/a' : null,
      horas: asig ? asig.horas_semanales : null,
    };
  });

  // Jornada del curso y control contra el horario cargado.
  let horario = null;
  try {
    const g = await grillaCurso(id);
    horario = { control: g.control, sinTablaJornadas: g.sinTablaJornadas };
    materias.forEach((m) => {
      m.modulosEnHorario = g.clases.filter((c) => c.materiaId === m.id).length;
    });
  } catch (e) {
    horario = null; // falta horarios.sql
  }

  return res.json({ ok: true, curso, alumnos, materias, totalDocumentos: TOTAL_DOCUMENTOS, horario, modulos: require('../config/horarios').MODULOS });
});

module.exports = router;
