// La gente que fue pone su nota y una foto (decisión 45, 28-10-2026).
// Se guarda en Supabase: la web solo puede AÑADIR votos y leer el resumen
// (votos, media y fotos aprobadas); las reglas están en supabase_sql/.
// La clave de aquí es pública a propósito: sin las reglas no sirve de nada.
const SUPABASE = 'https://vsdnwwnsoluftmpxcatp.supabase.co';
const SUPABASE_CLAVE = 'sb_publishable_4Z8ASKaoPrMF0EkSNl7v7w_fvIa4yGt';
const CABECERAS = { apikey: SUPABASE_CLAVE, Authorization: 'Bearer ' + SUPABASE_CLAVE };
const FOTO_LADO = 1600;            // px del lado largo: suficiente y pesa poco

let opiniones = {};                // 'spot|fecha|objetivo' → {votos, media, fotos}
const borrador = { nota: null, foto: null, permiso: false, enviando: false, error: '' };
let borradorDe = '';               // de qué evento es el borrador

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
    if (estado.mirador && estado.objetivo) pintarTodo();
  } catch { /* sin red */ }
}

// La foto, más pequeña y en JPEG (las del móvil pesan 3-8 MB).
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

// Primero la foto (si hay) y luego el voto con el nombre de la foto.
async function enviarVoto(spot, dia, objetivo) {
  let foto = null;
  if (borrador.foto) {
    foto = `${dispositivo()}-${Date.now()}.jpg`;
    const resp = await fetch(`${SUPABASE}/storage/v1/object/fotos/${foto}`, {
      method: 'POST', headers: { ...CABECERAS, 'Content-Type': 'image/jpeg' },
      body: await reducirFoto(borrador.foto) });
    if (!resp.ok) throw new Error('No se pudo subir la foto');
  }
  const resp = await fetch(`${SUPABASE}/rest/v1/valoraciones`, {
    method: 'POST', headers: { ...CABECERAS, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ spot, fecha: dia, objetivo, nota: borrador.nota, dispositivo: dispositivo(),
      foto, permiso_foto: !!foto }) });
  // 409 = este móvil ya había votado: se da por bueno.
  if (!resp.ok && resp.status !== 409) throw new Error('No se pudo guardar tu nota');
}

// «La gente que fue»: media, votos y fotos aprobadas (si hay alguno).
function cajaGente(spot, dia, objetivo, r) {
  const o = opiniones[claveEvento(spot, dia, objetivo)];
  if (!o) return null;
  const fotos = (o.fotos || []).map(f => `${SUPABASE}/storage/v1/object/public/fotos/${f}`);
  return el('div', { class: 'caja gente' },
    el('h4', {}, 'La gente que fue'),
    el('div', { class: 'comparar-notas' },
      r.puntos != null ? el('span', {}, 'Nuestra nota ', el('strong', {}, coma(r.puntos))) : null,
      el('span', {}, 'La gente ', el('strong', {}, coma(o.media)), ` (${o.votos} ${o.votos === 1 ? 'voto' : 'votos'})`)),
    fotos.length ? el('div', { class: 'fotos-gente' }, fotos.map(u =>
      el('a', { href: u, target: '_blank', rel: 'noopener' }, el('img', { src: u, alt: 'Foto de la gente', loading: 'lazy' })))) : null);
}

// «¿Fuiste? Pon tu nota»: solo cuando el evento ya pasó (hoy, después de su
// hora), que es cuando se puede saber cómo estuvo.
function cajaVotar(spot, dia, objetivo, r) {
  if (r.color !== 'pasado') return null;
  const k = claveEvento(spot, dia, objetivo);
  const ya = leerLocal('horizonte-voto-' + k);
  if (ya != null) return el('div', { class: 'caja votar' }, el('h4', {}, '¿Fuiste?'),
    el('p', { class: 'gracias' }, `¡Gracias! Tu nota: ${ya}. Nos ayuda a acertar más.`));
  if (borradorDe !== k) {           // otro evento: borrador nuevo
    Object.assign(borrador, { nota: null, foto: null, permiso: false, enviando: false, error: '' });
    borradorDe = k;
  }

  const repintar = () => pintarTodo();
  const notas = el('div', { class: 'notas-voto' }, Array.from({ length: 11 }, (_, n) => el('button', {
    class: 'nota-voto', 'aria-pressed': String(borrador.nota === n),
    onclick: () => { borrador.nota = n; repintar(); } }, String(n))));
  const elegir = el('input', { type: 'file', accept: 'image/*', hidden: '',
    onchange: e => { borrador.foto = e.target.files[0] || null; repintar(); } });
  const fotoBoton = el('button', { class: 'boton-foto', onclick: () => elegir.click() },
    borrador.foto ? `Foto: ${borrador.foto.name}` : 'Añadir una foto (opcional)');
  const permiso = borrador.foto ? el('label', { class: 'permiso' },
    el('input', { type: 'checkbox', ...(borrador.permiso ? { checked: '' } : {}),
      onchange: e => { borrador.permiso = e.target.checked; repintar(); } }),
    el('span', {}, 'Acepto que la foto se publique en Horizonte (la revisamos antes)')) : null;
  const listo = borrador.nota != null && (!borrador.foto || borrador.permiso) && !borrador.enviando;
  const enviar = el('button', { class: 'enviar-voto', ...(listo ? {} : { disabled: '' }), onclick: async () => {
    borrador.enviando = true; borrador.error = ''; repintar();
    try {
      await enviarVoto(spot, dia, objetivo);
      guardarLocal('horizonte-voto-' + k, String(borrador.nota));
      borrador.enviando = false;
      await cargarOpiniones();
    } catch (e) { borrador.error = e.message; borrador.enviando = false; }
    repintar();
  } }, borrador.enviando ? 'Enviando…' : 'Enviar');

  return el('div', { class: 'caja votar' },
    el('h4', {}, '¿Fuiste? Pon tu nota'),
    el('p', { class: 'nota-seccion' }, `¿Cómo estuvo, del 0 al 10? Así vemos si acertamos.`),
    notas, elegir, fotoBoton, permiso, enviar,
    borrador.error ? el('p', { class: 'error-voto' }, borrador.error + '. Prueba otra vez.') : null,
    el('p', { class: 'pie' }, 'No guardamos tu nombre ni nada que te identifique. Las fotos solo se publican después de revisarlas.'));
}
