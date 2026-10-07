# Empieza por aquí

El harness vive en la raíz del repo `sottoly`. No hay que instalarlo: se abre Claude Code en la raíz (o en un worktree creado con `make worktree`) y se trabaja.

## 1 · Abre esta carpeta con Claude Code

En una terminal, dentro de esta carpeta:

```
claude
```

⚠ **En la raíz del repo** (o de un worktree), no en una subcarpeta ni en tu carpeta de usuario.
Es lo que hace que el agente encuentre `CLAUDE.md`, tus reglas y el servidor de
Linear. Si lo abres en otro sitio, funcionará — pero sin nada de esto, y no te
va a avisar.

## 2 · Conecta Linear

Escribe `/mcp`, elige `linear-server` y autoriza en el navegador. Esto es lo
que va a permitir seguir tus tareas en un tablero.

## 3 · Pasa el plan a Linear

```
/linear-setup
```

Te pregunta en qué espacio de trabajo y en qué equipo está el proyecto. En
Linear ya existe el proyecto **Sottoly**, en el workspace `jaircelisv`:
https://linear.app/jaircelisv/project/sottoly-ec6a4a57aa53/overview. Al autorizar en `/mcp`, elige ese workspace. El skill pregunta antes de escribir
dentro, y después crea una tarea por cada tarea de tu `PLAN.md`. No se inventa
nada: solo lo que acordaste.

## 4 · Arranca el bucle

```
/goal
```

A partir de ahí el agente recorre tu plan, tarea a tarea: primero escribe las
comprobaciones de la tarea y las ve fallar, después construye, y mide con
`node gate/verificar.mjs` hasta que todo pasa. Las tareas no tienen tope de
intentos: el bucle sigue hasta que el gate pasa.

Qué esperar:

- **La primera tarea es el arranque**: el proyecto ya existe (fork de Meetily);
  el agente escribe el `Makefile` para que `make demo` abra la App con el
  overlay en modo demo (Next en http://localhost:3118). Las primeras veces,
  Jair la mira trabajar: la tarjeta "Betty · CFO", el desvanecido y ⌘⇧. para
  silenciar.
- **Después, una tarea cada vez**, en el orden de tu `PLAN.md`. Al terminar
  cada una la marca como hecha ahí.
- A veces Claude Code te preguntará si le dejas **cambiar una comprobación que
  ya existe**. Di que sí solo si te explicó por qué y te convence: cambiar una
  comprobación puede ser corregirla, o puede ser rebajar el examen para
  aprobarlo.

⚠ **Que agote los intentos sin conseguirlo es un final legítimo**, no un fallo
tuyo ni suyo: te va a decir dónde quedó y qué falta. Es infinitamente mejor que
un agente que te diga que está listo cuando no lo está.

## Qué es `node gate/verificar.mjs` y cómo se lee

Es el examen de tu proyecto, y no es del agente: es tuyo. Puedes escribirlo tú,
en la terminal, cuando quieras:

```
node gate/verificar.mjs
```

Abre tu app, prueba lo que acordaste que tenía que hacer —cada comprobación con
su nombre en español— y te dice cómo fue, por grupos. Algo así:

```
ARRANQUE
  ✓ la app se abre

TAREA 2 · reservar una clase
  ✓ una clase con sitio admite la reserva
  ✗ una clase llena no admite otra reserva
      con        "yoga-8am", 42
      esperaba   false
      y salió    true

2 de 3 comprobaciones pasan · el gate NO pasa.
```

- **✓** esa comprobación pasa. No hay que hacer nada con ella.
- **✗** no pasa, y debajo va con qué se probó, **qué esperaba** y **qué
  salió**. Esa diferencia es toda la información que hace falta para el
  intento siguiente — no hay que adivinar nada.
- **!** no se ha podido medir (por ejemplo, porque la app no arranca). «No lo
  sé» nunca cuenta como un sí.
- La última línea es el marcador. **Solo está terminado cuando pasa entero.**

⚠ Las comprobaciones tienen nombre por algo: cuando una falla se habla de ella
por su nombre —«no pasa el de la clase llena»—, nunca por su número. Los
números se mueven en cuanto se añade una; los nombres se quedan quietos.

⚠ Y **es normal que al principio falle todo**. El examen existe antes que las
respuestas: si el primer día pasara entero, querría decir que no está midiendo
nada.

## El examen no puede bajar

Cada vez que el gate pasa entero, apunta todo lo que pasó. Si la próxima vez
falta algo de esa lista —una comprobación borrada, menos tests que antes—, no
pasa, aunque lo que quede esté en verde. Así nadie aprueba quitando preguntas
del examen.

Si alguna vez **tú** decides que una comprobación sobra —porque cambiaste de
idea—, bájalo tú, en tu terminal:

```
node gate/verificar.mjs --aceptar-menos
```

⚠ El agente no puede correrlo, a propósito. Si te lo pide, que te explique
antes qué comprobación sobra y por qué.

## Semanas después: quiero añadir algo

Abre Claude Code en esta carpeta y **pídeselo al agente**, con tus palabras:
«quiero que se pueda cancelar una reserva». El agente lo convierte primero en
comprobaciones con `/caso`, las ve fallar, y después escribe el código, hasta
que el gate entero vuelva a pasar — lo nuevo y todo lo de antes. No hace falta
volver a ningún sitio.

Si lo que quieres es otra cosa distinta —cambiar la idea del producto, no
añadirle algo—, eso se repiensa en la conversación del aula de AI Builder
School.

## Si algo se rompe

- **«No encuentro CLAUDE.md»** → no abriste Claude Code dentro de esta carpeta.
- **«No aparece linear-server»** → lo mismo, o falta hacer `/mcp`.
- **El agente dice que funciona y no funciona** → pídele que corra
  `node gate/verificar.mjs` y te enseñe la salida. Esa es siempre la respuesta.
- **«Todavía no existe…» o «la app no arranca»** → al principio eso es
  exactamente lo que toca: el gate tiene que fallar antes de que haya nada
  escrito. No hay que arreglarlo; hay que arrancar el bucle con `/goal`. Si
  sigue apareciendo después de la primera tarea, enséñale la salida tal cual
  al agente.
- **«`gate/` no tiene ni una comprobación»**, o ves notas que dicen «FALTA POR
  ACORDAR» en tus documentos → la conversación del aula se quedó a medias.
  Termínala allí y descarga la carpeta otra vez. Por eso el gate sale en rojo:
  un examen sin preguntas no puede decir que aprobaste.
