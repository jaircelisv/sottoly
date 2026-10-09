// Cuánto interviene cada Rol (PLAN.md, tarea 30; diseño aprobado, canvas «6»): en Roles, cada Rol activo tiene
// «Solo lo importante», «Equilibrado» o «Más seguido»; la elección se guarda con `sottoly_set_role_level`.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

async function abrir(page: Page, niveles: Record<string, string> = {}) {
  await page.addInitScript({ path: join(__dirname, "ipc.js") });
  await page.addInitScript((n) => {
    const w = window as any;
    w.__NIVELES__ = n;
    w.__SOTTOLY_IPC__ = {
      sottoly_list_roles: [
        { id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras sin aclarar.", calibrated: true, status: "active" },
        { id: "cto", role: "CTO", persona: "Ada", gate_definition: "Plazos.", calibrated: false, status: "experimental" },
      ],
      sottoly_get_role_levels: () => w.__NIVELES__,
      sottoly_set_role_level: (args: any) => ((w.__NIVELES__ = { ...w.__NIVELES__, [args.role]: args.level }), null),
    };
  }, niveles);
  await page.goto("/sottoly/roles");
  await expect(page.getByRole("heading", { level: 1, name: "Tu junta" })).toBeVisible();
}

const nivel = (page: Page, persona: string) => page.getByRole("radiogroup", { name: `Cuánto interviene ${persona}` });

test("cada Rol activo tiene los tres niveles, y sin elegir está en «Solo lo importante»", async ({ page }) => {
  await abrir(page);
  await expect(nivel(page, "Betty").getByRole("radio")).toHaveText(["Solo lo importante", "Equilibrado", "Más seguido"]);
  await expect(nivel(page, "Betty").getByRole("radio", { name: "Solo lo importante" })).toBeChecked();
  await expect(nivel(page, "Ada")).toHaveCount(0);
});

test("elegir «Más seguido» lo guarda y explica qué significa", async ({ page }) => {
  await abrir(page);
  await nivel(page, "Betty").getByRole("radio", { name: "Más seguido" }).click();
  await expect(nivel(page, "Betty").getByRole("radio", { name: "Más seguido" })).toBeChecked();
  await expect.poll(() => page.evaluate(() => (window as any).__NIVELES__)).toEqual({ cfo: "often" });
  await expect(page.getByRole("listitem").filter({ hasText: "Betty" })).toContainText("Algunas Sugerencias pueden sobrar");
});

test("al volver, Roles muestra el nivel que elegiste", async ({ page }) => {
  await abrir(page, { cfo: "balanced" });
  await expect(nivel(page, "Betty").getByRole("radio", { name: "Equilibrado" })).toBeChecked();
});
