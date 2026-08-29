/**
 * Rutas de comunicados / cartelera.
 *   - Publican: Dirección, Secretaría, Profesores y Preceptores.
 *   - Leen: todos, filtrado por audiencia según su rol.
 *   - Eliminan: el autor del comunicado, o Dirección/Secretaría (moderación).
 */
const express = require('express');
const { supabaseAdmin } = require('../config/supabase');
const requireAuth = require('../middleware/requireAuth');

const router = express.Router();

const PUBLICADORES = ['director', 'secretaria', 'profesor', 'preceptor'];
const MODERADORES = ['director', 'secretaria'];
const AUDIENCIAS = ['todos', 'alumnos', 'familias', 'docentes'];

// Qué audiencias ve cada rol (Dirección y Secretaría ven todo).
const AUDIENCIA_VISIBLE = {
  alumno:    ['todos', 'alumnos'],
  padre:     ['todos', 'familias'],
  profesor:  ['todos', 'docentes'],
  preceptor: ['todos', 'docentes'],
};

// GET /api/comunicados — lista los comunicados visibles para el usuario.
router.get('/', requireAuth, async (req, res) => {
  const rol = req.perfil.rol;

  let query = supabaseAdmin
    .from('comunicados')
    .select('id, titulo, cuerpo, audiencia, autor_id, autor_nombre, autor_rol, creado_en')
    .order('creado_en', { ascending: false });

  const visibles = AUDIENCIA_VISIBLE[rol];
  if (visibles) query = query.in('audiencia', visibles);

  const { data, error } = await query;
  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos cargar los comunicados.' });
  }

  return res.json({
    ok: true,
    comunicados: data,
    puedePublicar: PUBLICADORES.includes(rol),
    esModerador: MODERADORES.includes(rol),
    miId: req.userId,
  });
});

// POST /api/comunicados — publica un comunicado.
router.post('/', requireAuth, async (req, res) => {
  if (!PUBLICADORES.includes(req.perfil.rol)) {
    return res.status(403).json({ ok: false, error: 'Tu rol no puede publicar comunicados.' });
  }

  const titulo = (req.body.titulo || '').trim();
  const cuerpo = (req.body.cuerpo || '').trim();
  const audiencia = req.body.audiencia || 'todos';

  if (!titulo || !cuerpo) {
    return res.status(400).json({ ok: false, error: 'El título y el mensaje son obligatorios.' });
  }
  if (titulo.length > 120) {
    return res.status(400).json({ ok: false, error: 'El título es demasiado largo (máx. 120 caracteres).' });
  }
  if (cuerpo.length > 2000) {
    return res.status(400).json({ ok: false, error: 'El mensaje es demasiado largo (máx. 2000 caracteres).' });
  }
  if (!AUDIENCIAS.includes(audiencia)) {
    return res.status(400).json({ ok: false, error: 'La audiencia seleccionada no es válida.' });
  }

  const { data, error } = await supabaseAdmin
    .from('comunicados')
    .insert({
      titulo,
      cuerpo,
      audiencia,
      autor_id: req.userId,
      autor_nombre: `${req.perfil.nombre} ${req.perfil.apellido}`,
      autor_rol: req.perfil.rol,
    })
    .select('id, titulo, cuerpo, audiencia, autor_id, autor_nombre, autor_rol, creado_en')
    .single();

  if (error) {
    return res.status(500).json({ ok: false, error: 'No pudimos publicar el comunicado.' });
  }
  return res.status(201).json({ ok: true, comunicado: data });
});

// DELETE /api/comunicados/:id — elimina (autor o moderador).
router.delete('/:id', requireAuth, async (req, res) => {
  const { data: com, error: buscarError } = await supabaseAdmin
    .from('comunicados')
    .select('autor_id')
    .eq('id', req.params.id)
    .maybeSingle();

  if (buscarError) return res.status(500).json({ ok: false, error: 'No pudimos eliminar el comunicado.' });
  if (!com) return res.status(404).json({ ok: false, error: 'El comunicado no existe.' });

  const esAutor = com.autor_id === req.userId;
  const esModerador = MODERADORES.includes(req.perfil.rol);
  if (!esAutor && !esModerador) {
    return res.status(403).json({ ok: false, error: 'No podés eliminar este comunicado.' });
  }

  const { error } = await supabaseAdmin.from('comunicados').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ ok: false, error: 'No pudimos eliminar el comunicado.' });
  return res.json({ ok: true });
});

module.exports = router;
