/**
 * Emails: normalización y control de duplicados.
 *
 * Gmail entrega en la misma casilla direcciones que "parecen" distintas:
 *   Tomas.Chierasco@gmail.com = tomaschierasco@gmail.com = tomaschierasco+cole@gmail.com
 *   (y googlemail.com es lo mismo que gmail.com).
 * Para que no se creen dos cuentas con el mismo Gmail, se compara la forma
 * "canónica": sin mayúsculas, sin puntos y sin lo que va después de "+".
 * En otros dominios solo se ignoran mayúsculas y espacios.
 */
const { supabaseAdmin } = require('../config/supabase');
const { traerTodo } = require('./consultas');

const DOMINIOS_GMAIL = ['gmail.com', 'googlemail.com'];

// Forma en que se guarda: sin espacios y en minúsculas.
function normalizarEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

// Forma usada para comparar si dos emails son la misma casilla.
function emailCanonico(email) {
  const e = normalizarEmail(email);
  const at = e.lastIndexOf('@');
  if (at < 1) return e;
  let local = e.slice(0, at);
  const dominio = e.slice(at + 1);
  if (DOMINIOS_GMAIL.includes(dominio)) {
    local = local.split('+')[0].replace(/\./g, '');
    return `${local}@gmail.com`;
  }
  return `${local}@${dominio}`;
}

/**
 * ¿Ya hay una cuenta con este email (o una variante de Gmail del mismo)?
 * Devuelve el email existente que coincide, o null.
 */
async function emailEnUso(email) {
  const canonico = emailCanonico(email);
  const dominio = canonico.split('@')[1];

  let candidatos;
  if (dominio === 'gmail.com') {
    // Todas las cuentas de Gmail (con cualquier punto o "+"): se comparan en su forma canónica.
    candidatos = await traerTodo(() => supabaseAdmin.from('perfiles').select('email')
      .or('email.ilike.%@gmail.com,email.ilike.%@googlemail.com'));
  } else {
    // Mismo email sin importar mayúsculas (se escapan los comodines de ILIKE).
    const exacto = normalizarEmail(email).replace(/([\\%_])/g, '\\$1');
    candidatos = await traerTodo(() => supabaseAdmin.from('perfiles').select('email').ilike('email', exacto));
  }
  const coincide = candidatos.find((p) => p.email && emailCanonico(p.email) === canonico);
  return coincide ? coincide.email : null;
}

module.exports = { normalizarEmail, emailValido, emailCanonico, emailEnUso };
