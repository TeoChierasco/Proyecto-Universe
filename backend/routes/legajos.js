/**
 * Legajos de alumnos y control de documentación (solo Secretaría y Dirección).
 *   - Lista los alumnos con su curso y cuántos documentos entregaron.
 *   - Muestra la ficha de un alumno: datos personales + documentos.
 *   - Actualiza los datos del legajo y el estado de cada documento.
 * Tablas: legajos, legajo_documentos (ver backend/db/secretaria.sql).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const ADMINS = ['secretaria', 'director'];
const esAdmin = (req) => ADMINS.includes(req.perfil.rol);

// Documentación que se le pide a cada alumno. Para agregar o quitar
// un documento alcanza con editar esta lista (no hace falta tocar la base).
const DOCUMENTOS = [
  { tipo: 'dni',          nombre: 'Copia de DNI' },
  { tipo: 'partida',      nombre: 'Partida de nacimiento' },
  { tipo: 'certificado',  nombre: 'Certificado de estudios / pase' },
  { tipo: 'ficha_medica', nombre: 'Ficha médica / apto físico' },
  { tipo: 'vacunas',      nombre: 'Certificado de vacunas' },
  { tipo: 'foto',         nombre: 'Foto carnet' },
];
const TIPOS = DOCUMENTOS.map((d) => d.tipo);
const ESTADOS = ['pendiente', 'entregado', 'no_aplica'];

function soloAdmin(req, res, next) {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede ver legajos.' });
  }
  next();
}

function texto(valor, max = 300) {
  const t = (valor == null ? '' : String(valor)).trim();
  return t ? t.slice(0, max) : null;
}

function fecha(valor) {
  const t = (valor || '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

// Cuenta documentos completos: "entregado" y "no aplica" cuentan como resueltos.
function resumenDocs(docsDelAlumno) {
  const estadoDe = {};
  (docsDelAlumno || []).forEach((d) => { estadoDe[d.tipo] = d.estado; });
  const pendientes = TIPOS.filter((t) => (estadoDe[t] || 'pendiente') === 'pendiente');
  return { total: TIPOS.length, completos: TIPOS.length - pendientes.length, pendientes };
}

// GET /api/legajos — todos los alumnos con su resumen de documentación.
router.get('/', requireAuth, soloAdmin, async (req, res) => {
  const [aluRes, insRes, curRes, docRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, email, documento').eq('rol', 'alumno').order('apellido').order('nombre'),
    supabaseAdmin.from('inscripciones').select('alumno_id, curso_id'),
    supabaseAdmin.from('cursos').select('id, anio, division').order('anio').order('division'),
    supabaseAdmin.from('legajo_documentos').select('alumno_id, tipo, estado'),
  ]);

  if (aluRes.error || insRes.error || curRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los legajos.' });
  }
  if (docRes.error) {
    return res.status(500).json({ ok: false, error: 'Falta crear las tablas de legajos (corré backend/db/secretaria.sql en Supabase).' });
  }

  const cursoDe = {};
  insRes.data.forEach((i) => { cursoDe[i.alumno_id] = i.curso_id; });
  const docsDe = {};
  docRes.data.forEach((d) => { (docsDe[d.alumno_id] = docsDe[d.alumno_id] || []).push(d); });

  const alumnos = aluRes.data.map((a) => ({
    ...a,
    cursoId: cursoDe[a.id] || null,
    documentacion: resumenDocs(docsDe[a.id]),
  }));

  return res.json({ ok: true, alumnos, cursos: curRes.data, documentos: DOCUMENTOS });
});

// GET /api/legajos/:id — ficha completa de un alumno.
router.get('/:id', requireAuth, soloAdmin, async (req, res) => {
  const id = req.params.id;
  const [perRes, legRes, docRes, insRes] = await Promise.all([
    supabaseAdmin.from('perfiles').select('id, nombre, apellido, email, documento, rol').eq('id', id).maybeSingle(),
    supabaseAdmin.from('legajos').select('*').eq('alumno_id', id).maybeSingle(),
    supabaseAdmin.from('legajo_documentos').select('tipo, estado, fecha_entrega, observacion').eq('alumno_id', id),
    supabaseAdmin.from('inscripciones').select('curso_id').eq('alumno_id', id).maybeSingle(),
  ]);

  if (perRes.error || legRes.error || docRes.error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar el legajo.' });
  }
  if (!perRes.data || perRes.data.rol !== 'alumno') {
    return res.status(404).json({ ok: false, error: 'Alumno no encontrado.' });
  }

  const registro = {};
  docRes.data.forEach((d) => { registro[d.tipo] = d; });
  const documentos = DOCUMENTOS.map((d) => ({
    ...d,
    estado: (registro[d.tipo] && registro[d.tipo].estado) || 'pendiente',
    fechaEntrega: (registro[d.tipo] && registro[d.tipo].fecha_entrega) || null,
    observacion: (registro[d.tipo] && registro[d.tipo].observacion) || '',
  }));

  const l = legRes.data || {};
  return res.json({
    ok: true,
    alumno: { ...perRes.data, cursoId: insRes.data ? insRes.data.curso_id : null },
    legajo: {
      fechaNacimiento: l.fecha_nacimiento || '',
      domicilio: l.domicilio || '',
      telefono: l.telefono || '',
      contactoEmergencia: l.contacto_emergencia || '',
      observaciones: l.observaciones || '',
      actualizadoEn: l.actualizado_en || null,
    },
    documentos,
  });
});

// PUT /api/legajos/:id — guarda los datos personales del legajo.
router.put('/:id', requireAuth, soloAdmin, async (req, res) => {
  const b = req.body || {};
  const fila = {
    alumno_id: req.params.id,
    fecha_nacimiento: fecha(b.fechaNacimiento),
    domicilio: texto(b.domicilio, 200),
    telefono: texto(b.telefono, 40),
    contacto_emergencia: texto(b.contactoEmergencia, 200),
    observaciones: texto(b.observaciones, 1000),
    actualizado_en: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from('legajos').upsert(fila, { onConflict: 'alumno_id' });
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos guardar el legajo.' });
  return res.json({ ok: true, message: 'Legajo actualizado.' });
});

// PATCH /api/legajos/:id/documentos/:tipo — cambia el estado de un documento.
router.patch('/:id/documentos/:tipo', requireAuth, soloAdmin, async (req, res) => {
  const tipo = req.params.tipo;
  const estado = req.body.estado;
  if (!TIPOS.includes(tipo)) return res.status(400).json({ ok: false, error: 'Documento no válido.' });
  if (!ESTADOS.includes(estado)) return res.status(400).json({ ok: false, error: 'Estado no válido.' });

  // Si se marca como entregado sin fecha, se toma la de hoy.
  const hoy = new Date().toISOString().slice(0, 10);
  const fila = {
    alumno_id: req.params.id,
    tipo,
    estado,
    fecha_entrega: estado === 'entregado' ? (fecha(req.body.fechaEntrega) || hoy) : null,
    observacion: texto(req.body.observacion, 300),
    actualizado_en: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin.from('legajo_documentos').upsert(fila, { onConflict: 'alumno_id,tipo' });
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el documento.' });
  return res.json({ ok: true, fechaEntrega: fila.fecha_entrega });
});

module.exports = router;
