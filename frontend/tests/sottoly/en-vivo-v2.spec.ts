// En vivo, versión 2 (PLAN.md, tarea 22; diseño aprobado, canvas «1b»): tarjetas que se contraen o se ignoran,
// el motivo detrás de «Por qué», Útil / No útil, filtro y scroll propio. IPC y eventos simulados (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");
const roles = [{ id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras.", calibrated: true, status: "active" }];
const sugerencia = {
  type: "suggestion", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty",
  text: "Pide el costo de la declaración de renta por separado.", reason: "Habló de un paquete sin detallar qué cubre.", confidence: 0.9,
};

async function abrir(page: Page) {
  await page.addInitScript({ path: IPC });
  await page.addInitScript((r) => ((window as any).__SOTTOLY_IPC__ = { sottoly_list_roles: r }), roles);
  await page.goto("/sottoly/en-vivo");
  await expect(page.getByRole("heading", { level: 1, name: "En vivo" })).toBeVisible();
}

async function emitir(page: Page, evento: string, payload: unknown) {
  await page.waitForFunction((e) => (window as any).__sottoly_listening(e), evento);
  await page.evaluate(([e, p]) => (window as any).__sottoly_emit(e, p), [evento, payload] as const);
}

const tarjeta = (page: Page) => page.getByRole("article", { name: "Sugerencia de Betty" });
const marcas = (page: Page) =>
  page.evaluate(() =>
    ((window as any).__SOTTOLY_CALLS__ as any[]).filter((c) => c.cmd === "plugin:event|emit" && c.args?.event === "suggestion-feedback").map((c) => c.args.payload),
  );

test("una Sugerencia se contrae a una línea y se vuelve a abrir", async ({ page }) => {
  await abrir(page);
  await emitir(page, "suggestion", sugerencia);
  await tarjeta(page).getByRole("button", { name: "Contraer" }).click();
  await expect(tarjeta(page)).toHaveCount(0);
  const linea = page.getByRole("button", { name: "Abrir la Sugerencia de Betty" });
  await expect(linea).toContainText("Pide el costo de la declaración");
  await linea.click();
  await expect(tarjeta(page)).toBeVisible();
});

test("ignorar quita la tarjeta, deja Deshacer y la marca como No útil", async ({ page }) => {
  await abrir(page);
  await emitir(page, "suggestion", sugerencia);
  await tarjeta(page).getByRole("button", { name: "Ignorar" }).click();
  await expect(tarjeta(page)).toHaveCount(0);
  await expect(page.getByText("Ignoraste una Sugerencia de Betty.")).toBeVisible();
  await expect.poll(() => marcas(page)).toEqual([{ id: "s1", role: "cfo", useful: false }]);
  await page.getByRole("button", { name: "Deshacer" }).click();
  await expect(tarjeta(page)).toBeVisible();
});

test("el motivo está oculto hasta pulsar «Por qué»", async ({ page }) => {
  await abrir(page);
  await emitir(page, "suggestion", sugerencia);
  await expect(tarjeta(page)).not.toContainText("Habló de un paquete");
  await tarjeta(page).getByRole("button", { name: "Por qué" }).click();
  await expect(tarjeta(page)).toContainText("Habló de un paquete sin detallar qué cubre.");
});

test("Útil y No útil mandan la marca de esa Sugerencia", async ({ page }) => {
  await abrir(page);
  await emitir(page, "suggestion", sugerencia);
  await tarjeta(page).getByRole("button", { name: "Útil", exact: true }).click();
  await expect.poll(() => marcas(page)).toEqual([{ id: "s1", role: "cfo", useful: true }]);
  await expect(tarjeta(page).getByRole("button", { name: "Útil", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("«Solo Sugerencias» oculta la transcripción y el contador cuenta las ignoradas", async ({ page }) => {
  await abrir(page);
  await emitir(page, "transcript-update", { text: "Son dieciocho millones.", speaker: "counterpart", is_partial: false, audio_start_time: 1 });
  await emitir(page, "suggestion", sugerencia);
  await emitir(page, "suggestion", { ...sugerencia, id: "s2", text: "Pide el calendario de pagos por escrito." });
  await page.getByRole("article").first().getByRole("button", { name: "Ignorar" }).click();
  await expect(page.getByText("2 Sugerencias · 1 ignorada")).toBeVisible();
  await page.getByRole("button", { name: "Solo Sugerencias" }).click();
  await expect(page.getByRole("list", { name: "Transcripción en vivo" })).not.toContainText("Son dieciocho millones.");
  await page.getByRole("button", { name: "Todo", exact: true }).click();
  await expect(page.getByRole("list", { name: "Transcripción en vivo" })).toContainText("Son dieciocho millones.");
});

test("la transcripción tiene su propio scroll e «Ir a lo último» aparece al subir", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrir(page);
  for (let i = 0; i < 40; i++) {
    await emitir(page, "transcript-update", { text: `Frase número ${i + 1} de la Reunión.`, speaker: "counterpart", is_partial: false, audio_start_time: i * 3 });
  }
  const lista = page.getByRole("list", { name: "Transcripción en vivo" });
  const medida = await lista.evaluate((el) => ({ overflow: getComputedStyle(el).overflowY, cabe: el.scrollHeight <= el.clientHeight, abajo: el.scrollTop + el.clientHeight >= el.scrollHeight - 4 }));
  expect(medida).toEqual({ overflow: "auto", cabe: false, abajo: true });
  await expect(page.getByRole("heading", { level: 1, name: "En vivo" })).toBeInViewport();
  await lista.evaluate((el) => el.scrollTo({ top: 0 }));
  await page.getByRole("button", { name: "Ir a lo último" }).click();
  await expect.poll(() => lista.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 4)).toBe(true);
});
