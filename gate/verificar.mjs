#!/usr/bin/env node
/**
 * El gate: lo único que decide si el producto funciona.
 *
 * ── Cómo se usa ─────────────────────────────────────────────────────────────
 *
 *     node gate/verificar.mjs
 *
 * Corre todas las comprobaciones de `gate/` y da un solo veredicto: sale con 0
 * si pasan todas y con 1 si falla alguna — o si no ha podido medir.
 *
 * ── Las dos formas de un gate ───────────────────────────────────────────────
 *
 * 1. **`gate/casos.json`** (la de siempre, la de WS-01). Un módulo, una
 *    función y sus casos. Si no hay `gate/gate.json`, el gate es esto y se
 *    comporta exactamente como se comportaba: las carpetas que ya están en
 *    portátiles de alumnos no pueden cambiar de veredicto por una versión
 *    nueva de este archivo.
 *
 * 2. **`gate/gate.json`** (CAS-466). El gate deja de medir una función y pasa a
 *    ORQUESTAR cuatro tipos de comprobación:
 *
 *    - `arranque`  — que la app se abre en local: lanza el comando y espera un
 *                    2xx en la URL.
 *    - `funcion`   — lo de siempre, pero en cualquier archivo y de varios
 *                    módulos: cada archivo de `gate/casos/` y `gate/reglas/`
 *                    es una ficha.
 *    - `comando`   — los tests del propio proyecto (`npm test`): salida 0 y un
 *                    mínimo de tests.
 *    - `navegador` — las pruebas de `gate/e2e/` y `gate/reglas/` con
 *                    Playwright, contra la app arrancada.
 *
 *    ⚠ Los casos son ARCHIVOS, no una lista dentro de `gate.json`: así añadir
 *    uno es crear un archivo, y «solo añadir» se puede comprobar por nombre de
 *    archivo (`frontera.sh`). Con una lista, añadir un caso sería editar un
 *    archivo que ya existe.
 *
 * ── ⚠⚠ Por qué este archivo es igual para todo el mundo ─────────────────────
 *
 * Porque es lo que separa un bucle que mide de uno que se autoengaña. Lo que
 * cambia de una persona a otra son los CASOS, que son suyos; el verificador se
 * escribió una vez, se revisó una vez y tiene tests que lo ejecutan.
 *
 * Si cada carpeta llevara su propio verificador escrito por un modelo, el
 * fallo más probable no sería que se rompiera: sería que dijera que sí a todo.
 * Y un gate que dice que sí a todo se ve exactamente igual que un producto
 * terminado.
 *
 * ── ⚠ No tiene dependencias, y es a propósito ───────────────────────────────
 *
 * Ni `npm install`, ni `package.json`, ni un runner de tests que aprender. Con
 * Node instalado esto corre. En un taller de una tarde, cada instalación que
 * hay que hacer es gente que se queda atrás en el minuto cinco.
 *
 * ⚠ Playwright NO es una dependencia de este archivo: es del PROYECTO, lo
 * instala la tarea de andamiaje y solo si hay interfaz. Aquí solo se llama a
 * su `cli.js` si está; si hace falta y no está, eso es «no se puede medir», y
 * «no se puede medir» nunca es un sí.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** La raíz del proyecto: la carpeta que contiene a `gate/`. */
const RAIZ = new URL('../', import.meta.url);
const DIR_RAIZ = fileURLToPath(RAIZ);
const DIR_GATE = fileURLToPath(new URL('./', import.meta.url));

/**
 * ⚠ Las rutas se resuelven contra ESTE archivo, no contra el directorio desde
 * el que se lanzó el comando. Correrlo desde otra carpeta es de los despistes
 * más comunes, y resolviendo por `cwd` el error que sale es «no encuentro tus
 * casos» — que manda a buscar el problema justo al lado del sitio equivocado.
 */
const RUTA_CASOS = new URL('casos.json', import.meta.url);
const RUTA_GATE = new URL('gate.json', import.meta.url);

const salida = [];
const di = (linea = '') => salida.push(linea);

/** Termina imprimiendo todo de una vez, para que el reporte no salga a trozos. */
function terminar(codigo) {
  process.stdout.write(`${salida.join('\n')}\n`);
  process.exit(codigo);
}

/**
 * Un fallo del propio gate —no del producto— contado para quien no es técnico.
 *
 * ⚠ Sale con 1, igual que un caso que no pasa. Es deliberado: mientras el gate
 * no pueda medir, la respuesta correcta a «¿funciona?» es «no lo sé», y «no lo
 * sé» nunca se puede tratar como un sí.
 */
function noSePuedeMedir(titulo, explicacion) {
  di(`✗ El gate no ha podido medir nada.`);
  di('');
  di(`  ${titulo}`);
  di('');
  for (const linea of explicacion) di(`  ${linea}`);
  terminar(1);
}

// ── Lo común: cargar una función y probarla con sus casos ───────────────────

/**
 * Carga `funcion` de `modulo`. Devuelve `{ fn }` o `{ problema }`, con el
 * problema ya contado para quien lo va a leer.
 */
async function cargarFuncion(modulo, funcion) {
  try {
    const cargado = await import(pathToFileURL(fileURLToPath(new URL(modulo, RAIZ))).href);
    const fn = cargado[funcion];

    if (typeof fn !== 'function') {
      const exporta = Object.keys(cargado).filter((k) => k !== 'default');
      return {
        problema: {
          titulo: `\`${modulo}\` existe, pero no exporta \`${funcion}\`.`,
          lineas: [
            exporta.length
              ? `Lo que exporta ahora mismo es: ${exporta.join(', ')}.`
              : 'Ahora mismo no exporta nada.',
            `El contrato dice \`export function ${funcion}(...)\`. O el código se`,
            'ajusta al contrato, o el contrato estaba mal — pero tienen que coincidir.',
          ],
        },
      };
    }
    return { fn };
  } catch (e) {
    if (e?.code === 'ERR_MODULE_NOT_FOUND') {
      // ⚠ Este NO es un error: al principio es lo correcto. El gate tiene que
      // fallar ANTES de que exista el código, porque si pasara sin nada escrito
      // no estaría comprobando nada.
      return {
        problema: {
          titulo: `Todavía no existe \`${modulo}\`.`,
          lineas: [
            'Esto es lo normal al empezar, y no es un fallo tuyo: el gate falla',
            'primero, y ese fallo es el punto de partida del bucle.',
            '',
            'Abre Claude Code en esta carpeta y escribe /goal.',
          ],
        },
      };
    }
    return {
      problema: {
        titulo: `\`${modulo}\` se ha roto al cargarlo.`,
        lineas: [
          'El archivo existe pero tiene un error que impide siquiera abrirlo:',
          '',
          `  ${String(e?.message ?? e).split('\n')[0]}`,
        ],
      },
    };
  }
}

/**
 * ¿Es esto lo que dijimos que tenía que salir?
 *
 * ⚠ Comparación por valor y no por identidad: para un caso, `[1, 2]` y otro
 * `[1, 2]` distinto son el mismo resultado. Con `===` fallaría todo lo que
 * devuelva una lista o un objeto, que es casi todo.
 *
 * ⚠ El orden de las claves de un objeto NO cuenta, el de una lista SÍ. Es lo
 * que espera cualquiera: una lista tiene un orden y un objeto no.
 */
function igual(a, b) {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((x, i) => igual(x, b[i]));
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ca = Object.keys(a);
    const cb = Object.keys(b);
    if (ca.length !== cb.length) return false;
    return ca.every((k) => Object.hasOwn(b, k) && igual(a[k], b[k]));
  }
  return false;
}

/** Un valor, escrito para que quepa en una línea de terminal. */
function comoTexto(v) {
  if (v === undefined) return 'undefined';
  let t;
  try {
    t = JSON.stringify(v);
  } catch {
    t = String(v);
  }
  if (t === undefined) t = String(v);
  return t.length > 300 ? `${t.slice(0, 300)}…` : t;
}

/** Cada caso contra la función: `{ nombre, pasa, detalle }` por caso. */
async function probarCasos(fn, casos) {
  const resultados = [];

  for (const [i, caso] of casos.entries()) {
    // ⚠ El nombre es lo que se lee, no el número. Un reporte que dice «falla el
    // caso 7» obliga a ir a contar líneas de un JSON; uno que dice «falla: una
    // clase llena no admite otra reserva» ya explica qué está mal.
    const nombre = caso?.nombre || `caso ${i + 1} (sin nombre)`;
    const entrada = Array.isArray(caso?.entrada) ? caso.entrada : [];
    const con = `      con        ${comoTexto(entrada).replace(/^\[|\]$/g, '')}`;

    try {
      // ⚠ `await` aunque la función sea síncrona: esperar un valor que no es una
      // promesa devuelve el valor. Sin esto, una función asíncrona compararía la
      // promesa contra el esperado y fallaría siempre, con un mensaje que no
      // señala la causa.
      const obtenido = await fn(...entrada);

      if (igual(obtenido, caso?.esperado)) {
        resultados.push({ nombre, pasa: true, detalle: [] });
      } else {
        resultados.push({
          nombre,
          pasa: false,
          detalle: [
            con,
            `      esperaba   ${comoTexto(caso?.esperado)}`,
            `      y salió    ${comoTexto(obtenido)}`,
          ],
        });
      }
    } catch (e) {
      // Un caso que revienta es un caso que falla, no el final del gate: los
      // demás se siguen midiendo. Parar en el primero esconde cuántos hay.
      resultados.push({
        nombre,
        pasa: false,
        detalle: [con, `      se rompió  ${String(e?.message ?? e).split('\n')[0]}`],
      });
    }
  }

  return resultados;
}

/** La coletilla de un gate que no pasa. Es la misma en las dos formas. */
function sinTrampas() {
  di('');
  di('Eso de arriba es la retroalimentación del bucle: cámbiale el código, no');
  di('los casos. Hacer pasar el gate cambiando el gate es hacer trampa.');
}

// ════════════════════════════════════════════════════════════════════════════
// Forma 1 · `gate/casos.json`: una función
// ════════════════════════════════════════════════════════════════════════════
//
// ⚠⚠ Cada frase de esta forma es la que ya leía la gente de WS-01. No se
// «mejora» aquí: `gate-del-harness.test.js` las fija, y una carpeta vieja que
// empezara a decir otra cosa con los mismos casos sería un gate que cambió de
// opinión sin que nadie tocara nada.

async function gateDeUnaFuncion() {
  let ficha;
  try {
    ficha = JSON.parse(readFileSync(RUTA_CASOS, 'utf8'));
  } catch (e) {
    noSePuedeMedir(
      e.code === 'ENOENT' ? 'No encuentro `gate/casos.json`.' : 'No he podido leer `gate/casos.json`.',
      [
        'Ese archivo es la lista de casos que acordaste en la conversación.',
        'Si no está, o está a medias, vuelve al chat de AI Builder School y',
        'termina de acordarlos: sin casos, nada puede decir si esto funciona.',
      ],
    );
  }

  const casos = Array.isArray(ficha?.casos) ? ficha.casos : [];

  // ⚠⚠ Cero casos NO es un gate que pasa. Es el fallo más peligroso que puede
  // tener esta pieza: un gate vacío sale verde, el agente lo lee como que ha
  // terminado, y la persona se lleva a casa un producto que nadie comprobó.
  if (casos.length === 0) {
    noSePuedeMedir('`gate/casos.json` no tiene ni un caso.', [
      'Un gate sin casos no comprueba nada, así que no puede decir que algo',
      'funciona. Vuelve al chat y acordad al menos un caso: una entrada',
      'concreta y el resultado exacto que tiene que salir.',
    ]);
  }

  if (!ficha.modulo || !ficha.funcion) {
    noSePuedeMedir('`gate/casos.json` no dice a qué código llamar.', [
      'Le faltan `modulo` (el archivo de tu código) o `funcion` (lo que llama).',
      'Vuelve al chat y acordad el contrato: qué archivo y qué función.',
    ]);
  }

  const { fn, problema } = await cargarFuncion(ficha.modulo, ficha.funcion);
  if (problema) noSePuedeMedir(problema.titulo, problema.lineas);

  di(`Gate de ${ficha.proyecto ?? 'este proyecto'} — ${casos.length} caso${casos.length === 1 ? '' : 's'}`);
  di(`Llamando a ${ficha.funcion}() de ${ficha.modulo}`);
  di('');

  const resultados = await probarCasos(fn, casos);
  for (const r of resultados) {
    di(`  ${r.pasa ? '✓' : '✗'} ${r.nombre}`);
    for (const linea of r.detalle) di(linea);
  }

  const fallan = resultados.filter((r) => !r.pasa).map((r) => r.nombre);

  di('');
  di(`${resultados.length - fallan.length} de ${casos.length} pasan.`);

  if (fallan.length > 0) {
    di('');
    di('Falta:');
    for (const nombre of fallan) di(`  · ${nombre}`);
    sinTrampas();
    terminar(1);
  }

  di('');
  di('Todos los casos pasan.');
  terminar(0);
}

// ════════════════════════════════════════════════════════════════════════════
// Forma 2 · `gate/gate.json`: el gate integral (CAS-466)
// ════════════════════════════════════════════════════════════════════════════

/**
 * El reporte se agrupa, y cada grupo es lo que la persona reconoce: el
 * arranque, cada regla, cada tarea, los comandos y el navegador.
 *
 * Cada comprobación lleva un `id` estable —grupo y nombre— porque es lo que
 * compara el trinquete: «faltan dos que antes pasaban» se dice por nombre.
 */
const grupos = new Map();

function grupo(titulo) {
  if (!grupos.has(titulo)) grupos.set(titulo, { notas: [], items: [] });
  return grupos.get(titulo);
}

/**
 * `medible: false` distingue «falla» de «no he podido medirlo». Las dos
 * cuentan como que NO pasa; la marca es solo para que el reporte diga cuál.
 */
function anotar(titulo, { nombre, pasa, detalle = [], medible = true, visible = nombre, tests = null }) {
  grupo(titulo).items.push({ id: `${titulo} › ${nombre}`, nombre, visible, pasa, detalle, medible, tests });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/** Quita los colores de terminal de una salida ajena, que ensucian el reporte. */
// ⚠ El carácter de escape se construye con `String.fromCharCode` en vez de
// escribirse dentro de la expresión: el linter prohíbe caracteres de control en
// una regex literal, y aquí son justo lo que se busca.
const COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');
const sinColor = (t) => String(t).replace(COLOR, '');

/** Las últimas `n` líneas no vacías de una salida, sangradas para el reporte. */
function cola(texto, n = 12) {
  return sinColor(texto)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter(Boolean)
    .slice(-n)
    .map((l) => `      │ ${l}`);
}

/**
 * Los archivos de una carpeta de `gate/`, en orden estable. Devuelve rutas
 * relativas a `gate/` (`casos/02-saltar.json`).
 *
 * ⚠ Solo el primer nivel, sin subcarpetas: es lo mismo que `frontera.sh` deja
 * crear. Lo que el hook no admite, el gate no lo mide.
 * ⚠ Los ocultos se saltan: un `.DS_Store` no es un caso.
 */
function listar(carpeta, extension) {
  const base = join(DIR_GATE, carpeta);
  if (!existsSync(base)) return [];
  return readdirSync(base)
    .sort()
    .filter((nombre) => !nombre.startsWith('.') && extension.test(nombre) && statSync(join(base, nombre)).isFile())
    .map((nombre) => `${carpeta}/${nombre}`);
}

const FICHA = /\.json$/;
// ⚠ Solo `.spec.js`, igual que lo que `frontera.sh` deja crear en `gate/e2e/` y
// `gate/reglas/`. Dos listas de lo mismo acaban diciendo cosas distintas: si el
// hook admite una forma, el gate la mide, y al revés.
const PRUEBA_DE_NAVEGADOR = /\.spec\.js$/;

// ── Comandos: lanzar, esperar y cortar ──────────────────────────────────────

/**
 * Lanza un comando de la persona en la raíz del proyecto.
 *
 * ⚠ En su propio GRUPO de procesos (`detached`): `npm run dev` lanza a su vez
 * el servidor de verdad, y matar solo a `npm` deja el servidor vivo ocupando
 * el puerto — y el siguiente gate «arranca» contra el cadáver del anterior.
 */
function lanzar(comando) {
  return spawn(comando, {
    cwd: DIR_RAIZ,
    shell: true,
    detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  });
}

function matar(hijo) {
  if (!hijo || hijo.exitCode !== null || hijo.signalCode !== null) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(hijo.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-hijo.pid, 'SIGTERM');
    }
  } catch {
    // Ya no estaba.
  }
}

/** Lo que haya que apagar al salir, pase lo que pase. */
const vivos = new Set();
process.on('exit', () => {
  for (const hijo of vivos) matar(hijo);
});
for (const senal of ['SIGINT', 'SIGTERM']) {
  process.on(senal, () => process.exit(130));
}

/** Corre un comando hasta que termine (o se agote su tiempo) y guarda su salida. */
function correr(comando, esperaMs, env = {}) {
  return new Promise((resolver) => {
    const hijo = spawn(comando, {
      cwd: DIR_RAIZ,
      shell: true,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, FORCE_COLOR: '0', ...env },
    });
    vivos.add(hijo);

    let texto = '';
    const guardar = (trozo) => {
      texto += trozo;
      // Solo importa el final: es donde los runners ponen el resumen.
      if (texto.length > 400_000) texto = texto.slice(-200_000);
    };
    hijo.stdout.on('data', guardar);
    hijo.stderr.on('data', guardar);

    let agotado = false;
    const reloj = setTimeout(() => {
      agotado = true;
      matar(hijo);
    }, esperaMs);

    hijo.on('error', (e) => guardar(`\n${e.message}\n`));
    hijo.on('close', (codigo) => {
      clearTimeout(reloj);
      vivos.delete(hijo);
      resolver({ codigo: codigo ?? 1, salida: texto, agotado });
    });
  });
}

/** ¿Responde esa URL con un 2xx ahora mismo? */
async function responde(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Arranque ────────────────────────────────────────────────────────────────

/**
 * La app se abre en local. Deja el servidor VIVO si arranca, para que las
 * pruebas de navegador lo usen (`reuseExistingServer`); se apaga al salir.
 */
async function medirArranque(arranque) {
  const titulo = 'ARRANQUE';
  const url = arranque?.url;
  const comando = arranque?.comando;
  const esperaMs = Number(arranque?.espera_ms) > 0 ? Number(arranque.espera_ms) : 60_000;

  if (typeof url !== 'string' || typeof comando !== 'string' || !url || !comando) {
    anotar(titulo, {
      nombre: 'la app se abre',
      pasa: false,
      medible: false,
      detalle: ['      `gate/gate.json` tiene `arranque`, pero le falta `comando` o `url`.'],
    });
    return false;
  }

  // ⚠ La URL va en lo que se lee, no en el `id`: cambiar el puerto en
  // `gate.json` no es medir menos, y el trinquete no tiene que tomarlo por eso.
  const nombre = 'la app se abre';
  const visible = `la app se abre en ${url}`;

  // ⚠ Si ya responde, se mide la que hay: lo normal es tener `npm run dev`
  // abierto en otra terminal, y lanzar otro encima solo buscaría otro puerto.
  // Se dice, para que nadie crea que la arrancó el gate.
  if (await responde(url)) {
    anotar(titulo, { nombre, visible, pasa: true });
    grupo(titulo).notas.push(`ya estaba abierta: he medido la que había`);
    return true;
  }

  const servidor = lanzar(comando);
  vivos.add(servidor);

  let texto = '';
  const guardar = (trozo) => {
    texto = (texto + trozo).slice(-50_000);
  };
  servidor.stdout.on('data', guardar);
  servidor.stderr.on('data', guardar);

  let termino = null;
  servidor.on('error', (e) => {
    termino = e.message;
  });
  servidor.on('exit', (codigo, senal) => {
    termino = codigo ?? senal ?? 'desconocido';
  });

  const fin = Date.now() + esperaMs;
  while (Date.now() < fin) {
    if (await responde(url)) {
      anotar(titulo, { nombre, visible, pasa: true });
      return true;
    }
    if (termino !== null) break;
    await esperar(400);
  }

  const detalle =
    termino !== null
      ? [`      \`${comando}\` terminó antes de abrir la app (salió con ${termino}).`]
      : [`      no responde en ${Math.round(esperaMs / 1000)} s.`];

  if (/\bnpm\b/.test(comando) && !existsSync(join(DIR_RAIZ, 'package.json'))) {
    detalle.push('      Todavía no hay `package.json`: es lo normal antes de la tarea de andamiaje.');
  }
  detalle.push(...cola(texto, 8));

  anotar(titulo, { nombre, visible, pasa: false, detalle });
  return false;
}

// ── Funciones: las fichas de casos/ y reglas/ ───────────────────────────────

/**
 * Una ficha es un archivo. Un archivo roto no para el gate: se cuenta como una
 * comprobación que no pasa, con su nombre, y las demás se siguen midiendo.
 */
async function medirFicha(relativa, { esRegla = false } = {}) {
  let ficha;
  try {
    ficha = JSON.parse(readFileSync(join(DIR_GATE, relativa), 'utf8'));
  } catch (e) {
    anotar(esRegla ? 'REGLAS' : 'CASOS', {
      nombre: `gate/${relativa}`,
      pasa: false,
      medible: false,
      detalle: [`      No he podido leerlo: ${String(e?.message ?? e).split('\n')[0]}`],
    });
    return;
  }

  const titulo = esRegla
    ? `REGLA · ${ficha?.regla || relativa}`
    : ficha?.tarea
      ? `TAREA ${ficha.tarea}`
      : `CASOS · gate/${relativa}`;

  const casos = Array.isArray(ficha?.casos) ? ficha.casos : [];

  // ⚠⚠ La misma regla que el gate entero, a escala de archivo: un archivo sin
  // casos no mide nada, y no medir nada no es pasar.
  if (casos.length === 0) {
    anotar(titulo, {
      nombre: `gate/${relativa}`,
      pasa: false,
      medible: false,
      detalle: ['      No tiene ni un caso: un archivo sin casos no comprueba nada.'],
    });
    return;
  }

  if (!ficha.modulo || !ficha.funcion) {
    anotar(titulo, {
      nombre: `gate/${relativa}`,
      pasa: false,
      medible: false,
      detalle: ['      No dice a qué código llamar: le faltan `modulo` o `funcion`.'],
    });
    return;
  }

  const { fn, problema } = await cargarFuncion(ficha.modulo, ficha.funcion);

  if (problema) {
    // ⚠ Cada caso cuenta como una comprobación que no pasa, en vez de una sola
    // para el archivo: así el total no cambia según exista o no el código, y
    // «0 de 5» dice lo mismo antes y después de escribir el módulo.
    const g = grupo(titulo);
    g.notas.push(problema.titulo, ...problema.lineas.filter(Boolean));
    casos.forEach((caso, i) =>
      anotar(titulo, {
        nombre: caso?.nombre || `caso ${i + 1} (sin nombre)`,
        pasa: false,
        medible: false,
      }),
    );
    return;
  }

  for (const r of await probarCasos(fn, casos)) anotar(titulo, r);
}

// ── Comandos: los tests del propio proyecto ─────────────────────────────────

/**
 * Cuántos tests dice la salida que pasaron, o `null` si no lo sé leer.
 *
 * Reconoce los runners habituales: Vitest y Jest («Tests 12 passed»), Mocha
 * («12 passing»), pytest («12 passed»), y el runner de Node («# pass 12» /
 * «ℹ pass 12»). Se queda con el MAYOR número que encuentre, porque Vitest
 * imprime también «Test Files 3 passed», y los archivos nunca son más que los
 * tests.
 *
 * ⚠ Si no sabe leerlo devuelve `null`, nunca 0 ni un número inventado: con un
 * mínimo pedido, «no sé contarlos» es «no se puede medir».
 */
function contarTests(texto) {
  const limpio = sinColor(texto);
  const numeros = [];
  for (const m of limpio.matchAll(/(\d+)\s+(?:passed|passing)\b/g)) numeros.push(Number(m[1]));
  for (const m of limpio.matchAll(/^\s*(?:#|ℹ)\s*pass\s+(\d+)/gm)) numeros.push(Number(m[1]));
  return numeros.length ? Math.max(...numeros) : null;
}

async function medirComando(definicion, i) {
  const titulo = 'COMANDOS';
  const comando = definicion?.comando;
  const nombre = definicion?.nombre || comando || `comando ${i + 1}`;

  if (typeof comando !== 'string' || !comando) {
    anotar(titulo, {
      nombre,
      pasa: false,
      medible: false,
      detalle: ['      En `gate/gate.json` le falta `comando`: no sé qué correr.'],
    });
    return;
  }

  // ⚠⚠ El mínimo es el MAYOR entre lo que pide `gate.json` y lo que corrió la
  // última vez que el gate pasó. Así lo sube el trinquete y no el agente: borrar
  // tests de `src/` deja el gate en rojo aunque `gate.json` siga pidiendo 0.
  const definido = Number(definicion.minimo_de_tests) > 0 ? Number(definicion.minimo_de_tests) : 0;
  const anterior = ACEPTAR_MENOS ? 0 : (trinquete.tests?.[`${titulo} › ${nombre}`] ?? 0);
  const minimo = Math.max(definido, anterior);
  const quienLoPide =
    anterior > definido
      ? 'la última vez que el gate pasó corrieron'
      : '`gate/gate.json` pide al menos';
  const esperaMs = Number(definicion.espera_ms) > 0 ? Number(definicion.espera_ms) : 600_000;

  const { codigo, salida: texto, agotado } = await correr(comando, esperaMs);
  const contados = contarTests(texto);
  const cuantos = contados === null ? '' : ` — ${contados} test${contados === 1 ? '' : 's'}`;

  if (agotado) {
    anotar(titulo, {
      nombre,
      pasa: false,
      detalle: [`      No terminó en ${Math.round(esperaMs / 1000)} s y lo he cortado.`, ...cola(texto)],
    });
    return;
  }

  if (codigo !== 0) {
    anotar(titulo, {
      nombre,
      pasa: false,
      detalle: [`      \`${comando}\` salió con ${codigo}.`, ...cola(texto)],
    });
    return;
  }

  if (minimo > 0 && contados === null) {
    anotar(titulo, {
      nombre,
      pasa: false,
      medible: false,
      detalle: [
        `      Salió con 0, pero no he sabido contar cuántos tests corrieron,`,
        `      y ${quienLoPide} ${minimo}.`,
      ],
    });
    return;
  }

  // ⚠ El mínimo existe porque estos tests los escribe el agente en `src/`, y el
  // día que se atasca puede quitarlos. Salida 0 con menos tests que antes no es
  // «todo bien»: es que se mide menos.
  if (contados !== null && contados < minimo) {
    anotar(titulo, {
      nombre,
      pasa: false,
      detalle: [`      Pasaron ${contados} tests y ${quienLoPide} ${minimo}.`],
    });
    return;
  }

  // ⚠ La cifra va en lo que se lee, no en el `id`: el id tiene que ser el mismo
  // de una pasada a otra aunque cambie cuántos tests hay.
  anotar(titulo, { nombre, visible: `${nombre}${cuantos}`, pasa: true, tests: contados });
}

// ── Navegador: Playwright contra la app arrancada ───────────────────────────

const CLI_PLAYWRIGHT = join(DIR_RAIZ, 'node_modules', '@playwright', 'test', 'cli.js');
const DIR_HARNESS = join(DIR_RAIZ, '.harness');
const CONFIG_PLAYWRIGHT = join(DIR_HARNESS, 'playwright.config.mjs');
const RESULTADO_PLAYWRIGHT = join(DIR_HARNESS, 'playwright-resultado.json');

// ── El trinquete: el gate no pasa con menos de lo que pasó ──────────────────
//
// ⚠⚠ Es la mitad de «solo añadir» que un hook no puede ver. `frontera.sh`
// decide qué se puede ESCRIBIR en `gate/`, pero un caso se puede quitar por
// otras puertas —un `rm`, un `git checkout`, un script— y el gate pasaría con
// uno menos sin que nadie lo notara. El trinquete no mira cómo se quitó: mira
// que falta.
//
// Cada vez que el gate pasa ENTERO, se apuntan aquí los nombres de todas sus
// comprobaciones y cuántos tests corrió cada comando. La vez siguiente, si
// falta un nombre de esa lista, el gate no pasa. Añadir nunca lo dispara:
// una comprobación nueva no le falta a nadie.
//
// Bajarlo es de la PERSONA: `node gate/verificar.mjs --aceptar-menos`, en su
// terminal. ⚠ Que el agente no pueda correrlo lo impide `comandos.sh`, y que no
// pueda escribir este archivo, `frontera.sh` (`.harness/` es inmutable). Lo que
// NO cubre, dicho para que nadie lo tome por garantía: vaciar el cuerpo de un
// test sin quitarlo, o escribir aquí desde un programa que los hooks no ven.

const RUTA_TRINQUETE = join(DIR_HARNESS, 'trinquete.json');
const ACEPTAR_MENOS = process.argv.includes('--aceptar-menos');

/** `{ estado: 'nuevo' | 'ok' | 'roto', nombres, tests }` */
function leerTrinquete() {
  if (!existsSync(RUTA_TRINQUETE)) return { estado: 'nuevo', nombres: [], tests: {} };
  try {
    const t = JSON.parse(readFileSync(RUTA_TRINQUETE, 'utf8'));
    if (!Array.isArray(t?.nombres)) throw new Error('no trae la lista de nombres');
    return { estado: 'ok', nombres: t.nombres, tests: t.tests && typeof t.tests === 'object' ? t.tests : {} };
  } catch (e) {
    return { estado: 'roto', nombres: [], tests: {}, error: String(e?.message ?? e).split('\n')[0] };
  }
}

function escribirTrinquete(todas) {
  const tests = {};
  for (const c of todas) if (c.tests !== null) tests[c.id] = c.tests;
  mkdirSync(DIR_HARNESS, { recursive: true });
  writeFileSync(
    RUTA_TRINQUETE,
    `${JSON.stringify(
      {
        nota: 'Lo escribe gate/verificar.mjs cada vez que el gate pasa entero. No se edita a mano.',
        pasaron: todas.length,
        nombres: todas.map((c) => c.id).sort(),
        tests,
        fecha: new Date().toISOString(),
      },
      null,
      2,
    )}\n`,
  );
}

/** Se lee al empezar: los comandos lo necesitan para su mínimo. */
let trinquete = { estado: 'nuevo', nombres: [], tests: {} };

/**
 * La configuración la escribe el gate, no la persona: así lo que se corre, con
 * qué reintentos y contra qué servidor es igual para todos, y un
 * `playwright.config` del proyecto no puede cambiar lo que mide el gate.
 *
 * ⚠ Va en `.harness/`, que es del gate. `retries: 0`: una prueba que pasa a la
 * segunda es una prueba que falla a veces, y eso no es un sí.
 */
function configDePlaywright(arranque) {
  const conf = {
    testDir: DIR_GATE,
    outputDir: join(DIR_HARNESS, 'playwright-artefactos'),
    reporter: [['json', { outputFile: RESULTADO_PLAYWRIGHT }]],
    retries: 0,
    workers: 1,
    use: { baseURL: arranque.url },
    webServer: {
      command: arranque.comando,
      url: arranque.url,
      cwd: DIR_RAIZ,
      reuseExistingServer: true,
      timeout: Number(arranque.espera_ms) > 0 ? Number(arranque.espera_ms) : 60_000,
    },
  };
  // ⚠ `testMatch` es una expresión regular y JSON no las sabe escribir: va
  // aparte. Con rutas de Windows, `JSON.stringify` ya escapa las barras.
  return `// Lo escribe gate/verificar.mjs en cada pasada. No se edita a mano.
export default {
  ...${JSON.stringify(conf, null, 2)},
  testMatch: /[\\\\/](e2e|reglas)[\\\\/].*\\.spec\\.js$/,
};
`;
}

/** Recorre el reporte JSON de Playwright y devuelve una entrada por prueba. */
function pruebasDelReporte(reporte) {
  const pruebas = [];
  const recorrer = (suite, titulos) => {
    // La suite de primer nivel es el ARCHIVO, y su título es su ruta: no se
    // repite dentro del nombre.
    const dentro = suite.title && suite.title !== suite.file ? [...titulos, suite.title] : titulos;
    for (const spec of suite.specs ?? []) {
      const prueba = spec.tests?.[0];
      const resultado = prueba?.results?.at(-1);
      pruebas.push({
        nombre: [spec.file ?? suite.file, ...dentro, spec.title].filter(Boolean).join(' › '),
        estado: prueba?.status ?? 'desconocido',
        error: resultado?.error?.message ?? '',
      });
    }
    for (const hija of suite.suites ?? []) recorrer(hija, dentro);
  };
  for (const suite of reporte?.suites ?? []) recorrer(suite, []);
  return pruebas;
}

async function medirNavegador(conf, arrancaOk) {
  const titulo = 'NAVEGADOR';
  const pruebas = [...listar('e2e', PRUEBA_DE_NAVEGADOR), ...listar('reglas', PRUEBA_DE_NAVEGADOR)];

  if (conf.navegador !== true && pruebas.length === 0) return;

  const noMedible = (lineas) =>
    anotar(titulo, {
      nombre: 'las pruebas de navegador',
      pasa: false,
      medible: false,
      detalle: lineas.map((l) => `      ${l}`),
    });

  if (!existsSync(CLI_PLAYWRIGHT)) {
    noMedible([
      'Falta Playwright en este proyecto. Lo instala la tarea de andamiaje:',
      '  npm install -D @playwright/test && npx playwright install chromium',
    ]);
    return;
  }

  if (!conf.arranque) {
    noMedible(['`gate/gate.json` no dice cómo se arranca la app, así que no hay nada que abrir.']);
    return;
  }

  if (!arrancaOk) {
    noMedible(['La app no arranca (mira ARRANQUE), así que no hay nada que abrir en el navegador.']);
    return;
  }

  if (pruebas.length === 0) {
    grupo(titulo).notas.push('todavía no hay pruebas de navegador en gate/e2e/');
    return;
  }

  mkdirSync(DIR_HARNESS, { recursive: true });
  writeFileSync(CONFIG_PLAYWRIGHT, configDePlaywright(conf.arranque));
  // ⚠ El resultado de la pasada anterior se borra antes: si esta no llegara a
  // escribir el suyo, leer el viejo sería dar por buena una medición de ayer.
  rmSync(RESULTADO_PLAYWRIGHT, { force: true });

  const { salida: texto, agotado } = await correr(
    `"${process.execPath}" "${CLI_PLAYWRIGHT}" test --config "${CONFIG_PLAYWRIGHT}"`,
    15 * 60_000,
  );

  let reporte = null;
  try {
    reporte = JSON.parse(readFileSync(RESULTADO_PLAYWRIGHT, 'utf8'));
  } catch {
    // Se cuenta abajo.
  }

  if (agotado || !reporte) {
    noMedible([
      agotado ? 'Playwright no terminó en 15 minutos y lo he cortado.' : 'Playwright no dejó resultado.',
      ...cola(texto).map((l) => l.trimStart()),
    ]);
    return;
  }

  // Un archivo de pruebas que ni carga (un error de sintaxis, un import que no
  // existe) no aparece como prueba: aparece aquí. Si se ignorara, el gate
  // pasaría con una prueba menos sin decirlo.
  for (const error of reporte.errors ?? []) {
    anotar(titulo, {
      nombre: 'una prueba de navegador no carga',
      pasa: false,
      detalle: sinColor(error?.message ?? String(error))
        .split('\n')
        .filter(Boolean)
        .slice(0, 4)
        .map((l) => `      ${l}`),
    });
  }

  const encontradas = pruebasDelReporte(reporte);

  // ⚠⚠ Hay archivos de pruebas y Playwright no encontró ninguna: eso no es un
  // navegador que pasa, es un navegador que no midió.
  if (encontradas.length === 0 && (reporte.errors ?? []).length === 0) {
    noMedible([`Hay ${pruebas.length} archivo(s) de pruebas y Playwright no encontró ninguna prueba dentro.`]);
    return;
  }

  for (const prueba of encontradas) {
    if (prueba.estado === 'expected') {
      anotar(titulo, { nombre: prueba.nombre, pasa: true });
    } else if (prueba.estado === 'skipped') {
      // ⚠ Una prueba saltada (`test.skip`) es la forma más barata de callar a
      // una que falla sin borrarla. No corre, así que no mide: no pasa.
      anotar(titulo, {
        nombre: prueba.nombre,
        pasa: false,
        detalle: ['      Está saltada: una prueba que no corre no comprueba nada.'],
      });
    } else {
      const falta = /Executable doesn't exist|playwright install/i.test(prueba.error);
      anotar(titulo, {
        nombre: prueba.nombre,
        pasa: false,
        medible: !falta,
        detalle: falta
          ? ['      Falta el navegador de Playwright: npx playwright install chromium']
          : sinColor(prueba.error)
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean)
              .slice(0, 3)
              .map((l) => `      ${l}`),
      });
    }
  }
}

// ── El gate entero ──────────────────────────────────────────────────────────

async function gateIntegral() {
  trinquete = leerTrinquete();

  let conf;
  try {
    conf = JSON.parse(readFileSync(RUTA_GATE, 'utf8'));
    if (!conf || typeof conf !== 'object' || Array.isArray(conf)) throw new Error('no es un objeto');
  } catch (e) {
    noSePuedeMedir('No he podido leer `gate/gate.json`.', [
      'Ese archivo dice cómo se arranca tu app y qué se corre para medirla.',
      `El error es: ${String(e?.message ?? e).split('\n')[0]}`,
    ]);
  }

  // El orden de los grupos es el del reporte: primero lo que hace falta para
  // todo lo demás (que la app se abra), al final lo más lento (el navegador).
  const arrancaOk = conf.arranque ? await medirArranque(conf.arranque) : false;

  for (const relativa of listar('reglas', FICHA)) await medirFicha(relativa, { esRegla: true });
  for (const relativa of listar('casos', FICHA)) await medirFicha(relativa);

  // ⚠ Un `casos.json` de la forma antigua, si sigue ahí, se mide como una
  // ficha más: no desaparece del gate por haber pasado a `gate.json`.
  if (existsSync(RUTA_CASOS)) await medirFicha('casos.json');

  const comandos = Array.isArray(conf.comandos) ? conf.comandos : [];
  for (const [i, definicion] of comandos.entries()) await medirComando(definicion, i);

  await medirNavegador(conf, arrancaOk);

  const todas = [...grupos.values()].flatMap((g) => g.items);

  // ⚠⚠ La regla de siempre, para la forma nueva: cero comprobaciones no es un
  // gate que pasa.
  if (todas.length === 0) {
    noSePuedeMedir('`gate/` no tiene ni una comprobación.', [
      'Hay `gate/gate.json`, pero ni arranque, ni casos en `gate/casos/`, ni',
      'reglas, ni comandos, ni pruebas de navegador. Un gate sin nada que',
      'comprobar no puede decir que algo funciona.',
    ]);
  }

  di(`Gate de ${conf.proyecto ?? 'este proyecto'} — ${todas.length} comprobaci${todas.length === 1 ? 'ón' : 'ones'}`);

  for (const [titulo, g] of grupos) {
    di('');
    di(titulo);
    for (const nota of g.notas) di(`  · ${nota}`);
    for (const item of g.items) {
      const marca = item.pasa ? '✓' : item.medible ? '✗' : '!';
      di(`  ${marca} ${item.visible}`);
      for (const linea of item.detalle) di(linea);
    }
  }

  const fallan = todas.filter((c) => !c.pasa);
  const pasan = todas.length - fallan.length;

  // El trinquete, después del reporte: primero lo que se midió, luego lo que
  // falta respecto de la última vez.
  const ids = new Set(todas.map((c) => c.id));
  const faltan = trinquete.estado === 'ok' && !ACEPTAR_MENOS ? trinquete.nombres.filter((id) => !ids.has(id)) : [];
  const roto = trinquete.estado === 'roto' && !ACEPTAR_MENOS;

  if (faltan.length > 0 || roto) {
    di('');
    di('TRINQUETE');
    if (roto) {
      di(`  ! No puedo leer \`.harness/trinquete.json\`: ${trinquete.error}.`);
      di('      Sin él no sé si el gate mide menos que la última vez que pasó.');
    } else {
      di(
        `  ✗ ${faltan.length === 1 ? 'Falta 1 comprobación que pasaba' : `Faltan ${faltan.length} comprobaciones que pasaban`} la última vez que el gate pasó:`,
      );
      for (const id of faltan.slice(0, 30)) di(`      · ${id}`);
      if (faltan.length > 30) di(`      · … y ${faltan.length - 30} más`);
    }
    di('');
    di('      Si quitarla fue una decisión tuya —no del agente—, córrelo tú en tu');
    di('      terminal con `node gate/verificar.mjs --aceptar-menos`.');
  }

  di('');
  if (fallan.length > 0 || faltan.length > 0 || roto) {
    di(`${pasan} de ${todas.length} comprobaciones pasan · el gate NO pasa.`);
    if (fallan.length > 0) {
      di('');
      di('Falta:');
      for (const c of fallan.slice(0, 30)) di(`  · ${c.id}`);
      if (fallan.length > 30) di(`  · … y ${fallan.length - 30} más`);
    }
    if (fallan.some((c) => !c.medible) || roto) {
      di('');
      di('Lo marcado con ! no se ha podido medir. «No lo sé» nunca cuenta como un sí.');
    }
    sinTrampas();
    terminar(1);
  }

  // ⚠ Solo se apunta cuando pasa ENTERO: un gate en rojo no es una marca que
  // defender.
  const antes = trinquete.estado === 'ok' ? trinquete.nombres.length : null;
  escribirTrinquete(todas);

  di(`${todas.length === 1 ? 'La comprobación pasa' : `Las ${todas.length} comprobaciones pasan`} · el gate pasa.`);
  if (antes !== null && todas.length !== antes) {
    di(`Trinquete: ${todas.length} (antes ${antes}).`);
  }
  if (ACEPTAR_MENOS && antes !== null && todas.length < antes) {
    di(`Has aceptado medir menos: el gate pasa ahora con ${todas.length} y antes con ${antes}.`);
  }
  terminar(0);
}

if (existsSync(RUTA_GATE)) await gateIntegral();
else await gateDeUnaFuncion();
