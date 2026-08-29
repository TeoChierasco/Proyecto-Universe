/**
 * Gestión de usuarios (Dirección y Secretaría).
 *
 * Jerarquía de permisos:
 *   - Dirección  : ve todos, puede cambiar cualquier rol y eliminar cualquier cuenta.
 *   - Secretaría : ve todos, pero NO puede tocar cuentas de Dirección/Secretaría
 *                  ni asignar esos roles.
 *   - Nadie puede cambiarse el rol a sí mismo ni eliminarse a sí mismo.
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const ADMINS = ['director', 'secretaria'];
const ROLES_JERARQUICOS = ['director', 'secretaria'];

// Qué roles puede asignar cada administrador.
const ROLES_ASIGNABLES = {
  director:   ['alumno', 'padre', 'profesor', 'preceptor', 'secretaria', 'director'],
  secretaria: ['alumno', 'padre', 'profesor', 'preceptor'],
};

function esAdmin(req) {
  return ADMINS.includes(req.perfil.rol);
}

// Devuelve un error (string) si el admin no puede operar sobre ese usuario.
function vetoSobre(req, objetivo) {
  if (objetivo.id === req.userId) {
    return 'No podés modificar tu propia cuenta desde acá.';
  }
  if (req.perfil.rol === 'secretaria' && ROLES_JERARQUICOS.includes(objetivo.rol)) {
    return 'Secretaría no puede modificar cuentas de Dirección o Secretaría.';
  }
  return null;
}

// GET /api/usuarios — lista todas las cuentas.
router.get('/', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar usuarios.' });
  }

  const { data, error } = await supabaseAdmin
    .from('perfiles')
    .select('id, nombre, apellido, email, rol, nivel, creado_en')
    .order('creado_en', { ascending: false });

  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los usuarios.' });
  }
  return res.json({
    ok: true,
    usuarios: data,
    miId: req.userId,
    miRol: req.perfil.rol,
    rolesAsignables: ROLES_ASIGNABLES[req.perfil.rol] || [],
  });
});

// PATCH /api/usuarios/:id/rol — cambia el rol de una cuenta.
router.patch('/:id/rol', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar usuarios.' });
  }

  const nuevoRol = req.body.rol;
  const permitidos = ROLES_ASIGNABLES[req.perfil.rol] || [];
  if (!permitidos.includes(nuevoRol)) {
    return res.status(403).json({ ok: false, error: 'No podés asignar ese rol.' });
  }

  const { data: objetivo, error: errorBuscar } = await supabaseAdmin
    .from('perfiles').select('id, rol').eq('id', req.params.id).maybeSingle();

  if (errorBuscar) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el rol.' });
  if (!objetivo) return res.status(404).json({ ok: false, error: 'La cuenta no existe.' });

  const veto = vetoSobre(req, objetivo);
  if (veto) return res.status(403).json({ ok: false, error: veto });

  const { error } = await supabaseAdmin
    .from('perfiles').update({ rol: nuevoRol }).eq('id', req.params.id);

  if (error) return res.status(500).json({ ok: false, error: 'No pudimos actualizar el rol.' });
  return res.json({ ok: true, message: 'Rol actualizado.' });
});

// DELETE /api/usuarios/:id — elimina una cuenta (y su perfil, en cascada).
router.delete('/:id', requireAuth, async (req, res) => {
  if (!esAdmin(req)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede gestionar usuarios.' });
  }

  const { data: objetivo, error: errorBuscar } = await supabaseAdmin
    .from('perfiles').select('id, rol').eq('id', req.params.id).maybeSingle();

  if (errorBuscar) return res.status(500).json({ ok: false, error: 'No pudimos eliminar la cuenta.' });
  if (!objetivo) return res.status(404).json({ ok: false, error: 'La cuenta no existe.' });

  const veto = vetoSobre(req, objetivo);
  if (veto) return res.status(403).json({ ok: false, error: veto });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar la cuenta.' });
  return res.json({ ok: true, message: 'Cuenta eliminada.' });
});

module.exports = router;
