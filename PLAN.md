# El plan de Sottoly

Las tareas con las que se construye el MVP, **en orden**. Salen de tu
conversación con el asistente de AI Builder School: son las que acordasteis, no
una lista genérica.

1. Crear Makefile con `worktree`, `verify`, `sidecars`, `demo` y `measure`.
2. Implementar `make worktree` con lógica de validación, creación de `CLAUDE.local.md` y gestión de binarios.
3. (Pendiente de integrar PR #27) Definir Zod Schema (protocol.ts) y CI check para asegurar coherencia con JSON Schema.
4. (Pendiente de integrar PR #27) Implementar test de Rust (engine_bridge.rs) para deserialización (usando fixtures JSONL).
5. (Pendiente de integrar PR #27) Resolver desfases de tipos (como `id` en SuggestionMessage) para pasar los tests.
6. Integrar #25-#28 y pruebas E2E.
7. Implementar grabador de sesiones (fixtures públicos) y limpieza automática de activos.

## Cómo se recorre

- **Una tarea cada vez, en este orden.** `/goal` empieza por la primera que no
  esté marcada como hecha.
- **La primera es siempre el andamiaje**: crear el proyecto con el stack
  acordado y conseguir que la app se abra en tu computador con `make demo` (se abre en http://localhost:3118).
  Si el proyecto es de JavaScript, lleva además un script `test` en su
  `package.json`, y si tiene pantalla, Playwright instalado para las pruebas de
  navegador. Está hecha cuando el ARRANQUE sale en verde en el gate; lo demás
  sigue en rojo, y es lo correcto.
- **Antes del código de una tarea van sus casos.** Se escriben con `/caso`, se
  ven fallar, y después se escribe el código que los cumple. Los de la primera
  tarea funcional ya vienen en `gate/casos/`: salieron de tu conversación.
- **Una tarea está hecha cuando el gate entero pasa**, no solo sus casos: lo
  que ya funcionaba tiene que seguir funcionando. (La excepción es el
  andamiaje, que termina con el arranque en verde.)
- Al terminar una, se marca aquí como hecha —`[x]` en su casilla, o
  «✅ hecha» al final de su línea— y se sigue con la siguiente.

⚠ Cambiar el orden, quitar una tarea o añadir una nueva lo decide la persona,
no el agente: se le pregunta antes. Una tarea nueva va al final.
