# Instituto Universe 🪐

Plataforma web universal del **Instituto Universe**: centraliza la gestión y comunicación
para toda la comunidad educativa (Alumnos, Padres, Profesores, Directores y Secretaría)
en los tres niveles académicos (Primario, Secundario y Terciario).

## Estado actual (MVP)

Flujo de entrada a la aplicación:

1. **Bienvenida** (`/`) — pantalla institucional minimalista: logo + botón "Ingresar a la plataforma".
2. **Nivel y rol** (`/niveles.html`) — dos pasos en una sola pantalla:
   - **Nivel**: Primario / Secundario / Terciario. Solo **Secundario** continúa;
     los otros muestran "Próximamente".
   - **Rol**: Alumno, Padre/Tutor, Profesor, Preceptor, Secretaría, Director.
   El botón "Continuar" se habilita al elegir un nivel activo **y** un rol.
3. **Login** (`/login.html`) — email + contraseña. Muestra el nivel y rol elegidos.
4. **Registro** (`/registro.html`) — datos personales (el rol viene del paso anterior).

### Reglas de registro por rol

| Rol | Cómo se crea la cuenta |
|---|---|
| Alumno / Padre-Tutor / Profesor / Preceptor | Requiere **código de aprobación de Secretaría**. (Secretaría también puede crear cuentas de alumno directamente desde *Alumnos*.) |
| Secretaría | Requiere **código de aprobación de Dirección**. |
| Director | No se autorregistra: se crea desde la administración (Supabase). |

### Módulos implementados

- Autenticación (login, registro, recuperar contraseña, perfil)
- Gestión de usuarios
- Códigos de aprobación
- Plan de estudios (materias y talleres)
- Comunicados / cartelera
- Alumnos
- Asistencia
- Familia / hijos (el padre/tutor solicita el vínculo con el DNI del alumno y **Secretaría lo aprueba** antes de que pueda ver sus datos)
- Inscripciones y cursos (esquemas SQL)
- **Asistencia con cómputo de inasistencias:** presente / tarde (¼) / retiro (½) / ausente (1), tope anual configurable, avisos automáticos a la familia al llegar a 10, 15, 20 y 25 faltas, planilla mensual imprimible por curso (reglas en `backend/config/asistencia.js`)
- **Horarios:** grilla semanal por curso que arma Secretaría; detecta choques de horario del profesor, no permite más módulos que las horas asignadas y permite asignar el docente desde la misma pantalla. Cada alumno, familia y profesor ve su horario (módulos en `backend/config/horarios.js`)
- **Jornada por curso (Cursos y divisiones):** primer y último módulo de cada día; el horario tiene que cubrir exactamente esa jornada (no se cargan clases fuera y se avisa si faltan módulos)
- **Exportar a Excel y PDF:** Legajos y Actas exportan lo que se ve en pantalla (con los filtros aplicados) a .xlsx o a PDF (`frontend/js/exportar.js`, sin dependencias)
- **Mis materias (alumno):** materias del año con profesor, módulos por semana y promedio publicado
- **Cierre de notas y emisión de boletines:** fecha límite por trimestre, avance de carga y planillas incompletas, cierre (el profesor ya no puede modificar), emisión (alumnos y familias ven las notas + aviso en Comunicados) e impresión de los boletines de todo un curso
- **Actas y citaciones:** citaciones a familias y actas de reunión (desarrollo, acuerdos, firmas, impresión); las familias se notifican y responden si asisten
- **Resumen general y Reportes (Dirección y Secretaría):** indicadores del día, alertas de lo pendiente, presentismo por curso; reportes de asistencia, rendimiento (alumnos en riesgo) y bajas/pases con descarga CSV para Excel
- **Bajas y pases:** baja o pase a otra escuela con historial y reincorporación; el alumno sale de su curso pero se conservan legajo, notas y asistencia
- **Calificaciones y boletines:** el profesor ve sus cursos y carga notas por trimestre en una planilla; alumnos, familias (con vínculo aprobado), Secretaría y Dirección ven el boletín imprimible
- **Secretaría Pedagógica (1.ª etapa):** legajos y documentación de alumnos, cursos y divisiones (nómina y docentes por curso), profesores con materias, cursos y horas semanales

## Pila tecnológica

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express |
| Base de datos | Supabase (PostgreSQL + Auth) |
| Frontend | HTML + CSS + JavaScript vanilla |

## Cómo ejecutar

```bash
# 1. Clonar el repositorio
git clone <url-del-repo>
cd instituto-universe

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env y completar SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_KEY

# 4. Ejecutar
npm run dev     # con recarga automática (node --watch)
# o
npm start
```

La aplicación queda disponible en `http://localhost:3000`.

## Estructura del proyecto

```
├── package.json
├── .env.example          # Plantilla de variables de entorno
├── .gitignore
│
├── backend/              # Servidor (Node.js + Express)
│   ├── server.js         # Punto de entrada: sirve frontend y expone /api
│   ├── routes/           # Endpoints de la API
│   │   ├── auth.js           # login, registro, perfil, contraseña
│   │   ├── academico.js      # plan de estudios
│   │   ├── alumnos.js        # gestión de alumnos
│   │   ├── asistencia.js     # control de asistencia
│   │   ├── codigos.js        # códigos de aprobación
│   │   ├── comunicados.js    # cartelera / avisos
│   │   ├── familia.js        # vínculos familiares (solicitud + aprobación)
│   │   ├── legajos.js        # legajos y documentación de alumnos
│   │   ├── cursos.js         # nómina y docentes por curso
│   │   ├── profesores.js     # asignaciones docentes (materia + curso + horas)
│   │   ├── calificaciones.js # mis cursos, planilla de notas y boletín
│   │   ├── reportes.js       # resumen general y reportes de Dirección
│   │   ├── horarios.js       # grilla horaria, mi horario, mis materias
│   │   ├── actas.js          # actas de reunión y citaciones
│   │   └── usuarios.js       # gestión de cuentas
│   ├── middleware/
│   │   └── requireAuth.js    # valida token y carga perfil
│   ├── utils/
│   │   └── consultas.js      # consultas paginadas a Supabase
│   ├── config/
│   │   ├── supabase.js       # clientes Supabase (público + admin)
│   │   ├── asistencia.js     # reglas del cómputo de inasistencias
│   │   └── horarios.js       # días, módulos y recreos
│   ├── db/                   # Esquemas SQL para Supabase
│   │   ├── schema.sql
│   │   ├── academico.sql
│   │   ├── asistencia.sql
│   │   ├── comunicados.sql
│   │   ├── cursos.sql
│   │   ├── familia.sql
│   │   ├── inscripciones.sql
│   │   ├── secretaria.sql       # legajos, documentos y asignaciones docentes
│   │   ├── correcciones-01.sql  # códigos de padres y vínculos con aprobación
│   │   ├── calificaciones.sql   # notas por alumno, materia y trimestre
│   │   ├── bajas.sql            # situación del alumno e historial de bajas y pases
│   │   ├── asistencia-computo.sql # llegadas tarde y avisos automáticos
│   │   ├── horarios.sql         # grilla horaria por curso
│   │   ├── cierre.sql           # cierre de notas y emisión de boletines
│   │   ├── actas.sql            # actas de reunión y citaciones
│   │   └── jornadas.sql         # jornada de cada curso por día
│   └── scripts/              # Utilidades de verificación
│
└── frontend/             # Interfaz (HTML + CSS + JS vanilla)
    ├── index.html
    ├── niveles.html
    ├── login.html
    ├── registro.html
    ├── recuperar.html
    ├── panel.html
    ├── perfil.html
    ├── usuarios.html
    ├── plan.html
    ├── codigos.html
    ├── comunicados.html
    ├── alumnos.html
    ├── asistencia.html
    ├── asistencia-alumno.html
    ├── hijos.html
    ├── vinculos.html
    ├── mis-cursos.html
    ├── notas.html
    ├── boletin.html
    ├── resumen.html
    ├── reportes.html
    ├── asistencia-mensual.html
    ├── horarios.html
    ├── mis-materias.html
    ├── cierre.html
    ├── boletines.html
    ├── actas.html
    ├── acta.html
    ├── citaciones.html
    ├── legajos.html
    ├── cursos.html
    ├── profesores.html
    ├── css/styles.css
    ├── js/app.js
    ├── js/exportar.js        # exportar listados a Excel (.xlsx) y PDF
    └── assets/               # logo.svg · logo-oscuro.svg · isotipo.svg
```

## Base de datos (Supabase)

1. Crear un proyecto en [Supabase](https://supabase.com).
2. Completar en `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY` (clave pública / anon)
   - `SUPABASE_SERVICE_KEY` (clave secreta / service_role — **solo backend**)
3. Ejecutar los esquemas: Supabase → **SQL Editor** → pegar cada archivo de
   `backend/db/` → **Run**, en este orden:
   `schema.sql` → `academico.sql` → `cursos.sql` → `familia.sql` → `inscripciones.sql` →
   `asistencia.sql` → `comunicados.sql` → `secretaria.sql` → `correcciones-01.sql` → `calificaciones.sql` → `bajas.sql` → `asistencia-computo.sql` → `horarios.sql` → `cierre.sql` → `actas.sql` → `jornadas.sql`.
   Todos son idempotentes: se pueden volver a correr sin duplicar datos.
4. Verificar la conexión: `node backend/scripts/test-conexion.js`.

**Importante:** nunca subas el archivo `.env` al repositorio. Ya está incluido en `.gitignore`.

## Licencia

UNLICENSED — uso interno del Instituto Universe.
