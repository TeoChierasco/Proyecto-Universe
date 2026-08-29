/**
 * Rutas de autenticación.
 *
 * Con Supabase configurado (clave secreta presente) el backend:
 *   - crea usuarios en Supabase Auth,
 *   - valida y consume los códigos de aprobación,
 *   - asigna el rol en la tabla `perfiles`.
 * Si no hay clave secreta, responde en modo simulado (sin tocar la base).
 */
const express = require('express');
const { supabaseAdmin, nuevoClientePublico, hasAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const ROLES_VALIDOS = ['alumno', 'padre', 'profesor', 'preceptor', 'secretaria', 'director'];
const NIVELES_ACTIVOS = ['secundario'];

// Roles que requieren un código de aprobación para registrarse solos:
//   - alumno, padre, profesor y preceptor → código emitido por Secretaría
//   - secretaria                          → código emitido por Dirección
// (Secretaría también puede crear cuentas de alumno directamente, sin código.)
const ROLES_CON_CODIGO = ['alumno', 'padre', 'profesor', 'preceptor', 'secretaria'];
// Roles que NO se autorregistran (se crean desde la administración / Supabase):
const ROLES_SIN_AUTORREGISTRO = ['director'];

// ------------------------------------------------------------
//  POST /api/auth/login
// ------------------------------------------------------------
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, error: 'Email y contraseña son obligatorios.' });
  }

  if (!hasAdmin) {
    return res.json({
      ok: true,
      simulado: true,
      message: 'Inicio de sesión recibido (modo simulado, sin base de datos).',
      usuario: { email },
    });
  }

  try {
    // Verificamos las credenciales con un cliente público efímero.
    const cliente = nuevoClientePublico();
    const { data, error } = await cliente.auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      return res.status(401).json({ ok: false, error: 'Email o contraseña incorrectos.' });
    }

    // El rol y nivel reales viven en la tabla de perfiles.
    const { data: perfil, error: perfilError } = await supabaseAdmin
      .from('perfiles')
      .select('nombre, apellido, rol, nivel')
      .eq('id', data.user.id)
      .single();

    if (perfilError || !perfil) {
      return res.status(403).json({
        ok: false,
        error: 'Tu cuenta no tiene un perfil asociado. Contactá a la administración.',
      });
    }

    return res.json({
      ok: true,
      message: `¡Hola ${perfil.nombre}! Ingresaste como ${perfil.rol}.`,
      token: data.session ? data.session.access_token : null,
      refreshToken: data.session ? data.session.refresh_token : null,
      usuario: { email, ...perfil },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos conectar con el servidor de autenticación.' });
  }
});

// ------------------------------------------------------------
//  GET /api/auth/me — valida el token de sesión y devuelve el perfil.
//  Lo usa el panel interno para protegerse: si el token es inválido o
//  expiró, responde 401 y el frontend manda al login.
// ------------------------------------------------------------
router.get('/me', async (req, res) => {
  const cabecera = req.headers.authorization || '';
  const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7) : null;

  if (!token) {
    return res.status(401).json({ ok: false, error: 'No autenticado.' });
  }
  if (!hasAdmin) {
    return res.status(401).json({ ok: false, error: 'Autenticación no disponible.' });
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

    return res.json({ ok: true, usuario: { id: data.user.id, email: data.user.email, ...perfil } });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos verificar la sesión.' });
  }
});

// ------------------------------------------------------------
//  PATCH /api/auth/perfil — el usuario edita sus propios datos.
//  (El rol y el nivel NO se pueden cambiar desde acá: los gestiona
//   Dirección/Secretaría, para que nadie se ascienda a sí mismo.)
// ------------------------------------------------------------
router.patch('/perfil', requireAuth, async (req, res) => {
  const nombre = (req.body.nombre || '').trim();
  const apellido = (req.body.apellido || '').trim();

  if (!nombre || !apellido) {
    return res.status(400).json({ ok: false, error: 'El nombre y el apellido son obligatorios.' });
  }
  if (nombre.length > 60 || apellido.length > 60) {
    return res.status(400).json({ ok: false, error: 'El nombre o el apellido son demasiado largos.' });
  }

  const { data, error } = await supabaseAdmin
    .from('perfiles')
    .update({ nombre, apellido })
    .eq('id', req.userId)
    .select('nombre, apellido, rol, nivel')
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos guardar tus datos.' });
  }
  return res.json({ ok: true, message: 'Datos actualizados.', usuario: { email: req.userEmail, ...data } });
});

// ------------------------------------------------------------
//  POST /api/auth/cambiar-password
//  Pide la contraseña actual para evitar cambios no autorizados.
// ------------------------------------------------------------
router.post('/cambiar-password', requireAuth, async (req, res) => {
  const actual = req.body.actual || '';
  const nueva = req.body.nueva || '';

  if (!actual || !nueva) {
    return res.status(400).json({ ok: false, error: 'Completá la contraseña actual y la nueva.' });
  }
  if (String(nueva).length < 8) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  if (actual === nueva) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe ser distinta de la actual.' });
  }

  try {
    // 1. Verificar la contraseña actual.
    const cliente = nuevoClientePublico();
    const { error: errorLogin } = await cliente.auth.signInWithPassword({
      email: req.userEmail, password: actual,
    });
    if (errorLogin) {
      return res.status(400).json({ ok: false, error: 'La contraseña actual no es correcta.' });
    }

    // 2. Cambiarla.
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.userId, { password: nueva });
    if (error) {
      return res.status(500).json({ ok: false, error: 'No pudimos cambiar la contraseña.' });
    }
    return res.json({ ok: true, message: 'Contraseña actualizada. Usala la próxima vez que ingreses.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos cambiar la contraseña.' });
  }
});

// ------------------------------------------------------------
//  POST /api/auth/recuperar — envía el email con el enlace de reseteo.
//  Responde siempre igual para no revelar si el email está registrado.
// ------------------------------------------------------------
router.post('/recuperar', async (req, res) => {
  const email = (req.body.email || '').trim();
  const respuestaGenerica = {
    ok: true,
    message: 'Si el email está registrado, te enviamos un enlace para restablecer tu contraseña. Revisá tu casilla (y la carpeta de spam).',
  };

  if (!email) return res.status(400).json({ ok: false, error: 'Ingresá tu email.' });
  if (!hasAdmin) return res.json(respuestaGenerica);

  try {
    const cliente = nuevoClientePublico();
    const origin = `${req.protocol}://${req.get('host')}`;
    await cliente.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/recuperar.html` });
  } catch (e) {
    // No revelamos el error al usuario (evita filtrar si el email existe).
  }
  return res.json(respuestaGenerica);
});

// ------------------------------------------------------------
//  POST /api/auth/restablecer-password — fija la nueva contraseña
//  usando el token de recuperación que llega en el enlace del email.
// ------------------------------------------------------------
router.post('/restablecer-password', async (req, res) => {
  const token = req.body.token || '';
  const nueva = req.body.nueva || '';

  if (!token) {
    return res.status(400).json({ ok: false, error: 'El enlace es inválido o venció. Pedí uno nuevo.' });
  }
  if (String(nueva).length < 8) {
    return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }
  if (!hasAdmin) {
    return res.status(400).json({ ok: false, error: 'La recuperación no está disponible en este momento.' });
  }

  try {
    // El token de recuperación es un access_token válido: lo verificamos.
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) {
      return res.status(400).json({ ok: false, error: 'El enlace es inválido o venció. Pedí uno nuevo.' });
    }

    // Defensa: exigir que el token provenga del enlace de recuperación (OTP),
    // no de un login común (amr 'password'). Así, una sesión robada no sirve
    // para resetear la contraseña sin pasar por el email.
    let esRecuperacion = false;
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
      esRecuperacion = Array.isArray(payload.amr) && payload.amr.some((m) => m.method === 'recovery' || m.method === 'otp');
    } catch (e) { /* si no se puede decodificar, se rechaza abajo */ }

    if (!esRecuperacion) {
      return res.status(400).json({ ok: false, error: 'Enlace no válido para recuperación. Pedí uno desde "¿Olvidaste tu contraseña?".' });
    }

    const { error: errorUpd } = await supabaseAdmin.auth.admin.updateUserById(data.user.id, { password: nueva });
    if (errorUpd) {
      return res.status(500).json({ ok: false, error: 'No pudimos actualizar la contraseña.' });
    }
    return res.json({ ok: true, message: '¡Listo! Tu contraseña fue actualizada. Ya podés iniciar sesión.' });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No pudimos restablecer la contraseña.' });
  }
});

// ------------------------------------------------------------
//  POST /api/auth/register
// ------------------------------------------------------------
router.post('/register', async (req, res) => {
  const { nombre, apellido, email, password, rol, nivel, codigo } = req.body || {};
  const documento = (req.body.documento || '').trim() || null;

  if (!nombre || !apellido || !email || !password || !rol) {
    return res.status(400).json({ ok: false, error: 'Todos los campos son obligatorios.' });
  }
  if (rol === 'alumno' && !documento) {
    return res.status(400).json({ ok: false, error: 'El documento (DNI) del alumno es obligatorio.' });
  }
  if (!ROLES_VALIDOS.includes(rol)) {
    return res.status(400).json({ ok: false, error: 'El rol seleccionado no es válido.' });
  }
  if (ROLES_SIN_AUTORREGISTRO.includes(rol)) {
    return res.status(403).json({ ok: false, error: 'Las cuentas de Dirección se crean desde la administración del instituto.' });
  }
  if (!NIVELES_ACTIVOS.includes(nivel)) {
    return res.status(400).json({ ok: false, error: 'Por el momento solo está habilitado el Nivel Secundario.' });
  }
  if (ROLES_CON_CODIGO.includes(rol) && !codigo) {
    return res.status(400).json({ ok: false, error: 'Este rol requiere un código de aprobación para registrarse.' });
  }
  if (String(password).length < 8) {
    return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres.' });
  }

  if (!hasAdmin) {
    return res.status(201).json({
      ok: true,
      simulado: true,
      message: `Registro recibido para ${nombre} ${apellido} (modo simulado, sin base de datos).`,
    });
  }

  try {
    // 1. Validar el código de aprobación (si el rol lo requiere), sin consumirlo aún.
    let codigoRow = null;
    if (ROLES_CON_CODIGO.includes(rol)) {
      const { data: cod, error: codError } = await supabaseAdmin
        .from('codigos_aprobacion')
        .select('id, usado, expira_en')
        .eq('codigo', codigo)
        .eq('rol_destino', rol)
        .maybeSingle();
      if (codError) throw codError;
      if (!cod) {
        return res.status(400).json({ ok: false, error: 'El código de aprobación no es válido para este rol.' });
      }
      if (cod.usado) {
        return res.status(400).json({ ok: false, error: 'Este código de aprobación ya fue utilizado.' });
      }
      if (cod.expira_en && new Date(cod.expira_en) < new Date()) {
        return res.status(400).json({ ok: false, error: 'Este código de aprobación está vencido.' });
      }
      codigoRow = cod;
    }

    // 2. Crear el usuario en Supabase Auth (email ya confirmado).
    const { data: creado, error: crearError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre, apellido, rol, nivel },
    });
    if (crearError) {
      const msg = /already been registered|already exists|duplicate/i.test(crearError.message || '')
        ? 'Ya existe una cuenta con ese email.'
        : 'No pudimos crear la cuenta. Revisá los datos e intentá de nuevo.';
      return res.status(400).json({ ok: false, error: msg });
    }
    const userId = creado.user.id;

    // 3. Crear el perfil con el rol correcto.
    const { error: perfilError } = await supabaseAdmin.from('perfiles').insert({
      id: userId, nombre, apellido, email, rol, nivel, documento,
    });
    if (perfilError) {
      // Evitar cuentas huérfanas si falla el perfil.
      await supabaseAdmin.auth.admin.deleteUser(userId);
      if (/duplicate|unique/i.test(perfilError.message || '')) {
        return res.status(400).json({ ok: false, error: 'Ya existe un alumno con ese documento.' });
      }
      throw perfilError;
    }

    // 4. Consumir el código (marcarlo como usado). El filtro usado=false evita
    //    que dos registros simultáneos reutilicen el mismo código.
    if (codigoRow) {
      await supabaseAdmin
        .from('codigos_aprobacion')
        .update({ usado: true, usado_por: userId })
        .eq('id', codigoRow.id)
        .eq('usado', false);
    }

    return res.status(201).json({
      ok: true,
      message: `¡Cuenta creada, ${nombre}! Ya podés iniciar sesión.`,
      usuario: { id: userId, email, rol, nivel },
    });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'Ocurrió un error al crear la cuenta. Probá de nuevo en un momento.' });
  }
});

module.exports = router;
