# El plan de Sottoly

Las tareas del bucle, **en orden**. Salen de la conversación de planificación del harness (2026-10-06) y del estado real del repo: Sottoly no parte de cero (ver `SPEC.md` y `docs/HANDOFF.md`). La prioridad es la demo: en una Reunión real, Betty muestra al menos una Sugerencia útil en menos de 2 s, en el overlay.

1. **El arranque: `Makefile` en la raíz** con `verify` (las tres suites: `bun test`, Playwright del overlay, `cargo test`), `sidecars` (`llama-helper` y `sottoly-engine`) y `demo` (Next en `localhost:3118` precalentado, después Tauri con `SOTTOLY_DEMO_SUGGESTIONS=1` y `beforeDevCommand` vacío), además de `measure` (envuelve `scripts/sottoly/latency/measure.sh`). Hecha cuando el ARRANQUE del gate sale en verde. ✅ hecha
2. **`make worktree NAME=<nombre>`**: crea el worktree desde `origin/main` con la rama `sottoly/<nombre>`, escribe un `CLAUDE.local.md` de una línea (`@~/.sottoly/CLAUDE.private.md`), falla con un mensaje claro si ese archivo privado no existe, y deja los binarios que Tauri necesita en `frontend/src-tauri/binaries/` (copiados o con `make sidecars`). ✅ hecha
3. **El contrato, generado desde Zod**: JSON Schema versionado generado desde `engine/src/protocol.ts` (`z.toJSONSchema`), un juego de mensajes de ejemplo (JSONL) que cubra `segment`, `session`, `clock`, `suggestion`, `suggestion_delta`, `suggestion_cancel` y `summary`, y un check de CI que falle si el schema quedó desactualizado. Esta tarea pone en verde la regla `gate/reglas/integridad-del-protocolo.json` (función `contrato_integro` en `scripts/sottoly/contract/contrato.mjs`). ✅ hecha
4. **Zod y Rust aceptan los mismos mensajes**: `aceptan(mensaje)` en `scripts/sottoly/contract/contrato.mjs` devuelve `{ zod, rust }`. El lado de Rust deserializa con los structs de `engine_bridge.rs` (por ejemplo, con un `cargo run --example` que lee el mensaje por stdin). Corrige el desfase del `id` (opcional en Zod, obligatorio en Rust): lo coherente con el streaming es volverlo obligatorio en Zod y que el modo demo lo mande. Sus casos ya están en `gate/casos/04-zod-y-rust-aceptan-lo-mismo.json`. ✅ hecha
5. **Overlay con streaming**: el overlay dibuja `suggestion_delta` (texto parcial, sin motivo ni botones), reemplaza con el `suggestion` final del mismo `id`, oculta con `suggestion_cancel` y se oculta solo si no llega el final en 8 s. Casos en `overlay/tests/streaming.spec.ts` (Playwright, IPC simulado) antes del código; el gate los mide por `make verify`, que no puede bajar de su número de tests (decisión de Jair, 2026-10-07: sin `package.json` ni `node_modules` en la raíz). ✅ hecha
6. **Limpieza de privacidad**: `make limpiar` borra las Reuniones de prueba y los `transcripts.json` que Meetily escribe en disco después de una medición, sin tocar nada más. ✅ hecha

### Segunda etapa (2026-10-07, después de la primera prueba de punta a punta)

Salen de la prueba con audio real del 2026-10-07 (20 Sugerencias, todas del CFO) y de lo que pidió Jair. Las de pantalla empiezan por un diseño (skill `hallmark`) que Jair aprueba antes de escribir sus casos.

7. **Una negativa no llega al overlay**: cuando la Redacción no tiene una Sugerencia que dar (en la prueba salió «Betty no opina sobre…» como tarjeta), el Motor manda `suggestion_cancel` en lugar de `suggestion`. Casos en el gate con un modelo simulado que devuelve una negativa. ✅ hecha
8. **Antiruido como dice el SPEC**: no repetir una Sugerencia ya mostrada sobre el mismo punto (en la prueba, «pide por escrito…» salió 8 veces y el régimen tributario 4 seguidas) y un tope de Sugerencias por Reunión. Casos con una secuencia de Turnos y un modelo simulado. ✅ hecha
9. **Las Decisiones candidatas al cerrar la Reunión**: al detener la grabación el Motor manda `summary` (en la prueba no salió ninguno). Casos con una Reunión simulada que se cierra. ✅ hecha
10. **`make measure` mide fin del habla → tarjeta**: además de la latencia de los Segmentos, calcula p50/p90 de fin del habla → primer texto en el overlay a partir del log. Casos con un log de ejemplo. ✅ hecha
11. **Evals de la Redacción**: la Sugerencia respeta los límites del Rol (en la prueba comentó lo personal), tiene una sola forma (indicación al Usuario) y no queda cortada por el tope de palabras. Fixtures con fragmentos de la prueba, sin datos reales en el repo público. ✅ hecha
12. **Panel Sottoly**: en la ventana principal, Reuniones (con su transcripción) y Roles, como pantallas nuevas sin borrar las de Meetily. Diseño aprobado primero; specs de Playwright contra `localhost:3118` con IPC simulado. ✅ hecha
13. **Chat con el Rol**: en la ventana principal, junto a la transcripción en vivo, el Usuario le responde a una Sugerencia o le pregunta al Rol por lo que se está diciendo, y la respuesta llega en streaming. Mensajes nuevos en `engine/src/protocol.ts` primero (la regla de integridad los cubre), después Rust y la pantalla. Diseño aprobado primero. ✅ hecha
14. **Creador de Roles**: entrevista guiada (función, Persona, cuándo interviene, límites, nombre) que escribe el archivo del Rol en `roles/`. El Rol nace sin calibrar (`calibrated_with: none`) con un umbral conservador y ejemplos para calibrarlo. Diseño aprobado primero. ✅ hecha

### Tercera etapa (2026-10-07, los huecos que dejó la segunda)

15. **Quién habló, en las Reuniones guardadas**: Meetily tiene la columna `speaker` pero no la llena; al guardar la Reunión se guarda si cada frase fue del Usuario o de la Contraparte, y el panel lo muestra. Casos con una Reunión guardada en una base temporal. ✅ hecha
16. **Evals de las Decisiones: no inventar**: Reuniones sintéticas con la respuesta correcta (lo que se decidió y lo que no; un pedido que nadie aceptó no es un compromiso) y criterios sobre lo que propone el modelo real, grabado; el prompt se ajusta hasta que pasen. ✅ hecha
17. **Aprobar las Decisiones**: el `summary` del cierre se guarda con la Reunión; en el panel, cada Decisión se aprueba, edita o descarta, o «No guardar nada»; lo aprobado va a la Memoria (`~/.sottoly/memory/`, un Markdown por Reunión, SPEC §6). Diseño ya aprobado (pantalla 2). ✅ hecha
18. **Calibrar la Compuerta**: evals de la Compuerta con Jev sobre los fixtures (precisión y recall por Rol, SPEC §8); el umbral de cada Rol se ajusta con esos números y `calibrated_with` dice con qué se calibró. Los ejemplos que guarda el creador de Roles entran como fixtures. ✅ hecha
19. **Antiruido para la misma idea con otras palabras**: pares de Sugerencias parafraseadas (de los patrones de la prueba) se reconocen como la misma idea, y pares distintos no. ✅ hecha
20. **El gate cuenta todos los tests**: `make verify` termina con el total real de todas sus suites (bun test, Playwright del overlay y del panel, cargo test), para que el mínimo de tests los proteja a todos. ✅ hecha

### Cuarta etapa (2026-10-08, para probar con audio real sin la consola)

21. **Grabar desde el panel**: «En vivo» tiene «Iniciar grabación» y «Detener y revisar Decisiones»; al detener guarda la Reunión con toda la transcripción que vio el panel (con quién habló) y abre su detalle, donde las Decisiones aparecen en cuanto el Motor las propone. El menú de Meetily tiene un enlace al panel. Specs de Playwright con IPC simulado antes del código. ✅ hecha
22. **En vivo, versión 2** (diseño aprobado por Jair el 2026-10-08, canvas «1b»): tarjetas compactas que se contraen a una línea o se ignoran (con Deshacer; ignorar marca «No útil»), el motivo detrás de «Por qué», Útil / No útil, filtro «Todo / Solo Sugerencias» con contador, y scroll propio en la transcripción y en el chat con «Ir a lo último». Además, `make demo` deja de mostrar tarjetas de demostración salvo con `DEMO=1`, y en desarrollo el panel tiene un interruptor para prenderlas o apagarlas sin reiniciar (pedido de Jair). ✅ hecha

### Quinta etapa (2026-10-08, de la prueba con audio real en la pantalla nueva)

23. **En vivo, versión 3** (diseño aprobado por Jair el 2026-10-08, canvas «1c»): lo que se ve en «En vivo» (transcripción, Sugerencias, chat y grabación) no se pierde al cambiar de pestaña; el chat muestra el formato de las respuestas en vez de asteriscos, con el Rol a la vista, respuestas cortas sin presentarse, preguntas de ejemplo y scroll hasta lo último; la transcripción va en bloques por hablante y oculta el eco (una frase del Usuario que repite lo que la Contraparte acaba de decir) con un aviso para usar audífonos; «Grabando» dice desde hace cuánto. Specs de Playwright con IPC simulado antes del código. ✅ hecha
24. **Preguntarle a toda la junta** (pedido de Jair en la prueba del 2026-10-09): en el chat de «En vivo», «Todos» va primero entre los Roles; una pregunta a «Todos» le llega a cada Rol activo y cada uno responde con su nombre. Además, el eco se reconoce aunque una frase diga los números en palabras y la otra en cifras («cien» y «100»). Specs de Playwright con IPC simulado antes del código. ✅ hecha

### Sexta etapa (2026-10-09, de la segunda prueba con audio; decisiones de Jair del mismo día)

25. **Meetily y Sottoly se encuentran** (Meetily es la casa; canvas «4»): el menú de Meetily tiene una sección «Sottoly · tu junta» siempre visible (En vivo, Reuniones y Decisiones, Roles), y el panel tiene «Volver a Meetily» arriba del menú. Specs de Playwright antes del código. ✅ hecha
26. **El eco no llega a la Compuerta**: el Motor descarta un Segmento del Usuario que repite lo que la Contraparte acaba de decir (o al revés, si llegó primero), con los números en palabras o cifras, y lo registra en el log; la Compuerta y la Redacción ven la conversación real. Casos con una Reunión simulada con eco. ✅ hecha
27. **Detalle de la Reunión, versión 2** (canvas «5»): la pantalla hace scroll; el título se cambia con un clic; las Sugerencias de la junta se guardan con la Reunión y aparecen en la transcripción en su momento, con la marca Útil / No útil; «Guardar en mi Memoria» dice cuántas Decisiones faltan por revisar. Specs de Playwright antes del código. ✅ hecha
28. **El título lo propone el modelo**: al cerrar la Reunión, el `summary` trae un título corto de lo que se habló y la Reunión se guarda con él; el Usuario lo puede cambiar. Mensaje nuevo en `engine/src/protocol.ts` primero (la regla de integridad lo cubre), después el Motor, Rust y la pantalla. ✅ hecha
29. **Hablar con la junta después de la Reunión** (canvas «5»): el detalle tiene el chat a la derecha (con «Todos»); el Rol responde con la transcripción guardada de esa Reunión. El historial no se guarda. Protocolo primero, después Motor, Rust y pantalla. ✅ hecha
30. **Cuánto interviene cada Rol** (canvas «6»): en Roles, cada uno tiene «Solo lo importante» (el umbral calibrado), «Equilibrado» o «Más seguido»; la elección se guarda fuera del Rol y la Compuerta la usa sin tocar `gate_option`, `gate_definition` ni `calibrated_with`. Casos del Motor y specs de Playwright. ✅ hecha
31. **Crear un Rol conversando** (canvas «7»): el creador de Roles es un chat con un agente que pregunta con opciones de selección única o múltiple y un campo libre para lo que no esté; al lado se ve cómo va quedando el Rol. Escribe el mismo archivo de Rol que hoy (sin calibrar). Diseño aprobado antes de los casos.

## Lo que hace Jair (fuera del bucle)

- **Integrar los PRs**, solo con checks en verde. Pendientes hoy: #25 → #28 (documentación) y #26 (`check_local_model`).
- **La prueba de punta a punta con audio real**: Jair inicia la grabación (no se concede Accesibilidad), `make measure` reproduce las frases y se mide por primera vez **fin del habla → tarjeta** (p50/p90). No es una tarea del bucle porque el gate no puede iniciar la grabación.

## Cómo se recorre

- **Una tarea cada vez, en este orden.** `/goal` empieza por la primera que no esté marcada como hecha.
- **La primera es el arranque**: el proyecto ya existe (fork de Meetily, ADR-0001); lo que falta es que `make demo` abra la App en `http://localhost:3118`. Está hecha cuando el ARRANQUE sale en verde en el gate; lo demás sigue en rojo, y es lo correcto.
- **Antes del código de una tarea van sus casos.** Se escriben con `/caso`, se ven fallar, y después se escribe el código que los cumple. Los de la tarea 4 y la regla de integridad ya vienen en `gate/`.
- **Una tarea está hecha cuando el gate entero pasa**, no solo sus casos: lo que ya funcionaba tiene que seguir funcionando. (La excepción es el arranque, que termina con el ARRANQUE en verde.)
- **Cada tarea es un PR pequeño contra `main`** (`gh pr create --repo jaircelisv/sottoly --base main`), con commits `test:` → `feat:` → `refactor:`. Nunca apilado. Jair hace el merge.
- Al terminar una, se marca aquí como hecha —`[x]` en su casilla, o «✅ hecha» al final de su línea— y se sigue con la siguiente.

⚠ Cambiar el orden, quitar una tarea o añadir una nueva lo decide la persona, no el agente: se le pregunta antes. Una tarea nueva va al final.
