// Interruptor de las tarjetas de demostración (PLAN.md, tarea 22; pedido de Jair): en desarrollo, el panel
// las prende o apaga sin reiniciar; en producción el modo no existe y el interruptor no aparece.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

async function abrir(page: Page, disponible: boolean, prendido: boolean) {
  await page.addInitScript({ path: join(__dirname, "ipc.js") });
  await page.addInitScript(
    ([d, p]) => {
      const w = window as any;
      w.__DEMO__ = { available: d, on: p };
      w.__SOTTOLY_IPC__ = {
        api_get_meetings: [],
        sottoly_demo_status: () => w.__DEMO__,
        sottoly_set_demo: (args: any) => ((w.__DEMO__ = { ...w.__DEMO__, on: args.on }), w.__DEMO__),
      };
    },
    [disponible, prendido] as const,
  );
  await page.goto("/sottoly");
  await expect(page.getByRole("heading", { level: 1, name: "Reuniones" })).toBeVisible();
}

const interruptor = (page: Page) => page.getByRole("switch", { name: "Tarjetas de demostración" });

test("en desarrollo, el interruptor muestra si están prendidas y las apaga", async ({ page }) => {
  await abrir(page, true, true);
  await expect(interruptor(page)).toHaveAttribute("aria-checked", "true");
  await interruptor(page).click();
  await expect(interruptor(page)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => (window as any).__DEMO__.on)).toBe(false);
});

test("en producción no aparece el interruptor", async ({ page }) => {
  await abrir(page, false, false);
  await expect(page.getByRole("navigation", { name: "Secciones" })).toBeVisible();
  await expect(interruptor(page)).toHaveCount(0);
});
