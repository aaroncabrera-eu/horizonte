// app.js: la web de Horizonte. Lee datos.json (preparado por exportar.py) y
// lo enseña sobre un mapa de Tenerife a pantalla completa. No calcula nada.
//
// Dos vistas en el panel:
//  - Lista: eliges el día y ves lo mejor que se puede observar en cada mirador.
//  - Mirador: eliges qué quieres ver (luna, atardecer...) y sale el plan.
// La dirección (#san_roque/2026-10-25/luna) guarda lo elegido: se puede
// compartir o guardar un enlace a un mirador concreto.

// --- Iconos (trazos sencillos, como en el diseño) ---------------------------
const ICONOS = {
  'Atardecer': '<path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 13v-6"/><path d="M9 10l3 3 3-3"/>',
  'Amanecer': '<path d="M3 18h18"/><path d="M7 18a5 5 0 0 1 10 0"/><path d="M12 3v7"/><path d="M9 6l3-3 3 3"/>',
  'Salida de luna': '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  'Estrellas': '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6l-5.4 2.9 1.2-6-4.5-4.2 6.1-.7z"/>',
  reloj: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  chispa: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>',
  paleta: '<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1 .2-2.2 1.3-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  nube: '<path d="M7 18h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/>',
  movil: '<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>',
  volver: '<path d="M19 12H5"/><path d="M11 6l-6 6 6 6"/>',
  abajo: '<path d="M6 9l6 6 6-6"/>',
  mapa: '<path d="M9 4L3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5"/><path d="M15 6.5V20"/>',
  ruta: '<path d="M12 21s-6-5.6-6-10.5A6 6 0 0 1 18 10.5C18 15.4 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.2"/>',
  calendario: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  meteoro: '<path d="M3.5 3.5l9 9"/><path d="M8.5 3.5l5 5"/><path d="M3.5 8.5l5 5"/><circle cx="16" cy="16" r="3.5"/>',
  galaxia: '<ellipse cx="12" cy="12" rx="10" ry="3.6" transform="rotate(-28 12 12)"/><circle cx="12" cy="12" r="1.9"/><path d="M5 6h.01M19 18h.01M18.5 5.5h.01M5.5 18.5h.01"/>',
  campana: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  compartir: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="M8.2 10.8l7.6-4.1M8.2 13.2l7.6 4.1"/>',
};
// La marca de lluvia de estrellas, en palabras (sin emoji, Aaron 24-10-2026).
const marcaTexto = m => m === '☄️' ? 'lluvia de estrellas' : m;
function svg(nombre, tam = 20) {
  return `<svg aria-hidden="true" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre]}</svg>`;
}

const OBJETIVOS = ['Salida de luna', 'Atardecer', 'Amanecer', 'Estrellas'];
const CORTO = { 'Salida de luna': 'Luna' };
const EN_ENLACE = { 'Salida de luna': 'luna', 'Atardecer': 'atardecer', 'Amanecer': 'amanecer', 'Estrellas': 'estrellas' };
const TITULO = { verde: 'Merece la pena', amarillo: 'Regular', rojo: 'No merece la pena', pasado: 'Ya pasó' };
const ORDEN = { verde: 0, amarillo: 1, rojo: 2, pasado: 3 };
const VERBO = { 'Salida de luna': 'sale la luna', 'Atardecer': 'se pone el sol',
                'Amanecer': 'sale el sol', 'Estrellas': 'sin luna' };
// La luna puede proponerse al salir o al ponerse (decisión 42).
const verbo = (objetivo, r) => objetivo === 'Salida de luna' && r && r.luna_pone ? 'se pone la luna' : VERBO[objetivo];
// Cuándo: «Sale la luna a las 18:02»; para las estrellas, si el rato es sin
// luna o con ella toda la noche (Aaron, 23-10-2026: decía «sin luna» siempre).
function textoHora(objetivo, r) {
  if (!r.hora) return objetivo === 'Estrellas' ? 'Esa noche no llega a oscurecer del todo' : 'Ese día no se ve desde aquí';
  if (objetivo !== 'Estrellas') return `${mayuscula(verbo(objetivo, r))} a las ${r.hora}`;
  const [a, b] = r.hora.split('-');
  if (r.sin_luna === true) return `Sin luna de ${a} a ${b}`;
  if (r.sin_luna === false) return `Con luna toda la noche (${a} – ${b})`;
  return `Noche cerrada de ${a} a ${b}`;        // datos antiguos, sin ese dato
}

// Qué tapan las nubes, según lo que se quiere ver.
const TAPAN = { 'Salida de luna': 'la tapen', 'Atardecer': 'lo tapen', 'Amanecer': 'lo tapen',
                'Estrellas': 'tapen el cielo' };
const RUMBOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
function rumbo(az) { return RUMBOS[Math.round(az / 22.5) % 16]; }
const TENERIFE = [[27.99, -16.93], [28.60, -16.11]];

let datos, mapa, capaMiradores;
const estado = { dia: null, mirador: null, objetivo: null, ocasiones: false, luna: null, filtro: null, mejorar: false };

// Crea un elemento con texto (nunca HTML) para no meter nada raro en la página.
function el(etiqueta, atributos = {}, ...hijos) {
  const e = document.createElement(etiqueta);
  for (const [k, v] of Object.entries(atributos)) {
    if (k === 'html') e.innerHTML = v;            // solo para iconos fijos
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const h of hijos.flat()) if (h != null) e.append(h);
  return e;
}
const mayuscula = t => t[0].toUpperCase() + t.slice(1);
const coma = n => String(n).replace('.', ',');

// "San Roque (punto propio, La Laguna)" → ["San Roque", "punto propio, La Laguna"]
function partesNombre(nombre) {
  const m = nombre.match(/^(.*?)\s*\((.*)\)$/);
  return m ? [m[1], m[2]] : [nombre, ''];
}

// "2026-10-25" → ["Hoy" | "Mañana" | "dom", "25"]
function partesDia(iso) {
  const i = datos.dias.indexOf(iso), d = new Date(iso + 'T12:00:00');
  const arriba = i === 0 ? 'Hoy' : i === 1 ? 'Mañana' : d.toLocaleDateString('es-ES', { weekday: 'short' });
  return [arriba, String(d.getDate())];
}

// Punto a d km en la dirección az (grados) desde lat, lon: para la línea.
function destino(lat, lon, az, km) {
  const R = 6371, a = km / R, f1 = lat * Math.PI / 180, l1 = lon * Math.PI / 180;
  const t = az * Math.PI / 180;
  const f2 = Math.asin(Math.sin(f1) * Math.cos(a) + Math.cos(f1) * Math.sin(a) * Math.cos(t));
  const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(a) * Math.cos(f1), Math.cos(a) - Math.sin(f1) * Math.sin(f2));
  return [f2 * 180 / Math.PI, l2 * 180 / Math.PI];
}

// Si su hora ya pasó (más de 20 min: los colores siguen un rato tras el
// atardecer), sale como «Ya pasó» (Aaron, 23-10-2026). Las estrellas (un rato
// de noche hasta el día siguiente) no se marcan.
const MARGEN_PASADO_MIN = 20;
function yaPaso(r, dia) {
  if (!r.hora || r.hora.includes('-')) return false;
  return instante(dia, r.hora).getTime() + MARGEN_PASADO_MIN * 60e3 < Date.now();
}
function resultado(clave, objetivo) {
  const r = datos.miradores[clave].dias[estado.dia][objetivo];
  const conPasado = x => yaPaso(x, estado.dia) ? { ...x, color: 'pasado', marca: '' } : x;
  if (objetivo !== 'Salida de luna' || !r.otra) return conPasado(r);
  // Luna con salida y puesta (Aaron, 24-10-2026): manda la mejor, salvo que
  // ya haya pasado y la otra no (la puesta del alba ya pasó, la salida de
  // esta tarde aún no).
  const a = conPasado(r), b = conPasado(r.otra);
  return a.color === 'pasado' && b.color !== 'pasado' ? { ...b, otra: a } : { ...a, otra: b };
}
// La luna que se está viendo: la propuesta o la otra si se tocó en el selector.
function resultadoVisto(clave, objetivo) {
  const r = resultado(clave, objetivo);
  if (objetivo !== 'Salida de luna' || !r.otra || !estado.luna) return r;
  const quiere = estado.luna === 'puesta';
  return Boolean(r.luna_pone) === quiere ? r : Boolean(r.otra.luna_pone) === quiere ? r.otra : r;
}
const tipoLuna = r => r.luna_pone ? 'puesta' : 'salida';
// «Luna (puesta)» en listas y resúmenes, para que se sepa cuál es.
const etiqueta = (o, r) => o === 'Salida de luna' && r && r.hora ? `Luna (${tipoLuna(r)})` : CORTO[o] || o;

// Orden de «mejor a peor»: color, luego la nota y, si empatan, ⭐ o 🎨.
function comparar(a, b) {
  return ORDEN[a.color] - ORDEN[b.color] || (b.puntos ?? 0) - (a.puntos ?? 0) ||
         (b.marca ? 1 : 0) - (a.marca ? 1 : 0);
}

// Lo mejor que se puede ver en un mirador ese día (si empatan, en el orden
// de OBJETIVOS).
function mejorObjetivo(clave) {
  // Con un filtro elegido en la lista (Aaron, 28-10-2026), solo esa opción.
  if (estado.filtro) return { o: estado.filtro, i: 0, r: resultado(clave, estado.filtro) };
  return OBJETIVOS.map((o, i) => ({ o, i, r: resultado(clave, o) }))
    .sort((a, b) => comparar(a.r, b.r) || a.i - b.i)[0];
}

// --- Enlace: #mirador/fecha/objetivo -----------------------------------------
function guardarEnlace() {
  const partes = estado.mirador ? [estado.mirador, estado.dia, EN_ENLACE[estado.objetivo]].filter(Boolean)
    : estado.ocasiones ? ['ocasiones'] : [];
  history.replaceState(null, '', partes.length ? '#' + partes.join('/') : location.pathname);
}
function leerEnlace() {
  const [mirador, dia, objetivo] = decodeURIComponent(location.hash.slice(1)).split('/');
  estado.ocasiones = mirador === 'ocasiones';
  if (datos.dias.includes(dia)) estado.dia = dia;
  if (mirador in datos.miradores) {
    estado.mirador = mirador;
    estado.objetivo = OBJETIVOS.find(o => EN_ENLACE[o] === objetivo) || null;   // sin objetivo: resumen
  }
}

// --- Mapa --------------------------------------------------------------------
const PIN = `<svg width="30" height="42" viewBox="0 0 30 42" aria-hidden="true">
  <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 41 15 41s14-15.7 14-26.1C29 7.2 22.7 1 15 1z" fill="#D7352A" stroke="#fff" stroke-width="2"/>
  <circle cx="15" cy="15" r="5.5" fill="#fff"/></svg>`;

const esOrdenador = () => window.innerWidth >= 900;

// Lo que tapa el panel, para que el mapa centre las cosas en la parte libre.
function margenPanel() {
  const panel = document.getElementById('panel');
  if (panel.classList.contains('plegado')) return [0, 0];
  return esOrdenador() ? [panel.offsetWidth + 16, 0] : [0, panel.offsetHeight];
}

function verTenerife() {
  const [derecha, abajo] = margenPanel();
  mapa.flyToBounds(TENERIFE, { paddingTopLeft: [20, 70], paddingBottomRight: [derecha + 20, abajo + 20], duration: 0.6 });
}

function centrarEn(lat, lon, zoom) {
  const [derecha, abajo] = margenPanel();
  const p = mapa.project([lat, lon], zoom).add([derecha / 2, abajo / 2]);
  mapa.flyTo(mapa.unproject(p, zoom), zoom, { duration: 0.6 });
}

const ZOOM_NOMBRES = 12;

function iniciarMapa() {
  mapa = L.map('mapa', { zoomControl: false, attributionControl: true });
  // Relieve algo apagado (clase fondo-suave) para que no choquen.
  // crossOrigin: el trabajador sin conexión puede guardar los trozos de mapa.
  const relieve = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { crossOrigin: true,
    maxZoom: 17, className: 'fondo-suave', attribution: '© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)' });
  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { crossOrigin: true,
    maxZoom: 18, attribution: 'Imágenes © Esri, Maxar, Earthstar Geographics' });
  relieve.addTo(mapa);
  // Tipo de mapa y zoom a la izquierda (el panel va a la derecha), en fila.
  L.control.layers({ 'Relieve': relieve, 'Satélite': satelite },
    null, { position: 'topleft', collapsed: false }).addTo(mapa);
  L.control.zoom({ position: 'topleft', zoomInTitle: 'Acercar', zoomOutTitle: 'Alejar' }).addTo(mapa);
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(mapa);
  capaMiradores = L.layerGroup().addTo(mapa);
  // Con la isla entera, solo los localizadores; los nombres salen al acercarse.
  const nombres = () => mapa.getContainer().classList.toggle('con-nombres', mapa.getZoom() >= ZOOM_NOMBRES);
  mapa.on('zoomend', nombres);
  mapa.on('moveend', refrescarLista);
  mapa.fitBounds(TENERIFE);
  nombres();
}

function pintarMapa() {
  capaMiradores.clearLayers();
  for (const [clave, m] of Object.entries(datos.miradores)) {
    const elegido = clave === estado.mirador;
    // Línea hacia donde sale o se pone lo elegido, solo en el detalle.
    if (elegido && estado.objetivo) {
      const r = resultadoVisto(clave, estado.objetivo);
      if (r.azimut != null) {
        L.polyline([[m.lat, m.lon], destino(m.lat, m.lon, r.azimut, 60)], {
          color: '#1D4E6B', weight: 4, opacity: 0.9, dashArray: '8 6' })
          .bindTooltip(`${mayuscula(verbo(estado.objetivo, r))}${r.hora ? ' · ' + r.hora : ' · tapado por el relieve'}`, {
            permanent: true, direction: 'center', className: 'etiqueta-mapa' })
          .addTo(capaMiradores);
      }
    }
    const icono = L.divIcon({ className: '', iconSize: [30, 42], iconAnchor: [15, 41],
      html: `<div class="pin${elegido ? ' elegido' : ''}">${PIN}</div>` });
    // El nombre a la derecha, salvo que otro mirador esté justo a la derecha.
    const vecino = Object.values(datos.miradores).some(o => o !== m &&
      o.lon > m.lon && o.lon - m.lon < 0.25 && Math.abs(o.lat - m.lat) < 0.06);
    L.marker([m.lat, m.lon], { icon: icono, title: m.nombre, keyboard: true, riseOnHover: true })
      .bindTooltip(el('span', { onclick: ev => { L.DomEvent.stopPropagation(ev); abrirMirador(clave); } },
        partesNombre(m.nombre)[0]), { permanent: true, direction: vecino ? 'left' : 'right',
        offset: vecino ? [-12, -24] : [12, -24], className: 'nombre-pin' })
      .on('click', () => abrirMirador(clave))
      .addTo(capaMiradores);
  }
}

// --- Piezas del panel ----------------------------------------------------------
function seccion(titulo, ...hijos) {
  return el('div', { class: 'seccion' }, el('span', { class: 'etiqueta' }, titulo), ...hijos);
}

function botonesDias() {
  return el('div', { class: 'dias' }, datos.dias.map(d => {
    const [arriba, numero] = partesDia(d);
    return el('button', { class: 'dia', 'aria-pressed': String(d === estado.dia),
      onclick: () => { estado.dia = d; estado.luna = null; pintarTodo(); } }, el('span', {}, arriba), el('strong', {}, numero));
  }));
}

// La pastilla: el color en palabras y, si hay puntuación, la nota.
function pastilla(r) {
  return el('span', { class: `pastilla ${r.color}` },
    r.puntos != null && r.color !== 'pasado' ? `${coma(r.puntos)}/10` : TITULO[r.color]);
}

// --- Vista lista: lo mejor de cada mirador ese día ---------------------------
// Si Open-Meteo no respondió al calcular, las notas no cuentan las nubes.
function sinTiempo() {
  if (!navigator.onLine) return el('strong', { class: 'sin-tiempo' }, ' Sin conexión: son los últimos datos guardados en el móvil.');
  return datos.sin_tiempo ? el('strong', { class: 'sin-tiempo' }, ' Ojo: esta vez no se pudo consultar la previsión del tiempo; las notas suponen el cielo despejado.') : null;
}

// Lista sin mirador abierto (Aaron, 23-10-2026): siempre de mejor a peor
// nota. Con el mapa lejos, todos; al acercarse (zoom ≥ ZOOM_CERCA), solo
// los que se ven en el mapa: los mejores de esa zona.
const ZOOM_CERCA = 12;

function mejoresPrimero() {
  return Object.keys(datos.miradores)
    .map(clave => ({ clave, mejor: mejorObjetivo(clave) }))
    .sort((a, b) => comparar(a.mejor.r, b.mejor.r));
}

// Miradores que se ven en la parte del mapa que no tapa el panel, de mejor a peor.
function miradoresALaVista() {
  const tam = mapa.getSize(), [derecha, abajo] = margenPanel();
  const ancho = tam.x - derecha, alto = tam.y - abajo;
  const aLaVista = new Set(Object.keys(datos.miradores).filter(clave => {
    const m = datos.miradores[clave], p = mapa.latLngToContainerPoint([m.lat, m.lon]);
    return p.x >= 0 && p.y >= 0 && p.x <= ancho && p.y <= alto;
  }));
  return mejoresPrimero().filter(({ clave }) => aLaVista.has(clave));
}

// Al mover el mapa o abrir el panel, la lista cambia (solo sin mirador abierto).
function refrescarLista() {
  if (!estado.mirador && !estado.ocasiones) document.getElementById('contenido').replaceChildren(...pintarLista());
}

function pintarLista() {
  const lejos = mapa.getZoom() < ZOOM_CERCA;
  const filas = lejos ? mejoresPrimero() : miradoresALaVista();
  const todos = lejos || filas.length === Object.keys(datos.miradores).length;
  const verTodos = el('button', { class: 'ver-todos', onclick: verTenerife,
    html: svg('mapa', 16) + '<span>Ver todos los spots</span>' });
  const ocasiones = el('button', { class: 'ver-todos', onclick: () => { estado.ocasiones = true; pintarTodo(); irArriba(); },
    html: svg('calendario', 16) + '<span>Próximas ocasiones</span>' });
  const filtro = el('div', { class: 'filtro' }, [null, ...OBJETIVOS].map(o => el('button', {
    class: 'opcion-filtro', 'aria-pressed': String(estado.filtro === o),
    onclick: () => { estado.filtro = o; refrescarLista(); },
  }, o ? el('span', { html: svg(o, 16) }) : null, o ? CORTO[o] || o : 'Todo')));
  return [
    seccion('¿Cuándo?', botonesDias()),
    seccion('¿Qué quieres ver?', filtro),
    ocasionesVigentes().length ? ocasiones : null,
    botonMejorar(),
    filas.length ? null : el('p', { class: 'vacio' }, 'No hay spots en esta parte del mapa.'),
    todos ? null : verTodos,
    filas.length ? seccion(estado.filtro ? `${CORTO[estado.filtro] || estado.filtro}${lejos ? ' en cada spot' : ' en esta zona del mapa'}`
      : lejos ? 'Lo mejor de cada spot' : 'Lo mejor en esta zona del mapa', el('ul', { class: 'lista' }, filas.map(({ clave, mejor }) => {
      const m = datos.miradores[clave], r = mejor.r;
      // Con filtro se dice siempre cómo está esa opción (aunque sea roja).
      const sub = estado.filtro ? [etiqueta(mejor.o, r), r.hora ? (r.color === 'pasado' ? 'ya pasó' : r.hora) : 'no se ve', marcaTexto(r.marca)].filter(Boolean).join(' · ')
        : r.color === 'pasado' ? 'Lo de hoy ya pasó' : r.color === 'rojo' ? 'Nada destacable ese día'
        : `${etiqueta(mejor.o, r)}${r.hora ? ' · ' + r.hora : ''}${r.marca ? ' ' + marcaTexto(r.marca) : ''}`;
      // Tocar un spot abre directamente su mejor opción (Aaron, 28-10-2026:
      // se probó abrir el resumen y prefirió esto); si está en rojo o ya
      // pasó, el resumen. Desde el detalle, «Todas las opciones» lleva a él.
      const abrir = estado.filtro || !(r.color === 'rojo' || r.color === 'pasado') ? mejor.o : null;
      return el('li', {}, el('button', { class: 'fila', onclick: () => abrirMirador(clave, abrir) },
        el('span', { class: 'icono-obj', html: svg(mejor.o, 20) }),
        el('span', { class: 'texto' }, el('span', { class: 'titulo' }, partesNombre(m.nombre)[0]), el('span', { class: 'sub' }, sub)),
        pastilla(r)));
    }))) : null,
    el('p', { class: 'pie' }, `Toca un localizador o un spot para ver el plan. Previsión del ${datos.generado}.`, sinTiempo()),
  ].filter(Boolean);
}

// --- La rueda del horizonte: tú en el centro, girando ----------------------
// Vista desde arriba con el norte arriba (como el mapa). El círculo
// discontinuo es la horizontal; el verde que sobresale hacia fuera es relieve
// que te tapa; el azul hacia dentro es el mar, que ves por debajo de la
// horizontal porque estás en alto. Las alturas están exageradas.
const RUEDA = { C: 180, HORIZONTAL: 112, DENTRO: 52 };

function radio(m, h) {
  // Píxeles por grado: exagerado, pero que el más alto quepa en la rueda.
  const escala = Math.min(8, 52 / Math.max(1, ...m.horizonte));
  return RUEDA.HORIZONTAL + Math.max(h, -4) * escala;
}

function punto(az, r) {
  const a = az * Math.PI / 180;
  return [RUEDA.C + r * Math.sin(a), RUEDA.C - r * Math.cos(a)];
}

// Un anillo como un solo trazado: el borde de fuera siguiendo radios[] y el
// de dentro un círculo de radio interior (con evenodd queda hueco).
function anillo(radios, interior, desde = 0, hasta = 360) {
  const fuera = [], dentro = [];
  for (let az = desde; az <= hasta; az++) fuera.push(punto(az, radios[az % 360]));
  for (let az = hasta; az >= desde; az--) dentro.push(punto(az, interior));
  const linea = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join('');
  // Anillo completo: dos trazados (fuera y el hueco). Un tramo: una sola
  // forma que va por fuera y vuelve por dentro.
  return desde === 0 && hasta === 360
    ? linea(fuera) + 'Z' + linea(dentro) + 'Z'
    : linea(fuera) + linea(dentro).replace('M', 'L') + 'Z';
}

// Tramos seguidos de mar (az inicial, az final) para pintarlos de azul.
function tramosMar(m) {
  const tramos = [];
  let inicio = null;
  for (let az = 0; az <= 360; az++) {
    const mar = az < 360 && m.delante[az] === 'mar abierto';
    if (mar && inicio === null) inicio = az;
    if (!mar && inicio !== null) { tramos.push([inicio, az]); inicio = null; }
  }
  return tramos;
}

function pintarRueda(m, azimut) {
  const { C, HORIZONTAL, DENTRO } = RUEDA;
  const radios = m.horizonte.map(h => radio(m, h));
  // Suelo (lo que tienes delante), el mar encima en azul y, en verde oscuro,
  // solo lo que sobresale por encima de la horizontal: lo que te tapa.
  const suelo = `<path d="${anillo(radios, DENTRO)}" fill="#C8D3BC" fill-rule="evenodd"/>`;
  const mar = tramosMar(m).map(([a, b]) =>
    `<path d="${anillo(radios, DENTRO, a, b)}" fill="#A3C6DE"/>`).join('');
  const tapa = `<path d="${anillo(radios.map(x => Math.max(x, HORIZONTAL)), HORIZONTAL)}" fill="#5F6F52" fill-rule="evenodd"/>`;
  const cunas = suelo + mar + tapa;
  const letras = [['N', 0], ['E', 90], ['S', 180], ['O', 270]].map(([l, az]) => {
    const [x, y] = punto(az, 166);
    return `<text x="${x}" y="${y + 5}" font-size="15" font-weight="700" fill="#56657A" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif">${l}</text>`;
  }).join('');
  // El Teide, con su nombre en la rueda si se ve desde aquí (Aaron,
  // 23-10-2026); m.teide es el grado en que asoma más alto.
  let cumbres = '';
  if (m.teide != null) {
    const az = m.teide;
    const [x, y] = punto(az, radios[az] + 4);
    const [tx, ty] = punto(az, radios[az] + 16);
    cumbres = `<path d="M${x - 6},${y + 4}L${x},${y - 7}L${x + 6},${y + 4}Z" fill="#5F6F52" stroke="#fff" stroke-width="1"/>` +
      `<text x="${tx}" y="${ty}" font-size="12" font-weight="700" fill="#3E4A35" text-anchor="${az < 180 ? 'start' : 'end'}" font-family="Plus Jakarta Sans, sans-serif" paint-order="stroke" stroke="#EAF2F8" stroke-width="3">Teide</text>`;
  }
  let flecha = '';
  if (azimut != null) {
    const [x, y] = punto(azimut, 148);
    flecha = `<line x1="${C}" y1="${C}" x2="${x}" y2="${y}" stroke="#8A4A12" stroke-width="3" stroke-dasharray="7 5"/>` +
             `<circle cx="${x}" cy="${y}" r="10" fill="#F6D27A" stroke="#8A4A12" stroke-width="2"/>`;
  }
  // El localizador: tú, en el centro (rojo, como en el mapa).
  const localizador = `<g transform="translate(${C - 14},${C - 34})">
      <path d="M14 0C6.3 0 0 6.1 0 13.6 0 23.8 14 36 14 36s14-12.2 14-22.4C28 6.1 21.7 0 14 0z" fill="#D7352A"/>
      <circle cx="14" cy="13.5" r="5.5" fill="#fff"/></g>
    <text x="${C}" y="${C + 20}" font-size="13" font-weight="700" fill="#13202E" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif">Tú</text>`;
  return `<svg viewBox="0 0 360 360" role="img" aria-label="Rueda del horizonte desde ${m.nombre}: tú en el centro">
    <circle cx="${C}" cy="${C}" r="178" fill="#EAF2F8"/>
    ${cunas}
    <circle cx="${C}" cy="${C}" r="${DENTRO}" fill="#F4F6F8" stroke="#DCE2E8"/>
    <circle cx="${C}" cy="${C}" r="${HORIZONTAL}" fill="none" stroke="#13202E" stroke-width="1.2" stroke-dasharray="4 4"/>
    ${letras}${flecha}${cumbres}
    <g class="cursor" visibility="hidden">
      <line class="linea" x1="${C}" y1="${C}" x2="${C}" y2="${C}" stroke="#13202E" stroke-width="1.5"/>
      <circle class="bola" cx="${C}" cy="${C}" r="8" fill="#13202E" stroke="#fff" stroke-width="2"/>
      <line class="agarre" x1="${C}" y1="${C}" x2="${C}" y2="${C}" stroke="transparent" stroke-width="40" stroke-linecap="round"/>
    </g>
    ${localizador}</svg>`;
}

// Al tocar la rueda (o pasar el ratón): qué hay en esa dirección. En el móvil,
// un toque coloca la línea y luego se puede arrastrar cogiéndola (Aaron,
// 23-10-2026); deslizar por el resto de la rueda sigue moviendo el panel.
// --- Lo que verás: el horizonte de frente, como por la cámara ---------------
// (Aaron, 23-10-2026). La silueta mirando hacia el astro y su camino cada
// 5 minutos (r.camino: [hora, azimut, altura]). Las alturas van exageradas
// para que se lea; el dibujo dice cuánto.
const FRENTE = { W: 360, H: 210, ARRIBA: 20, ABAJO: 24 };
const SUELO = { mar: '#A3C6DE', isla: '#9AAA8E', tierra: '#5F6F52' };

function pintarFrente(m, r, objetivo) {
  const { W, H, ARRIBA, ABAJO } = FRENTE;
  const camino = r.camino;
  const rel = (az, c) => ((az - c + 540) % 360) - 180;            // grados respecto al centro
  const c = r.azimut ?? camino[Math.floor(camino.length / 2)][1];
  const separacion = Math.max(...camino.map(p => Math.abs(rel(p[1], c))));
  const mitad = Math.max(30, separacion + 10);
  const hEn = az => {                                               // horizonte, interpolado
    const a = ((az % 360) + 360) % 360, i = Math.floor(a), f = a - i;
    return m.horizonte[i] * (1 - f) + m.horizonte[(i + 1) % 360] * f;
  };
  const tipo = az => {
    const d = m.delante[((Math.round(az) % 360) + 360) % 360];
    return d === 'mar abierto' ? 'mar' : /^(La Palma|La Gomera|Gran Canaria|El Hierro)\b/.test(d) ? 'isla' : 'tierra';
  };
  const grados = [];
  for (let d = -mitad; d <= mitad; d += 0.5) grados.push(d);
  const alturas = grados.map(d => hEn(c + d));
  const yMin = Math.min(-1.5, Math.min(...alturas) - 0.5);
  const yMax = Math.max(...camino.map(p => p[2]), Math.max(...alturas)) + 1.5;
  const x = d => (d + mitad) / (2 * mitad) * W;
  const y = h => H - ABAJO - (h - yMin) / (yMax - yMin) * (H - ABAJO - ARRIBA);
  const exagera = ((H - ABAJO - ARRIBA) / (yMax - yMin)) / (W / (2 * mitad));

  // Suelo por tramos del mismo tipo (mar, otra isla, tierra), cada uno con su color.
  let suelo = '', desde = 0;
  for (let i = 1; i <= grados.length; i++) {
    if (i < grados.length && tipo(c + grados[i]) === tipo(c + grados[desde])) continue;
    const tramo = grados.slice(desde, Math.min(i + 1, grados.length));
    const borde = tramo.map(d => `L${x(d).toFixed(1)},${y(hEn(c + d)).toFixed(1)}`).join('');
    suelo += `<path d="M${x(tramo[0]).toFixed(1)},${H - ABAJO}${borde}L${x(tramo[tramo.length - 1]).toFixed(1)},${H - ABAJO}Z" fill="${SUELO[tipo(c + grados[desde])]}"/>`;
    desde = i;
  }
  // Nombres: el Teide y las islas que entran en el dibujo.
  const nombres = [];
  if (m.teide != null && Math.abs(rel(m.teide, c)) < mitad) nombres.push(['Teide', rel(m.teide, c)]);
  for (const isla of ['La Palma', 'La Gomera', 'Gran Canaria', 'El Hierro']) {
    const suyos = grados.filter(d => m.delante[((Math.round(c + d) % 360) + 360) % 360].startsWith(isla));
    if (suyos.length) nombres.push([isla, suyos.reduce((a, b) => hEn(c + b) > hEn(c + a) ? b : a)]);
  }
  const etiquetas = nombres.map(([n, d]) =>
    `<text x="${x(d)}" y="${y(hEn(c + d)) - 6}" font-size="11" font-weight="700" fill="#3E4A35" text-anchor="middle" paint-order="stroke" stroke="#fff" stroke-width="3">${n}</text>`).join('');
  // El camino: un punto cada 5 minutos; hueco si lo tapa el relieve.
  const sol = objetivo !== 'Salida de luna';
  const puntos = camino.filter(p => Math.abs(rel(p[1], c)) <= mitad).map(([hh, az, h], i) => {
    const d = rel(az, c), tapado = h < hEn(az) - 0.25;
    const relleno = tapado ? 'none' : sol ? '#F6D27A' : '#FFFFFF';
    const punto = `<circle cx="${x(d).toFixed(1)}" cy="${y(h).toFixed(1)}" r="5" fill="${relleno}" stroke="${sol ? '#8A4A12' : '#56657A'}" stroke-width="1.6"${tapado ? ' stroke-dasharray="2 2"' : ''}/>`;
    const texto = hh.endsWith('0') && y(h) > ARRIBA - 4 && y(h) < H - ABAJO - 2
      ? `<text x="${(x(d) + 8).toFixed(1)}" y="${(y(h) + 4).toFixed(1)}" font-size="11" fill="#13202E" paint-order="stroke" stroke="#fff" stroke-width="3">${hh}</text>` : '';
    return punto + texto;
  }).join('');
  // Rumbos abajo, cada 10°.
  let rumbos = '';
  for (let a = Math.ceil((c - mitad) / 10) * 10; a <= c + mitad; a += 10) {
    const az = ((a % 360) + 360) % 360;
    rumbos += `<text x="${x(rel(az, c))}" y="${H - 7}" font-size="10.5" fill="#56657A" text-anchor="middle">${az}° ${a % 45 === 0 ? rumbo(az) : ''}</text>`;
  }
  // Nubes de la previsión (Aaron, 23-10-2026): cada una donde se vería, más
  // opaca cuanto más probable; las de delante (mar de nubes) tapan el relieve.
  const pxGrado = W / (2 * mitad), pyGrado = (H - ABAJO - ARRIBA) / (yMax - yMin);
  const nube = ([az, h, pct, ancho, alto, capa]) => {
    const d = rel(az, c);
    if (Math.abs(d) > mitad + ancho / 2 || h < yMin - alto || h > yMax + alto) return '';
    const cx = x(d), cy = y(h), w = Math.max(14, Math.min(20, ancho) * pxGrado), op = (pct / 100 * 0.7).toFixed(2);
    if (capa !== 'b') {           // medias y altas: velos alargados (al atardecer, tintados)
      const color = sol ? (capa === 'a' ? '#F5C2B0' : '#F2D2B8') : '#F4F6F8';
      return `<ellipse cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${capa === 'a' ? 2.5 : 4}" fill="${color}" opacity="${op}"/>`;
    }
    const hpx = Math.max(6, Math.min(40, alto * pyGrado));
    const bola = (dx, dy, rx, ry) => `<ellipse cx="${(cx + dx * w).toFixed(1)}" cy="${(cy + dy * hpx).toFixed(1)}" rx="${(rx * w).toFixed(1)}" ry="${(ry * hpx).toFixed(1)}"/>`;
    const forma = bola(-0.22, 0.05, 0.28, 0.45) + bola(0, -0.2, 0.3, 0.6) + bola(0.22, 0.05, 0.28, 0.45) + bola(0, 0.15, 0.48, 0.35);
    return `<g opacity="${op}" fill="#FFFFFF">${forma}<ellipse cx="${cx.toFixed(1)}" cy="${(cy + 0.3 * hpx).toFixed(1)}" rx="${(0.42 * w).toFixed(1)}" ry="${(0.18 * hpx).toFixed(1)}" fill="#DCE3EA"/></g>`;
  };
  const nubes = r.nubes || [];
  const nubesDetras = nubes.filter(n => !n[6]).map(nube).join('');
  const nubesDelante = nubes.filter(n => n[6]).map(nube).join('');
  // Calima (Aaron, 23-10-2026): neblina de puntitos marrones pegada al
  // horizonte, más densa cuanto más turbio el aire (r.aod, turbidez).
  let calima = '';
  if (r.aod != null && r.aod >= 0.2) {
    const fuerza = Math.min(1, (r.aod - 0.1) / 0.6);
    const techo = y(Math.min(yMax, 0 + 2 + 6 * fuerza));
    calima = `<rect y="${techo.toFixed(1)}" width="${W}" height="${(H - ABAJO - techo).toFixed(1)}" fill="url(#puntos-calima)" mask="url(#sube-calima)" opacity="${(0.4 + 0.5 * fuerza).toFixed(2)}"/>` +
      `<rect y="${techo.toFixed(1)}" width="${W}" height="${(H - ABAJO - techo).toFixed(1)}" fill="#C9A06A" mask="url(#sube-calima)" opacity="${(0.15 + 0.3 * fuerza).toFixed(2)}"/>`;
  }
  const cielo = sol ? ['#EAF2F8', '#F8DDB4'] : ['#E3EAF2', '#C9D6E4'];
  return {
    svg: `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="El horizonte de frente desde ${m.nombre}, con el camino del ${sol ? 'sol' : 'la luna'}">
      <defs><linearGradient id="cielo-frente" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${cielo[0]}"/><stop offset="1" stop-color="${cielo[1]}"/></linearGradient>
        <clipPath id="recorte-frente"><rect width="${W}" height="${H - ABAJO}"/></clipPath>
        <pattern id="puntos-calima" width="5" height="5" patternUnits="userSpaceOnUse"><circle cx="1.2" cy="1.2" r=".8" fill="#9C6B30"/><circle cx="3.7" cy="3.6" r=".7" fill="#9C6B30"/></pattern>
        <linearGradient id="sube-calima-g" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
        <mask id="sube-calima" maskContentUnits="objectBoundingBox"><rect width="1" height="1" fill="url(#sube-calima-g)"/></mask></defs>
      <rect width="${W}" height="${H - ABAJO}" fill="url(#cielo-frente)"/>
      <g clip-path="url(#recorte-frente)">${nubesDetras}
      <line x1="0" x2="${W}" y1="${y(0)}" y2="${y(0)}" stroke="#13202E" stroke-width="1" stroke-dasharray="4 4" opacity=".5"/>
      ${suelo}${calima}${nubesDelante}</g>${etiquetas}${puntos}${rumbos}</svg>`,
    hayNubes: nubes.length > 0,
    hayCalima: calima !== '',
    exagera: Math.max(1, Math.round(exagera)),
    rumbo: rumbo(c),
  };
}

function conectarRueda(dibujo, lectura, m, azInicial) {
  const mover = ev => {
    const caja = dibujo.querySelector('svg').getBoundingClientRect();
    const dx = ev.clientX - (caja.left + caja.width / 2), dy = ev.clientY - (caja.top + caja.height / 2);
    if (Math.hypot(dx, dy) < caja.width * 0.1) return;      // encima de ti: sin dirección
    ponerEn((Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360);
  };
  const ponerEn = az => {
    const [x, y] = punto(az, 166);
    const cursor = dibujo.querySelector('.cursor');
    for (const linea of cursor.querySelectorAll('line')) { linea.setAttribute('x2', x); linea.setAttribute('y2', y); }
    cursor.querySelector('.bola').setAttribute('cx', x);
    cursor.querySelector('.bola').setAttribute('cy', y);
    cursor.setAttribute('visibility', 'visible');
    const h = m.horizonte[az], km = m.distancia[az];
    const que = m.delante[az] === 'mar abierto' ? `mar abierto (horizonte del mar a ${Math.round(km)} km)`
      : `${m.delante[az]}, a ${km < 10 ? coma(km.toFixed(1)) : Math.round(km)} km`;
    lectura.textContent = `${az}° ${rumbo(az)} · ${que} · ${h >= 0 ? '+' : ''}${coma(h.toFixed(1))}°`;
  };
  let arrastrando = false;
  dibujo.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse' || arrastrando) mover(ev); });
  dibujo.addEventListener('click', mover);
  // Coger la línea: la zona gruesa invisible (agarre) no deja que el dedo
  // mueva el panel mientras se arrastra.
  const agarre = dibujo.querySelector('.agarre');
  agarre.addEventListener('pointerdown', ev => {
    arrastrando = true;
    try { agarre.setPointerCapture(ev.pointerId); } catch { /* puntero ya suelto */ }
  });
  agarre.addEventListener('touchstart', ev => ev.preventDefault(), { passive: false });   // Safari
  const soltar = () => { arrastrando = false; };
  agarre.addEventListener('pointerup', soltar);
  agarre.addEventListener('pointercancel', soltar);
  // Ya puesta desde el principio (Aaron, 23-10-2026): sin ella nadie sabría
  // que se puede usar.
  ponerEn(Math.round(azInicial ?? 0) % 360);
}

// Un número con una cifra decimal como mucho y coma: 5.5 → "5,5", 3 → "3".
const num = n => coma(Math.round(n * 10) / 10);
// Decimales con coma también dentro de los textos: "0.64" → "0,64".
const comas = texto => texto.replace(/(\d)\.(\d)/g, '$1,$2');

// Amanecer y atardecer en tres partes (decisión 41): cielo, sol y paisaje,
// cada una con su probabilidad; la nota, la de que salga bien al menos una.
const PARTE_TITULO = { Cielo: 'Que el cielo se encienda', Sol: 'Que el sol toque algo bonito', Paisaje: 'Que luzca el paisaje' };
function tablaPartes(r) {
  const fila = (izq, der, clase = '') => el('div', { class: `fila-nota ${clase}` }, izq, el('span', { class: 'cifra' }, der));
  return el('div', { class: 'tabla-nota' },
    r.delante ? el('p', { class: 'delante' }, `Delante: ${comas(r.delante)} (horizonte a ${r.horizonte >= 0 ? '+' : ''}${num(r.horizonte)}°)`) : null,
    r.partes.map(p => fila(el('span', {}, el('strong', {}, PARTE_TITULO[p.parte] || p.parte),
      el('span', { class: 'explica' }, comas(mayuscula(p.claves.join('; '))))), `${num(p.nota ?? p.pct / 10)} / 10`)),
    fila(el('span', {}, el('strong', {}, 'Nota final'),
      el('span', { class: 'explica' }, 'Basta con que una cosa salga bien para que merezca la pena ir: manda la mejor y las otras suman un poco')),
      `${num(r.puntos)} / 10`, 'total'),
    (r.notas || []).map(n => el('p', { class: 'nota' }, mayuscula(n))));
}

function tablaNota(r) {
  const fila = (izq, der, clase = '') => el('div', { class: `fila-nota ${clase}` }, izq, el('span', { class: 'cifra' }, der));
  const factor = (nombre, texto) => el('span', {}, el('strong', {}, nombre), texto ? el('span', { class: 'explica' }, comas(mayuscula(texto))) : null);
  const libre = r.prob_nubes != null ? 1 - r.prob_nubes / 100 : null;
  return el('div', { class: 'tabla-nota' },
    r.delante ? el('p', { class: 'delante' }, `Delante: ${comas(r.delante)} (horizonte a ${r.horizonte >= 0 ? '+' : ''}${num(r.horizonte)}°)`) : null,
    r.desglose.map(d => fila(factor(d.factor, d.texto), d.max != null ? `${num(d.puntos)} / ${d.max}` : num(d.puntos))),
    fila(factor('Con el cielo despejado'), `${num(r.calidad)} / 10`, 'subtotal'),
    fila(factor('Nubes', libre != null ? `${r.prob_nubes} % de que ${TAPAN[estado.objetivo]}` : 'aún no se pueden prever'),
      libre != null ? `× ${coma(libre.toFixed(2))}` : '—'),
    r.paisaje && r.nota_luna != null ? fila(factor('La luna, con sus nubes'), `${num(r.nota_luna)} / 10`, 'subtotal') : null,
    r.paisaje ? fila(factor('Además, el paisaje', r.paisaje.claves.join('; ')), `${num(r.paisaje.nota ?? r.paisaje.pct / 10)} / 10`) : null,
    fila(factor('Nota final', r.paisaje ? 'Manda la mejor de las dos y la otra suma un poco' : null), `${num(r.puntos)} / 10`, 'total'),
    (r.notas || []).map(n => el('p', { class: 'nota' }, mayuscula(n))));
}

// --- Vista mirador: resumen con las cuatro opciones o detalle de una ----------
// (Aaron, 23-10-2026): al abrir un mirador, primero las cuatro tarjetas con
// su nota; al tocar una, su pantalla con todo (y «← mirador» para volver).
function pintarMirador() {
  return estado.objetivo ? pintarDetalle() : pintarResumen();
}

function cabezaMirador(m) {
  const [titulo, lugar] = partesNombre(m.nombre);
  return el('div', { class: 'cabeza-ficha' }, el('h2', {}, titulo),
    // La luz de ciudad solo importa para las estrellas (Aaron, 23-10-2026).
    el('p', {}, [lugar, `${m.altitud} m`, estado.objetivo === 'Estrellas' ? `luz de ciudad: zona ${m.zona_luz}` : null]
      .filter(Boolean).join(' · ')),
    // Muy canario y llama la atención (Aaron, 23-10-2026).
    m.teide != null ? el('span', { class: 'teide' }, el('span', { class: 'triangulo' }), 'Se ve el Teide') : null);
}

// Al abrir un spot desde las ocasiones se sale de ellas: atrás o tocar el
// mapa llevan a la lista de spots (Aaron, 23-10-2026).
const textoVolver = () => 'Spots';

function pintarResumen() {
  const m = datos.miradores[estado.mirador];
  return [
    el('button', { class: 'volver', onclick: () => { cerrarMirador(false); irArriba(); }, html: svg('volver', 18) + `<span>${textoVolver()}</span>` }),
    cabezaMirador(m),
    seccion('¿Cuándo?', botonesDias()),
    seccion('¿Qué quieres ver?', el('ul', { class: 'lista' }, OBJETIVOS.map(o => {
      const r = resultado(estado.mirador, o);
      // Si no hay nota, el veredicto ya va en la pastilla: no repetirlo.
      const hora = o === 'Estrellas' && r.hora ? textoHora(o, r) : r.hora;
      const sub = [r.puntos != null && r.color !== 'pasado' ? TITULO[r.color] : null, hora, marcaTexto(r.marca)].filter(Boolean).join(' · ');
      const nubes = r.prob_nubes != null ? `${r.prob_nubes} % de nubes` : null;
      return el('li', {}, el('button', { class: 'fila', onclick: () => { estado.objetivo = o; pintarTodo(); irArriba(); } },
        el('span', { class: 'icono-obj', html: svg(o, 20) }),
        el('span', { class: 'texto' }, el('span', { class: 'titulo' }, etiqueta(o, r)),
          el('span', { class: 'sub' }, sub), nubes ? el('span', { class: 'sub' }, nubes) : null),
        pastilla(r)));
    }))),
    el('p', { class: 'pie' }, `Toca una opción para ver el plan. Previsión del ${datos.generado}.`, sinTiempo()),
    cajaGaleria(estado.mirador),      // todas las fotos de la gente (valoraciones.js)
  ].filter(Boolean);
}

// --- Cómo llegar, Avísame y Compartir (Aaron, 23-10-2026) -------------------
function acciones(m, r) {
  const nombre = partesNombre(m.nombre)[0];
  const llegar = el('a', { class: 'accion', target: '_blank', rel: 'noopener',
    href: `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lon}`,
    html: svg('ruta', 18) + '<span>Cómo llegar</span>' });
  // Avísame abre un mini menú: Google Calendar en Android no abre los .ics
  // (Aaron, 23-10-2026), así que va por su enlace; el resto, con el archivo.
  const menu = el('div', { class: 'menu-aviso', hidden: '' },
    el('a', { class: 'opcion-aviso', target: '_blank', rel: 'noopener', href: enlaceGoogle(m, r) },
      el('strong', {}, 'Google Calendar'), el('span', {}, 'Se abre ya rellenado: dale a Guardar')),
    el('button', { class: 'opcion-aviso', onclick: () => descargarAviso(m, r) },
      el('strong', {}, 'Otro calendario'), el('span', {}, 'iPhone, Samsung, Outlook… con alarma 1 h antes')));
  const avisar = r.hora ? el('button', { class: 'accion', html: svg('campana', 18) + '<span>Avísame</span>',
    onclick: () => { menu.hidden = !menu.hidden; } }) : null;
  const compartir = el('button', { class: 'accion', html: svg('compartir', 18) + '<span>Compartir</span>',
    onclick: () => compartirPlan(m, r, compartir) });
  return el('div', {}, el('div', { class: 'acciones' }, llegar, avisar, compartir), r.hora ? menu : null);
}

const fechaLarga = dia => new Date(dia + 'T12:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

// Hora de Canarias (HH:MM de ese día) → instante real. Canarias va con UTC en
// invierno y UTC+1 en verano: se pregunta al navegador qué toca ese día.
function instante(dia, hhmm) {
  const [a, mes, d] = dia.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  const aprox = new Date(Date.UTC(a, mes - 1, d, h, mi));
  let desfase = 0;
  try {
    const zona = new Intl.DateTimeFormat('en', { timeZone: 'Atlantic/Canary', timeZoneName: 'shortOffset' })
      .formatToParts(aprox).find(p => p.type === 'timeZoneName').value;      // "GMT+1" o "GMT"
    desfase = Number((zona.match(/[+-]\d+/) || ['0'])[0]);
  } catch { /* navegador viejo: hora de invierno */ }
  return new Date(aprox.getTime() - desfase * 3600e3);
}

// Lo que lleva el aviso: cuándo empieza y acaba, título y descripción.
function eventoAviso(m, r) {
  const nombre = partesNombre(m.nombre)[0];
  const [ini, fin] = r.hora.split('-');
  let desde, hasta;
  if (fin) {                       // estrellas: el rato de noche (acaba al día siguiente)
    desde = instante(estado.dia, ini);
    hasta = instante(estado.dia, fin);
    if (hasta <= desde) hasta = new Date(hasta.getTime() + 86400e3);
  } else {                         // sol o luna: llegar media hora antes y quedarse otra media
    const t = instante(estado.dia, ini);
    desde = new Date(t.getTime() - 30 * 60e3);
    hasta = new Date(t.getTime() + 30 * 60e3);
  }
  const notaTxt = r.puntos != null ? ` (${coma(r.puntos)}/10)` : '';
  return { nombre, desde, hasta, titulo: `${CORTO[estado.objetivo] || estado.objetivo} en ${nombre}`,
           descripcion: `${TITULO[r.color]}${notaTxt}. ${textoHora(estado.objetivo, r)}.\n${location.href}` };
}
const utc = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');

// Google Calendar: su página de «nuevo evento» ya rellenada.
function enlaceGoogle(m, r) {
  if (!r.hora) return '';
  const e = eventoAviso(m, r);
  return 'https://calendar.google.com/calendar/render?' + new URLSearchParams({
    action: 'TEMPLATE', text: e.titulo, dates: `${utc(e.desde)}/${utc(e.hasta)}`,
    details: e.descripcion, location: `${e.nombre} (${m.lat},${m.lon})` });
}

// Un evento de calendario (.ics) con alarma una hora antes. El móvil lo abre
// con su calendario; no hace falta servidor ni cuenta.
function descargarAviso(m, r) {
  const { nombre, desde, hasta, titulo, descripcion } = eventoAviso(m, r);
  // En los .ics, comas, puntos y coma y saltos de línea van escapados.
  const txt = s => s.replace(/\\/g, '\\\\').replace(/[,;]/g, c => '\\' + c).replace(/\n/g, '\\n');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Horizonte//ES', 'BEGIN:VEVENT',
    `UID:${estado.mirador}-${estado.dia}-${EN_ENLACE[estado.objetivo]}@horizonte`,
    `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(desde)}`, `DTEND:${utc(hasta)}`,
    `SUMMARY:${txt(titulo)}`, `LOCATION:${txt(nombre)}`, `GEO:${m.lat};${m.lon}`,
    `DESCRIPTION:${txt(descripcion)}`,
    `URL:${location.href}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT60M', `DESCRIPTION:${txt(titulo + ': sal en un rato')}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const enlace = el('a', { href: URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })),
    download: `horizonte-${estado.mirador}-${estado.dia}.ics` });
  document.body.append(enlace);
  enlace.click();
  enlace.remove();
}

// Compartir por WhatsApp y demás (el menú del móvil); si no hay, se copia.
async function compartirPlan(m, r, boton) {
  const nombre = partesNombre(m.nombre)[0];
  const texto = `${CORTO[estado.objetivo] || estado.objetivo} en ${nombre}, ${fechaLarga(estado.dia)}: ` +
    `${TITULO[r.color].toLowerCase()}${r.puntos != null ? ` (${coma(r.puntos)}/10)` : ''}. ${textoHora(estado.objetivo, r)}.`;
  try {
    if (navigator.share) return await navigator.share({ title: 'Horizonte', text: texto, url: location.href });
    await navigator.clipboard.writeText(`${texto} ${location.href}`);
    boton.querySelector('span').textContent = 'Enlace copiado';
    setTimeout(() => { boton.querySelector('span').textContent = 'Compartir'; }, 2500);
  } catch { /* cancelado */ }
}

// --- Próximas ocasiones (Aaron, 23-10-2026) ----------------------------------
// Lo especial de los próximos meses (ocasiones.py): sin el tiempo, que solo
// se sabe con 5 días. Las que caen en los días con datos se pueden abrir.
const OBJETIVO_DE = { luna: 'Salida de luna', atardecer: 'Atardecer', amanecer: 'Amanecer', estrellas: 'Estrellas' };
const fechaCorta = d => new Date(d + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

function cuandoOcasion(o) {
  if (!o.hasta) return [fechaCorta(o.fecha), o.hora].filter(Boolean).join(' · ');
  const hasta = new Date(o.hasta + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return o.fecha <= datos.dias[0] ? `Ya, hasta el ${hasta}` : `Del ${fechaCorta(o.fecha)} al ${hasta}`;
}

function iconoOcasion(tipo) {
  if (tipo === 'luna') return el('span', { class: 'icono-obj', html: svg('Salida de luna', 20) });
  if (tipo === 'oscuras') return el('span', { class: 'icono-obj', html: svg('Estrellas', 20) });
  if (tipo === 'teide') return el('span', { class: 'icono-obj teide-icono' }, el('span', { class: 'triangulo' }));
  return el('span', { class: 'icono-obj', html: svg(tipo === 'lluvia' ? 'meteoro' : 'galaxia', 20) });
}

// Sin las que ya pasaron (Aaron, 28-10-2026: salía la luna de hoy ya pasada):
// las de días anteriores y, si son de hoy, 20 min después de su hora.
function ocasionesVigentes() {
  const hoy = hoyCanarias();
  return (datos.ocasiones || []).filter(o => {
    if ((o.hasta || o.fecha) < hoy) return false;
    if (!o.hasta && o.hora && !o.hora.includes('-') && o.fecha === hoy)
      return instante(o.fecha, o.hora).getTime() + MARGEN_PASADO_MIN * 60e3 > Date.now();
    return true;
  });
}

function pintarOcasiones() {
  // Dos partes (Aaron, 24-10-2026): las que caen en los días con previsión
  // (se pueden abrir) y, por meses, las que aún no la tienen.
  const diaCon = o => datos.dias.find(d => d >= o.fecha && d <= (o.hasta || o.fecha));
  const fila = o => {
    const dia = diaCon(o);
    const contenido = [iconoOcasion(o.tipo),
      el('span', { class: 'texto' },
        el('span', { class: 'titulo' }, o.titulo),
        el('span', { class: 'sub' }, `${cuandoOcasion(o)} · ${partesNombre(datos.miradores[o.spot].nombre)[0]}`),
        el('span', { class: 'sub explica-ocasion' }, o.texto))];
    return el('li', {}, dia
      ? el('button', { class: 'fila', onclick: () => { estado.dia = dia; estado.ocasiones = false; abrirMirador(o.spot, OBJETIVO_DE[o.objetivo]); } }, ...contenido)
      : el('div', { class: 'fila sin-prevision' }, ...contenido));
  };
  const vigentes = ocasionesVigentes();
  const ya = vigentes.filter(diaCon), luego = vigentes.filter(o => !diaCon(o));
  const porMes = {};
  for (const o of luego) {
    const mes = new Date(o.fecha + 'T12:00').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    (porMes[mes] = porMes[mes] || []).push(o);
  }
  return [
    el('button', { class: 'volver', onclick: () => { estado.ocasiones = false; pintarTodo(); irArriba(); },
      html: svg('volver', 18) + '<span>Hoy y próximos días</span>' }),
    el('div', { class: 'cabeza-ficha' }, el('h2', {}, 'Próximas ocasiones'),
      el('p', {}, 'Lo especial de los próximos meses en todos los spots.')),
    ya.length ? seccion('Estos días: con previsión del tiempo', el('p', { class: 'nota-seccion' }, 'Toca una para ver su nota con las nubes.'),
      el('ul', { class: 'lista' }, ya.map(fila))) : null,
    luego.length ? el('p', { class: 'separador-ocasiones' }, 'Más adelante: aún sin previsión del tiempo (las nubes se saben con unos 5 días).') : null,
    ...Object.entries(porMes).map(([mes, lista]) => seccion(mayuscula(mes), el('ul', { class: 'lista' }, lista.map(fila)))),
  ].filter(Boolean);
}

// Cuánto fiarse de la previsión (Aaron, 24-10-2026): por ahora, según los
// días que faltan (cuanto más lejos, más puede cambiar). Más adelante se
// podrá afinar mirando si varios modelos del tiempo coinciden.
function hoyCanarias() {
  try { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Atlantic/Canary' }); }   // AAAA-MM-DD
  catch { return datos.dias[0]; }
}
// Con varios modelos del tiempo (decisión 47, 28-10-2026) manda lo peor de
// las dos cosas: los días que faltan y si los modelos coinciden.
const CLASES_SEGURIDAD = ['segura', 'media', 'floja'];
const TEXTO_ACUERDO = {
  alta: 'Previsión bastante segura: los modelos del tiempo coinciden',
  media: 'Previsión con dudas: los modelos del tiempo no coinciden del todo',
  baja: 'Previsión dudosa: los modelos del tiempo no se ponen de acuerdo',
};
function seguridad(dia, acuerdo) {
  const faltan = Math.round((new Date(dia + 'T12:00') - new Date(hoyCanarias() + 'T12:00')) / 86400e3);
  const porDias = faltan <= 1 ? 0 : faltan <= 3 ? 1 : 2;
  const porModelos = acuerdo ? ['alta', 'media', 'baja'].indexOf(acuerdo.nivel) : -1;
  if (porModelos >= porDias) return [CLASES_SEGURIDAD[porModelos], TEXTO_ACUERDO[acuerdo.nivel]];
  return [CLASES_SEGURIDAD[porDias], ['Previsión bastante segura', 'Previsión: puede cambiar algo',
    'Previsión: puede cambiar bastante, revísala antes de ir'][porDias]];
}

function pintarDetalle() {
  const m = datos.miradores[estado.mirador];
  const r = resultadoVisto(estado.mirador, estado.objetivo);
  const partes = [
    // Atrás: al resumen del spot (Aaron, 28-10-2026); con un filtro elegido
    // en la lista se llegó directo, así que a la lista de spots, con el mapa
    // donde está.
    estado.filtro
      ? el('button', { class: 'volver', onclick: () => { cerrarMirador(false); irArriba(); },
          html: svg('volver', 18) + `<span>${textoVolver()}</span>` })
      : el('button', { class: 'volver', onclick: () => { estado.objetivo = null; estado.luna = null; pintarTodo(); irArriba(); },
          html: svg('volver', 18) + '<span>Todas las opciones</span>' }),
    cabezaMirador(m),
    seccion('¿Cuándo?', botonesDias()),
    // Cambiar de opción sin volver al resumen (Aaron, 23-10-2026); cada una
    // con un punto de su color ese día.
    seccion('¿Qué quieres ver?', el('div', { class: 'objetivos' }, OBJETIVOS.map(o => el('button', {
      class: 'objetivo', 'aria-pressed': String(o === estado.objetivo),
      onclick: () => { estado.objetivo = o; pintarTodo(); },
    }, el('span', { class: `punto ${resultado(estado.mirador, o).color}`, title: TITULO[resultado(estado.mirador, o).color] }),
       el('span', { html: svg(o, 22) }), CORTO[o] || o)))),
  ];

  // Luna: salida y puesta del día, con su nota; se ve la propuesta y se puede
  // tocar la otra (Aaron, 24-10-2026).
  if (estado.objetivo === 'Salida de luna') {
    const propuesta = resultado(estado.mirador, estado.objetivo);
    const opciones = [propuesta, propuesta.otra].filter(x => x && x.hora)
      .sort((x, y) => (x.luna_pone ? 0 : 1) - (y.luna_pone ? 0 : 1));    // el día: primero la puesta del alba
    const boton = x => el('button', { class: 'opcion-luna', 'aria-pressed': String(tipoLuna(x) === tipoLuna(r)),
      onclick: () => { estado.luna = tipoLuna(x); pintarTodo(); } },
      el('strong', {}, `${mayuscula(tipoLuna(x))} ${x.hora}`),
      el('span', {}, [x.color === 'pasado' ? 'ya pasó' : x.puntos != null ? `${coma(x.puntos)}/10` : TITULO[x.color], x.marca].filter(Boolean).join(' ')));
    if (opciones.length) partes.push(opciones.length > 1
      ? el('div', { class: 'selector-luna' }, opciones.map(boton))
      : el('p', { class: 'nota-seccion' }, `Ese día solo se ve ${r.luna_pone ? 'ponerse' : 'salir'}: ` +
          `${r.luna_pone ? 'la salida' : 'la puesta'} la tapa el relieve o cae fuera del día.`));
  }

  // Tarjeta del estado: veredicto, hora, nota y datos clave.
  const datosEstado = [];
  if (r.prob_nubes != null) datosEstado.push(el('span', { class: 'dato', html: svg('nube', 15) + `<span>${r.prob_nubes} % de que las nubes ${TAPAN[estado.objetivo]}</span>` }));
  if (r.prob_nubes != null && r.color !== 'pasado') {
    const [clase, texto] = seguridad(estado.dia, r.acuerdo);
    datosEstado.push(el('span', { class: `dato seguridad ${clase}`, html: svg('reloj', 15) + `<span>${texto}</span>` }));
  }
  if (r.marca === '⭐') datosEstado.push(el('span', { class: 'dato ideal', html: svg('chispa', 15) + '<span>Momento ideal</span>' }));
  // El Teide cuenta ese día en el paisaje (despejado y aire limpio).
  const paisaje = (r.partes || []).find(p => p.parte === 'Paisaje') || r.paisaje;
  const hayPaisaje = paisaje && (paisaje.nota ?? paisaje.pct) > 0;
  const enPaisaje = t => hayPaisaje && paisaje.claves.some(c => c.includes(t));
  // «Teide despejado» o, si no es seguro, con qué probabilidad se verá.
  const teideClave = hayPaisaje && paisaje.claves.find(c => c.includes('Teide'));
  if (teideClave)
    datosEstado.push(el('span', { class: 'dato teide-dato' }, el('span', { class: 'triangulo' }),
      el('span', {}, mayuscula(teideClave.replace(/^el /, '')))));
  if (enPaisaje('mar de nubes'))
    datosEstado.push(el('span', { class: 'dato', html: svg('nube', 15) + '<span>Mar de nubes debajo</span>' }));
  const lluvia = (r.desglose || []).find(d => d.factor === 'Lluvia de estrellas');
  if (lluvia) datosEstado.push(el('span', { class: 'dato ideal', html: svg('meteoro', 15) + `<span>${lluvia.texto.split(' (')[0]}</span>` }));
  if (r.marca === '🎨') datosEstado.push(el('span', { class: 'dato ideal', html: svg('paleta', 15) + '<span>El cielo puede encenderse</span>' }));
  partes.push(el('div', { class: `estado ${r.color}` },
    el('div', { class: 'fila-estado' },
      el('div', {}, el('h3', {}, TITULO[r.color]),
        el('span', { class: 'hora' }, textoHora(estado.objetivo, r))),
      r.puntos != null ? el('div', { class: 'nota-puntos' }, el('strong', {}, coma(r.puntos)), el('span', {}, 'de 10')) : null),
    datosEstado.length ? el('div', { class: 'datos-estado' }, datosEstado) : null));
  partes.push(acciones(m, r));
  // Notas y fotos de la gente que fue (decisión 45, en valoraciones.js): si
  // ya pasó, el formulario rellenado con este evento.
  if (r.color === 'pasado') partes.push(botonMejorar({ spot: estado.mirador, dia: estado.dia, objetivo: estado.objetivo }));
  const gente = cajaGente(estado.mirador, estado.dia, estado.objetivo, r);
  if (gente) partes.push(gente);
  const fotos = cajaGaleria(estado.mirador, estado.objetivo);     // de cualquier día
  if (fotos) partes.push(fotos);

  if (r.momentos && r.momentos.length) {
    partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Tu plan'),
      el('ul', { class: 'momentos' }, r.momentos.map(t => el('li', { class: t.startsWith('mejor') ? 'mejor' : '' },
        el('span', { class: 'icono', html: svg(t.startsWith('mejor') ? 'chispa' : 'reloj', 15) }),
        el('span', {}, mayuscula(t)))))));
  }
  if (r.consejo) {
    partes.push(el('div', { class: 'caja consejo' },
      el('span', { class: 'titulo-consejo', html: svg('movil', 18) + '<span>Nota para fotografiar con el móvil</span>' }),
      el('p', {}, r.consejo)));
  }

  // Solo si en algún momento se ve (500 escalones al amanecer: el acantilado
  // lo tapa todo y la vista sería una pared).
  const seVe = (r.camino || []).some(([, az, h]) => h >= m.horizonte[Math.round(az) % 360]);
  if (seVe) {
    const frente = pintarFrente(m, r, estado.objetivo);
    partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Lo que verás'),
      el('div', { class: 'frente', html: frente.svg }),
      el('p', { class: 'nota' }, `De frente, mirando hacia el ${frente.rumbo}. Cada punto marca dónde estará ` +
        `${estado.objetivo === 'Salida de luna' ? 'la luna' : 'el sol'} cada 5 minutos; los huecos, cuando lo tapa el relieve. ` +
        `La línea discontinua es la horizontal${frente.exagera > 1 ? `; alturas ×${frente.exagera} para que se vea bien` : ''}.` +
        (frente.hayNubes ? ' Las nubes, donde las pone la previsión a esa hora: más opacas cuanto más probables.' : '') +
        (frente.hayCalima ? ` Los puntitos marrones son calima (turbidez ${coma(r.aod)}): el horizonte se verá borroso.` : ''))));
  }

  const dibujo = el('div', { class: 'dibujo', html: pintarRueda(m, r.azimut) });
  const lectura = el('p', { class: 'lectura', 'aria-live': 'polite' });
  conectarRueda(dibujo, lectura, m, r.azimut);
  partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Su horizonte: tú en el centro'), dibujo, lectura,
    el('p', { class: 'ayuda-rueda' }, 'Arrastra la bolita para ver qué hay en cada dirección.'),
    el('p', { class: 'nota' }, 'Visto desde arriba, con el norte arriba como en el mapa. ' +
      (r.azimut != null ? `La flecha marca hacia dónde ${verbo(estado.objetivo, r)} (${rumbo(r.azimut)}). ` : '') +
      'El círculo discontinuo es la horizontal: el verde que sobresale es relieve que te tapa; el azul, el mar. Alturas exageradas.')));

  // ¿Cómo se calcula la nota? (Aaron, 23-10-2026): tabla con los puntos de
  // cada factor; sin nota (estrellas o si no se ve), las frases de siempre.
  const tabla = r.partes ? tablaPartes(r) : r.desglose ? tablaNota(r) : el('ul', { class: 'porque' }, r.porque.map(t => el('li', {}, mayuscula(t))));
  // Qué dice cada modelo del tiempo (decisión 47).
  const modelos = r.acuerdo && r.acuerdo.modelos ? el('p', { class: 'explica-modelos' },
    'Nubes bajas según cada modelo del tiempo: ' +
    Object.entries(r.acuerdo.modelos).map(([m, v]) => `${m} ${v} %`).join(', ') +
    '. Usamos los cinco: la media para las nubes bajas y, para los colores, cuántos modelos los dan.') : null;
  const lista = el('div', {}, tabla, modelos);
  lista.hidden = true;
  const boton = el('button', { class: 'boton', 'aria-expanded': 'false', onclick: () => {
    const abrir = lista.hidden; lista.hidden = !abrir; boton.setAttribute('aria-expanded', String(abrir));
  }, html: '<span>¿Cómo se calcula la nota?</span>' + svg('abajo', 18) });
  partes.push(el('div', { class: 'caja' }, boton, lista));

  const alternativas = [];
  if (r.otro_mirador) alternativas.push(...otrosSpots(r.otro_mirador).map(([clave, texto]) =>
    alternativa('Ese mismo día, desde otro spot', texto, clave, estado.dia)));
  // Si el otro día bueno y el momento ideal coinciden, una sola vez.
  if (r.otro_dia && r.otro_dia === r.ideal) {
    alternativas.push(alternativa('Desde aquí, otro día (momento ideal)', r.otro_dia, estado.mirador, diaDe(r.otro_dia)));
  } else {
    if (r.otro_dia) alternativas.push(alternativa('Desde aquí, otro día', r.otro_dia, estado.mirador, diaDe(r.otro_dia)));
    if (r.ideal) alternativas.push(alternativa('Momento ideal más cercano', r.ideal, estado.mirador, diaDe(r.ideal)));
  }
  if (alternativas.length) partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Alternativas'), ...alternativas));
  partes.push(el('p', { class: 'pie' }, `El tiempo es una previsión y puede cambiar: revísalo el mismo día. Previsión del ${datos.generado}.`, sinTiempo()));
  return partes;
}

// Se abre en el resumen y en el día que estuviera elegido (Aaron, 23-10-2026).
// objetivo: desde la lista se entra directo a lo mejor de ese día (Aaron,
// 23-10-2026); desde el mapa, al resumen con las cuatro opciones.
// Tarjeta de una alternativa (Aaron, 28-10-2026: al tocarla, te lleva a
// ella). Solo se puede tocar si ese día tiene datos (los próximos 6 días); si
// es más adelante, se queda como texto porque aún no hay nada que enseñar.
function alternativa(titulo, texto, clave, dia) {
  const contenido = [el('strong', {}, titulo), el('span', {}, texto)];
  if (!dia || !datos.dias.includes(dia)) {
    if (dia) contenido.push(el('span', { class: 'aun-no' }, 'Se podrá abrir cuando haya previsión (unos 5 días antes).'));
    return el('div', { class: 'alternativa' }, ...contenido);
  }
  const objetivo = estado.objetivo;
  return el('button', { class: 'alternativa tocable', onclick: () => { estado.dia = dia; abrirMirador(clave, objetivo); } },
    el('span', { class: 'texto' }, ...contenido), el('span', { class: 'ir', html: svg('abajo', 18) }));
}

// «12-11-2026 (07:15) ⭐» → '2026-11-12'.
function diaDe(texto) {
  const m = /(\d\d)-(\d\d)-(\d{4})/.exec(texto);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// «Jardina (Anaga) (07:11), Igueque (TF-24, cumbre) (07:20)» → una pareja
// [clave, texto] por spot. Se busca por el nombre porque los nombres también
// llevan comas y no se puede partir por ellas.
function otrosSpots(texto) {
  const sitios = Object.entries(datos.miradores)
    .map(([clave, m]) => [clave, texto.indexOf(m.nombre)]).filter(([, i]) => i >= 0)
    .sort((a, b) => a[1] - b[1]);
  if (!sitios.length) return [[null, texto]];
  return sitios.map(([clave, i], n) => [clave,
    texto.slice(i, n + 1 < sitios.length ? sitios[n + 1][1] : undefined).replace(/,\s*$/, '')]);
}

function abrirMirador(clave, objetivo = null) {
  estado.mirador = clave;
  estado.luna = null;
  estado.objetivo = objetivo;
  plegar(false);
  pintarTodo();
  const m = datos.miradores[clave];
  centrarEn(m.lat, m.lon, Math.max(mapa.getZoom(), 12));
  irArriba();
}

function irArriba() {
  document.getElementById('contenido').scrollTop = 0;
}

// moverMapa: false para dejar el mapa donde está (al tocar el mapa).
function cerrarMirador(moverMapa = true) {
  estado.mirador = null; estado.objetivo = null;
  pintarTodo();
  if (moverMapa) verTenerife();
  // En el móvil el panel se encoge al cerrar el spot: cuando acabe, se mira
  // otra vez qué spots quedan a la vista.
  else setTimeout(refrescarLista, 400);
}

// Esconder el panel para ver el mapa entero (y volver a sacarlo).
// Deslizar el panel con el dedo (móvil), arrastrando su barra de arriba:
// manda la dirección del gesto, no dónde se suelta (Aaron, 23-10-2026): hacia
// abajo baja un escalón (grande → normal → recogido) y hacia arriba sube uno.
let arrastrado = 0;     // cuándo acabó el último arrastre (para no tomarlo por un toque)

function conectarDeslizar() {
  const panel = document.getElementById('panel'), barra = panel.querySelector('.cabecera');
  let inicioY = null, inicioAlto = 0, movido = false, ultimoY = 0, desde = 'normal';
  barra.addEventListener('pointerdown', e => {
    if (esOrdenador()) return;
    inicioY = ultimoY = e.clientY; inicioAlto = panel.offsetHeight; movido = false;
    desde = panel.classList.contains('plegado') ? 'plegado'
      : panel.classList.contains('grande') ? 'grande' : 'normal';
  });
  barra.addEventListener('pointermove', e => {
    if (inicioY === null) return;
    const dy = e.clientY - inicioY;
    ultimoY = e.clientY;
    if (!movido && Math.abs(dy) < 8) return;       // aún puede ser un toque
    if (!movido) {
      movido = true;
      // Solo ahora: un toque sin mover sigue llegando al botón "Ver mapa".
      try { barra.setPointerCapture(e.pointerId); } catch { /* puntero ya suelto */ }
      panel.classList.add('arrastrando');
      panel.classList.remove('plegado');
    }
    const alto = Math.min(window.innerHeight * 0.92, Math.max(barra.offsetHeight, inicioAlto - dy));
    panel.style.maxHeight = panel.style.height = `${alto}px`;
  });
  const soltar = () => {
    if (inicioY === null) return;
    const abajo = ultimoY > inicioY;     // antes de olvidar dónde empezó
    inicioY = null;
    if (!movido) return;
    arrastrado = Date.now();
    const alto = panel.offsetHeight, pantalla = window.innerHeight;
    const normal = pantalla * (panel.classList.contains('con-ficha') ? 0.72 : 0.48);
    panel.classList.remove('arrastrando');
    panel.style.maxHeight = panel.style.height = '';
    // Si desde grande lo bajas por debajo del tamaño normal, se recoge del todo.
    const destino = abajo
      ? (desde === 'grande' && alto > normal * 0.8 ? 'normal' : 'plegado')
      : (desde === 'plegado' && alto < (normal + pantalla * 0.92) / 2 ? 'normal' : 'grande');
    plegar(destino === 'plegado');
    panel.classList.toggle('grande', destino === 'grande');
  };
  barra.addEventListener('pointerup', soltar);
  barra.addEventListener('pointercancel', soltar);
}

function plegar(si) {
  const panel = document.getElementById('panel'), boton = document.getElementById('plegar');
  panel.classList.toggle('plegado', si);
  if (si) panel.classList.remove('grande');
  boton.textContent = si ? 'Mostrar panel' : 'Ver mapa';
  boton.setAttribute('aria-expanded', String(!si));
  refrescarLista();      // cambia la parte del mapa que se ve
}

function pintarTodo() {
  pintarMapa();
  // En el móvil, con un mirador abierto el panel sube más: la nota y Tu plan
  // se ven sin deslizar.
  document.getElementById('panel').classList.toggle('con-ficha', Boolean(estado.mirador));
  document.getElementById('contenido').replaceChildren(...(estado.mejorar ? pintarMejorar()
    : estado.mirador ? pintarMirador() : estado.ocasiones ? pintarOcasiones() : pintarLista()));
  guardarEnlace();
}

// --- Cómo funciona (Aaron, 24-10-2026) ---------------------------------------
// Cuatro pantallas cortas la primera vez que se abre la web; luego, con el
// botón «?» de arriba. Se recuerda en este navegador que ya se vio.
const AYUDA = [
  { icono: 'Atardecer', titulo: '¿Merece la pena ir?',
    texto: 'Horizonte te dice, para hoy y los próximos días, si merece la pena ir a cada spot de Tenerife a ver la salida de la luna, el atardecer, el amanecer o las estrellas.',
    puntos: [['verde', 'Merece la pena'], ['amarillo', 'Regular'], ['rojo', 'No merece la pena']],
    pie: 'Cada opción tiene una nota de 0 a 10. Elige el día arriba: la lista te enseña lo mejor de cada spot, de mejor a peor.' },
  { icono: 'mapa', titulo: 'Toca un spot',
    texto: 'En el mapa o en la lista. Verás sus cuatro opciones con su nota; toca una para ver el plan: a qué hora ir, qué pasará y una nota para hacer la foto con el móvil.',
    pie: '«Avísame» lo apunta en tu calendario, «Cómo llegar» abre la ruta y «Compartir» lo manda por WhatsApp.' },
  { icono: 'ruta', titulo: 'Lo que verás',
    texto: 'Un dibujo del horizonte de frente, como por la cámara: por dónde saldrá o se pondrá el sol o la luna cada 5 minutos, las nubes que da la previsión y la calima.',
    pie: 'Debajo, la rueda: todo tu horizonte visto desde arriba, con lo que tapa cada dirección (arrastra la bolita).' },
  { icono: 'nube', titulo: 'De dónde sale la nota',
    texto: 'En amaneceres y atardeceres mira tres cosas: que el cielo se encienda de colores, que el sol toque algo bonito (el mar, el Teide…) y que luzca el paisaje. Basta con que una salga bien: un cielo bonito compensa que no se vea el sol, y al revés. Las nubes y la calima vienen de la previsión, fiable unos 5 días.',
    pie: 'Para más adelante, mira «Próximas ocasiones»: lunas llenas, lluvias de estrellas, la Vía Láctea… Instálala en el móvil: funciona sin cobertura.' },
];
const AYUDA_VISTA = 'horizonte-ayuda-vista';

function mostrarAyuda(paso = 0) {
  document.querySelector('.ayuda-fondo')?.remove();
  const p = AYUDA[paso], ultimo = paso === AYUDA.length - 1;
  const cerrar = () => {
    fondo.remove();
    try { localStorage.setItem(AYUDA_VISTA, '1'); } catch { /* sin almacenamiento: se volverá a ver */ }
  };
  const fondo = el('div', { class: 'ayuda-fondo', onclick: e => { if (e.target === fondo) cerrar(); } },
    el('div', { class: 'ayuda-caja', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Cómo funciona' },
      el('span', { class: 'ayuda-icono', html: svg(p.icono, 28) }),
      el('h2', {}, p.titulo),
      el('p', {}, p.texto),
      p.puntos ? el('div', { class: 'ayuda-colores' }, p.puntos.map(([c, t]) => el('span', { class: `pastilla ${c}` }, t))) : null,
      el('p', { class: 'ayuda-pie' }, p.pie),
      el('div', { class: 'ayuda-pasos' }, AYUDA.map((_, i) => el('span', { class: i === paso ? 'activo' : '' }))),
      el('div', { class: 'ayuda-botones' },
        ultimo ? null : el('button', { class: 'ayuda-saltar', onclick: cerrar }, 'Saltar'),
        el('button', { class: 'ayuda-siguiente', onclick: () => ultimo ? cerrar() : mostrarAyuda(paso + 1) },
          ultimo ? 'Empezar' : 'Siguiente'))));
  document.body.append(fondo);
}

function ayudaPrimeraVez() {
  let vista = false;
  try { vista = localStorage.getItem(AYUDA_VISTA) === '1'; } catch { /* sin almacenamiento */ }
  if (!vista) mostrarAyuda();
}

// --- Sin conexión (punto 4, 23-10-2026) --------------------------------------
// El trabajador (sw.js) guarda la web, los datos y el mapa visto. Además le
// pedimos el mapa de relieve alrededor de cada mirador (zoom 12 a 14), para
// tenerlo en el mirador aunque no se haya mirado antes.
function teselasDeLosMiradores() {
  const urls = [];
  for (const m of Object.values(datos.miradores)) {
    for (const z of [12, 13, 14]) {
      const n = 2 ** z, x = Math.floor((m.lon + 180) / 360 * n);
      const lat = m.lat * Math.PI / 180;
      const y = Math.floor((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2 * n);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        urls.push(`https://${'abc'[(x + dx + y + dy) % 3]}.tile.opentopomap.org/${z}/${x + dx}/${y + dy}.png`);
      }
    }
  }
  return urls;
}

function prepararSinConexion() {
  if (!('serviceWorker' in navigator)) return;
  // updateViaCache 'none': buscar el trabajador nuevo sin esperar a la caché
  // del navegador (GitHub la deja 10 min).
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(() => navigator.serviceWorker.ready)
    .then(reg => reg.active && reg.active.postMessage({ tipo: 'guardar-teselas', urls: teselasDeLosMiradores() }))
    .catch(() => { /* sin trabajador: la web sigue funcionando con red */ });
  // Versión nueva publicada: el trabajador nuevo toma el mando y la página se
  // recarga sola (si no, una pestaña abierta seguía con la vieja; Aaron,
  // 24-10-2026). Al volver a la pestaña se mira si hay versión nueva.
  const habiaTrabajador = Boolean(navigator.serviceWorker.controller);
  let recargando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!habiaTrabajador || recargando) return;
    recargando = true;
    location.reload();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible')
      navigator.serviceWorker.getRegistration().then(reg => reg && reg.update()).catch(() => {});
  });
  // Al perder o recuperar la red, actualizar el aviso.
  addEventListener('online', pintarTodo);
  addEventListener('offline', pintarTodo);
}

// --- Arranque ----------------------------------------------------------------
fetch('datos.json', { cache: 'no-cache' })
  .then(r => r.json())
  .then(d => {
    datos = d;
    estado.dia = datos.dias[0];
    cargarOpiniones();
    cargarGaleria();
    leerEnlace();
    iniciarMapa();
    document.getElementById('ayuda').addEventListener('click', e => { e.stopPropagation(); mostrarAyuda(); });
    document.getElementById('plegar').addEventListener('click', e => {
      e.stopPropagation();
      plegar(!document.getElementById('panel').classList.contains('plegado'));
    });
    // Tocar la barra del panel recogido lo vuelve a abrir.
    // Tocar el mapa (Aaron, 23-10-2026): con un mirador abierto, se
    // deselecciona y el panel vuelve a la lista (sin esconderse ni mover el
    // mapa); sin mirador abierto, en el móvil se esconde el panel. En el
    // ordenador el panel solo se cierra con su botón.
    mapa.on('click', () => {
      if (estado.mirador) cerrarMirador(false);
      else if (estado.ocasiones) { estado.ocasiones = false; pintarTodo(); irArriba(); }   // a los spots
      else if (!esOrdenador()) plegar(true);
    });
    document.querySelector('.cabecera').addEventListener('click', () => {
      if (Date.now() - arrastrado < 400) return;      // era un deslizamiento, no un toque
      if (document.getElementById('panel').classList.contains('plegado')) plegar(false);
    });
    conectarDeslizar();
    pintarTodo();
    ayudaPrimeraVez();
    prepararSinConexion();
    if (estado.mirador) {
      const m = datos.miradores[estado.mirador];
      centrarEn(m.lat, m.lon, 12);
    } else {
      verTenerife();
    }
  })
  .catch(() => {
    document.getElementById('contenido').replaceChildren(el('p', { class: 'nota' }, 'No se han podido cargar los datos.'));
  });
