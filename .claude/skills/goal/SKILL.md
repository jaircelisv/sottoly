---
name: goal
description: Recorre PLAN.md tarea a tarea —primero sus casos en rojo, luego el código, luego el gate entero en verde— usando el gate como única fuente de verdad, hasta terminar el plan o agotar los intentos de una tarea.
---

# /goal — el bucle

El objetivo que dio quien te llama:

> $ARGUMENTS

Si no dio ninguno, el objetivo es **terminar `PLAN.md`**: todas sus tareas
hechas y `node gate/verificar.mjs` pasando entero. Cada tarea tiene un máximo de
**ilimitado intentos**. Si el objetivo nombra una tarea concreta, o un
límite distinto, respétalo.

## Antes de la primera tarea

1. **Lee `PRD.md`, `PLAN.md` y `CLAUDE.md`.** El PRD define el producto, el
   plan el orden, y `CLAUDE.md` las reglas.
2. **Corre `node gate/verificar.mjs`** antes de tocar nada, para saber de dónde
   partes. ⚠ Esa corrida **no cuenta como intento**: medir no es intentar.

   ⚠⚠ **Al principio el gate DEBE fallar.** Sin app todavía, el arranque sale
   en rojo y los casos no encuentran el código; eso no es un problema que
   arreglar, es el punto de partida. Y si **pasa a la primera sin que nadie
   haya escrito nada**, no lo celebres ni sigas: el gate está mal escrito o sus
   comprobaciones no comprueban nada. Dilo en voz alta, con la salida delante,
   y para ahí. Un verde que no se ha visto nunca en rojo no significa que el
   producto funcione — significa que nadie sabe si funciona.

## Cada tarea, en orden

Coge la primera tarea de `PLAN.md` que no esté marcada como hecha, y anúnciala
en una línea: `Tarea N — <qué tiene que quedar funcionando>`.

1. **Sus casos, primero.** Si la tarea todavía no tiene comprobaciones en el
   gate, escríbelas con `/caso` —un archivo nuevo por tarea—, corre
   `node gate/verificar.mjs` y **míralas fallar** por su nombre. Si salen en verde sin
   código, no miden nada: para y díselo a la persona.
   (Los casos de la primera tarea funcional ya vienen en `gate/casos/`; esos
   solo hay que verlos en rojo.)
2. **Itera.** Cada intento, en este orden:
   - Anuncia en una línea: `Intento N — hipótesis: <qué crees que falla y qué vas a cambiar>`.
   - Cambia el código.
   - Corre `node gate/verificar.mjs` y **lee la salida entera**. Esa salida es tu
     retroalimentación: analízala antes del cambio siguiente.
   - Cada comprobación que falla se nombra **por su nombre**, tal como aparece
     en el reporte — nunca «el caso 3». Los números se corren en cuanto cambia
     la lista, y además el nombre es lo que la persona reconoce.
   - Reporta el resultado en una línea.
3. **La tarea está hecha cuando el gate pasa ENTERO**, no solo sus casos: lo
   que funcionaba antes tiene que seguir funcionando.
4. **Márcala como hecha en `PLAN.md`** y pasa a la siguiente.

**Para** con lo primero que ocurra: el plan se termina, o una tarea agota sus
intentos. Si una tarea los agota, **no sigas con la siguiente**: construir
encima de algo que no pasa esconde dónde se rompió.

### La tarea 1 es el andamiaje

No lleva casos de función: lo que la mide es el ARRANQUE del gate. Consiste en:

- crear el proyecto con el stack del PRD;
- que `make demo` (se abre en http://localhost:3118) abra la app;
- si el stack es JavaScript, un script `test` en su `package.json` (con
  `node --test` basta: sin tests todavía, sale bien);
- si el producto tiene pantalla, instalar Playwright:
  `npm install -D @playwright/test && npx playwright install chromium`.

Está hecha cuando **el ARRANQUE sale en verde** en el gate. Todo lo demás
seguirá en rojo, y es lo correcto: son las tareas que vienen.

⚠ Anunciar la hipótesis antes de cambiar no es burocracia: es lo que convierte
cada vuelta en un experimento en vez de en un manotazo, y es lo que hace que la
persona pueda seguirte.

## Reglas duras

- El gate **crece, no encoge**. Añadir una comprobación nueva con `/caso` es
  libre. Cambiar una que ya existe, o `gate/gate.json`, se le pide a la persona
  explicándole por qué. Borrar una no sirve: el trinquete deja el gate en rojo
  si falta algo que ya pasó, y bajarlo es solo de la persona.
- **Nunca** se tocan `gate/verificar.mjs`, `.harness/`, `PRD.md`, `CLAUDE.md`
  ni `.claude/`. Un gate que el agente puede rebajar no mide al agente: mide
  sus ganas de terminar.
- Prohibido el overfitting: nada atado a los textos literales de los casos.
- **Nunca reportes un número que no hayas visto en la salida real del gate.**

## El reporte final

Al terminar, por éxito o por límite:

1. Tabla de tareas: número, qué quedó funcionando, intentos gastados,
   resultado.
2. Lo que terminó siendo la solución de cada tarea, en una o dos frases.
3. Si una tarea agotó sus intentos, **dónde quedó y qué falta**. Un final
   honesto vale más que un «ya está» que la persona va a descubrir mañana.
