/**
 * @file trabajos.js
 * @description Módulo encargado de cargar, animar y gestionar la visualización modal
 * de la galería de fotos dinámica (trabajos) en la Landing Page pública.
 */

(function () {
  // Detección automática del Host del Backend para evitar hardcoding en producción
  const backendBase = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:8000'
    : window.location.origin;

  const galleryBase = `${backendBase}/api/gallery`;

  const galeria = document.getElementById("galeria");

  /**
   * Carga de forma asíncrona las fotos de trabajos realizados desde el Backend.
   * Renderiza las imágenes dinámicamente e inicializa las animaciones de Scroll y el visualizador Modal.
   * En caso de error, muestra un mensaje de fallback amigable al visitante.
   * 
   * @async
   */
  async function cargarTrabajos() {
    try {
      const res = await fetch(`${galleryBase}/`);
      if (!res.ok) throw new Error('Error cargando trabajos');
      const data = await res.json();

      // Renderizar imágenes en la grilla
      data.forEach((item) => {
        const img = document.createElement("img");
        img.src = item.image;
        img.alt = item.alt_text || 'Trabajo de peluquería';
        img.className = "imagen-trabajo";
        galeria.appendChild(img);
      });

      // Inicializar animaciones de scroll después de cargar las imágenes
      inicializarAnimaciones();

      // Inicializar modal interactivo
      inicializarModal();
    } catch (e) {
      console.error('Error cargando trabajos:', e);
      // Fallback visual en caso de desconexión con el servidor
      galeria.innerHTML = '<p style="text-align: center; padding: 20px;">No se pudieron cargar los trabajos. Por favor intentá más tarde.</p>';
    }
  }

  /**
   * Inicializa la librería GSAP (ScrollTrigger) para otorgarle a cada imagen
   * un efecto suave de revelado (fade-in & slide-up) al hacer scroll.
   */
  function inicializarAnimaciones() {
    if (typeof gsap === 'undefined' || !ScrollTrigger) return;
    
    gsap.registerPlugin(ScrollTrigger);

    gsap.utils.toArray(".imagen-trabajo").forEach((img, i) => {
      gsap.fromTo(
        img,
        { opacity: 0, y: 50 },
        {
          scrollTrigger: {
            trigger: img,
            start: "top 90%",
            toggleActions: "play none none reverse",
          },
          opacity: 1,
          y: 0,
          duration: 0.5,
          delay: i * 0.1,
        }
      );
    });
  }

  /**
   * Registra los eventos de click en las imágenes para permitir la ampliación (Lightbox).
   * Gestiona el cierre mediante el botón "x" o haciendo click fuera del modal.
   */
  function inicializarModal() {
    const modal = document.getElementById("modal");
    const modalImg = document.getElementById("imagen-ampliada");
    const cerrar = document.getElementById("cerrar");

    if (!modal || !modalImg || !cerrar) return;

    document.querySelectorAll(".imagen-trabajo").forEach((img) => {
      img.addEventListener("click", () => {
        modal.style.display = "block";
        modalImg.src = img.src;
        modalImg.alt = img.alt;
      });
    });

    cerrar.onclick = function () {
      modal.style.display = "none";
    };

    window.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.style.display = "none";
      }
    });
  }

  // Inicializar carga de fotos cuando el DOM esté listo
  document.addEventListener('DOMContentLoaded', cargarTrabajos);
})();
