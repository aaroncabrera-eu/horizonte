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
};
function svg(nombre, tam = 20) {
  return `<svg aria-hidden="true" width="${tam}" height="${tam}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONOS[nombre]}</svg>`;
}

const OBJETIVOS = ['Salida de luna', 'Atardecer', 'Amanecer', 'Estrellas'];
const CORTO = { 'Salida de luna': 'Luna' };
const EN_ENLACE = { 'Salida de luna': 'luna', 'Atardecer': 'atardecer', 'Amanecer': 'amanecer', 'Estrellas': 'estrellas' };
const TITULO = { verde: 'Merece la pena', amarillo: 'Regular', rojo: 'No merece la pena' };
const ORDEN = { verde: 0, amarillo: 1, rojo: 2 };
const VERBO = { 'Salida de luna': 'sale la luna', 'Atardecer': 'se pone el sol',
                'Amanecer': 'sale el sol', 'Estrellas': 'sin luna' };
const RUMBOS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];
function rumbo(az) { return RUMBOS[Math.round(az / 22.5) % 16]; }
const TENERIFE = [[27.99, -16.93], [28.60, -16.11]];

let datos, mapa, capaMiradores;
const estado = { dia: null, mirador: null, objetivo: null };

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

function resultado(clave, objetivo) {
  return datos.miradores[clave].dias[estado.dia][objetivo];
}

// Lo mejor que se puede ver en un mirador ese día: primero por color, luego
// si tiene ⭐ o 🎨, y si empatan, en el orden de OBJETIVOS.
function mejorObjetivo(clave) {
  return OBJETIVOS.map((o, i) => ({ o, i, r: resultado(clave, o) }))
    .sort((a, b) => ORDEN[a.r.color] - ORDEN[b.r.color] ||
                    (b.r.marca ? 1 : 0) - (a.r.marca ? 1 : 0) || a.i - b.i)[0];
}

// --- Enlace: #mirador/fecha/objetivo -----------------------------------------
function guardarEnlace() {
  const partes = estado.mirador ? [estado.mirador, estado.dia, EN_ENLACE[estado.objetivo]] : [];
  history.replaceState(null, '', partes.length ? '#' + partes.join('/') : location.pathname);
}
function leerEnlace() {
  const [mirador, dia, objetivo] = decodeURIComponent(location.hash.slice(1)).split('/');
  if (datos.dias.includes(dia)) estado.dia = dia;
  if (mirador in datos.miradores) {
    estado.mirador = mirador;
    estado.objetivo = OBJETIVOS.find(o => EN_ENLACE[o] === objetivo) || mejorObjetivo(mirador).o;
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
  const relieve = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    maxZoom: 17, className: 'fondo-suave', attribution: '© OpenStreetMap, SRTM · © OpenTopoMap (CC-BY-SA)' });
  const satelite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
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
  mapa.fitBounds(TENERIFE);
  nombres();
}

function pintarMapa() {
  capaMiradores.clearLayers();
  for (const [clave, m] of Object.entries(datos.miradores)) {
    const elegido = clave === estado.mirador;
    // Línea hacia donde sale o se pone lo elegido, solo en el mirador abierto.
    if (elegido) {
      const r = resultado(clave, estado.objetivo);
      if (r.azimut != null) {
        L.polyline([[m.lat, m.lon], destino(m.lat, m.lon, r.azimut, 60)], {
          color: '#1D4E6B', weight: 4, opacity: 0.9, dashArray: '8 6' })
          .bindTooltip(`${mayuscula(VERBO[estado.objetivo])}${r.hora ? ' · ' + r.hora : ''}`, {
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
      .bindTooltip(partesNombre(m.nombre)[0], { permanent: true, direction: vecino ? 'left' : 'right',
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
      onclick: () => { estado.dia = d; pintarTodo(); } }, el('span', {}, arriba), el('strong', {}, numero));
  }));
}

// La pastilla: el color en palabras y, si hay puntuación, la nota.
function pastilla(r) {
  return el('span', { class: `pastilla ${r.color}` },
    r.puntos != null ? `${coma(r.puntos)}/10` : TITULO[r.color]);
}

// --- Vista lista: lo mejor de cada mirador ese día ---------------------------
// Si Open-Meteo no respondió al calcular, las notas no cuentan las nubes.
function sinTiempo() {
  return datos.sin_tiempo ? el('strong', { class: 'sin-tiempo' }, ' Ojo: esta vez no se pudo consultar la previsión del tiempo; las notas suponen el cielo despejado.') : null;
}

function pintarLista() {
  const filas = Object.keys(datos.miradores)
    .map(clave => ({ clave, mejor: mejorObjetivo(clave) }))
    .sort((a, b) => ORDEN[a.mejor.r.color] - ORDEN[b.mejor.r.color] ||
                    (b.mejor.r.marca ? 1 : 0) - (a.mejor.r.marca ? 1 : 0));
  return [
    seccion('¿Cuándo?', botonesDias()),
    seccion('Lo mejor de cada mirador', el('ul', { class: 'lista' }, filas.map(({ clave, mejor }) => {
      const m = datos.miradores[clave], r = mejor.r;
      const sub = r.color === 'rojo' ? 'Nada destacable ese día'
        : `${CORTO[mejor.o] || mejor.o}${r.hora ? ' · ' + r.hora : ''}${r.marca ? ' ' + r.marca : ''}`;
      return el('li', {}, el('button', { class: 'fila', onclick: () => abrirMirador(clave, mejor.o) },
        el('span', { class: 'icono-obj', html: svg(mejor.o, 20) }),
        el('span', { class: 'texto' }, el('span', { class: 'titulo' }, partesNombre(m.nombre)[0]), el('span', { class: 'sub' }, sub)),
        pastilla(r)));
    }))),
    el('p', { class: 'pie' }, `Toca un localizador o un mirador para ver el plan. Previsión del ${datos.generado}.`, sinTiempo()),
  ];
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
    ${letras}${flecha}
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
function conectarRueda(dibujo, lectura, m) {
  const mover = ev => {
    const caja = dibujo.querySelector('svg').getBoundingClientRect();
    const dx = ev.clientX - (caja.left + caja.width / 2), dy = ev.clientY - (caja.top + caja.height / 2);
    if (Math.hypot(dx, dy) < caja.width * 0.1) return;      // encima de ti: sin dirección
    const az = (Math.round(Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;
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
}

// --- Vista mirador: elegir qué ver y el plan ---------------------------------
function pintarMirador() {
  const m = datos.miradores[estado.mirador];
  const r = resultado(estado.mirador, estado.objetivo);
  const [titulo, lugar] = partesNombre(m.nombre);
  const partes = [
    el('button', { class: 'volver', onclick: () => cerrarMirador(), html: svg('volver', 18) + '<span>Todos los miradores</span>' }),
    el('div', { class: 'cabeza-ficha' }, el('h2', {}, titulo),
      el('p', {}, [lugar, `${m.altitud} m`, `luz de ciudad: zona ${m.zona_luz}`].filter(Boolean).join(' · '))),
    seccion('¿Cuándo?', botonesDias()),
    // Cada opción lleva un punto con su color ese día: se ve cuál está mejor.
    seccion('¿Qué quieres ver?', el('div', { class: 'objetivos' }, OBJETIVOS.map(o => el('button', {
      class: 'objetivo', 'aria-pressed': String(o === estado.objetivo),
      onclick: () => { estado.objetivo = o; pintarTodo(); },
    }, el('span', { class: `punto ${resultado(estado.mirador, o).color}`, title: TITULO[resultado(estado.mirador, o).color] }),
       el('span', { html: svg(o, 22) }), CORTO[o] || o)))),
  ];

  // Tarjeta del estado: veredicto, hora, nota y datos clave.
  const datosEstado = [];
  if (r.prob_nubes != null) datosEstado.push(el('span', { class: 'dato', html: svg('nube', 15) + `<span>${r.prob_nubes} % de que ${estado.objetivo === 'Salida de luna' ? 'la' : 'lo'} tapen las nubes</span>` }));
  if (r.marca === '⭐') datosEstado.push(el('span', { class: 'dato ideal', html: svg('chispa', 15) + '<span>Momento ideal</span>' }));
  if (r.marca === '🎨') datosEstado.push(el('span', { class: 'dato ideal', html: svg('paleta', 15) + '<span>El cielo puede encenderse</span>' }));
  partes.push(el('div', { class: `estado ${r.color}` },
    el('div', { class: 'fila-estado' },
      el('div', {}, el('h3', {}, TITULO[r.color]),
        el('span', { class: 'hora' }, r.hora ? `${mayuscula(VERBO[estado.objetivo])} a las ${r.hora}` : 'Ese día no se ve desde aquí')),
      r.puntos != null ? el('div', { class: 'nota-puntos' }, el('strong', {}, coma(r.puntos)), el('span', {}, 'de 10')) : null),
    datosEstado.length ? el('div', { class: 'datos-estado' }, datosEstado) : null));

  if (r.momentos && r.momentos.length) {
    partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Tu plan'),
      el('ul', { class: 'momentos' }, r.momentos.map(t => el('li', { class: t.startsWith('mejor') ? 'mejor' : '' },
        el('span', { class: 'icono', html: svg(t.startsWith('mejor') ? 'chispa' : 'reloj', 15) }),
        el('span', {}, mayuscula(t)))))));
  }
  if (r.consejo) {
    partes.push(el('div', { class: 'caja consejo' },
      el('span', { class: 'titulo-consejo', html: svg('movil', 18) + '<span>Con el móvil</span>' }),
      el('p', {}, r.consejo)));
  }

  const dibujo = el('div', { class: 'dibujo', html: pintarRueda(m, r.azimut) });
  const lectura = el('p', { class: 'lectura', 'aria-live': 'polite' }, 'Toca alrededor de la rueda para ver qué hay en cada dirección.');
  conectarRueda(dibujo, lectura, m);
  partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Su horizonte: tú en el centro'), dibujo, lectura,
    el('p', { class: 'nota' }, 'Visto desde arriba, con el norte arriba como en el mapa. ' +
      (r.azimut != null ? `La flecha marca hacia dónde ${VERBO[estado.objetivo]} (${rumbo(r.azimut)}). ` : '') +
      'El círculo discontinuo es la horizontal: el verde que sobresale es relieve que te tapa; el azul, el mar. Alturas exageradas.')));

  const lista = el('ul', { class: 'porque', hidden: '' }, r.porque.map(t => el('li', {}, mayuscula(t))));
  const boton = el('button', { class: 'boton', 'aria-expanded': 'false', onclick: () => {
    const abrir = lista.hidden; lista.hidden = !abrir; boton.setAttribute('aria-expanded', String(abrir));
  }, html: '<span>¿Por qué?</span>' + svg('abajo', 18) });
  partes.push(el('div', { class: 'caja' }, boton, lista));

  const alternativas = [];
  if (r.otro_mirador) alternativas.push(el('div', { class: 'alternativa' }, el('strong', {}, 'Ese mismo día, desde otro mirador'), r.otro_mirador));
  if (r.otro_dia) alternativas.push(el('div', { class: 'alternativa' }, el('strong', {}, 'Desde aquí, otro día'), r.otro_dia));
  if (r.ideal) alternativas.push(el('div', { class: 'alternativa' }, el('strong', {}, 'Momento ideal más cercano'), r.ideal));
  if (alternativas.length) partes.push(el('div', { class: 'caja' }, el('h4', {}, 'Alternativas'), ...alternativas));
  partes.push(el('p', { class: 'pie' }, `El tiempo es una previsión y puede cambiar: revísalo el mismo día. Previsión del ${datos.generado}.`, sinTiempo()));
  return partes;
}

function abrirMirador(clave, objetivo) {
  estado.mirador = clave;
  estado.objetivo = objetivo || mejorObjetivo(clave).o;   // por defecto, lo mejor
  plegar(false);
  pintarTodo();
  const m = datos.miradores[clave];
  centrarEn(m.lat, m.lon, Math.max(mapa.getZoom(), 12));
  document.getElementById('contenido').scrollTop = 0;
}

// moverMapa: false para dejar el mapa donde está (al tocar el mapa).
function cerrarMirador(moverMapa = true) {
  estado.mirador = null; estado.objetivo = null;
  pintarTodo();
  if (moverMapa) verTenerife();
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
}

function pintarTodo() {
  pintarMapa();
  // En el móvil, con un mirador abierto el panel sube más: la nota y Tu plan
  // se ven sin deslizar.
  document.getElementById('panel').classList.toggle('con-ficha', Boolean(estado.mirador));
  document.getElementById('contenido').replaceChildren(...(estado.mirador ? pintarMirador() : pintarLista()));
  guardarEnlace();
}

// --- Arranque ----------------------------------------------------------------
fetch('datos.json', { cache: 'no-cache' })
  .then(r => r.json())
  .then(d => {
    datos = d;
    estado.dia = datos.dias[0];
    leerEnlace();
    iniciarMapa();
    document.getElementById('plegar').addEventListener('click', e => {
      e.stopPropagation();
      plegar(!document.getElementById('panel').classList.contains('plegado'));
    });
    // Tocar la barra del panel recogido lo vuelve a abrir.
    // Tocar el mapa (Aaron, 23-10-2026): se cierra el panel y, si había un
    // mirador abierto, se deselecciona; el mapa se queda donde estaba.
    mapa.on('click', () => {
      plegar(true);
      if (estado.mirador) cerrarMirador(false);
    });
    document.querySelector('.cabecera').addEventListener('click', () => {
      if (Date.now() - arrastrado < 400) return;      // era un deslizamiento, no un toque
      if (document.getElementById('panel').classList.contains('plegado')) plegar(false);
    });
    conectarDeslizar();
    pintarTodo();
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
