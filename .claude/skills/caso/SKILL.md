---
name: caso
description: Añade una comprobación nueva al gate —un caso de función, una prueba de navegador o una regla— como archivo nuevo, escrita antes del código y vista fallar primero.
---

# /caso — añadir una comprobación al gate

Lo que quiere comprobar quien te llama:

> $ARGUMENTS

El gate es la vara con la que se mide si el producto funciona. **Puede crecer,
pero no encogerse**: añadir una comprobación nueva es libre; cambiar o quitar
una que ya existe no lo decides tú.

## Qué tipo de comprobación es

Elige UNA, según lo que haya que medir:

- **Un caso de función** (`gate/casos/`): una función de `src/` que, con una
  entrada concreta, tiene que devolver algo concreto. Es la opción por defecto.
- **Una prueba de navegador** (`gate/e2e/`): solo si el producto tiene
  pantalla y lo que importa es lo que ve o hace una persona en ella.
- **Una regla** (`gate/reglas/`): algo que no se negocia nunca —lo que haría
  que el producto no sirviera aunque todo lo demás pasara—. Lleva además
  `"regla"` (la frase, en llano) y `"porque"` (qué pasa si se incumple).

Si no está claro cuál, pregúntaselo a la persona antes de escribir nada.

## Cómo se escribe

1. **Un archivo NUEVO, nunca uno existente.** Nómbralo con el número de la
   tarea delante, para que se lean en orden: `gate/casos/02-moverse-y-saltar.json`,
   `gate/e2e/03-pantalla-de-inicio.spec.js`, `gate/reglas/01-no-cobra-dos-veces.json`.
   Si el nombre ya existe, elige otro: no lo sobrescribas.

2. **Un caso de función** tiene esta forma:

   ```json
   {
     "tarea": "2 · moverse y saltar",
     "origen": "agente",
     "modulo": "src/juego/fisica.js",
     "funcion": "paso",
     "casos": [
       { "nombre": "sin tocar nada, el personaje cae", "entrada": [{ "y": 0, "vy": 0 }], "esperado": { "y": 1, "vy": 1 } }
     ]
   }
   ```

   - `"origen": "agente"` siempre: dice que lo escribiste tú y no salió de la
     conversación con la persona. `"plataforma"` no lo pones nunca.
   - Cada caso lleva un **nombre en lenguaje llano**, el que la persona
     reconocería: es lo que se lee cuando falla.
   - `entrada` es la lista de argumentos con los que se llama a la función.

   **Una prueba de navegador** es un archivo de Playwright que termina en .spec.js
   (`import { test, expect } from '@playwright/test'`) que hace lo que haría
   una persona: abrir la página, pulsar, mirar lo que aparece.

   **Una regla** es un caso de función con `"regla"` y `"porque"` además, o un
   archivo .spec.js si la regla es sobre la pantalla.

3. **Se escribe ANTES que el código de esa tarea.** Primero la comprobación,
   después lo que la cumple. Al revés, la comprobación acaba midiendo lo que
   hiciste en vez de lo que hacía falta.

4. **Corre `node gate/verificar.mjs` y míralo FALLAR.** Tu comprobación nueva tiene
   que salir en rojo, por su nombre.

   ⚠⚠ **Si pasa sin que hayas escrito el código, no mide nada.** Puede estar
   llamando a otra función, comparando algo consigo mismo o mirando un sitio
   que no toca lo que dice medir — y seguiría en verde el día que el producto
   se rompa. Dilo en voz alta, con la salida delante, y **para ahí**. Para
   corregirla hace falta cambiar un archivo que ya existe, así que la persona
   tendrá que aprobarlo: explícale que la comprobación todavía no mide nada.

5. Solo cuando la has visto en rojo, escribe el código en `src/` y vuelve a
   correr el gate hasta verla en verde.

## Lo que no se hace

- **Nunca edites una comprobación que ya existe para que pase.** Eso no es
  arreglar el producto: es mover la vara. Si de verdad está mal —un número
  equivocado, un criterio que la persona cambió—, **pídele permiso a la persona
  y explícale por qué** antes de tocarla. Claude Code le preguntará en su
  terminal; sin nadie delante, el cambio se bloquea.
- Nunca borres una comprobación, ni la vacíes, ni le quites casos. Y no
  serviría: el gate apunta todo lo que pasó la última vez que pasó entero, y
  si falta algo, no pasa. Bajar esa marca es de la persona, en su terminal.
- `gate/verificar.mjs` y `.harness/` no se tocan nunca, ni con permiso.
- `gate/gate.json` (cómo arranca la app y qué se corre) cambia solo con
  permiso de la persona.

## Al terminar

Di en una línea qué comprobación añadiste, en qué archivo, y que la viste
fallar antes del código — con el nombre del caso tal como sale en el gate.
