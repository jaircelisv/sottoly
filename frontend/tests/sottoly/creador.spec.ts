// Creador de Roles (PLAN.md, tarea 14; pantalla 3 del diseño aprobado): una entrevista de cinco pasos
// (Función, Persona, Cuándo habla, Límites, Nombre) que crea el Rol con `sottoly_create_role`.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");

const junta = [{ id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras sin aclarar.", calibrated: false, status: "active" }];
const nuevo = { id: "negociador", role: "Negociador", persona: "Nora", gate_definition: "Interviene cuando piden un descuento sin dar nada.", calibrated: false, status: "active" };

async function abrir(page: Page, crear: "ok" | "ya-existe" = "ok") {
  await page.addInitScript({ path: IPC });
  await page.addInitScript(
    ([j, n, modo]) => {
      const w = window as any;
      w.__JUNTA__ = j;
      w.__SOTTOLY_IPC__ = {
        sottoly_list_roles: () => w.__JUNTA__,
        sottoly_create_role: (args: any) => {
          w.__CREADOS__ = [...(w.__CREADOS__ ?? []), args];
          if (modo === "ya-existe") return new Error("Ya existe un Rol llamado Negociador.");
          w.__JUNTA__ = [...w.__JUNTA__, n];
          return n;
        },
      };
    },
    [junta, nuevo, crear] as const,
  );
  await page.goto("/sottoly/roles");
  await expect(page.getByRole("listitem").filter({ hasText: "Betty · CFO" })).toBeVisible();
}

const creador = (page: Page) => page.getByRole("dialog", { name: /Nuevo Rol/ });
const siguiente = (page: Page) => creador(page).getByRole("button", { name: "Siguiente" });

async function responderTodo(page: Page) {
  await page.getByRole("button", { name: "Crear un Rol" }).click();
  await creador(page).getByLabel("¿Qué va a cuidar este Rol?").fill("Que me avise cuando un cliente pida descuentos sin dar nada a cambio.");
  await siguiente(page).click();
  await creador(page).getByLabel("¿Cómo se llama la persona?").fill("Nora");
  await creador(page).getByLabel("¿Cómo habla?").fill("Directa y tranquila.");
  await siguiente(page).click();
  await creador(page).getByLabel("¿Cuándo debe intervenir?").fill("Interviene cuando piden un descuento sin dar nada.");
  await creador(page).getByLabel("Un ejemplo de cuándo sí").fill("Si nos haces un diez por ciento, firmamos hoy.");
  await creador(page).getByLabel("Un ejemplo de cuándo no").fill("Qué bien que pudimos reunirnos.");
  await siguiente(page).click();
  await creador(page).getByLabel("Opiniones legales").check();
  await siguiente(page).click();
  await creador(page).getByLabel("¿Cómo se llama el Rol?").fill("Negociador");
}

test("«Crear un Rol» abre la entrevista en el paso 1 de 5", async ({ page }) => {
  await abrir(page);
  await page.getByRole("button", { name: "Crear un Rol" }).click();
  await expect(creador(page)).toContainText("Paso 1 de 5");
  await expect(creador(page).getByLabel("¿Qué va a cuidar este Rol?")).toBeVisible();
  await expect(creador(page)).toContainText("empieza sin calibrar");
});

test("«Siguiente» no avanza sin respuesta, y «Atrás» vuelve sin perder lo escrito", async ({ page }) => {
  await abrir(page);
  await page.getByRole("button", { name: "Crear un Rol" }).click();
  await expect(siguiente(page)).toBeDisabled();
  await creador(page).getByLabel("¿Qué va a cuidar este Rol?").fill("Descuentos sin contraprestación.");
  await siguiente(page).click();
  await expect(creador(page)).toContainText("Paso 2 de 5");
  await creador(page).getByRole("button", { name: "Atrás" }).click();
  await expect(creador(page).getByLabel("¿Qué va a cuidar este Rol?")).toHaveValue("Descuentos sin contraprestación.");
});

test("al terminar, crea el Rol con lo respondido y aparece en la junta sin calibrar", async ({ page }) => {
  await abrir(page);
  await responderTodo(page);
  await creador(page).getByRole("button", { name: "Crear el Rol" }).click();
  await expect(creador(page)).toBeHidden();
  const creados = await page.evaluate(() => (window as any).__CREADOS__);
  expect(creados).toEqual([
    {
      draft: {
        name: "Negociador",
        persona: "Nora",
        function: "Que me avise cuando un cliente pida descuentos sin dar nada a cambio.",
        tone: "Directa y tranquila.",
        when: "Interviene cuando piden un descuento sin dar nada.",
        example_speak: "Si nos haces un diez por ciento, firmamos hoy.",
        example_silent: "Qué bien que pudimos reunirnos.",
        limits: ["legal opinions"],
      },
    },
  ]);
  const fila = page.getByRole("listitem").filter({ hasText: "Nora · Negociador" });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText("Sin calibrar");
});

test("si no se puede crear, lo dice y deja corregir", async ({ page }) => {
  await abrir(page, "ya-existe");
  await responderTodo(page);
  await creador(page).getByRole("button", { name: "Crear el Rol" }).click();
  await expect(creador(page).getByRole("alert").filter({ hasText: "Ya existe un Rol llamado Negociador." })).toBeVisible();
  await expect(creador(page).getByLabel("¿Cómo se llama el Rol?")).toHaveValue("Negociador");
});

test("«Cancelar» cierra la entrevista sin crear nada", async ({ page }) => {
  await abrir(page);
  await page.getByRole("button", { name: "Crear un Rol" }).click();
  await creador(page).getByRole("button", { name: "Cancelar" }).click();
  await expect(creador(page)).toBeHidden();
  expect(await page.evaluate(() => (window as any).__CREADOS__ ?? [])).toEqual([]);
});
