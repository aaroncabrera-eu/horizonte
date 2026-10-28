// Trabajador sin conexión (punto 4 de la lista, 23-10-2026): en muchos
// miradores no hay cobertura. Guarda en el móvil la web, los datos y los
// trozos de mapa ya vistos, y los usa cuando no hay red.
//
// Súbelo junto al ?v= de index.html: al cambiar VERSION se rehace la caché
// de la web (los trozos de mapa se conservan).
const VERSION = '20261028g';
const WEB = 'horizonte-web-' + VERSION;
const MAPA = 'horizonte-mapa';
const MAX_TESELAS = 2500;          // ~40-60 MB como mucho

// Lo imprescindible para abrir la web sin red.
const BASE = ['./', 'index.html', 'manifest.webmanifest', 'icono-192.png',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];

self.addEventListener('install', ev => {
  ev.waitUntil(caches.open(WEB).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

// Al estrenar versión, borrar las cachés de la web viejas.
self.addEventListener('activate', ev => {
  ev.waitUntil(caches.keys()
    .then(nombres => Promise.all(nombres
      .filter(n => n.startsWith('horizonte-web-') && n !== WEB).map(n => caches.delete(n))))
    .then(() => self.clients.claim()));
});

const esTesela = url => /tile\.opentopomap\.org|arcgisonline\.com/.test(url.hostname);

self.addEventListener('fetch', ev => {
  if (ev.request.method !== 'GET') return;
  const url = new URL(ev.request.url);
  if (esTesela(url)) ev.respondWith(teselaPrimeroGuardada(ev.request));
  else if (url.pathname.endsWith('datos.json')) ev.respondWith(redPrimero(ev.request));
  // La página: con red, siempre la nueva (si no, el móvil enseñaba la vieja
  // hasta la siguiente vez que se abría; Aaron, 23-10-2026).
  else if (ev.request.mode === 'navigate') ev.respondWith(paginaRedPrimero(ev.request));
  else ev.respondWith(guardadoYActualizar(ev.request));
});

// Datos: siempre los más nuevos si hay red; si no, los últimos guardados.
async function redPrimero(peticion) {
  const cache = await caches.open(WEB);
  try {
    const resp = await fetch(peticion);
    if (resp.ok) cache.put('datos.json', resp.clone());
    return resp;
  } catch {
    return (await cache.match('datos.json')) || Response.error();
  }
}

async function paginaRedPrimero(peticion) {
  const cache = await caches.open(WEB);
  try {
    const resp = await fetch(peticion, { cache: 'no-cache' });   // saltar la caché de 10 min
    if (resp.ok) cache.put('index.html', resp.clone());
    return resp;
  } catch {
    return (await cache.match('index.html')) || (await cache.match('./')) || Response.error();
  }
}

// La web: lo guardado al momento y, por detrás, se actualiza para la próxima.
async function guardadoYActualizar(peticion) {
  const cache = await caches.open(WEB);
  const guardado = await cache.match(peticion, { ignoreSearch: false });
  const red = fetch(peticion).then(resp => {
    if (resp.ok || resp.type === 'opaque') cache.put(peticion, resp.clone());
    return resp;
  }).catch(() => null);
  return guardado || (await red) ||
    (peticion.mode === 'navigate' ? cache.match('index.html') : Response.error());
}

// Trozos de mapa: si ya se vio, de la memoria (rápido y sin red); si no, de
// la red y se guarda. Con un tope para no llenar el móvil.
async function teselaPrimeroGuardada(peticion) {
  const cache = await caches.open(MAPA);
  const guardada = await cache.match(peticion);
  if (guardada) return guardada;
  try {
    const resp = await fetch(peticion);
    if (resp.ok) {             // los servidores del mapa permiten leerlas (CORS)
      await cache.put(peticion, resp.clone());
      recortar(cache);
    }
    return resp;
  } catch {
    return Response.error();
  }
}

async function recortar(cache) {
  const claves = await cache.keys();
  for (const vieja of claves.slice(0, Math.max(0, claves.length - MAX_TESELAS))) await cache.delete(vieja);
}

// La web pide guardar el mapa alrededor de los miradores (para tenerlo
// aunque no se haya mirado antes).
self.addEventListener('message', ev => {
  if (ev.data && ev.data.tipo === 'guardar-teselas') {
    ev.waitUntil(caches.open(MAPA).then(async cache => {
      for (const url of ev.data.urls) {
        if (await cache.match(url)) continue;
        try {
          const resp = await fetch(url);
          if (resp.ok) await cache.put(url, resp);
        } catch { /* sin red: ya se guardará otra vez */ }
      }
    }));
  }
});
