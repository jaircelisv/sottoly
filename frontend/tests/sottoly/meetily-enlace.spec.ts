// Desde Meetily se llega al panel (PLAN.md, tarea 21): su menú lateral tiene un enlace a «En vivo» de Sottoly.
import { expect, test } from "@playwright/test";
import { join } from "node:path";

test("el menú de Meetily tiene un enlace al panel de Sottoly", async ({ page }) => {
  await page.addInitScript({ path: join(__dirname, "ipc.js") });
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Sottoly/ })).toHaveAttribute("href", "/sottoly/en-vivo");
});
