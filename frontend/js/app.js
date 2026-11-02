/**
 * Instituto Universe — utilidades compartidas del frontend
 */
const App = {
  NIVELES: {
    primario:   { nombre: 'Nivel Primario',   activo: false },
    secundario: { nombre: 'Nivel Secundario', activo: true },
    terciario:  { nombre: 'Nivel Terciario',  activo: false },
  },

  ROLES: {
    alumno:     { nombre: 'Alumno/a',              codigo: 'secretaria', registroLibre: true },
    padre:      { nombre: 'Padre / Madre / Tutor', codigo: 'secretaria', registroLibre: true },
    profesor:   { nombre: 'Profesor/a',            codigo: 'secretaria', registroLibre: true },
    preceptor:  { nombre: 'Preceptor/a',           codigo: 'secretaria', registroLibre: true },
    secretaria: { nombre: 'Secretaría',            codigo: 'direccion',  registroLibre: true },
    director:   { nombre: 'Director/a',            codigo: null,         registroLibre: false },
  },

  // Quién emite cada código de aprobación
  EMISOR_CODIGO: { secretaria: 'Secretaría', direccion: 'Dirección' },

  // Audiencias de los comunicados
  AUDIENCIAS: {
    todos:    'Toda la comunidad',
    alumnos:  'Alumnos',
    familias: 'Familias',
    docentes: 'Docentes',
  },

  // Secciones que ve todo usuario, sin importar su rol.
  MENU_COMUN: [
    { icono: 'user', titulo: 'Mi perfil', desc: 'Tus datos y tu contraseña.', link: '/perfil.html' },
  ],

  // Secciones del panel interno según el rol (íconos de línea por nombre).
  MENU_POR_ROL: {
    alumno: [
      { icono: 'book',      titulo: 'Mis materias',     desc: 'Las materias que estás cursando este año.', link: '/boletin.html' },
      { icono: 'file',      titulo: 'Calificaciones',   desc: 'Tus notas por materia y período.', link: '/boletin.html' },
      { icono: 'clipboard', titulo: 'Asistencia',       desc: 'Tus inasistencias y justificativos.', link: '/asistencia-alumno.html' },
      { icono: 'megaphone', titulo: 'Comunicados',      desc: 'Avisos del instituto y de tus profesores.', link: '/comunicados.html' },
      { icono: 'calendar',  titulo: 'Horarios',         desc: 'Tu horario semanal de clases.' },
    ],
    padre: [
      { icono: 'users',     titulo: 'Mis hijos/as',     desc: 'Solicitá el vínculo con tus hijos y seguí su curso.', link: '/hijos.html' },
      { icono: 'file',      titulo: 'Calificaciones',   desc: 'Los boletines de tus hijos/as.', link: '/hijos.html' },
      { icono: 'clipboard', titulo: 'Asistencia',       desc: 'Inasistencias y avisos de tus hijos/as.', link: '/hijos.html' },
      { icono: 'megaphone', titulo: 'Comunicados',      desc: 'Avisos del instituto.', link: '/comunicados.html' },
    ],
    profesor: [
      { icono: 'briefcase', titulo: 'Mis cursos',       desc: 'Los cursos y materias que dictás.', link: '/mis-cursos.html' },
      { icono: 'edit',      titulo: 'Cargar notas',     desc: 'Registrá las calificaciones de tus alumnos.', link: '/mis-cursos.html' },
      { icono: 'megaphone', titulo: 'Publicar comunicado', desc: 'Enviá avisos a tus cursos.', link: '/comunicados.html' },
    ],
    preceptor: [
      { icono: 'clipboard', titulo: 'Asistencia',       desc: 'Tomá lista, justificá faltas y avisá a las familias.', link: '/asistencia.html' },
      { icono: 'megaphone', titulo: 'Comunicados',      desc: 'Avisos a los cursos a tu cargo.', link: '/comunicados.html' },
    ],
    secretaria: [
      { icono: 'cap',       titulo: 'Alumnos',          desc: 'Altas, inscripción a cursos, bajas y pases.', link: '/alumnos.html' },
      { icono: 'folder',    titulo: 'Legajos',          desc: 'Datos de cada alumno y documentación pendiente.', link: '/legajos.html' },
      { icono: 'building',  titulo: 'Cursos y divisiones', desc: 'Nómina de alumnos y docentes de cada curso.', link: '/cursos.html' },
      { icono: 'briefcase', titulo: 'Profesores',       desc: 'Docentes, materias, cursos y horas.', link: '/profesores.html' },
      { icono: 'family',    titulo: 'Vínculos familiares', desc: 'Aprobá las solicitudes de padres y tutores.', link: '/vinculos.html' },
      { icono: 'clipboard', titulo: 'Asistencia',       desc: 'Ver la asistencia de los alumnos y avisar a familias.', link: '/asistencia.html' },
      { icono: 'users',     titulo: 'Usuarios',         desc: 'Cuentas registradas y sus roles.', link: '/usuarios.html' },
      { icono: 'book',      titulo: 'Plan de estudios', desc: 'Materias por año y divisiones.', link: '/plan.html' },
      { icono: 'key',       titulo: 'Generar códigos',  desc: 'Códigos de aprobación para Profesores y Preceptores.', link: '/codigos.html' },
      { icono: 'chart',     titulo: 'Reportes',         desc: 'Asistencia, rendimiento, bajas y pases.', link: '/reportes.html' },
      { icono: 'megaphone', titulo: 'Comunicados',      desc: 'Avisos institucionales.', link: '/comunicados.html' },
    ],
    director: [
      { icono: 'chart',     titulo: 'Resumen general',  desc: 'Visión global del nivel secundario.', link: '/resumen.html' },
      { icono: 'cap',       titulo: 'Alumnos',          desc: 'Altas, inscripción a cursos, bajas y pases.', link: '/alumnos.html' },
      { icono: 'folder',    titulo: 'Legajos',          desc: 'Datos de cada alumno y documentación pendiente.', link: '/legajos.html' },
      { icono: 'building',  titulo: 'Cursos y divisiones', desc: 'Nómina de alumnos y docentes de cada curso.', link: '/cursos.html' },
      { icono: 'briefcase', titulo: 'Profesores',       desc: 'Docentes, materias, cursos y horas.', link: '/profesores.html' },
      { icono: 'family',    titulo: 'Vínculos familiares', desc: 'Aprobá las solicitudes de padres y tutores.', link: '/vinculos.html' },
      { icono: 'clipboard', titulo: 'Asistencia',       desc: 'Ver la asistencia de los alumnos.', link: '/asistencia.html' },
      { icono: 'users',     titulo: 'Usuarios',         desc: 'Cuentas registradas y sus roles.', link: '/usuarios.html' },
      { icono: 'book',      titulo: 'Plan de estudios', desc: 'Materias por año del secundario.', link: '/plan.html' },
      { icono: 'key',       titulo: 'Códigos de Secretaría', desc: 'Generá códigos de aprobación para Secretaría.', link: '/codigos.html' },
      { icono: 'file',      titulo: 'Reportes',         desc: 'Asistencia, rendimiento, bajas y pases.', link: '/reportes.html' },
      { icono: 'megaphone', titulo: 'Comunicados',      desc: 'Avisos a toda la comunidad.', link: '/comunicados.html' },
    ],
  },

  // ---------- Íconos de línea (SVG monocromáticos, color = currentColor) ----------
  ICONOS: {
    home:      '<path d="M3 9.5 12 3l9 6.5"/><path d="M5 10v10a1 1 0 0 0 1 1h3v-6h6v6h3a1 1 0 0 0 1-1V10"/>',
    user:      '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    users:     '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    book:      '<path d="M12 7v14"/><path d="M4 5a1 1 0 0 1 1-1h4a3 3 0 0 1 3 3 3 3 0 0 1 3-3h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-5a3 3 0 0 0-3 3 3 3 0 0 0-3-3H5a1 1 0 0 1-1-1z"/>',
    key:       '<circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.5 12.5 20 3"/><path d="m16 7 3 3"/><path d="m19 4 2 2"/>',
    megaphone: '<path d="m3 11 14-4v10L3 13z"/><path d="M7 13v3a2 2 0 0 0 4 0"/><path d="M18 8a4 4 0 0 1 0 8"/>',
    file:      '<path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M15 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M8 13h8"/><path d="M8 17h6"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    calendar:  '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/><path d="M8 2v4"/><path d="M16 2v4"/>',
    chart:     '<path d="M3 3v18h18"/><path d="M7 15v-4"/><path d="M12 15V8"/><path d="M17 15v-2"/>',
    briefcase: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/><path d="M2 13h20"/>',
    edit:      '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    cap:       '<path d="M22 10 12 5 2 10l10 5z"/><path d="M6 12v5c0 1 2.5 3 6 3s6-2 6-3v-5"/><path d="M22 10v5"/>',
    folder:    '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    family:    '<circle cx="8" cy="6" r="3"/><circle cx="17" cy="8" r="2.5"/><path d="M2 21v-3a5 5 0 0 1 10 0v3"/><path d="M13 21v-2.5a4 4 0 0 1 8 0V21"/>',
    building:  '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/>',
    wrench:    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    moon:      '<path d="M12 3a6.4 6.4 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    sun:       '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.9 4.9 1.4 1.4"/><path d="m17.7 17.7 1.4 1.4"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.3 17.7-1.4 1.4"/><path d="m19.1 4.9-1.4 1.4"/>',
    logout:    '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    eye:       '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    'eye-off': '<path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13.5 13.5 0 0 1-2.2 3.2"/><path d="M6.6 6.6A13.6 13.6 0 0 0 2 12s3.5 7 10 7a9 9 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="m2 2 20 20"/>',
    chevron:   '<path d="m6 9 6 6 6-6"/>',
    search:    '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    copy:      '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    trash:     '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/>',
    plus:      '<path d="M5 12h14"/><path d="M12 5v14"/>',
    x:         '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  },

  // ---------- Selección de nivel y rol ----------
  guardarNivel(nivel) { sessionStorage.setItem('nivelSeleccionado', nivel); },
  obtenerNivel()      { return sessionStorage.getItem('nivelSeleccionado'); },

  guardarRol(rol) { sessionStorage.setItem('rolSeleccionado', rol); },
  obtenerRol()    { return sessionStorage.getItem('rolSeleccionado'); },

  /**
   * Protege las pantallas de autenticación: si no hay un nivel activo
   * y un rol válido seleccionados, devuelve al usuario al selector.
   * Devuelve { nivel, rol } o null (tras redirigir).
   */
  exigirSeleccion() {
    const nivel = this.obtenerNivel();
    const rol = this.obtenerRol();
    const nivelOk = nivel && this.NIVELES[nivel] && this.NIVELES[nivel].activo;
    const rolOk = rol && this.ROLES[rol];
    if (!nivelOk || !rolOk) {
      window.location.replace('/niveles.html');
      return null;
    }
    return { nivel, rol };
  },

  // ---------- Sesión (post-login) ----------
  guardarSesion(token, usuario, refreshToken) {
    localStorage.setItem('iu_token', token || '');
    localStorage.setItem('iu_usuario', JSON.stringify(usuario || {}));
    if (refreshToken) localStorage.setItem('iu_refresh', refreshToken);
  },

  obtenerToken() { return localStorage.getItem('iu_token'); },

  cerrarSesion() {
    localStorage.removeItem('iu_token');
    localStorage.removeItem('iu_usuario');
    localStorage.removeItem('iu_refresh');
  },

  /**
   * Pide un token nuevo con el refresh token guardado.
   * Si varias llamadas fallan a la vez, comparten una sola renovación
   * (el refresh token de Supabase sirve una sola vez).
   * Devuelve el token nuevo o null si la sesión ya no se puede renovar.
   */
  renovarSesion() {
    if (this._renovando) return this._renovando;
    const refreshToken = localStorage.getItem('iu_refresh');
    if (!refreshToken) return Promise.resolve(null);

    this._renovando = (async () => {
      try {
        const r = await App._fetchOriginal('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.ok || !data.token) return null;
        localStorage.setItem('iu_token', data.token);
        localStorage.setItem('iu_refresh', data.refreshToken);
        return data.token;
      } catch (e) {
        return null;
      } finally {
        setTimeout(() => { App._renovando = null; }, 0);
      }
    })();
    return this._renovando;
  },

  /**
   * Protege las páginas internas: valida el token contra el backend.
   * Devuelve el usuario o null (tras redirigir al login).
   */
  async exigirSesion() {
    const token = this.obtenerToken();
    if (!token) { window.location.replace('/login.html'); return null; }
    try {
      const r = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data.ok) {
        this.cerrarSesion();
        window.location.replace('/login.html');
        return null;
      }
      return data.usuario;
    } catch (e) {
      window.location.replace('/login.html');
      return null;
    }
  },

  // ---------- Notificación flotante ----------
  toast(mensaje, duracionMs = 2800) {
    let el = document.querySelector('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      el.setAttribute('role', 'status');
      document.body.appendChild(el);
    }
    el.textContent = mensaje;
    el.classList.add('visible');
    clearTimeout(el._timer);
    el._timer = setTimeout(() => el.classList.remove('visible'), duracionMs);
  },

  // ---------- Mensajes dentro de formularios ----------
  mostrarMensaje(contenedor, texto, tipo) {
    contenedor.textContent = texto;
    contenedor.className = `mensaje-form visible ${tipo}`;
  },

  ocultarMensaje(contenedor) {
    contenedor.className = 'mensaje-form';
  },

  // ---------- Llamadas a la API ----------
  async post(ruta, datos) {
    const respuesta = await fetch(ruta, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) {
      throw new Error(cuerpo.error || 'Ocurrió un error inesperado.');
    }
    return cuerpo;
  },

  // ---------- Íconos ----------
  /** Devuelve el markup SVG de un ícono de línea por su nombre. */
  icono(nombre, clase = '') {
    const inner = this.ICONOS[nombre] || '';
    return `<svg class="ico ${clase}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
  },

  /** Reemplaza los <span data-ico="nombre"></span> del HTML por su ícono. */
  montarIconos(contenedor = document) {
    contenedor.querySelectorAll('[data-ico]').forEach((el) => {
      el.innerHTML = this.icono(el.dataset.ico);
    });
  },

  // ---------- Tema (claro / oscuro) ----------
  temaActual() {
    return document.documentElement.dataset.tema === 'oscuro' ? 'oscuro' : 'claro';
  },

  aplicarTema(tema) {
    document.documentElement.dataset.tema = tema;
    localStorage.setItem('iu_tema', tema);
    const oscuro = tema === 'oscuro';
    document.querySelectorAll('[data-icono-tema]').forEach((el) => { el.innerHTML = this.icono(oscuro ? 'sun' : 'moon'); });
    document.querySelectorAll('[data-texto-tema]').forEach((el) => { el.textContent = oscuro ? 'Modo claro' : 'Modo oscuro'; });
    // El logotipo tiene una versión clara para fondo oscuro.
    document.querySelectorAll('.marca img, .hero-logo').forEach((img) => {
      img.src = oscuro ? '/assets/logo-oscuro.svg' : '/assets/logo.svg';
    });
  },

  alternarTema() {
    this.aplicarTema(this.temaActual() === 'oscuro' ? 'claro' : 'oscuro');
  },

  /** Botón de tema para las pantallas públicas (sin menú de usuario). */
  montarBotonTema() {
    if (document.getElementById('zona-usuario')) return; // las internas lo tienen en el menú

    const boton = document.createElement('button');
    boton.className = 'btn-tema';
    boton.type = 'button';
    boton.title = 'Cambiar tema';
    boton.setAttribute('aria-label', 'Cambiar tema');
    boton.innerHTML = '<span data-icono-tema></span>';
    boton.addEventListener('click', () => this.alternarTema());

    const barra = document.querySelector('.barra-superior');
    if (barra) {
      const ultimo = barra.lastElementChild;
      const grupo = document.createElement('div');
      grupo.className = 'acciones-barra';
      barra.appendChild(grupo);
      if (ultimo && ultimo !== grupo) grupo.appendChild(ultimo);
      grupo.appendChild(boton);
    } else {
      boton.classList.add('btn-tema-flotante');
      document.body.appendChild(boton);
    }
    this.aplicarTema(this.temaActual());
  },

  // ---------- Menú de usuario (pantallas internas) ----------
  montarBarraUsuario(usuario) {
    const zona = document.getElementById('zona-usuario');
    if (!zona) return;

    const rolNombre = (this.ROLES[usuario.rol] || {}).nombre || usuario.rol;
    const iniciales = ((usuario.nombre || '')[0] || '') + ((usuario.apellido || '')[0] || '');
    const actual = window.location.pathname;
    const secciones = (this.MENU_POR_ROL[usuario.rol] || []).concat(this.MENU_COMUN).filter((s) => s.link);

    const enlaces = [{ icono: 'home', titulo: 'Panel', link: '/panel.html' }].concat(secciones)
      .map((s) => `<a href="${s.link}" class="item-menu ${actual === s.link ? 'activo' : ''}">
                     ${this.icono(s.icono)}${s.titulo}</a>`).join('');

    zona.innerHTML = `
      <div class="menu-usuario">
        <button class="boton-usuario" id="btn-menu" aria-haspopup="true" aria-expanded="false">
          <span class="avatar">${iniciales.toUpperCase()}</span>
          <span class="boton-usuario-nombre">${usuario.nombre || ''}</span>
          <span class="chevron">${this.icono('chevron')}</span>
        </button>
        <div class="desplegable" id="desplegable" hidden>
          <div class="desplegable-cabecera">
            <span class="avatar grande">${iniciales.toUpperCase()}</span>
            <div>
              <span class="desplegable-nombre">${usuario.nombre || ''} ${usuario.apellido || ''}</span>
              <span class="desplegable-rol">${rolNombre}</span>
            </div>
          </div>
          ${enlaces}
          <div class="desplegable-separador"></div>
          <button class="item-menu" id="toggle-tema" type="button">
            <span data-icono-tema></span><span data-texto-tema>Modo oscuro</span>
            <span class="switch"></span>
          </button>
          <div class="desplegable-separador"></div>
          <button class="item-menu peligro" id="btn-salir" type="button">
            ${this.icono('logout')}Cerrar sesión
          </button>
        </div>
      </div>`;

    const contenedor = zona.querySelector('.menu-usuario');
    const boton = zona.querySelector('#btn-menu');
    const menu = zona.querySelector('#desplegable');

    const abrir = (mostrar) => {
      menu.hidden = !mostrar;
      contenedor.classList.toggle('abierto', mostrar);
      boton.setAttribute('aria-expanded', String(mostrar));
    };

    boton.addEventListener('click', (e) => { e.stopPropagation(); abrir(menu.hidden); });
    document.addEventListener('click', (e) => { if (!contenedor.contains(e.target)) abrir(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') abrir(false); });

    zona.querySelector('#toggle-tema').addEventListener('click', (e) => {
      e.stopPropagation();
      this.alternarTema();
    });
    zona.querySelector('#btn-salir').addEventListener('click', () => {
      this.cerrarSesion();
      window.location.href = '/';
    });

    this.aplicarTema(this.temaActual());
  },

  // ---------- Mostrar/ocultar contraseña (ojito) ----------
  montarOjos(contenedor = document) {
    contenedor.querySelectorAll('input[type="password"]').forEach((input) => {
      if (input.dataset.ojo) return;
      input.dataset.ojo = '1';

      const wrap = document.createElement('div');
      wrap.className = 'input-ojo';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);

      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'btn-ojo';
      boton.setAttribute('aria-label', 'Mostrar u ocultar la contraseña');
      boton.innerHTML = this.icono('eye');
      boton.addEventListener('click', () => {
        const oculto = input.type === 'password';
        input.type = oculto ? 'text' : 'password';
        boton.innerHTML = this.icono(oculto ? 'eye-off' : 'eye');
      });
      wrap.appendChild(boton);
    });
  },

  // ---------- Burbujas decorativas ----------
  crearBurbujas(cantidad = 16) {
    const capa = document.createElement('div');
    capa.className = 'estrellas';
    capa.setAttribute('aria-hidden', 'true');

    for (let i = 0; i < cantidad; i++) {
      const burbuja = document.createElement('span');
      burbuja.className = 'estrella';
      const tam = Math.random() * 90 + 30;
      burbuja.style.width = `${tam}px`;
      burbuja.style.height = `${tam}px`;
      burbuja.style.left = `${Math.random() * 100}%`;
      burbuja.style.top = `${Math.random() * 100}%`;
      burbuja.style.setProperty('--dur', `${Math.random() * 6 + 7}s`);
      burbuja.style.setProperty('--delay', `${Math.random() * 6}s`);
      burbuja.style.setProperty('--op-min', (Math.random() * 0.1 + 0.08).toFixed(2));
      burbuja.style.setProperty('--op-max', (Math.random() * 0.25 + 0.3).toFixed(2));
      capa.appendChild(burbuja);
    }
    document.body.prepend(capa);
  },
};

/**
 * Renovación automática de la sesión.
 * Envuelve fetch: si una llamada a /api/ responde 401 (token vencido),
 * renueva la sesión una vez y repite la llamada con el token nuevo.
 * Así ninguna pantalla necesita ocuparse del vencimiento.
 */
App._fetchOriginal = window.fetch.bind(window);
window.fetch = async (recurso, opciones = {}) => {
  const respuesta = await App._fetchOriginal(recurso, opciones);
  const url = typeof recurso === 'string' ? recurso : recurso.url;
  const esApi = url.startsWith('/api/') || url.startsWith(location.origin + '/api/');
  const esAuthPublica = /\/api\/auth\/(login|refresh|register|recuperar|restablecer-password)/.test(url);
  if (respuesta.status !== 401 || !esApi || esAuthPublica) return respuesta;

  const token = await App.renovarSesion();
  if (!token) return respuesta;

  const headers = new Headers(opciones.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  return App._fetchOriginal(recurso, { ...opciones, headers });
};

document.addEventListener('DOMContentLoaded', () => {
  App.aplicarTema(localStorage.getItem('iu_tema') || 'claro');
  App.crearBurbujas();
  App.montarBotonTema();
  App.montarIconos();
  App.montarOjos();
});
