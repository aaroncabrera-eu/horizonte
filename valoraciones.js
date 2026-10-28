// La gente que fue pone su nota y una foto (decisión 45, 28-10-2026).
// Se guarda en Supabase: la web solo puede AÑADIR votos y leer el resumen
// (votos, media y fotos aprobadas); las reglas están en supabase_sql/.
// La clave de aquí es pública a propósito: sin las reglas no sirve de nada.
const SUPABASE = 'https://vsdnwwnsoluftmpxcatp.supabase.co';
const SUPABASE_CLAVE = 'sb_publishable_4Z8ASKaoPrMF0EkSNl7v7w_fvIa4yGt';
const CABECERAS = { apikey: SUPABASE_CLAVE, Authorization: 'Bearer ' + SUPABASE_CLAVE };
const FOTO_LADO = 1600;            // px del lado largo: suficiente y pesa poco
const DIAS_ATRAS = 3;              // hasta cuándo se puede valorar (Aaron: más reciente, más preciso)

let opiniones = {};                // 'spot|fecha|objetivo' → {votos, media, fotos}
const claveEvento = (spot, dia, objetivo) => `${spot}|${dia}|${objetivo}`;

// Lo guardado en el móvil (puede fallar en modo privado: entonces no pasa nada).
function leerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch { /* sin memoria */ } }

// Un número al azar por móvil para no votar dos veces lo mismo. No dice
// quién eres: solo distingue un móvil de otro.
function dispositivo() {
  let id = leerLocal('horizonte-dispositivo');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : '10000000-1000-4000-8000-100000000000'
      .replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
    guardarLocal('horizonte-dispositivo', id);
  }
  return id;
}

// Resumen de los días que enseña la web. Si falla (sin red), sin opiniones.
async function cargarOpiniones() {
  try {
    const resp = await fetch(`${SUPABASE}/rest/v1/rpc/resumen_valoraciones`, {
      method: 'POST', headers: { ...CABECERAS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ desde: datos.dias[0] }) });
    if (!resp.ok) return;
    opiniones = {};
    for (const o of await resp.json()) opiniones[claveEvento(o.spot, o.fecha, o.objetivo)] = o;
    if (estado.mirador) pintarTodo();
  } catch { /* sin red */ }
}

// --- Galería de cada spot (Aaron, 28-10-2026) -----------------------------------
// Las fotos aprobadas de cualquier día, con la nota de la gente y la nuestra
// de ese día (de datos.pasado si ya pasó), para ver cuándo acertamos.
let galeria = [];

async function cargarGaleria() {
  try {
    const resp = await fetch(`${SUPABASE}/rest/v1/rpc/galeria`, {
      method: 'POST', headers: { ...CABECERAS, 'Content-Type': 'application/json' }, body: '{"cuantas": 120}' });
    if (!resp.ok) return;
    galeria = await resp.json();
    if (estado.mirador && estado.objetivo) pintarTodo();
  } catch { /* sin red */ }
}

// Nuestra nota de ese día: de los días que enseña la web o de los pasados.
function nuestraNota(spot, fecha, objetivo) {
  const dia = (datos.miradores[spot].dias || {})[fecha] || ((datos.pasado || {})[spot] || {})[fecha];
  const r = dia && dia[objetivo];
  return r && r.puntos != null ? r.puntos : null;
}

// En el resumen del spot, todas; dentro de cada sección, solo las suyas
// (Aaron, 28-10-2026: que no se mezclen): las de atardecer en el atardecer…
function cajaGaleria(spot, objetivo = null) {
  const fotos = galeria.filter(g => g.spot === spot && (!objetivo || g.objetivo === objetivo));
  if (!fotos.length) return null;
  return el('div', { class: 'caja galeria' },
    el('h4', {}, 'Fotos de la gente'),
    el('div', { class: 'fotos-galeria' }, fotos.map(g => {
      const url = `${SUPABASE}/storage/v1/object/public/fotos/${g.foto}`;
      const nuestra = nuestraNota(spot, g.fecha, g.objetivo);
      const cuando = new Date(g.fecha + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
      return el('figure', {},
        el('a', { href: url, target: '_blank', rel: 'noopener' }, el('img', { src: url, alt: `${CORTO[g.objetivo] || g.objetivo} en ${partesNombre(datos.miradores[spot].nombre)[0]}`, loading: 'lazy' })),
        el('figcaption', {},
          el('strong', {}, [objetivo ? null : CORTO[g.objetivo] || g.objetivo, objetivo ? mayuscula(cuando) : cuando, g.hora_foto]
            .filter(Boolean).join(' · ')),
          el('span', { class: 'comparar' },
            el('span', {}, 'La gente ', el('b', {}, coma(g.media))),
            nuestra != null ? el('span', {}, 'Nosotros ', el('b', {}, coma(nuestra))) : null)));
    })));
}

// «La gente que fue», dentro del evento: media y votos de ese día (las
// fotos van en «Fotos de la gente», debajo).
function cajaGente(spot, dia, objetivo, r) {
  const o = opiniones[claveEvento(spot, dia, objetivo)];
  if (!o) return null;
  return el('div', { class: 'caja gente' },
    el('h4', {}, 'La gente que fue'),
    el('div', { class: 'comparar-notas' },
      r.puntos != null ? el('span', {}, 'Nuestra nota ', el('strong', {}, coma(r.puntos))) : null,
      el('span', {}, 'La gente ', el('strong', {}, coma(o.media)), ` (${o.votos} ${o.votos === 1 ? 'voto' : 'votos'})`)));
}

// --- La foto -------------------------------------------------------------------
// Más pequeña y en JPEG (las del móvil pesan 3-8 MB). Al redibujarla se pierden
// los datos ocultos de la foto, también la ubicación: no se sube dónde estabas.
function reducirFoto(archivo) {
  return new Promise((bien, mal) => {
    const img = new Image();
    img.onload = () => {
      const escala = Math.min(1, FOTO_LADO / Math.max(img.width, img.height));
      const lienzo = document.createElement('canvas');
      lienzo.width = Math.round(img.width * escala); lienzo.height = Math.round(img.height * escala);
      lienzo.getContext('2d').drawImage(img, 0, 0, lienzo.width, lienzo.height);
      URL.revokeObjectURL(img.src);
      lienzo.toBlob(b => b ? bien(b) : mal(new Error('foto')), 'image/jpeg', 0.85);
    };
    img.onerror = () => mal(new Error('foto'));
    img.src = URL.createObjectURL(archivo);
  });
}

// Fecha y hora en que se hizo la foto ('2026:10:28 18:12:05'), si la guarda
// (JPEG con datos EXIF); si no, null. Solo se usa para rellenar el formulario.
async function fechaFoto(archivo) {
  try {
    const v = new DataView(await archivo.slice(0, 128 * 1024).arrayBuffer());
    if (v.getUint16(0) !== 0xFFD8) return null;
    for (let p = 2; p + 4 < v.byteLength;) {
      const marca = v.getUint16(p), largo = v.getUint16(p + 2);
      if (marca === 0xFFE1 && v.getUint32(p + 4) === 0x45786966) {     // «Exif»
        const t = p + 10, peq = v.getUint16(t) === 0x4949;            // orden de los bytes
        const u16 = i => v.getUint16(t + i, peq), u32 = i => v.getUint32(t + i, peq);
        const buscar = (ifd, etiqueta) => {
          for (let n = u16(ifd), i = 0; i < n; i++)
            if (u16(ifd + 2 + i * 12) === etiqueta) return u32(ifd + 2 + i * 12 + 8);
          return null;
        };
        const exif = buscar(u32(4), 0x8769);                           // subcarpeta Exif
        const pos = exif != null ? buscar(exif, 0x9003) : null;        // fecha original
        return pos == null ? null : String.fromCharCode(...new Uint8Array(v.buffer, t + pos, 19));
      }
      p += 2 + largo;
    }
  } catch { /* foto rara: sin fecha */ }
  return null;
}

// --- «Ayúdanos a mejorar» (Aaron, 28-10-2026) ----------------------------------
// Un formulario siempre a mano: spot de la app (Aaron: por ahora sin «otro
// sitio»), día (hasta 3 atrás), qué
// fuiste a ver, nota y foto. Desde un evento viene ya rellenado.
const formulario = {};
let volverDe = null;               // dónde estabas, para volver

function diasAtras() {
  const hoy = new Date(hoyCanarias() + 'T12:00');
  return Array.from({ length: DIAS_ATRAS + 1 }, (_, n) =>
    new Date(hoy.getTime() - n * 86400e3).toLocaleDateString('sv-SE'));
}

function abrirMejorar(relleno = {}) {
  volverDe = { mirador: estado.mirador, objetivo: estado.objetivo, ocasiones: estado.ocasiones, luna: estado.luna };
  Object.keys(formulario).forEach(k => delete formulario[k]);
  Object.assign(formulario, { spot: null, dia: hoyCanarias(), objetivo: null, nota: null,
    foto: null, permiso: false, enviando: false, error: '', hecho: false }, relleno);
  estado.mejorar = true;
  plegar(false);
  pintarTodo();
  irArriba();
}

function cerrarMejorar() {
  estado.mejorar = false;
  Object.assign(estado, volverDe || {});
  pintarTodo();
  irArriba();
}

// Al elegir la foto: si sabe cuándo se hizo, rellena el día y, por la hora,
// si era amanecer, atardecer o estrellas (lo que no hayas elegido ya).
async function elegirFoto(archivo) {
  formulario.foto = archivo || null;
  formulario.hora = null;
  const f = archivo && await fechaFoto(archivo);
  if (f) {
    const dia = f.slice(0, 10).replace(/:/g, '-'), hora = Number(f.slice(11, 13));
    // La hora se manda aparte: al reducir la foto se pierde (Aaron, 28-10-2026:
    // sirve para saber si se hizo antes, durante o después).
    if (/^\d\d:\d\d$/.test(f.slice(11, 16))) formulario.hora = f.slice(11, 16);
    if (diasAtras().includes(dia)) formulario.dia = dia;
    if (!formulario.objetivo) formulario.objetivo = hora < 12 ? 'Amanecer' : hora < 21 ? 'Atardecer' : 'Estrellas';
  }
  pintarTodo();
}

async function enviarFormulario() {
  const f = formulario;
  let foto = null;
  if (f.foto) {
    foto = `${dispositivo()}-${Date.now()}.jpg`;
    const resp = await fetch(`${SUPABASE}/storage/v1/object/fotos/${foto}`, {
      method: 'POST', headers: { ...CABECERAS, 'Content-Type': 'image/jpeg' },
      body: await reducirFoto(f.foto) });
    if (!resp.ok) throw new Error('No se pudo subir la foto');
  }
  const resp = await fetch(`${SUPABASE}/rest/v1/valoraciones`, {
    method: 'POST', headers: { ...CABECERAS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ spot: f.spot,
      fecha: f.dia, objetivo: f.objetivo, nota: f.nota, dispositivo: dispositivo(), foto, permiso_foto: !!foto,
      hora_foto: foto ? f.hora || null : null }) });
  if (resp.status === 409) throw new Error('Ya habías valorado eso mismo desde este móvil');
  if (!resp.ok) throw new Error('No se pudo guardar tu nota');
}

// Grupo de botones en el que se elige uno (spot, día, qué, nota).
function eleccion(clase, opciones, actual, elegir) {
  return el('div', { class: clase }, opciones.map(([valor, texto]) => el('button', {
    class: 'opcion-filtro', 'aria-pressed': String(actual === valor),
    onclick: () => { elegir(valor); pintarTodo(); } }, texto)));
}

function pintarMejorar() {
  const f = formulario;
  const volver = el('button', { class: 'volver', onclick: cerrarMejorar, html: svg('volver', 18) + '<span>Volver</span>' });
  if (f.hecho) return [volver, el('div', { class: 'cabeza-ficha' }, el('h2', {}, '¡Gracias!'),
    el('p', {}, 'Con lo que nos cuentas comparamos la nota con lo que pasó de verdad y la afinamos.' +
      (f.foto ? ' Tu foto saldrá en la app cuando la revisemos.' : ''))),
    el('button', { class: 'enviar-voto', onclick: () => abrirMejorar() }, 'Valorar otra salida')];

  const nombres = { 0: 'Hoy', 1: 'Ayer', 2: 'Anteayer' };
  const dias = diasAtras().map((d, n) => [d, nombres[n] ||
    new Date(d + 'T12:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })]);
  const spots = Object.entries(datos.miradores).map(([clave, m]) => [clave, partesNombre(m.nombre)[0]])
    .sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const listo = f.spot && f.objetivo && f.nota != null &&
    (!f.foto || f.permiso) && !f.enviando;
  const archivo = el('input', { type: 'file', accept: 'image/*', hidden: '', onchange: e => elegirFoto(e.target.files[0]) });

  return [
    volver,
    el('div', { class: 'cabeza-ficha' }, el('h2', {}, 'Ayúdanos a mejorar'),
      el('p', {}, '¿Fuiste a ver un amanecer, un atardecer, la luna o las estrellas? Cuéntanos cómo estuvo: así vemos si la nota acertó.')),
    seccion('Foto (opcional)', archivo,
      el('button', { class: 'boton-foto', onclick: () => archivo.click() }, f.foto ? `Foto: ${f.foto.name}` : 'Elegir una foto'),
      f.foto ? el('label', { class: 'permiso' },
        el('input', { type: 'checkbox', ...(f.permiso ? { checked: '' } : {}), onchange: e => { f.permiso = e.target.checked; pintarTodo(); } }),
        el('span', {}, 'Acepto que la foto se publique en Horizonte (la revisamos antes)')) : null),
    seccion('¿Dónde?', campoSpot(spots, f)),
    seccion('¿Cuándo?', eleccion('filtro', dias, f.dia, v => { f.dia = v; })),
    seccion('¿Qué fuiste a ver?', eleccion('filtro', OBJETIVOS.map(o => [o, CORTO[o] || o]), f.objetivo, v => { f.objetivo = v; })),
    seccion('¿Cómo estuvo, del 0 al 10?', eleccion('notas-voto', Array.from({ length: 11 }, (_, n) => [n, String(n)]), f.nota, v => { f.nota = v; })),
    botonEnviar = el('button', { class: 'enviar-voto', ...(listo ? {} : { disabled: '' }), onclick: async () => {
      f.enviando = true; f.error = ''; pintarTodo();
      try {
        await enviarFormulario();
        f.hecho = true;
        cargarOpiniones();
      } catch (e) { f.error = e.message; }
      f.enviando = false;
      pintarTodo(); irArriba();
    } }, f.enviando ? 'Enviando…' : 'Enviar'),
    f.error ? el('p', { class: 'error-voto' }, f.error + '.') : null,
    el('p', { class: 'pie' }, `Se puede valorar hasta ${DIAS_ATRAS} días atrás. No guardamos tu nombre ni nada que te identifique; de la foto no se sube dónde estabas.`),
  ].filter(Boolean);
}

let botonEnviar = null;            // se activa al escribir el spot, sin redibujar (se perdería el teclado)

// Spot: desplegable por nombre en el que también se puede escribir para
// buscar (Aaron, 28-10-2026: con muchos spots, los botones llenarían la
// pantalla). Solo vale un spot de la lista; sin acentos ni mayúsculas.
const sinAcentos = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function campoSpot(spots, f) {
  // Lista propia en vez de la del teléfono (Aaron, 28-10-2026: la del móvil
  // no le gustaba): se abre al tocar la casilla y se filtra al escribir.
  const actual = spots.find(([clave]) => clave === f.spot);
  const aviso = el('p', { class: 'aviso-spot', hidden: '' }, 'Elige uno de la lista.');
  const opciones = el('ul', { class: 'opciones-spot', hidden: '' });
  const caja = el('div', { class: 'desplegable' + (actual ? ' elegido' : '') });
  const activarEnviar = () => {
    if (botonEnviar) botonEnviar.disabled = !(f.spot && f.objetivo && f.nota != null && (!f.foto || f.permiso));
  };
  const elegir = (clave, nombre) => {
    f.spot = clave; campo.value = nombre;
    opciones.hidden = true; aviso.hidden = true;
    caja.classList.add('elegido'); campo.blur(); activarEnviar();
  };
  // Las que contienen lo escrito (sin acentos ni mayúsculas); con un spot ya
  // elegido, todas, para poder cambiarlo.
  const pintarOpciones = () => {
    const buscar = f.spot ? '' : sinAcentos(campo.value);
    const quedan = spots.filter(([, nombre]) => sinAcentos(nombre).includes(buscar));
    opciones.replaceChildren(...(quedan.length ? quedan.map(([clave, nombre]) => {
      const m = datos.miradores[clave];
      return el('li', {}, el('button', { type: 'button', class: 'opcion-spot', 'aria-selected': String(clave === f.spot),
        // pointerdown + preventDefault: elegir antes de que la casilla pierda el foco.
        onpointerdown: e => e.preventDefault(), onclick: () => elegir(clave, nombre) },
        el('span', { class: 'pin-spot', html: svg('ruta', 18) }),
        el('span', { class: 'texto' }, el('strong', {}, nombre), el('span', {}, `${partesNombre(m.nombre)[1] || 'Tenerife'} · ${m.altitud} m`))));
    }) : [el('li', { class: 'sin-opciones' }, 'Ningún spot se llama así.')]));
  };
  const campo = el('input', { class: 'campo-spot', type: 'text', autocomplete: 'off', enterkeyhint: 'done',
    placeholder: 'Escribe o elige un spot', value: actual ? actual[1] : '',
    onfocus: () => { pintarOpciones(); opciones.hidden = false; },
    onblur: () => setTimeout(() => { opciones.hidden = true; aviso.hidden = Boolean(f.spot) || !campo.value.trim(); }, 120),
    oninput: () => {
      const hallado = spots.find(([, nombre]) => sinAcentos(nombre) === sinAcentos(campo.value));
      f.spot = hallado ? hallado[0] : null;
      caja.classList.toggle('elegido', Boolean(hallado));
      pintarOpciones(); opciones.hidden = false; aviso.hidden = true; activarEnviar();
    } });
  caja.append(el('span', { class: 'lupa', html: svg('ruta', 18) }), campo,
    el('span', { class: 'flecha-spot', html: svg('abajo', 18) }));
  return [caja, opciones, aviso];
}

// Botón para abrirlo: en la lista, vacío; en un evento que ya pasó, rellenado.
function botonMejorar(relleno) {
  return el('button', { class: 'ver-todos', onclick: () => abrirMejorar(relleno),
    html: svg('chispa', 16) + `<span>${relleno ? '¿Fuiste? Cuéntanos cómo estuvo' : 'Ayúdanos a mejorar'}</span>` });
}
