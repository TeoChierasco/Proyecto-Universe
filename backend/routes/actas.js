/**
 * Actas de reunión y citaciones a familias.
 *
 *   Personal (Secretaría, Dirección, Preceptor, Profesor):
 *     GET    /api/actas              → listado (filtros: estado, tipo).
 *     GET    /api/actas/opciones     → cursos y alumnos activos para el formulario.
 *     GET    /api/actas/:id          → detalle + notificaciones de las familias.
 *     POST   /api/actas              → nueva citación o reunión.
 *     PUT    /api/actas/:id          → editar / completar el acta / cambiar estado.
 *     DELETE /api/actas/:id          → eliminar (Secretaría/Dirección, o el autor si sigue programada).
 *   Padre / Tutor (vínculo aprobado):
 *     GET    /api/actas/familia              → citaciones y actas de sus hijos.
 *     POST   /api/actas/:id/notificacion     → "Me notifiqué" + asistiré / no puedo.
 *
 * Tablas: actas, acta_notificaciones (ver backend/db/actas.sql).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');
const { traerTodo } = require('../utils/consultas');

const router = express.Router();

const PERSONAL = ['secretaria', 'director', 'preceptor', 'profesor'];
const ADMINS = ['secretaria', 'director'];
const TIPOS = ['citacion', 'reunion'];
const ESTADOS = ['programada', 'realizada', 'cancelada'];
const esPersonal = (req) => PERSONAL.includes(req.perfil.rol);
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);
const cursoLabel = (c) => (c ? `${c.anio}.º ${c.division}` : null);

const errorTabla = (res) => res.status(500).json({ ok: false, error: 'No pudimos cargar las actas. ¿Corriste backend/db/actas.sql en Supabase?' });

function texto(v, max) {
  const t = (v == null ? '' : String(v)).trim();
  return t ? t.slice(0, max) : null;
}
function fecha(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : null;
}
function hora(v) {
  return /^\d{2}:\d{2}$/.test(String(v || '')) ? v : null;
}

// Datos de alumnos y cursos para mostrar en las actas.
async function enriquecer(actas) {
  const alumnoIds = [...new Set(actas.map((a) => a.alumno_id).filter(Boolean))];
  const cursoIds = [...new Set(actas.map((a) => a.curso_id).filter(Boolean))];
  const [alRes, cuRes] = await Promise.all([
    alumnoIds.length ? supabaseAdmin.from('perfiles').select('id, nombre, apellido, documento').in('id', alumnoIds) : Promise.resolve({ data: [] }),
    cursoIds.length ? supabaseAdmin.from('cursos').select('id, anio, division').in('id', cursoIds) : Promise.resolve({ data: [] }),
  ]);
  return actas.map((a) => {
    const al = (alRes.data || []).find((x) => x.id === a.alumno_id);
    return {
      id: a.id, tipo: a.tipo, estado: a.estado, fecha: a.fecha, hora: a.hora, lugar: a.lugar, asunto: a.asunto,
      convocados: a.convocados, presentes: a.presentes, desarrollo: a.desarrollo, acuerdos: a.acuerdos,
      alumno: al ? { id: al.id, nombre: al.nombre, apellido: al.apellido, documento: al.documento } : null,
      curso: cursoLabel((cuRes.data || []).find((c) => c.id === a.curso_id)),
      cursoId: a.curso_id,
      creadoPor: a.creado_por, creadoNombre: a.creado_nombre, creadoRol: a.creado_rol, creadoEn: a.creado_en,
    };
  });
}

// ============================================================
//  Padre / Tutor
// ============================================================
router.get('/familia', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'padre') return res.status(403).json({ ok: false, error: 'Solo para familias.' });
  try {
    const { data: vin } = await supabaseAdmin.from('vinculos').select('alumno_id')
      .eq('padre_id', req.userId).eq('estado', 'aprobado');
    const ids = (vin || []).map((v) => v.alumno_id);
    if (!ids.length) return res.json({ ok: true, actas: [] });

    const { data, error } = await supabaseAdmin.from('actas').select('*')
      .in('alumno_id', ids).neq('estado', 'cancelada').order('fecha', { ascending: false });
    if (error) return errorTabla(res);
    const { data: notifs } = await supabaseAdmin.from('acta_notificaciones')
      .select('acta_id, respuesta, comentario, notificado_en').eq('padre_id', req.userId);

    const actas = (await enriquecer(data)).map((a) => {
      const n = (notifs || []).find((x) => x.acta_id === a.id);
      return {
        id: a.id, tipo: a.tipo, estado: a.estado, fecha: a.fecha, hora: a.hora, lugar: a.lugar, asunto: a.asunto,
        alumno: a.alumno ? { id: a.alumno.id, nombre: a.alumno.nombre, apellido: a.alumno.apellido } : null,
        curso: a.curso,
        convoca: a.creadoNombre,
        // El contenido del acta solo cuando la reunión ya se realizó.
        acuerdos: a.estado === 'realizada' ? a.acuerdos : null,
        notificacion: n ? { respuesta: n.respuesta, comentario: n.comentario, en: n.notificado_en } : null,
      };
    });
    return res.json({ ok: true, actas });
  } catch (e) {
    return errorTabla(res);
  }
});

router.post('/:id/notificacion', requireAuth, async (req, res) => {
  if (req.perfil.rol !== 'padre') return res.status(403).json({ ok: false, error: 'Solo para familias.' });
  const id = Number(req.params.id);
  const respuesta = ['asistire', 'no_puedo'].includes(req.body.respuesta) ? req.body.respuesta : null;
  try {
    const { data: acta } = await supabaseAdmin.from('actas').select('id, alumno_id').eq('id', id).maybeSingle();
    if (!acta || !acta.alumno_id) return res.status(404).json({ ok: false, error: 'Citación no encontrada.' });
    const { data: vin } = await supabaseAdmin.from('vinculos').select('id')
      .eq('padre_id', req.userId).eq('alumno_id', acta.alumno_id).eq('estado', 'aprobado').maybeSingle();
    if (!vin) return res.status(403).json({ ok: false, error: 'No tenés vínculo aprobado con este alumno.' });

    const { error } = await supabaseAdmin.from('acta_notificaciones').upsert({
      acta_id: id, padre_id: req.userId, respuesta, comentario: texto(req.body.comentario, 300),
      notificado_en: new Date().toISOString(),
    }, { onConflict: 'acta_id,padre_id' });
    if (error) throw error;
    return res.json({ ok: true, message: respuesta === 'no_puedo' ? 'Avisamos que no podés asistir.' : 'Gracias, quedó registrada tu notificación.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos registrar la notificación.' });
  }
});

// ============================================================
//  Personal
// ============================================================
router.get('/opciones', requireAuth, async (req, res) => {
  if (!esPersonal(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  try {
    const [cursos, ins, alumnos] = await Promise.all([
      traerTodo(() => supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division')),
      traerTodo(() => supabaseAdmin.from('inscripciones').select('alumno_id, curso_id')),
      traerTodo(() => supabaseAdmin.from('perfiles').select('id, nombre, apellido').eq('rol', 'alumno').order('apellido').order('nombre')),
    ]);
    const cursoDe = {};
    ins.forEach((i) => { cursoDe[i.alumno_id] = i.curso_id; });
    return res.json({
      ok: true,
      cursos: cursos.map((c) => ({ id: c.id, label: cursoLabel(c) })),
      alumnos: alumnos.filter((a) => cursoDe[a.id]).map((a) => ({ id: a.id, nombre: `${a.apellido}, ${a.nombre}`, cursoId: cursoDe[a.id] })),
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar las opciones.' });
  }
});

router.get('/', requireAuth, async (req, res) => {
  if (!esPersonal(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  try {
    const actas = await traerTodo(() => {
      let q = supabaseAdmin.from('actas').select('*').order('fecha', { ascending: false });
      if (ESTADOS.includes(req.query.estado)) q = q.eq('estado', req.query.estado);
      if (TIPOS.includes(req.query.tipo)) q = q.eq('tipo', req.query.tipo);
      return q;
    });
    const notifs = await traerTodo(() => supabaseAdmin.from('acta_notificaciones').select('acta_id, respuesta'), { opcional: true });
    const lista = (await enriquecer(actas)).map((a) => {
      const ns = notifs.filter((n) => n.acta_id === a.id);
      return {
        ...a,
        desarrollo: undefined,
        notificaciones: ns.length,
        noPueden: ns.filter((n) => n.respuesta === 'no_puedo').length,
        puedeEditar: esAdmin(req) || a.creadoPor === req.userId,
      };
    });
    return res.json({ ok: true, actas: lista });
  } catch (e) {
    return errorTabla(res);
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  if (!esPersonal(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  try {
    const { data, error } = await supabaseAdmin.from('actas').select('*').eq('id', req.params.id).maybeSingle();
    if (error) return errorTabla(res);
    if (!data) return res.status(404).json({ ok: false, error: 'Acta no encontrada.' });
    const [acta] = await enriquecer([data]);

    // Familias del alumno (vínculos aprobados) y si se notificaron.
    let familias = [];
    if (data.alumno_id) {
      const { data: vin } = await supabaseAdmin.from('vinculos').select('padre_id, parentesco')
        .eq('alumno_id', data.alumno_id).eq('estado', 'aprobado');
      const pids = (vin || []).map((v) => v.padre_id);
      const [pRes, nRes] = await Promise.all([
        pids.length ? supabaseAdmin.from('perfiles').select('id, nombre, apellido, email').in('id', pids) : Promise.resolve({ data: [] }),
        supabaseAdmin.from('acta_notificaciones').select('padre_id, respuesta, comentario, notificado_en').eq('acta_id', data.id),
      ]);
      familias = (vin || []).map((v) => {
        const p = (pRes.data || []).find((x) => x.id === v.padre_id) || {};
        const n = (nRes.data || []).find((x) => x.padre_id === v.padre_id);
        return {
          nombre: p.apellido ? `${p.apellido}, ${p.nombre}` : '—', email: p.email, parentesco: v.parentesco,
          notificado: n ? { respuesta: n.respuesta, comentario: n.comentario, en: n.notificado_en } : null,
        };
      });
    }
    return res.json({ ok: true, acta: { ...acta, puedeEditar: esAdmin(req) || acta.creadoPor === req.userId }, familias });
  } catch (e) {
    return errorTabla(res);
  }
});

function camposDesde(body, parcial) {
  const f = {};
  if (!parcial || body.tipo !== undefined) f.tipo = TIPOS.includes(body.tipo) ? body.tipo : null;
  if (!parcial || body.fecha !== undefined) f.fecha = fecha(body.fecha);
  if (body.hora !== undefined) f.hora = hora(body.hora);
  if (body.lugar !== undefined) f.lugar = texto(body.lugar, 120);
  if (!parcial || body.asunto !== undefined) f.asunto = texto(body.asunto, 300);
  if (body.convocados !== undefined) f.convocados = texto(body.convocados, 1000);
  if (body.presentes !== undefined) f.presentes = texto(body.presentes, 1000);
  if (body.desarrollo !== undefined) f.desarrollo = texto(body.desarrollo, 8000);
  if (body.acuerdos !== undefined) f.acuerdos = texto(body.acuerdos, 4000);
  if (body.estado !== undefined) f.estado = ESTADOS.includes(body.estado) ? body.estado : null;
  if (body.alumnoId !== undefined) f.alumno_id = body.alumnoId || null;
  if (body.cursoId !== undefined) f.curso_id = body.cursoId ? Number(body.cursoId) : null;
  return f;
}

router.post('/', requireAuth, async (req, res) => {
  if (!esPersonal(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const f = camposDesde(req.body || {}, false);
  if (!f.tipo) return res.status(400).json({ ok: false, error: 'Elegí si es citación o reunión.' });
  if (!f.fecha) return res.status(400).json({ ok: false, error: 'Indicá la fecha.' });
  if (!f.asunto) return res.status(400).json({ ok: false, error: 'Escribí el motivo o asunto.' });
  if (f.tipo === 'citacion' && !f.alumno_id) return res.status(400).json({ ok: false, error: 'Una citación es a la familia de un alumno: elegilo.' });
  f.estado = f.estado || 'programada';

  try {
    // Si hay alumno, el curso se toma de su inscripción.
    if (f.alumno_id) {
      const { data: ins } = await supabaseAdmin.from('inscripciones').select('curso_id').eq('alumno_id', f.alumno_id).maybeSingle();
      if (ins) f.curso_id = ins.curso_id;
    }
    const { data, error } = await supabaseAdmin.from('actas').insert({
      ...f,
      creado_por: req.userId,
      creado_nombre: `${req.perfil.nombre} ${req.perfil.apellido}`,
      creado_rol: req.perfil.rol,
    }).select('id').single();
    if (error) throw error;
    return res.status(201).json({ ok: true, id: data.id, message: f.tipo === 'citacion' ? 'Citación creada. La familia la ve en su panel.' : 'Reunión registrada.' });
  } catch (e) {
    return errorTabla(res);
  }
});

async function cargarEditable(req, res) {
  const { data, error } = await supabaseAdmin.from('actas').select('id, creado_por, estado').eq('id', req.params.id).maybeSingle();
  if (error) { errorTabla(res); return null; }
  if (!data) { res.status(404).json({ ok: false, error: 'Acta no encontrada.' }); return null; }
  if (!esAdmin(req) && data.creado_por !== req.userId) {
    res.status(403).json({ ok: false, error: 'Solo quien la creó, Secretaría o Dirección pueden modificarla.' });
    return null;
  }
  return data;
}

router.put('/:id', requireAuth, async (req, res) => {
  if (!esPersonal(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const actual = await cargarEditable(req, res);
  if (!actual) return;
  const f = camposDesde(req.body || {}, true);
  if ('fecha' in f && !f.fecha) return res.status(400).json({ ok: false, error: 'La fecha no es válida.' });
  if ('asunto' in f && !f.asunto) return res.status(400).json({ ok: false, error: 'El asunto no puede quedar vacío.' });
  if ('estado' in f && !f.estado) return res.status(400).json({ ok: false, error: 'Estado no válido.' });
  if ('tipo' in f && !f.tipo) delete f.tipo;
  try {
    const { error } = await supabaseAdmin.from('actas').update({ ...f, actualizado_en: new Date().toISOString() }).eq('id', actual.id);
    if (error) throw error;
    return res.json({ ok: true, message: f.estado === 'realizada' ? 'Acta guardada como realizada.' : 'Cambios guardados.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos guardar el acta.' });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  if (!esPersonal(req)) return res.status(403).json({ ok: false, error: 'No autorizado.' });
  const actual = await cargarEditable(req, res);
  if (!actual) return;
  if (!esAdmin(req) && actual.estado !== 'programada') {
    return res.status(403).json({ ok: false, error: 'Un acta realizada solo la puede eliminar Secretaría o Dirección.' });
  }
  const { error } = await supabaseAdmin.from('actas').delete().eq('id', actual.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar el acta.' });
  return res.json({ ok: true, message: 'Acta eliminada.' });
});

module.exports = router;
