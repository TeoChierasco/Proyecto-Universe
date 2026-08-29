/**
 * Middleware: exige un token de sesión válido de Supabase y carga el perfil.
 * Adjunta req.userId, req.userEmail y req.perfil (nombre, apellido, rol, nivel).
 * Responde 401 si el token es inválido, 403 si no tiene perfil.
 */
const { supabaseAdmin, hasAdmin } = require('../config/supabase');

async function requireAuth(req, res, next) {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token || !hasAdmin) {
    return res.status(401).json({ ok: false, error: 'No autenticado.' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(401).json({ ok: false, error: 'Sesión inválida o expirada.' });
    }

    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .select('nombre, apellido, rol, nivel')
      .eq('id', data.user.id)
      .single();

    if (perfilError || !perfil) {
      return res.status(403).json({ ok: false, error: 'Tu cuenta no tiene un perfil asociado.' });
    }

    req.userId = data.user.id;
    req.userEmail = data.user.email;
    req.perfil = perfil;
    next();
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos verificar la sesión.' });
  }
}

module.exports = requireAuth;
