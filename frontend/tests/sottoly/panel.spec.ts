// Panel de Sottoly (PLAN.md, tarea 12): Reuniones (con su transcripción) y Roles, pantallas nuevas
// junto a las de Meetily. El IPC de Tauri va simulado (ipc.js) con las respuestas de cada prueba.
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");

const reunion = {
  id: "meeting-1",
  title: "Reunión con el contador",
  created_at: "2026-10-07T21:57:00Z",
  updated_at: "2026-10-07T22:31:00Z",
  transcripts: [
    { id: "t1", text: "El servicio contable anual les queda en dieciocho millones.", timestamp: "21:58:02", audio_start_time: 62, speaker: "system" },
    { id: "t2", text: "Ok, suena razonable.", timestamp: "21:58:09", audio_start_time: 69, speaker: "mic" },
    { id: "t3", text: "Incluye la declaración de renta.", timestamp: "21:58:14", audio_start_time: 74 },
  ],
};

const roles = [
  { id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Interviene cuando se mencionan cifras sin aclarar.", calibrated: false, status: "active" },
  { id: "ceo", role: "CEO adversarial", persona: "Sheldon", gate_definition: "Interviene cuando se acepta un acuerdo sin datos.", calibrated: true, status: "active" },
  { id: "cto", role: "CTO", persona: "Ada", gate_definition: "Interviene cuando se prometen plazos sin estimar.", calibrated: false, status: "experimental" },
];

/** Respuestas del IPC como texto de JS: valores JSON, o `error:<mensaje>` para que el comando falle. */
async function abrir(page: Page, ruta: string, ipc: Record<string, unknown>) {
  await page.addInitScript({ path: IPC });
  const tabla = Object.fromEntries(Object.entries(ipc).map(([k, v]) => [k, typeof v === "string" && v.startsWith("error:") ? { __error: v.slice(6) } : v]));
  await page.addInitScript((t) => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(t)) out[k] = v && typeof v === "object" && "__error" in (v as object) ? new Error((v as { __error: string }).__error) : v;
    (window as unknown as { __SOTTOLY_IPC__: unknown }).__SOTTOLY_IPC__ = out;
  }, tabla);
  await page.goto(ruta);
}

const menu = (page: Page) => page.getByRole("navigation", { name: "Secciones" });

test("Reuniones lista las Reuniones guardadas y cada una abre su detalle", async ({ page }) => {
  await abrir(page, "/sottoly", {
    api_get_meetings: [{ id: "meeting-1", title: "Reunión con el contador" }, { id: "meeting-2", title: "Proveedor de software" }],
    api_get_meeting: reunion,
  });
  await expect(page.getByRole("heading", { level: 1, name: "Reuniones" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Proveedor de software" })).toBeVisible();
  await page.getByRole("link", { name: "Reunión con el contador" }).click();
  await expect(page).toHaveURL(/\/sottoly\/reunion\/?\?id=meeting-1/);
  await expect(page.getByRole("heading", { level: 1, name: "Reunión con el contador" })).toBeVisible();
});

test("el detalle muestra la transcripción en orden y quién habló cuando se sabe", async ({ page }) => {
  await abrir(page, "/sottoly/reunion?id=meeting-1", { api_get_meeting: reunion });
  const lineas = page.getByRole("list", { name: "Transcripción" }).getByRole("listitem");
  await expect(lineas).toHaveCount(3);
  await expect(lineas.nth(0)).toContainText("Contraparte");
  await expect(lineas.nth(0)).toContainText("dieciocho millones");
  await expect(lineas.nth(1)).toContainText("Tú");
  await expect(lineas.nth(2)).toContainText("Incluye la declaración de renta.");
  await expect(lineas.nth(2)).not.toContainText("Contraparte");
  await expect(lineas.nth(2)).not.toContainText("Tú");
});

test("sin Reuniones guardadas, el panel lo dice", async ({ page }) => {
  await abrir(page, "/sottoly", { api_get_meetings: [] });
  await expect(page.getByText("Todavía no hay Reuniones guardadas.")).toBeVisible();
});

test("si no se pueden cargar las Reuniones, lo dice y se puede reintentar", async ({ page }) => {
  await abrir(page, "/sottoly", { api_get_meetings: "error:database is locked" });
  // Next tiene su propio role="alert" (el anunciador de rutas): se filtra por el texto del error.
  await expect(page.getByRole("alert").filter({ hasText: "No se pudieron cargar las Reuniones" })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __SOTTOLY_IPC__: Record<string, unknown> }).__SOTTOLY_IPC__.api_get_meetings = [{ id: "m", title: "Ya cargó" }];
  });
  await page.getByRole("button", { name: "Reintentar" }).click();
  await expect(page.getByRole("link", { name: "Ya cargó" })).toBeVisible();
});

test("Roles muestra cada Rol con su Persona, cuándo interviene y si está sin calibrar", async ({ page }) => {
  await abrir(page, "/sottoly/roles", { sottoly_list_roles: roles });
  await expect(page.getByRole("heading", { level: 1, name: "Tu junta" })).toBeVisible();
  const betty = page.getByRole("listitem").filter({ hasText: "Betty · CFO" });
  await expect(betty).toContainText("Interviene cuando se mencionan cifras sin aclarar.");
  await expect(betty).toContainText("Sin calibrar");
  await expect(page.getByRole("listitem").filter({ hasText: "Ada · CTO" })).toContainText("Experimental");
});

test("un Rol calibrado no lleva la marca Sin calibrar", async ({ page }) => {
  await abrir(page, "/sottoly/roles", { sottoly_list_roles: roles });
  const sheldon = page.getByRole("listitem").filter({ hasText: "Sheldon · CEO adversarial" });
  await expect(sheldon).toBeVisible();
  await expect(sheldon).not.toContainText("Sin calibrar");
});

test("el menú lateral lleva entre Reuniones y Roles, y En vivo a la grabación", async ({ page }) => {
  await abrir(page, "/sottoly", { api_get_meetings: [], sottoly_list_roles: roles });
  await expect(menu(page).getByRole("link", { name: "En vivo" })).toHaveAttribute("href", "/");
  await menu(page).getByRole("link", { name: "Roles" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tu junta" })).toBeVisible();
  await menu(page).getByRole("link", { name: "Reuniones" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reuniones" })).toBeVisible();
  await expect(menu(page).getByRole("link", { name: "Reuniones" })).toHaveAttribute("aria-current", "page");
});
