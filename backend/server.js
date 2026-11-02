/**
 * Instituto Universe — Servidor principal
 * Sirve el frontend estático y expone la API bajo /api.
 */
const path = require('path');

// El .env vive en la raíz del proyecto (un nivel arriba de /backend).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');

const authRoutes = require('./routes/auth');
const academicoRoutes = require('./routes/academico');
const codigosRoutes = require('./routes/codigos');
const comunicadosRoutes = require('./routes/comunicados');
const usuariosRoutes = require('./routes/usuarios');
const alumnosRoutes = require('./routes/alumnos');
const familiaRoutes = require('./routes/familia');
const asistenciaRoutes = require('./routes/asistencia');
const legajosRoutes = require('./routes/legajos');
const cursosRoutes = require('./routes/cursos');
const profesoresRoutes = require('./routes/profesores');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Frontend estático (carpeta /frontend, un nivel arriba de /backend)
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API
app.use('/api/auth', authRoutes);
app.use('/api/academico', academicoRoutes);
app.use('/api/codigos', codigosRoutes);
app.use('/api/comunicados', comunicadosRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/alumnos', alumnosRoutes);
app.use('/api/familia', familiaRoutes);
app.use('/api/asistencia', asistenciaRoutes);
app.use('/api/legajos', legajosRoutes);
app.use('/api/cursos', cursosRoutes);
app.use('/api/profesores', profesoresRoutes);

// Cualquier ruta no-API desconocida vuelve a la pantalla de bienvenida
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Recurso no encontrado' });
  }
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Instituto Universe corriendo en http://localhost:${PORT}`);
});
