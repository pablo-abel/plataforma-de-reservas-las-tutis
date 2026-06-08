/**
 * @file turnos.js
 * @description Módulo para agendar turnos de manera dinámica en la Landing Page.
 * Controla la consulta interactiva de horarios disponibles por fecha, aplica la regla
 * de 12 horas de anticipación mínima y realiza la reserva con notificaciones de estado.
 */

(function () {
  // Detección automática del Host del Backend para evitar hardcoding en producción
  const backendBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : window.location.origin;

  const apiBase = `${backendBase}/api/appointments`;

  const formElement = document.getElementById('form-turno');
  const nombreInput = document.getElementById('t-nombre');
  const emailInput = document.getElementById('t-email');
  const fechaInput = document.getElementById('t-fecha');
  const horarioSelect = document.getElementById('t-horario');
  const comentarioInput = document.getElementById('t-comentario');
  const estadoParagraph = document.getElementById('t-estado');

  if (!formElement) return;

  /**
   * Sanitiza código HTML para mitigar vulnerabilidades de XSS (Cross-Site Scripting).
   * Utiliza DOMPurify si está disponible o aplica un escape simple.
   * 
   * @param {string} dirty - Cadena de texto a sanitizar.
   * @returns {string} Cadena sanitizada segura.
   */
  function sanitizeHtml(dirty) {
    if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
      return DOMPurify.sanitize(dirty);
    }
    // Fallback: escape manual de caracteres HTML especiales
    const div = document.createElement('div');
    div.textContent = dirty;
    return div.innerHTML;
  }

  /**
   * Renderiza un mensaje de estado en pantalla con estilos de éxito o error.
   * 
   * @param {string} msg - Mensaje de texto a mostrar en pantalla.
   * @param {boolean} [ok=false] - Indica si es un mensaje de éxito (verde) o error (rojo).
   */
  function setEstado(msg, ok = false) {
    estadoParagraph.textContent = msg;
    estadoParagraph.style.color = ok ? '#2e7d32' : '#b71c1c';
  }

  /**
   * Consulta al servidor los horarios (slots) disponibles para la fecha seleccionada.
   * Renderiza dinámicamente las opciones en el select o muestra un mensaje explicativo.
   * 
   * @async
   */
  async function cargarHorarios() {
    horarioSelect.innerHTML = '<option value="">Cargando horarios...</option>';
    const date = fechaInput.value;
    if (!date) {
      horarioSelect.innerHTML = '<option value="">Seleccioná un horario</option>';
      setEstado('');
      return;
    }

    // Validación local de domingos (0) y lunes (1)
    const dateParts = date.split('-');
    const pickedDate = new Date(dateParts[0], dateParts[1] - 1, dateParts[2]);
    const dayOfWeek = pickedDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 1) {
      horarioSelect.innerHTML = '<option value="">Cerrado</option>';
      setEstado('Los domingos y lunes la peluquería permanece cerrada. Por favor elegí otro día de martes a sábado.', false);
      return;
    }
    try {
      const res = await fetch(`${apiBase}/available-slots/?date=${date}`);
      if (!res.ok) {
        setEstado('No se pudieron cargar los horarios');
        horarioSelect.innerHTML = '<option value="">Seleccioná un horario</option>';
        return;
      }
      const data = await res.json();
      const slots = data.slots || [];
      if (slots.length === 0) {
        horarioSelect.innerHTML = '<option value="">No hay horarios disponibles</option>';
        setEstado('No hay turnos disponibles para ese día.', false);
        return;
      }
      setEstado('');
      horarioSelect.innerHTML = '<option value="">Seleccioná un horario</option>' +
        slots.map(iso => {
          // Mostrar en hora local amigable
          const d = new Date(iso);
          const label = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `<option value="${iso}">${label}</option>`;
        }).join('');
    } catch (e) {
      setEstado('Error de red al cargar horarios');
      horarioSelect.innerHTML = '<option value="">Seleccioná un horario</option>';
    }
  }

  fechaInput.addEventListener('change', cargarHorarios);

  /**
   * Convierte un objeto de tipo Date a formato de fecha YYYY-MM-DD.
   * 
   * @param {Date} d - Objeto fecha.
   * @returns {string} Fecha formateada.
   */
  function toYYYYMMDD(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  // Setear la fecha mínima para agendar (al menos 12 horas en el futuro)
  (function initMinDate() {
    const now = new Date();
    const plus12h = new Date(now.getTime() + 12 * 60 * 60 * 1000);
    fechaInput.min = toYYYYMMDD(plus12h);
  })();

  // Sugerir automáticamente la primera fecha con turnos libres en las próximas 2 semanas
  (async function suggestFirstAvailable() {
    try {
      const now = new Date();
      for (let i = 0; i < 14; i++) {
        const d = new Date(now.getTime() + i * 24 * 60 * 60 * 1000);
        const ds = toYYYYMMDD(d);
        // Respetar min
        if (fechaInput.min && ds < fechaInput.min) continue;
        const res = await fetch(`${apiBase}/available-slots/?date=${ds}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (Array.isArray(data.slots) && data.slots.length > 0) {
          fechaInput.value = ds;
          await cargarHorarios();
          break;
        }
      }
    } catch (e) {
      // Manejo silencioso en carga inicial sugerida
    }
  })();

  // Enviar formulario de agendamiento
  formElement.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    setEstado('Enviando...');

    const payload = {
      name: nombreInput.value.trim(),
      email: emailInput.value.trim(),
      starts_at: horarioSelect.value, // ISO String del slot elegido
      comment: comentarioInput.value.trim()
    };

    if (!payload.starts_at) {
      setEstado('Elegí un horario disponible');
      return;
    }

    try {
      const res = await fetch(`${apiBase}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok) {
        setEstado('¡Pedido enviado! Te vamos a escribir por email cuando se confirme.', true);
        
        formElement.reset();
        horarioSelect.innerHTML = '<option value="">Seleccioná un horario</option>';
      } else {
        const msg = data.detail || 'No se pudo crear el turno';
        setEstado(msg);
      }
    } catch (e) {
      setEstado('Error de red al enviar');
    }
  });
  // Cargar configuraciones públicas (teléfono, email dinámicos, etc.) desde el backend
  (async function cargarConfiguraciones() {
    try {
      const res = await fetch(`${backendBase}/api/appointments/settings/`);
      if (res.ok) {
        const data = await res.json();
        const phone = data.owner_phone;
        if (phone) {
          // Actualizar botón de WhatsApp
          const waBtn = document.getElementById('whatsapp-btn');
          if (waBtn) {
            const cleanPhone = phone.replace(/\D/g, '');
            waBtn.href = `https://wa.me/${cleanPhone}?text=Hola%2C%20quisiera%20pedir%20un%20turno%20para%20mi%20mascota`;
          }
          // Actualizar teléfono en el footer
          const footerTel = document.getElementById('footer-telefono');
          if (footerTel) {
            footerTel.textContent = phone;
          }
        }
        const email = data.owner_email;
        if (email) {
          // Actualizar email en el footer
          const footerEmail = document.getElementById('footer-email');
          if (footerEmail) {
            footerEmail.textContent = email;
          }
        }
      }
    } catch (e) {
      console.warn('No se pudieron cargar las configuraciones dinámicas:', e);
    }
  })();
})();

