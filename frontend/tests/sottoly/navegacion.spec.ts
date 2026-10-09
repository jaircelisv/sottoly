// Meetily y Sottoly se encuentran (PLAN.md, tarea 25; Meetily es la casa, canvas «4»): el menú de Meetily tiene
// la sección «Sottoly · tu junta» siempre visible, y el panel tiene «Volver a Meetily». IPC simulado (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

async function abrir(page: Page, ruta: string) {
  await page.addInitScript({ path: join(__dirname, "ipc.js") });
  await page.addInitScript(() => ((window as any).__SOTTOLY_IPC__ = { api_get_meetings: [], sottoly_list_roles: [] }));
  await page.goto(ruta);
}

const seccion = (page: Page) => page.getByRole("navigation", { name: "Sottoly · tu junta" });

test("el menú de Meetily tiene la sección «Sottoly · tu junta» con En vivo, Reuniones y Decisiones, y Roles", async ({ page }) => {
  await abrir(page, "/");
  await expect(seccion(page)).toBeVisible();
  await expect(seccion(page).getByRole("link", { name: /En vivo/ })).toHaveAttribute("href", "/sottoly/en-vivo");
  await expect(seccion(page).getByRole("link", { name: "Reuniones y Decisiones" })).toHaveAttribute("href", "/sottoly");
  await expect(seccion(page).getByRole("link", { name: "Roles" })).toHaveAttribute("href", "/sottoly/roles");
});

test("desde la sección se llega a las Reuniones del panel", async ({ page }) => {
  await abrir(page, "/");
  await seccion(page).getByRole("link", { name: "Reuniones y Decisiones" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reuniones" })).toBeVisible();
});

test("el panel tiene «Volver a Meetily», que lleva al inicio de Meetily", async ({ page }) => {
  await abrir(page, "/sottoly/roles");
  const volver = page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Volver a Meetily" });
  await expect(volver).toHaveAttribute("href", "/");
  await volver.click();
  await expect(seccion(page)).toBeVisible();
});
