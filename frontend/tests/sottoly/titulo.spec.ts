// El título lo propone el modelo (PLAN.md, tarea 28): al cerrar, el Motor propone un título y el puente lo guarda
// con la Reunión; el detalle lo aplica (`sottoly_apply_title`) en vez del nombre automático, también si llega
// después de abrirla, y si el Usuario ya cambió el título, el del modelo no lo pisa. IPC simulado (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

async function abrir(page: Page, propuesto: "ya" | "despues") {
  await page.addInitScript({ path: join(__dirname, "ipc.js") });
  await page.addInitScript((modo) => {
    const w = window as any;
    w.__LLAMADAS__ = [];
    w.__TITULO__ = modo === "ya" ? "Cotización del servicio contable" : null;
    w.__SOTTOLY_IPC__ = {
      api_get_meeting: { id: "m1", title: "Reunión 2026-10-09 00:12", created_at: "2026-10-09T05:12:00Z", updated_at: "", transcripts: [] },
      sottoly_apply_title: (args: unknown) => (w.__LLAMADAS__.push({ cmd: "apply", args }), w.__TITULO__),
      sottoly_title_settled: (args: unknown) => (w.__LLAMADAS__.push({ cmd: "settled", args }), null),
      api_save_meeting_title: () => ({ message: "ok" }),
    };
  }, propuesto);
  await page.goto("/sottoly/reunion?id=m1");
}

const titulo = (page: Page) => page.getByRole("heading", { level: 1 });
const llamadas = (page: Page) => page.evaluate(() => (window as any).__LLAMADAS__);

test("al abrir la Reunión, el título que propuso el modelo reemplaza al automático", async ({ page }) => {
  await abrir(page, "ya");
  await expect(titulo(page)).toHaveText("Cotización del servicio contable");
  await expect(page.getByText(/Título propuesto por Sottoly/)).toBeVisible();
});

test("si el título llega después de abrir la Reunión, aparece sin recargar", async ({ page }) => {
  await abrir(page, "despues");
  await expect(titulo(page)).toHaveText("Reunión 2026-10-09 00:12");
  await page.evaluate(() => ((window as any).__TITULO__ = "Plan de pagos con el proveedor"));
  await page.waitForFunction(() => (window as any).__sottoly_listening("summary"));
  await page.evaluate(() => (window as any).__sottoly_emit("summary", { type: "summary", title: "Plan de pagos con el proveedor", decisions: [] }));
  await expect(titulo(page)).toHaveText("Plan de pagos con el proveedor");
});

test("si cambias el título, el del modelo ya no lo pisa", async ({ page }) => {
  await abrir(page, "despues");
  await page.getByRole("button", { name: "Cambiar el título" }).click();
  await page.getByRole("textbox", { name: "Título de la Reunión" }).fill("Reunión con el contador");
  await page.getByRole("textbox", { name: "Título de la Reunión" }).press("Enter");
  await expect(titulo(page)).toHaveText("Reunión con el contador");
  await expect.poll(async () => (await llamadas(page)).filter((l: any) => l.cmd === "settled")).toEqual([{ cmd: "settled", args: { meetingId: "m1" } }]);
});
