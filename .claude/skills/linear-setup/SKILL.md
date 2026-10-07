---
name: linear-setup
description: Lee PLAN.md y crea en Linear el proyecto y una tarea por cada tarea del plan, sin inventar alcance. Antes de escribir nada pregunta en qué espacio de trabajo y en qué equipo. Se corre una sola vez, al empezar.
---

# /linear-setup — el plan, en un tablero

Convierte `PLAN.md` en un tablero. Se corre **una vez**, antes del primer `/goal`.
Las tareas ya están decididas —salieron de la conversación de la persona con
el asistente—: este skill las copia, no las inventa.

## Antes de nada

Comprueba que el servidor de Linear responde: si `/mcp` no lo muestra
conectado, para y dile a la persona que lo autorice. Sin eso todo lo de abajo
falla a la mitad y deja un tablero incompleto, que es peor que ninguno.

## ⚠ Dónde se crea: se pregunta SIEMPRE, antes de escribir nada

Lo que crees en Linear lo ve todo el que esté en ese equipo. Si la persona
conectó el Linear de su trabajo, un proyecto creado en el equipo equivocado
aparece delante de sus compañeros. Nada se pierde y nada se borra, pero eso no
se arregla con cuidado después: se evita preguntando antes.

Por eso, **antes de la primera escritura** (antes de cualquier herramienta que
empiece por `save_`):

1. **Dile en qué espacio de trabajo estás conectado.** Pídelo con
   `get_workspace` y dile el nombre tal cual. Si esa herramienta no responde,
   no lo adivines: dile que el espacio lo eligió al autorizar en `/mcp`, y que
   es el que salía en la pantalla de Linear.
2. **Pregúntale si es el correcto.** Si no lo es, dile cómo cambiarlo: en
   `/mcp`, elegir el servidor de Linear, borrar la autorización y volver a
   autorizar, eligiendo el otro espacio en la pantalla de Linear. Reconectar
   sin borrar la autorización no cambia de espacio. Después, vuelve a empezar
   desde aquí.
3. **Enséñale los equipos** con `list_teams` y **pregúntale en cuál** crear el
   proyecto. **Aunque haya uno solo:** ese único equipo puede ser el de su
   trabajo. Díselo en una frase: «quien esté en ese equipo va a ver el
   proyecto y sus tareas».
4. **Espera la respuesta.** No hay equipo por defecto, ni «el único que hay»,
   ni «el que parece personal». **Sin respuesta, no se crea nada.** Si la
   persona no contesta o duda, para ahí y díselo: es mejor un tablero que
   todavía no existe que uno a la vista de quien no debía.

## Cómo se ejecuta

1. **Lee `PLAN.md` y `PRD.md` enteros.** El plan dice qué tareas hay y en qué
   orden; el PRD, de qué va cada una. Son la única fuente. No mires el código,
   que todavía no existe, y no te apoyes en lo que recuerdes de la conversación.
2. **Haz las preguntas de arriba** y espera la respuesta.
3. **Mira qué hay ya en el equipo elegido**, con `list_projects`. ⚠ El espacio
   de trabajo puede ser compartido: no toques nada que no hayas creado tú en
   esta corrida, y no borres nunca nada.
4. **Crea el proyecto** con `save_project`, en el equipo que la persona dijo,
   usando el nombre que el PRD le da al producto. Si ya existe uno con ese
   nombre, **pregunta** antes de escribir dentro: puede ser de otra persona.
5. **Crea una tarea por cada tarea de `PLAN.md`**, en el mismo orden y con
   `save_issue`. Ni una más, ni una menos, ni fundidas:
   - El título es el de la tarea en el plan, con su número delante: dice qué
     tiene que quedar funcionando, no qué hay que tocar.
   - La descripción cita la parte del PRD de la que sale.
   - Di con qué se va a saber que está hecha. La primera, el andamiaje, cuando
     el ARRANQUE del gate sale en verde. La primera tarea funcional ya trae sus
     casos en `gate/casos/`: nombra el archivo. Las demás todavía no tienen:
     los escribirá `/goal` con `/caso` antes de su código, y dilo así.
6. **Reporta** en cuatro líneas: en qué espacio y en qué equipo, qué proyecto
   creaste, cuántas tareas, y cuáles tienen ya comprobaciones en el gate.

## Las dos reglas que hacen que el tablero sirva

- **Nada de tareas especulativas.** Solo las de `PLAN.md`. El coste de crear
  una tarea se fue a cero; el de leer un tablero inflado, no. Si crees que
  falta algo, **dilo en el reporte** y deja que la persona decida — no lo
  añadas «por si acaso».
- **Ningún número que no venga del gate.** Ni estimaciones, ni porcentajes, ni
  «casi listo». Al empezar, lo honesto es que no hay ninguno.

## Lo que NO hace este skill

No elige por la persona dónde se crea el proyecto, no escribe código, no crea
etiquetas ni estados nuevos, no asigna a nadie y no borra nada. Si el tablero
queda mal, se corrige a mano en Linear: es más rápido que dar marcha atrás a
un agente.
