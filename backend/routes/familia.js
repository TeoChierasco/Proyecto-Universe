/**
 * Vínculos familiares (padre/tutor ↔ alumno), con aprobación de Secretaría.
 *
 *   Padre/Tutor:
 *     - Solicita el vínculo con el documento (DNI) del alumno.
 *     - La solicitud queda "pendiente" hasta que Secretaría/Dirección la revise.
 *     - Solo con el vínculo "aprobado" puede ver los datos del alumno
 *       (curso, asistencia, etc.).
 *   Secretaría / Dirección:
 *     - Ven las solicitudes y las aprueban, rechazan o eliminan.
 *
 * Tabla: vinculos (ver familia.sql y correcciones-01.sql).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const esPadre = (req) => req.perfil.rol === 'padre';
const ADMINS = ['secretaria', 'director'];
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);

const ESTADOS = ['pendiente', 'aprobado', 'rechazado'];
const PARENTESCOS = ['Madre', 'Padre', 'Tutor/a', 'Otro'];

async function cursosPorAlumno(ids) {
  if (!ids.length) return {};
  const [insRes, curRes] = await Promise.all([
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id').in('alumno_id', ids),
    supabaseAdmin.from('cursos').select('id, anio, division'),
  ]);
  if (insRes.error || curRes.error) throw new Error('cursos');
  const label = {};
  curRes.data.forEach((c) => { label[c.id] = `${c.anio}.º ${c.division}`; });
  const res = {};
  insRes.data.forEach((i) => { res[i.alumno_id] = label[i.curso_id] || null; });
  return res;
}

// ============================================================
//  Padre / Tutor
// ============================================================

// GET /api/familia/hijos — hijos del padre, con el estado de cada solicitud.
// Los datos del alumno (curso) solo se muestran si el vínculo está aprobado.
router.get('/hijos', requireAuth, async (req, res) => {
  if (!esPadre(req)) {
    return res.status(403).json({ ok: false, error: 'Solo los padres/tutores pueden ver sus hijos.' });
  }

  const { data: vinculos, error: vErr } = await supabaseAdmin
    .from('vinculos').select('alumno_id, estado, parentesco').eq('padre_id', req.userId);
  if (vErr) return res.status(500).json({ ok: false, error: 'No pudimos cargar tus hijos.' });

  const ids = vinculos.map((v) => v.alumno_id);
  if (ids.length === 0) return res.json({ ok: true, hijos: [], parentescos: PARENTESCOS });

  try {
    const { data: perfiles, error } = await supabaseAdmin
      .from('perfiles').select('id, nombre, apellido, documento').in('id', ids);
    if (error) throw error;

    const aprobados = vinculos.filter((v) => v.estado === 'aprobado').map((v) => v.alumno_id);
    const curso = await cursosPorAlumno(aprobados);

    const hijos = vinculos.map((v) => {
      const p = perfiles.find((x) => x.id === v.alumno_id) || {};
      const aprobado = v.estado === 'aprobado';
      // Hasta que Secretaría apruebe, no se muestra ningún dato del alumno:
      // solo los últimos 3 dígitos del DNI que ingresó el padre.
      return {
        id: v.alumno_id,
        nombre: aprobado ? p.nombre || '' : null,
        apellido: aprobado ? p.apellido || '' : null,
        dniFinal: String(p.documento || '').slice(-3),
        estado: v.estado,
        parentesco: v.parentesco,
        curso: aprobado ? curso[v.alumno_id] || null : null,
      };
    });

    return res.json({ ok: true, hijos, parentescos: PARENTESCOS });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar tus hijos.' });
  }
});

// POST /api/familia/hijos — solicita el vínculo con un alumno por su documento.
router.post('/hijos', requireAuth, async (req, res) => {
  if (!esPadre(req)) {
    return res.status(403).json({ ok: false, error: 'Solo los padres/tutores pueden agregar hijos.' });
  }

  const documento = (req.body.documento || '').trim();
  const parentesco = PARENTESCOS.includes(req.body.parentesco) ? req.body.parentesco : null;
  if (!documento) {
    return res.status(400).json({ ok: false, error: 'Ingresá el documento (DNI) del alumno.' });
  }

  const { data: alumno, error: buscarError } = await supabaseAdmin
    .from('perfiles').select('id, rol').eq('documento', documento).maybeSingle();
  if (buscarError) return res.status(500).json({ ok: false, error: 'No pudimos buscar al alumno.' });
  if (!alumno || alumno.rol !== 'alumno') {
    return res.status(404).json({ ok: false, error: 'No encontramos un alumno con ese documento.' });
  }

  const { data: existente } = await supabaseAdmin
    .from('vinculos').select('id, estado')
    .eq('padre_id', req.userId).eq('alumno_id', alumno.id).maybeSingle();

  if (existente && existente.estado !== 'rechazado') {
    return res.status(400).json({
      ok: false,
      error: existente.estado === 'aprobado'
        ? 'Ese alumno ya está vinculado a tu cuenta.'
        : 'Ya enviaste una solicitud para ese alumno. Está pendiente de revisión.',
    });
  }

  const fila = { estado: 'pendiente', parentesco, revisado_por: null, revisado_en: null };
  const { error } = existente
    // Si había sido rechazada, se vuelve a enviar.
    ? await supabaseAdmin.from('vinculos').update(fila).eq('id', existente.id)
    : await supabaseAdmin.from('vinculos').insert({ ...fila, padre_id: req.userId, alumno_id: alumno.id });

  if (error) {
    if (/duplicate|unique/i.test(error.message || '')) {
      return res.status(400).json({ ok: false, error: 'Ya enviaste una solicitud para ese alumno.' });
    }
    return res.status(500).json({ ok: false, error: 'No pudimos enviar la solicitud.' });
  }

  return res.status(201).json({
    ok: true,
    message: 'Solicitud enviada. Secretaría la va a revisar y, cuando la apruebe, vas a ver los datos de tu hijo/a.',
  });
});

// DELETE /api/familia/hijos/:alumnoId — el padre quita su vínculo o su solicitud.
router.delete('/hijos/:alumnoId', requireAuth, async (req, res) => {
  if (!esPadre(req)) {
    return res.status(403).json({ ok: false, error: 'No autorizado.' });
  }
  const { error } = await supabaseAdmin
    .from('vinculos').delete().eq('padre_id', req.userId).eq('alumno_id', req.params.alumnoId);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos quitar el vínculo.' });
  return res.json({ ok: true });
});

// ============================================================
//  Secretaría / Dirección
// ============================================================

// GET /api/familia/vinculos — todas las solicitudes, con datos del padre y del alumno.
router.get('/vinculos', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar vínculos familiares.' });
  }

  const { data: vinculos, error } = await supabaseAdmin
    .from('vinculos')
    .select('id, padre_id, alumno_id, estado, parentesco, creado_en, revisado_en')
    .order('creado_en', { ascending: false });
  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los vínculos. ¿Corriste backend/db/correcciones-01.sql en Supabase?' });
  }

  const ids = [...new Set(vinculos.flatMap((v) => [v.padre_id, v.alumno_id]))];
  try {
    const perfilesRes = ids.length
      ? await supabaseAdmin.from('perfiles').select('id, nombre, apellido, email, documento').in('id', ids)
      : { data: [] };
    if (perfilesRes.error) throw perfilesRes.error;
    const perfil = {};
    perfilesRes.data.forEach((p) => { perfil[p.id] = p; });
    const curso = await cursosPorAlumno([...new Set(vinculos.map((v) => v.alumno_id))]);

    const lista = vinculos.map((v) => {
      const pa = perfil[v.padre_id] || {};
      const al = perfil[v.alumno_id] || {};
      return {
        id: v.id,
        estado: v.estado,
        parentesco: v.parentesco,
        creadoEn: v.creado_en,
        revisadoEn: v.revisado_en,
        padre: { nombre: pa.nombre, apellido: pa.apellido, email: pa.email },
        alumno: { id: v.alumno_id, nombre: al.nombre, apellido: al.apellido, documento: al.documento, curso: curso[v.alumno_id] || null },
      };
    });

    return res.json({ ok: true, vinculos: lista });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los vínculos.' });
  }
});

// PATCH /api/familia/vinculos/:id — aprueba o rechaza una solicitud.
router.patch('/vinculos/:id', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar vínculos familiares.' });
  }
  const estado = req.body.estado;
  if (!ESTADOS.includes(estado) || estado === 'pendiente') {
    return res.status(400).json({ ok: false, error: 'Estado no válido.' });
  }

  const { data, error } = await supabaseAdmin
    .from('vinculos')
    .update({ estado, revisado_por: req.userId, revisado_en: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id');
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el vínculo.' });
  if (!data || !data.length) return res.status(404).json({ ok: false, error: 'Vínculo no encontrado.' });

  return res.json({ ok: true, message: estado === 'aprobado' ? 'Vínculo aprobado.' : 'Solicitud rechazada.' });
});

// DELETE /api/familia/vinculos/:id — elimina un vínculo (por ej., si ya no corresponde).
router.delete('/vinculos/:id', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar vínculos familiares.' });
  }
  const { error } = await supabaseAdmin.from('vinculos').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar el vínculo.' });
  return res.json({ ok: true });
});

module.exports = router;
