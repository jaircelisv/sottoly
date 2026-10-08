// Aprobar las Decisiones (PLAN.md, tarea 17; pantalla 2 del diseño aprobado): en el detalle de una
// Reunión cerrada, cada Decisión candidata se aprueba, edita o descarta, o «No guardar nada»; lo aprobado
// va a la Memoria con `sottoly_save_decisions`. IPC simulado (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");

const reunion = { id: "meeting-1", title: "Reunión con el contador", created_at: "2026-10-07T21:57:00Z", updated_at: "", transcripts: [] };
const d = (i: number, kind: string, owner: string, text: string, due: string | null = null) => ({
  id: `m1-d${i}`, kind, owner, text, due, source: "engine", meeting_id: "m1", created_at: "2026-10-07T22:00:00Z", approved: false,
});
const decisiones = [
  d(1, "decision", "user", "Se contrata el plan anual por dieciocho millones."),
  d(2, "commitment", "counterpart", "Enviar el contrato para firmar.", "2026-10-09"),
  d(3, "decision", "counterpart", "El anticipo es del cincuenta por ciento."),
];

async function abrir(page: Page, estado: { reviewed: boolean; decisions: unknown[] } | null) {
  await page.addInitScript({ path: IPC });
  await page.addInitScript(
    ([r, e]) => {
      const w = window as any;
      w.__SOTTOLY_IPC__ = {
        api_get_meeting: r,
        sottoly_get_decisions: e,
        sottoly_save_decisions: (args: any) => {
          w.__GUARDADO__ = args;
          return { saved: args.items.filter((i: any) => i.approved).length };
        },
      };
    },
    [reunion, estado] as const,
  );
  await page.goto("/sottoly/reunion?id=meeting-1");
  await expect(page.getByRole("heading", { level: 1, name: "Reunión con el contador" })).toBeVisible();
}

const seccion = (page: Page) => page.getByRole("region", { name: "Decisiones por revisar" });
const item = (page: Page, texto: string) => seccion(page).getByRole("listitem").filter({ hasText: texto });
const guardado = (page: Page) => page.evaluate(() => (window as any).__GUARDADO__);

test("una Reunión cerrada muestra sus Decisiones por revisar, con quién y para cuándo", async ({ page }) => {
  await abrir(page, { reviewed: false, decisions: decisiones });
  await expect(seccion(page).getByRole("listitem")).toHaveCount(3);
  await expect(item(page, "plan anual")).toContainText("Decisión · Tú");
  await expect(item(page, "contrato")).toContainText("Compromiso · Contraparte · para el 2026-10-09");
  await expect(seccion(page)).toContainText("Solo se guarda en tu Memoria lo que apruebes.");
});

test("aprobar, editar y descartar, y guardar, manda lo elegido y dice cuántas fueron a la Memoria", async ({ page }) => {
  await abrir(page, { reviewed: false, decisions: decisiones });
  const guardar = seccion(page).getByRole("button", { name: "Guardar en mi Memoria" });
  await expect(guardar).toBeDisabled();
  await item(page, "plan anual").getByRole("button", { name: "Aprobar" }).click();
  await item(page, "contrato").getByRole("button", { name: "Editar" }).click();
  await seccion(page).getByLabel("Texto de la Decisión").fill("La Contraparte envía el contrato firmado el viernes.");
  await item(page, "contrato firmado").getByRole("button", { name: "Aprobar" }).click();
  await item(page, "anticipo").getByRole("button", { name: "Descartar" }).click();
  await guardar.click();
  expect(await guardado(page)).toEqual({
    meetingId: "meeting-1",
    items: [
      { id: "m1-d1", approved: true, text: "Se contrata el plan anual por dieciocho millones." },
      { id: "m1-d2", approved: true, text: "La Contraparte envía el contrato firmado el viernes." },
      { id: "m1-d3", approved: false, text: "El anticipo es del cincuenta por ciento." },
    ],
  });
  await expect(page.getByText("2 Decisiones guardadas en tu Memoria.")).toBeVisible();
  await expect(seccion(page)).toHaveCount(0);
});

test("«No guardar nada» manda todas descartadas y lo dice", async ({ page }) => {
  await abrir(page, { reviewed: false, decisions: decisiones });
  await seccion(page).getByRole("button", { name: "No guardar nada de esta Reunión" }).click();
  const g = await guardado(page);
  expect(g.items.map((i: any) => i.approved)).toEqual([false, false, false]);
  await expect(page.getByText("No se guardó nada de esta Reunión.")).toBeVisible();
});

test("una Reunión ya revisada no vuelve a pedir revisión", async ({ page }) => {
  await abrir(page, { reviewed: true, decisions: decisiones });
  await expect(seccion(page)).toHaveCount(0);
  await expect(page.getByText("Ya revisaste las Decisiones de esta Reunión.")).toBeVisible();
});

test("sin Decisiones propuestas, no aparece la revisión", async ({ page }) => {
  await abrir(page, null);
  await expect(page.getByRole("list", { name: "Transcripción" }).or(page.getByText("Esta Reunión no tiene transcripción guardada."))).toBeVisible();
  await expect(seccion(page)).toHaveCount(0);
});
