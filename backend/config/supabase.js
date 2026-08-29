/**
 * Configuración de Supabase.
 *
 *  - `supabase`      → cliente público (clave anon/publishable). Operaciones
 *                      sin privilegios; respeta las políticas RLS.
 *  - `supabaseAdmin` → cliente administrador (clave secreta service_role).
 *                      SOLO backend: crea usuarios, valida códigos y asigna
 *                      roles saltándose RLS. Nunca debe llegar al frontend.
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
  : null;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  : null;

// Crea un cliente público nuevo por pedido (evita compartir sesión entre
// logins concurrentes en el backend).
function nuevoClientePublico() {
  return isConfigured
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    : null;
}

module.exports = {
  supabase,
  supabaseAdmin,
  nuevoClientePublico,
  isConfigured,
  hasAdmin: Boolean(supabaseAdmin),
};
