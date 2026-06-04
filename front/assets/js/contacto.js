/**
 * @file contacto.js
 * @description Módulo de contacto para recibir consultas de la Landing Page.
 * Envía las peticiones a la API del backend, la cual notifica por correo electrónico.
 * Aplica técnicas de defensa en capas mediante sanitización de inputs.
 */

(function () {
  // Detección automática del Host del Backend para evitar hardcoding en producción
  const backendBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : window.location.origin;

  const apiBase = `${backendBase}/api/appointments`;

  const formElement = document.getElementById('form-contacto');
  const nombreInput = document.getElementById('c-nombre');
  const emailInput = document.getElementById('c-email');
  const mensajeInput = document.getElementById('c-mensaje');
  const estadoParagraph = document.getElementById('c-estado');

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

  // Enviar formulario de contacto
  formElement.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Resetear mensaje de estado
    estadoParagraph.textContent = '';
    estadoParagraph.style.color = '#333';

    // Obtener y sanitizar inputs
    const nombre = sanitizeHtml(nombreInput.value.trim());
    const email = sanitizeHtml(emailInput.value.trim());
    const mensaje = sanitizeHtml(mensajeInput.value.trim());

    if (!nombre || !email || !mensaje) {
      estadoParagraph.textContent = 'Por favor, completa todos los campos.';
      estadoParagraph.style.color = '#e74c3c'; // Rojo
      return;
    }

    try {
      estadoParagraph.textContent = 'Enviando mensaje...';
      estadoParagraph.style.color = '#3498db'; // Azul informativo

      const response = await fetch(`${apiBase}/contact/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: nombre,
          email: email,
          message: mensaje
        })
      });

      const data = await response.json();

      if (response.ok) {
        // Éxito
        estadoParagraph.textContent = data.detail || '¡Mensaje enviado con éxito! Nos comunicaremos pronto.';
        estadoParagraph.style.color = '#2ecc71'; // Verde éxito
        
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'success',
            title: '¡Mensaje Enviado!',
            text: 'Muchas gracias por escribirnos. Nos comunicaremos con vos a la brevedad.',
            confirmButtonColor: '#0c4d3adc',
            background: '#faf9f6',
            color: '#2f2325',
            customClass: {
              popup: 'swal2-landing-popup',
              confirmButton: 'swal2-confirm swal2-landing-button'
            }
          });
        }
        
        // Limpiar formulario
        formElement.reset();
      } else {
        // Errores de validación o del servidor
        let errMsg = 'No se pudo enviar el mensaje. ';
        if (data.detail) {
          errMsg += data.detail;
        } else {
          // Si hay errores de campos específicos (ej: email inválido)
          const errors = [];
          for (const key in data) {
            errors.push(`${key}: ${data[key].join(', ')}`);
          }
          errMsg += errors.join(' | ');
        }
        estadoParagraph.textContent = errMsg;
        estadoParagraph.style.color = '#e74c3c'; // Rojo
      }
    } catch (error) {
      estadoParagraph.textContent = 'Error de conexión con el servidor. Intentá más tarde.';
      estadoParagraph.style.color = '#e74c3c'; // Rojo
    }
  });
})();
