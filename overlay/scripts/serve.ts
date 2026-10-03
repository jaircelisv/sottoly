// Servidor estático para las specs: sirve lo que Tauri cargaría en la ventana overlay.
import { join, normalize } from "node:path";

const root = join(import.meta.dir, "../../frontend/public");
const port = Number(process.env.PORT ?? 3119);

Bun.serve({
  port,
  async fetch(req) {
    if (new URL(req.url).pathname === "/healthz") return new Response("ok");
    const path = normalize(decodeURIComponent(new URL(req.url).pathname));
    const file = Bun.file(join(root, path));
    return (await file.exists()) ? new Response(file) : new Response("not found", { status: 404 });
  },
});
console.log(`overlay en http://localhost:${port}/overlay/index.html`);
