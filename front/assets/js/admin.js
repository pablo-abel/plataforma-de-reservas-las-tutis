/**
 * @file admin.js
 * @description Módulo de administración para el sistema "Las Tutis".
 * Gestiona de forma modular el panel administrativo (Turnos y Galería de fotos)
 * conectándose de manera segura con el Backend a través de tokens de autenticación.
 */

(function () {
  // Detección automática del Host del Backend para evitar hardcoding en producción
  const backendBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : window.location.origin;

  const apiBase = `${backendBase}/api/appointments`;
  const authBase = `${backendBase}/api/auth`;
  const galleryBase = `${backendBase}/api/gallery`;

  /** @type {Array<object>} Lista local en memoria de turnos cargados */
  let turnos = [];

  /** @type {number|null} ID del turno que se está editando, o null si es nuevo */
  let editandoId = null;

  /** @type {string|null} Token de seguridad activo de la sesión del administrador */
  let authToken = localStorage.getItem('adminToken');

  /**
   * Sanitiza código HTML para mitigar vulnerabilidades de XSS (Cross-Site Scripting).
   * Utiliza la librería DOMPurify si está disponible; de lo contrario, aplica un escape simple.
   * 
   * @param {string} dirty - Cadena de texto que podría contener etiquetas HTML maliciosas.
   * @returns {string} Cadena sanitizada y segura para inyectar en el DOM.
   */
  function sanitizeHtml(dirty) {
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      return DOMPurify.sanitize(dirty);
    }
    // Fallback: escape manual simple de caracteres HTML especiales
    const div = document.createElement('div');
    div.textContent = dirty;
    return div.innerHTML;
  }

  /**
   * Muestra una alerta visual elegante utilizando la librería SweetAlert2.
   * Si la librería no está cargada, hace un fallback al alert nativo del navegador.
   * 
   * @param {string} icon - Tipo de ícono ('success', 'error', 'warning', 'info').
   * @param {string} title - Título de la alerta.
   * @param {string} text - Contenido del mensaje.
   */
  function showSwalAlert(icon, title, text) {
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: icon,
        title: title,
        text: text,
        confirmButtonColor: '#076b4f',
        background: '#f8faf8',
        color: '#1b3b2b',
        customClass: {
          popup: 'swal2-custom-popup',
          confirmButton: 'swal2-confirm swal2-custom-button'
        }
      });
    } else {
      alert(text);
    }
  }

  /**
   * Muestra un modal informativo al hacer clic en "¿Has olvidado tu contraseña?".
   * Indica al usuario que debe ponerse en contacto con soporte técnico (el desarrollador).
   */
  function recuperarClave() {
    showSwalAlert(
      'info',
      'Recuperar contraseña',
      'Por motivos de seguridad, el restablecimiento de tu contraseña debe ser gestionado por tu desarrollador o soporte de confianza.'
    );
  }

  /**
   * Envoltura inteligente sobre la API fetch que añade de forma automática
   * el token de autenticación en las cabeceras (Authorization: Token ...)
   * e inyecta la cabecera Content-Type correspondiente si no es un envío binario (FormData).
   * 
   * @async
   * @param {string} url - URL del recurso a solicitar.
   * @param {object} [options={}] - Configuración de fetch (método, cuerpo, cabeceras).
   * @returns {Promise<Response>} Promesa con el objeto Response del servidor.
   */
  async function authFetch(url, options = {}) {
    const headers = {
      ...options.headers,
    };

    // Solo agregamos Content-Type JSON si hay cuerpo y no es un envío de archivos (FormData)
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    if (authToken) {
      headers['Authorization'] = `Token ${authToken}`;
    }
    return fetch(url, {
      ...options,
      headers,
    });
  }

  /**
   * Solicita al servidor el listado de turnos, aplicando opcionalmente
   * un filtro de estado (pendiente, confirmado, cancelado).
   * 
   * @async
   * @param {string} [statusFilter] - Parámetro de estado opcional para filtrar los turnos.
   */
  async function cargarTurnos(statusFilter) {
    try {
      const url = statusFilter ? `${apiBase}/admin/list/?status=${encodeURIComponent(statusFilter)}` : `${apiBase}/admin/list/`;
      const res = await authFetch(url);
      if (!res.ok) throw new Error('Error cargando turnos');
      const data = await res.json();
      
      // Mapear el formato plano de la base de datos a objetos entendibles por la UI
      turnos = data.map(a => ({
        id: a.id,
        nombre: a.name,
        email: a.email,
        fecha: a.starts_at ? new Date(a.starts_at) : null,
        comentario: a.comment || '',
        status: a.status
      }));
      renderTurnos();
    } catch (e) {
      showSwalAlert('error', 'Error', 'No se pudieron cargar los turnos');
    }
  }

  /**
   * Formatea un objeto Date de JS a una cadena ISO local (YYYY-MM-DD).
   * 
   * @param {Date|null} d - Objeto fecha a formatear.
   * @returns {string} Fecha formateada o cadena vacía si no existe la fecha.
   */
  function fmtFecha(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * Formatea un objeto Date de JS a una hora en formato amigable de 24 horas (HH:MM).
   * 
   * @param {Date|null} d - Objeto fecha de donde extraer la hora.
   * @returns {string} Hora formateada o cadena vacía.
   */
  function fmtHora(d) {
    if (!d) return '';
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  /**
   * Realiza el proceso de autenticación del administrador.
   * Obtiene las credenciales del formulario y solicita un token al backend.
   * Si es exitoso, almacena el token en localStorage y despliega el panel.
   * 
   * @async
   */
  async function login() {
    const usuario = document.getElementById('usuario').value;
    const clave = document.getElementById('clave').value;
    if (!usuario || !clave) {
      showSwalAlert('warning', 'Campos requeridos', 'Por favor completá usuario y contraseña');
      return;
    }

    try {
      const res = await fetch(`${authBase}/login/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: usuario, password: clave })
      });

      if (!res.ok) {
        const err = await res.json();
        showSwalAlert('error', 'Error', err.non_field_errors?.[0] || 'Error de login');
        return;
      }

      const data = await res.json();
      authToken = data.token;
      localStorage.setItem('adminToken', authToken);

      document.getElementById('login-wrapper').style.display = 'none';
      document.getElementById('panel').style.display = 'block';
      document.getElementById('menu-top').style.display = 'flex';
      cargarTurnos();
    } catch (e) {
      showSwalAlert('error', 'Error de conexión', 'No se pudo conectar con el servidor');
    }
  }

  /**
   * Cierra de forma física la sesión del administrador.
   * Elimina el token de almacenamiento local y refresca la vista al login.
   */
  function cerrarSesion() {
    localStorage.removeItem('adminToken');
    authToken = null;
    location.reload();
  }

  /**
   * Limpia y visualiza el formulario para agendar un turno nuevo en el sistema.
   * Realiza un scroll suave automático para facilitar la usabilidad.
   */
  function mostrarFormulario() {
    editandoId = null;
    document.getElementById('form-turno').style.display = 'block';
    document.getElementById('nombre').value = '';
    document.getElementById('email').value = '';
    document.getElementById('fecha').value = '';
    document.getElementById('hora').value = '';
    document.getElementById('comentario').value = '';

    // Auto-scroll al formulario
    document.getElementById('form-turno').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /**
   * Oculta el formulario de edición/creación de turnos.
   */
  function cerrarFormulario() {
    document.getElementById('form-turno').style.display = 'none';
  }

  /**
   * Envía los datos del formulario de turnos al servidor.
   * Crea un nuevo registro o actualiza uno existente de manera segura.
   * 
   * @async
   */
  async function guardarTurno() {
    const nombre = document.getElementById('nombre').value;
    const email = document.getElementById('email').value;
    const fecha = document.getElementById('fecha').value;
    const hora = document.getElementById('hora').value;
    const comentario = document.getElementById('comentario').value;

    if (!nombre || !email || !fecha || !hora) {
      showSwalAlert('warning', 'Campos requeridos', 'Por favor completá todos los campos.');
      return;
    }
    try {
      // Construir la fecha consciente starts_at en formato ISO
      const startsAtLocal = new Date(`${fecha}T${hora}:00`);
      const payload = {
        name: nombre,
        email: email,
        starts_at: startsAtLocal.toISOString(),
        comment: comentario
      };
      
      // Los administradores crean mediante el endpoint especial que ignora límites locales
      const endpoint = `${apiBase}/admin/create/`;
      const res = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const txt = await res.text();
        showSwalAlert('error', 'Error', 'Error creando turno: ' + txt);
        return;
      }
      cerrarFormulario();
      showSwalAlert('success', '¡Excelente!', 'Turno guardado exitosamente.');
      await cargarTurnos();
    } catch (e) {
      showSwalAlert('error', 'Error', 'Error de red al crear turno');
    }
  }

  /**
   * Dibuja de forma dinámica las celdas y filas de la tabla de turnos en el DOM.
   * Sanitiza toda la inyección de textos y traduce los estados del inglés al español.
   */
  function renderTurnos() {
    const tbody = document.getElementById("turnos-body");
    tbody.innerHTML = "";

    // Diccionario de traducción para mostrar los estados de forma súper visual e intuitiva
    const statusMap = {
      'pending': 'Pendiente',
      'approved': 'Confirmado',
      'cancelled': 'Cancelado'
    };

    turnos.forEach((turno) => {
      const fila = document.createElement("tr");
      const estadoTraducido = statusMap[turno.status] || turno.status;

      fila.innerHTML = `
      <td>${sanitizeHtml(turno.nombre)}</td>
      <td>${sanitizeHtml(turno.email)}</td>
      <td>${fmtFecha(turno.fecha)}</td>
      <td>${fmtHora(turno.fecha)}</td>
      <td class="col-comentario" title="${sanitizeHtml(turno.comentario)}">${sanitizeHtml(turno.comentario)}</td>
      <td>${sanitizeHtml(estadoTraducido)}</td>
      <td>
        <button onclick="window._editarTurno(${turno.id})" title="Editar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
          </svg>
        </button>
        <button onclick="window._aprobarTurno(${turno.id})" title="Aprobar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
        <button onclick="window._cancelarTurno(${turno.id})" title="Cancelar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <button onclick="window._eliminarTurno(${turno.id})" title="Eliminar">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </td>`;
      tbody.appendChild(fila);
    });
  }

  /**
   * Envía la solicitud DELETE para remover un turno específico de forma permanente.
   * 
   * @async
   * @param {number} id - ID del turno a eliminar.
   */
  async function eliminarTurno(id) {
    if (typeof Swal !== 'undefined') {
      const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: 'El turno será eliminado de forma permanente.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#aaa',
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        background: '#f8faf8',
        color: '#1b3b2b',
        customClass: {
          popup: 'swal2-custom-popup',
          confirmButton: 'swal2-confirm swal2-custom-button',
          cancelButton: 'swal2-cancel'
        }
      });
      if (!result.isConfirmed) return;
    } else {
      if (!confirm("¿Estás seguro de eliminar este turno?")) return;
    }

    try {
      const res = await authFetch(`${apiBase}/admin/${id}/delete/`, { method: 'DELETE' });
      if (res.status !== 204) {
        const txt = await res.text();
        showSwalAlert('error', 'Error', 'Error al eliminar: ' + txt);
        return;
      }
      showSwalAlert('success', '¡Eliminado!', 'El turno ha sido eliminado con éxito.');
      await cargarTurnos();
    } catch (e) {
      showSwalAlert('error', 'Error', 'Error de red eliminando turno');
    }
  }

  /**
   * Carga los valores de un turno en los inputs del formulario para su modificación.
   * 
   * @param {number} id - ID del turno que se desea editar.
   */
  function editarTurno(id) {
    const turno = turnos.find(t => t.id === id);
    if (!turno) return;
    editandoId = id;
    document.getElementById('nombre').value = turno.nombre;
    document.getElementById('email').value = turno.email;
    document.getElementById('fecha').value = fmtFecha(turno.fecha);
    document.getElementById('hora').value = fmtHora(turno.fecha);
    document.getElementById('comentario').value = turno.comentario;
    document.getElementById('form-turno').style.display = 'block';
  }

  /**
   * Modifica el estado (moderación) de un turno mediante una petición PATCH rápida.
   * 
   * @async
   * @param {number} id - ID del turno a actualizar.
   * @param {string} nuevo - Nuevo estado (approved, cancelled, pending).
   */
  async function setEstado(id, nuevo) {
    try {
      const res = await authFetch(`${apiBase}/admin/${id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nuevo })
      });
      if (!res.ok) {
        const txt = await res.text();
        showSwalAlert('error', 'Error', 'No se pudo actualizar: ' + txt);
        return;
      }
      showSwalAlert('success', '¡Actualizado!', 'El estado del turno fue actualizado con éxito.');
      await cargarTurnos();
    } catch (e) {
      showSwalAlert('error', 'Error', 'Error de red al actualizar');
    }
  }

  // Exponer handlers a window para uso en onclick de HTML generado
  window._aprobarTurno = (id) => setEstado(id, 'approved');
  window._cancelarTurno = (id) => setEstado(id, 'cancelled');
  window._eliminarTurno = (id) => eliminarTurno(id);
  window._editarTurno = (id) => editarTurno(id);

  // Exponer funciones existentes esperadas por la UI
  window.login = login;
  window.cerrarSesion = cerrarSesion;
  window.mostrarFormulario = mostrarFormulario;
  window.cerrarFormulario = cerrarFormulario;
  window.guardarTurno = guardarTurno;
  window.recuperarClave = recuperarClave;

  /**
   * Controla la navegación modular por pestañas o solapas en el panel.
   * Cierra de forma segura los formularios abiertos, alterna clases de CSS activo,
   * actualiza la persistencia de navegación en LocalStorage, y activa la visibilidad del botón de agregar.
   * 
   * @param {string} tabName - Nombre identificador de la pestaña a la que se cambia (turnos, galeria).
   */
  function switchTab(tabName) {
    // Cerramos el formulario de turnos si estaba abierto para no arrastrarlo a otras solapas
    cerrarFormulario();

    // Ocultar todos los contenidos de solapas
    document.querySelectorAll('.tab-content').forEach(tab => {
      tab.classList.remove('active');
    });

    // Desactivar todos los botones de navegación
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.remove('active');
    });

    // Mostrar el contenido de la solapa seleccionada
    const targetTab = document.getElementById('tab-' + tabName);
    if (targetTab) {
      targetTab.classList.add('active');
    }

    // Activar visualmente el botón correspondiente (de forma segura, sin usar event.target)
    document.querySelectorAll('.tab-btn').forEach(btn => {
      const onclickAttr = btn.getAttribute('onclick') || '';
      if (onclickAttr.includes(`'${tabName}'`)) {
        btn.classList.add('active');
      }
    });

    // Guardar el estado de la solapa activa en LocalStorage para resistir recargas de LiveServer
    localStorage.setItem('activeTab', tabName);

    // Mostrar/Ocultar el botón "Agregar Turno" según la solapa activa
    const btnAgregar = document.getElementById('btn-agregar-turno');
    if (btnAgregar) {
      if (tabName === 'turnos') {
        btnAgregar.style.display = 'inline-block';
      } else {
        btnAgregar.style.display = 'none';
      }
    }

    // Cargar los datos correspondientes según la solapa activa
    if (tabName === 'galeria') {
      loadPhotos();
    } else if (tabName === 'turnos') {
      cargarTurnos();
    }
  }

  /**
   * Solicita el listado completo de fotos de la galería al servidor.
   * 
   * @async
   */
  async function loadPhotos() {
    try {
      const res = await authFetch(`${galleryBase}/`);
      if (!res.ok) throw new Error('Error cargando fotos');
      const data = await res.json();
      renderPhotos(data);
    } catch (e) {
      showSwalAlert('error', 'Error', 'No se pudieron cargar las fotos');
    }
  }

  /**
   * Renderiza dinámicamente las fotos cargadas del portfolio en una grilla de HTML.
   * 
   * @param {Array<object>} photos - Listado de objetos de tipo HaircutImage de la base de datos.
   */
  function renderPhotos(photos) {
    const grid = document.getElementById('photos-grid');
    grid.innerHTML = '';

    photos.forEach(photo => {
      const photoItem = document.createElement('div');
      photoItem.className = 'photo-item';
      photoItem.innerHTML = `
        <img src="${photo.image}" alt="${sanitizeHtml(photo.alt_text || 'Sin descripción')}">
        <div class="photo-info">
          <p><strong>${sanitizeHtml(photo.alt_text || 'Sin descripción')}</strong></p>
          <p>${new Date(photo.created_at).toLocaleDateString()}</p>
          <button class="delete-btn" onclick="window._deletePhoto(${photo.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: text-bottom;">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            Borrar
          </button>
        </div>
      `;
      grid.appendChild(photoItem);
    });
  }

  /**
   * Sube una nueva foto de corte de pelo a la API en formato FormData.
   * Envía la referencia del archivo de imagen y la descripción de texto alternativo para SEO.
   * 
   * @async
   */
  async function uploadPhoto() {
    const fileInput = document.getElementById('photo-input');
    const altInput = document.getElementById('photo-alt');
    const file = fileInput.files[0];

    if (!file) {
      showSwalAlert('warning', 'Imagen requerida', 'Por favor seleccioná una imagen');
      return;
    }

    const formData = new FormData();
    formData.append('image', file);
    formData.append('alt_text', altInput.value.trim() || 'Trabajo de peluquería');

    try {
      const res = await authFetch(`${galleryBase}/upload/`, {
        method: 'POST',
        headers: {
          // No inyectamos cabecera de tipo Content-Type, el navegador asocia el boundary correcto de forma automática
        },
        body: formData
      });

      if (!res.ok) {
        const err = await res.json();
        showSwalAlert('error', 'Error', 'Error subiendo foto: ' + JSON.stringify(err));
        return;
      }

      // Limpiar inputs y recargar galería de fotos
      fileInput.value = '';
      altInput.value = '';
      await loadPhotos();
      showSwalAlert('success', '¡Excelente!', 'Foto subida exitosamente');
    } catch (e) {
      showSwalAlert('error', 'Error', 'Error de red al subir foto');
    }
  }

  /**
   * Envía la solicitud DELETE para borrar una foto tanto de la base de datos como físicamente del disco.
   * 
   * @async
   * @param {number} id - ID de la foto a eliminar de la galería.
   */
  async function deletePhoto(id) {
    if (typeof Swal !== 'undefined') {
      const result = await Swal.fire({
        title: '¿Estás seguro?',
        text: 'Esta foto se borrará permanentemente de la galería.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#aaa',
        confirmButtonText: 'Sí, borrar',
        cancelButtonText: 'Cancelar',
        background: '#f8faf8',
        color: '#1b3b2b',
        customClass: {
          popup: 'swal2-custom-popup',
          confirmButton: 'swal2-confirm swal2-custom-button',
          cancelButton: 'swal2-cancel'
        }
      });
      if (!result.isConfirmed) return;
    } else {
      if (!confirm('¿Estás seguro de eliminar esta foto?')) return;
    }

    try {
      const res = await authFetch(`${galleryBase}/${id}/delete/`, {
        method: 'DELETE'
      });

      if (res.status !== 204) {
        const txt = await res.text();
        showSwalAlert('error', 'Error', 'Error al eliminar: ' + txt);
        return;
      }

      await loadPhotos();
      showSwalAlert('success', '¡Borrada!', 'La foto ha sido eliminada de la galería.');
    } catch (e) {
      showSwalAlert('error', 'Error', 'Error de red al eliminar foto');
    }
  }

  // Inicialización al cargar la página: Si ya hay token, iniciar sesión de forma automática y restaurar pestaña
  document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
      document.getElementById('login-wrapper').style.display = 'none';
      document.getElementById('panel').style.display = 'block';
      document.getElementById('menu-top').style.display = 'flex';

      // Restauramos la última solapa que usó la clienta (por defecto 'turnos')
      const activeTab = localStorage.getItem('activeTab') || 'turnos';
      switchTab(activeTab);
    }
  });

  // Exponer funciones de solapa y galería
  window.switchTab = switchTab;
  window.uploadPhoto = uploadPhoto;
  window._deletePhoto = deletePhoto;
})();
