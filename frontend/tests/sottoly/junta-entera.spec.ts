// Preguntarle a toda la junta (PLAN.md, tarea 24; pedido de Jair): «Todos» va primero en el chat de «En vivo»,
// la pregunta le llega a cada Rol activo y cada uno responde con su nombre. Y el eco se reconoce aunque los
// números vayan en palabras en una frase y en cifras en la otra. IPC y eventos simulados (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");
const roles = [
  { id: "ceo", role: "CEO adversarial", persona: "Sheldon", gate_definition: "Acuerdos.", calibrated: true, status: "active" },
  { id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras.", calibrated: true, status: "active" },
  { id: "cto", role: "CTO", persona: "Ada", gate_definition: "Plazos.", calibrated: false, status: "experimental" },
];

async function abrir(page: Page) {
  await page.addInitScript({ path: IPC });
  await page.addInitScript((r) => {
    const w = window as any;
    w.__ENVIOS__ = [];
    let n = 0;
    w.__SOTTOLY_IPC__ = { sottoly_list_roles: r, sottoly_chat_send: (args: unknown) => (w.__ENVIOS__.push(args), `c${++n}`) };
  }, roles);
  await page.goto("/sottoly/en-vivo");
  await expect(page.getByRole("heading", { level: 1, name: "En vivo" })).toBeVisible();
}

async function emitir(page: Page, evento: string, payload: unknown) {
  await page.waitForFunction((e) => (window as any).__sottoly_listening(e), evento);
  await page.evaluate(([e, p]) => (window as any).__sottoly_emit(e, p), [evento, payload] as const);
}

const chat = (page: Page) => page.getByRole("complementary", { name: "Chat con la junta" });
const conversacion = (page: Page) => chat(page).getByRole("list", { name: "Conversación" });
const envios = (page: Page) => page.evaluate(() => (window as any).__ENVIOS__);

test("«Todos» va primero entre los Roles con los que hablas", async ({ page }) => {
  await abrir(page);
  const opciones = chat(page).getByRole("group", { name: "Con quién hablas" }).getByRole("button");
  await expect(opciones).toHaveCount(3);
  await expect(opciones.first()).toHaveAccessibleName("Todos · toda tu junta");
});

test("una pregunta a «Todos» le llega a cada Rol activo, se ve una vez y cada uno responde con su nombre", async ({ page }) => {
  await abrir(page);
  await chat(page).getByRole("button", { name: "Todos · toda tu junta" }).click();
  await expect(chat(page).getByRole("button", { name: "Todos · toda tu junta" })).toHaveAttribute("aria-pressed", "true");
  await chat(page).getByLabel("Pregúntale a toda tu junta").fill("¿Qué opinan del precio?");
  await chat(page).getByLabel("Pregúntale a toda tu junta").press("Enter");
  await expect.poll(() => envios(page)).toEqual([
    { role: "ceo", text: "¿Qué opinan del precio?", replyTo: null },
    { role: "cfo", text: "¿Qué opinan del precio?", replyTo: null },
  ]);
  await expect(conversacion(page).getByText("¿Qué opinan del precio?")).toHaveCount(1);
  await emitir(page, "chat_reply", { type: "chat_reply", id: "c2", role: "cfo", text: "Pide el precio con IVA." });
  await emitir(page, "chat_reply", { type: "chat_reply", id: "c1", role: "ceo", text: "No compares sin datos." });
  const respuestas = conversacion(page).getByRole("listitem");
  await expect(respuestas.filter({ hasText: "No compares sin datos." })).toContainText("Sheldon");
  await expect(respuestas.filter({ hasText: "Pide el precio con IVA." })).toContainText("Betty");
});

test("con «Todos», una pregunta de ejemplo también le llega a cada Rol activo", async ({ page }) => {
  await abrir(page);
  await chat(page).getByRole("button", { name: "Todos · toda tu junta" }).click();
  await chat(page).getByRole("button", { name: "Resume lo último" }).click();
  await expect.poll(async () => (await envios(page)).map((e: any) => e.role)).toEqual(["ceo", "cfo"]);
});

test("el eco se reconoce aunque una frase diga los números en palabras y la otra en cifras", async ({ page }) => {
  await abrir(page);
  await emitir(page, "transcript-update", {
    text: "entonces tiene planes de cien doscientos y quinientos dólares para los que está", speaker: "user", is_partial: false, audio_start_time: 80,
  });
  await emitir(page, "transcript-update", {
    text: "Entonces, tiene planes de 100, 200 y 500 dólares, para los que está disponible.", speaker: "counterpart", is_partial: false, audio_start_time: 80,
  });
  await expect(page.getByRole("list", { name: "Transcripción en vivo" }).getByRole("listitem")).toHaveCount(1);
  await expect(page.getByRole("status").filter({ hasText: "Usa audífonos" })).toContainText("1 frase repetida");
});
