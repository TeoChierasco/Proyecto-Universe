/**
 * Rutas de códigos de aprobación (generar / listar / revocar).
 * Autorización por rol:
 *   - Dirección  emite códigos para Secretaría.
 *   - Secretaría emite códigos para Profesor y Preceptor.
 */
const crypto = require('crypto');
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

// Qué puede emitir cada rol.
const PUEDE_EMITIR = {
  director:   { emitidoPor: 'direccion',  roles: ['secretaria'] },
  secretaria: { emitidoPor: 'secretaria', roles: ['alumno', 'padre', 'profesor', 'preceptor'] },
};

const PREFIJO = { secretaria: 'SEC', profesor: 'PROF', preceptor: 'PREC', alumno: 'ALU', padre: 'PAD' };

function generarCodigo(rolDestino) {
  const abecedario = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin O/0/I/1 para evitar confusiones
  let sufijo = '';
  for (let i = 0; i < 6; i++) sufijo += abecedario[crypto.randomInt(abecedario.length)];
  return `${PREFIJO[rolDestino]}-${new Date().getFullYear()}-${sufijo}`;
}

// GET /api/codigos — lista los códigos del ámbito del usuario.
router.get('/', requireAuth, async (req, res) => {
  const permiso = PUEDE_EMITIR[req.perfil.rol];
  if (!permiso) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar códigos de aprobación.' });
  }

  const { data, error } = await supabaseAdmin
    .from('codigos_aprobacion')
    .select('id, codigo, rol_destino, usado, creado_en')
    .eq('emitido_por', permiso.emitidoPor)
    .order('creado_en', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los códigos.' });
  }
  return res.json({ ok: true, codigos: data, puedeEmitir: permiso.roles });
});

// POST /api/codigos — genera un código para el rol indicado.
router.post('/', requireAuth, async (req, res) => {
  const permiso = PUEDE_EMITIR[req.perfil.rol];
  if (!permiso) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede generar códigos de aprobación.' });
  }

  const { rolDestino } = req.body || {};
  if (!permiso.roles.includes(rolDestino)) {
    return res.status(400).json({ ok: false, error: 'No podés generar un código para ese rol.' });
  }

  // Reintenta ante una colisión improbable del código único.
  for (let intento = 0; intento < 5; intento++) {
    const codigo = generarCodigo(rolDestino);
    const { data, error } = await supabaseAdmin
      .from('codigos_aprobacion')
      .insert({ codigo, rol_destino: rolDestino, emitido_por: permiso.emitidoPor, creado_por: req.userId })
      .select('id, codigo, rol_destino, usado, creado_en')
      .single();

    if (!error) return res.status(201).json({ ok: true, codigo: data });
    if (!/duplicate|unique/i.test(error.message || '')) {
      return res.status(500).json({ ok: false, error: 'No pudimos generar el código.' });
    }
  }
  return res.status(500).json({ ok: false, error: 'No pudimos generar un código único, probá de nuevo.' });
});

// DELETE /api/codigos/:id — revoca un código que todavía no fue usado.
router.delete('/:id', requireAuth, async (req, res) => {
  const permiso = PUEDE_EMITIR[req.perfil.rol];
  if (!permiso) {
    return res.status(403).json({ ok: false, error: 'No autorizado.' });
  }

  const { data, error } = await supabaseAdmin
    .from('codigos_aprobacion')
    .delete()
    .eq('id', req.params.id)
    .eq('emitido_por', permiso.emitidoPor)
    .eq('usado', false)
    .select('id');

  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos revocar el código.' });
  }
  if (!data || data.length === 0) {
    return res.status(400).json({ ok: false, error: 'No se pudo revocar (ya fue usado o no existe).' });
  }
  return res.json({ ok: true });
});

module.exports = router;
