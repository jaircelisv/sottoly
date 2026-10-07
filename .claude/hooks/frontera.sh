#!/usr/bin/env bash
# Impide escribir fuera de la zona del alumno, y deja que el gate CREZCA sin
# poder ENCOGERSE (CAS-466).
#
# ⚠⚠ Esto existe porque en el repo del que viene esta plantilla, esa regla
# estaba SOLO escrita en markdown. Una regla escrita es una regla que el modelo
# cumple porque quiere; con sesenta personas a la vez, alguna carpeta no la va a
# cumplir — y el fallo se ve exactamente igual que el éxito: un agente que dice
# que está listo.
#
# Es la diferencia entre una comprobación y una imposibilidad.
#
# ── Las tres respuestas ──────────────────────────────────────────────────────
#
#   · BLOQUEAR (salida 2) — siempre, en cualquier modo:
#       PRD.md, CLAUDE.md, .claude/, .mcp.json, .harness/, gate/verificar.mjs,
#       y cualquier ruta de gate/ que no sea de las de abajo.
#   · LIBRE (salida 0) — un archivo NUEVO en gate/casos/*.json, gate/e2e/*.spec.js
#       o gate/reglas/*.json|*.spec.js. Añadir una comprobación solo puede hacer
#       el gate más exigente: es crecer.
#   · PREGUNTAR («ask», salida 0 con JSON) — cambiar uno que YA existe en esas
#       tres carpetas, y gate/gate.json o gate/casos.json existan o no. Cambiar
#       una comprobación puede ser corregirla o puede ser mover la vara para
#       ponerse verde, y desde aquí no se distingue: lo decide la persona.
#
# ⚠⚠ Hasta CAS-466 todo gate/ era intocable, y a la vez CLAUDE.md le pedía al
# agente convertir cada criterio nuevo en un caso: una contradicción que el
# agente resolvía como podía. La salida no es abrir gate/, es abrir SOLO la
# dirección que no permite hacer trampa.
#
# ⚠⚠ gate/reglas/ lleva el MISMO trato que casos/ y e2e/: pregunta, no bloquea.
# Es DECISIÓN DEL USUARIO del 18/09/2026, CONTRA la recomendación del diseño,
# que pedía bloquear las reglas siempre. No es un descuido: no lo «corrijas».
# Hay un test que lo fija con esa misma frase.
#
# ⚠⚠ gate.json y casos.json preguntan aunque NO existan. gate.json dice cómo se
# arranca la app y qué comandos se corren: crearlo cambia qué se mide, no añade
# una medición. casos.json es el formato viejo de una sola ficha (WS-01): lo
# nuevo va en casos/, y crearlo a estas alturas merece que alguien lo mire.
#
# ── ⚠⚠ La pieza que sostiene todo: sin nadie delante, «ask» es un sí ─────────
#
# En `bypassPermissions` y en `dontAsk` nadie contesta la pregunta. Así que ahí
# lo que pediría permiso SE BLOQUEA, con un motivo que lo dice. Quitar esto
# convierte cada «ask» en un permiso automático para mover la vara.
# Y un modo que NO conocemos, o que no llega, también bloquea: fallar hacia el
# lado cerrado es lo único que no se descubre tarde.
#
# ── Qué se verificó en la documentación oficial (18/09/2026) ─────────────────
# https://code.claude.com/docs/en/hooks y .../permission-modes:
#   · `permission_mode` llega en la entrada: «"default", "plan", "acceptEdits",
#     "auto", "dontAsk", or "bypassPermissions". The mode labeled Manual
#     arrives as "default", never as "manual"».
#   · La salida para preguntar: `hookSpecificOutput.permissionDecision` =
#     "ask", con `permissionDecisionReason` — «For "allow" and "ask", shown to
#     the user but not Claude». Con salida 0: con 2 se ignora el JSON.
#   · «A hook's "ask" also forces a permission prompt in auto mode».
#   · dontAsk: «auto-denies every tool call that would otherwise prompt you».
#   · ⚠ Lo que la doc NO dice es qué hace un «ask» de hook en
#     bypassPermissions. Por eso no se deja al azar: se bloquea aquí.
#   · Para Write y Edit, «tool_input.file_path is always absolute» (Claude Code
#     expande las relativas). Aun así se aceptan las dos formas: la relativa
#     se resuelve contra $CLAUDE_PROJECT_DIR. NotebookEdit trae `notebook_path`.
#   · El matcher de settings.json con solo letras y `|` es una lista EXACTA
#     («`Edit|Write` … match either tool exactly»), así que `Write|Edit` dejaba
#     fuera NotebookEdit: un `.ipynb` dentro de gate/ o de .claude/ pasaba sin
#     preguntar. Por eso el matcher nombra también NotebookEdit, y MultiEdit
#     para las versiones de Claude Code que aún la tienen (nombrar una
#     herramienta que no existe no cuesta nada).
#
# ⚠ Y lo que este hook NO ve: una escritura hecha desde Bash (`echo > gate/…`,
# un script de Python). Es la barandilla de las herramientas de edición, no un
# aislamiento; lo que se borre por otra vía lo caza el trinquete del verificador.
#
# ⚠ Las rutas se NORMALIZAN antes de clasificar: sin eso
# `gate/casos/../verificar.mjs` es un «archivo nuevo en casos/» a ojos de un
# patrón de texto. Y se siguen los enlaces simbólicos de lo que ya existe, por
# lo mismo: `gate/casos` apuntando a `gate/` no convierte el verificador en un
# caso.
#
# Recibe el JSON de la llamada por la entrada estándar.
set -uo pipefail

# ⚠ Si node no está, el hook no puede decidir nada — y un hook que no decide
# deja pasar. Mejor decirlo que fallar abierto en silencio.
if ! command -v node >/dev/null 2>&1; then
  echo "Bloqueado: el guardián de la frontera necesita node para decidir y no lo encuentra. Instala Node (el gate también lo necesita)." >&2
  exit 2
fi

read -r -d '' DECIDIR <<'JS'
const fs = require('node:fs');
const path = require('node:path').posix;

const INMUTABLE = 'es inmutable. Hacer pasar el gate cambiando el gate es hacer trampa, no cumplir el objetivo.';

function bloquear(motivo) {
  process.stderr.write(motivo + '\n');
  process.exit(2);
}

// Los modos en los que un «ask» llega a una persona. Lista de lo PERMITIDO:
// un modo nuevo o ausente cae del lado cerrado.
const MODOS_QUE_PREGUNTAN = new Set(['default', 'plan', 'acceptEdits', 'auto']);

function preguntar(modo, visible, motivo) {
  if (!MODOS_QUE_PREGUNTAN.has(modo)) {
    bloquear(
      `Bloqueado: cambiar '${visible}' necesita el permiso de la persona, y en el modo ` +
        `'${modo || 'desconocido'}' nadie puede darlo — una pregunta sin nadie delante sería un sí automático. ` +
        'Si es una comprobación NUEVA, escríbela en un archivo nuevo de gate/casos/, gate/e2e/ o gate/reglas/. ' +
        'Si hay que cambiar una que ya existe, para y explícale a la persona por qué.',
    );
  }
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: motivo,
      },
    }),
  );
  process.exit(0);
}

/** Resuelve los enlaces de la parte que ya existe; lo que aún no existe se añade tal cual. */
function real(p) {
  const cola = [];
  let actual = p;
  for (;;) {
    try {
      return path.join(fs.realpathSync(actual).replace(/\\/g, '/'), ...cola.reverse());
    } catch {
      const padre = path.dirname(actual);
      if (padre === actual) return p;
      cola.push(path.basename(actual));
      actual = padre;
    }
  }
}

function existe(p) {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

let d = '';
process.stdin.on('data', (c) => (d += c)).on('end', () => {
  try {
    let j = {};
    try { j = JSON.parse(d); } catch {}
    const crudo = String(j?.tool_input?.file_path ?? j?.tool_input?.notebook_path ?? '');
    if (!crudo) process.exit(0);

    const modo = typeof j.permission_mode === 'string' ? j.permission_mode : '';
    const raizCruda = (process.env.CLAUDE_PROJECT_DIR || j.cwd || process.cwd()).replace(/\\/g, '/');
    const raiz = real(path.resolve(raizCruda));
    const absoluta = real(path.resolve(raiz, crudo.replace(/\\/g, '/')));
    const tramos = absoluta.split('/').filter(Boolean);
    const nombre = tramos[tramos.length - 1] ?? '';

    // Lo intocable, esté donde esté: fuera del proyecto también (el
    // ~/.claude/ de la persona no es asunto del agente).
    //
    // ⚠⚠ `.harness/` entra aquí aunque no lo parezca: dentro vive la marca de
    // cuándo se midió por última vez, y `medir.sh` la compara con la fecha de
    // tu código. Si esa marca se pudiera escribir, la forma más rápida de
    // callar al guardián sería tocarla — que es hacer trampa con un paso más.
    if (
      nombre.endsWith('PRD.md') ||
      nombre.endsWith('CLAUDE.md') ||
      nombre === '.mcp.json' ||
      tramos.includes('.claude') ||
      tramos.includes('.harness')
    ) {
      bloquear(`Bloqueado: '${crudo}' ${INMUTABLE}`);
    }

    // Dónde empieza el gate. Dentro del proyecto, solo el gate/ de la raíz lo
    // es: un src/gate/ es código del producto. Fuera del proyecto (o sin saber
    // cuál es) se toma el último tramo `gate`, que es la lectura que más
    // bloquea: ante la duda, cerrado.
    let enGate = null;
    const relativa = path.relative(raiz, absoluta);
    const dentro = relativa !== '' && !relativa.startsWith('..') && !path.isAbsolute(relativa);
    if (dentro) {
      const t = relativa.split('/');
      if (t[0] === 'gate') enGate = t.slice(1);
    } else {
      const i = tramos.lastIndexOf('gate');
      if (i !== -1) enGate = tramos.slice(i + 1);
    }
    if (enGate === null) process.exit(0);

    const visible = ['gate', ...enGate].join('/');
    const [carpeta, archivo, ...sobra] = enGate;

    if (enGate.length === 1 && (carpeta === 'gate.json' || carpeta === 'casos.json')) {
      preguntar(
        modo,
        visible,
        `El agente quiere ${existe(absoluta) ? 'cambiar' : 'crear'} ${visible}, que decide QUÉ se mide. ` +
          'Apruébalo solo si te explicó por qué y te parece bien.',
      );
    }

    const FORMAS = {
      casos: (n) => n.endsWith('.json'),
      e2e: (n) => n.endsWith('.spec.js'),
      reglas: (n) => n.endsWith('.json') || n.endsWith('.spec.js'),
    };
    const esComprobacion =
      Object.hasOwn(FORMAS, carpeta) && archivo && sobra.length === 0 && FORMAS[carpeta](archivo);

    if (!esComprobacion) {
      // gate/verificar.mjs y cualquier otra cosa: es la vara de medir.
      bloquear(
        `Bloqueado: '${crudo}' ${INMUTABLE} ` +
          'Lo único que se puede añadir al gate es un archivo nuevo en gate/casos/*.json, ' +
          'gate/e2e/*.spec.js o gate/reglas/ (.json o .spec.js).',
      );
    }

    // Una comprobación NUEVA hace el gate más exigente: es crecer, y es libre.
    if (!existe(absoluta)) process.exit(0);

    preguntar(
      modo,
      visible,
      `El agente quiere cambiar ${visible}, una comprobación que ya existe. ` +
        'Cambiarla puede ser corregirla o puede ser mover la vara para ponerse en verde. ' +
        'Apruébalo solo si te explicó por qué.',
    );
  } catch (e) {
    // Un fallo aquí no puede convertirse en un sí.
    bloquear(`Bloqueado: el guardián de la frontera falló al decidir (${e?.message ?? e}).`);
  }
});
JS

node -e "$DECIDIR"
codigo=$?

# ⚠ Cualquier salida que no sea 0 ni 2 Claude Code la toma por un error que NO
# bloquea: un node que revienta dejaría pasar la escritura. Se cierra aquí.
if [ "$codigo" -ne 0 ] && [ "$codigo" -ne 2 ]; then
  echo "Bloqueado: el guardián de la frontera no pudo decidir (salida $codigo)." >&2
  exit 2
fi
exit "$codigo"
