// Hablar con la junta después de la Reunión (PLAN.md, tarea 29; diseño aprobado, canvas «5»): el detalle tiene el
// chat a la derecha, con «Todos»; la pregunta va al Rol con la transcripción guardada (`sottoly_review_chat_send`)
// y la respuesta llega por los mismos eventos del chat en vivo. IPC simulado (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const roles = [
  { id: "ceo", role: "CEO adversarial", persona: "Sheldon", status: "active" },
  { id: "cfo", role: "CFO", persona: "Betty", status: "active" },
];

async function abrir(page: Page) {
  await page.addInitScript({ path: join(__dirname, "ipc.js") });
  await page.addInitScript((r) => {
    const w = window as any;
    w.__ENVIOS__ = [];
    let n = 0;
    w.__SOTTOLY_IPC__ = {
      sottoly_list_roles: r,
      api_get_meeting: { id: "m1", title: "Cotización del servicio contable", created_at: "2026-10-09T05:12:00Z", updated_at: "", transcripts: [] },
      sottoly_review_chat_send: (args: unknown) => (w.__ENVIOS__.push(args), `r${++n}`),
    };
  }, roles);
  await page.goto("/sottoly/reunion?id=m1");
  await expect(page.getByRole("heading", { level: 1, name: "Cotización del servicio contable" })).toBeVisible();
}

async function emitir(page: Page, evento: string, payload: unknown) {
  await page.waitForFunction((e) => (window as any).__sottoly_listening(e), evento);
  await page.evaluate(([e, p]) => (window as any).__sottoly_emit(e, p), [evento, payload] as const);
}

const chat = (page: Page) => page.getByRole("complementary", { name: "Chat con la junta" });
const envios = (page: Page) => page.evaluate(() => (window as any).__ENVIOS__);

test("el detalle tiene el chat con la junta, con «Todos» primero", async ({ page }) => {
  await abrir(page);
  const opciones = chat(page).getByRole("group", { name: "Con quién hablas" }).getByRole("button");
  await expect(opciones).toHaveCount(3);
  await expect(opciones.first()).toHaveAccessibleName("Todos · toda tu junta");
});

test("una pregunta va al Rol con esta Reunión y la respuesta llega en streaming", async ({ page }) => {
  await abrir(page);
  await chat(page).getByRole("button", { name: "Betty · CFO" }).click();
  await chat(page).getByLabel("Pregúntale a Betty").fill("¿Qué quedó pendiente?");
  await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
  await expect.poll(() => envios(page)).toEqual([{ meetingId: "m1", role: "cfo", text: "¿Qué quedó pendiente?" }]);
  await emitir(page, "chat_delta", { type: "chat_delta", id: "r1", role: "cfo", text: "Falta que confirmes" });
  await expect(chat(page)).toContainText("Falta que confirmes");
  await emitir(page, "chat_reply", { type: "chat_reply", id: "r1", role: "cfo", text: "Falta que confirmes el **lunes**." });
  await expect(chat(page).locator("strong")).toHaveText("lunes");
});

test("con «Todos», la pregunta le llega a cada Rol activo", async ({ page }) => {
  await abrir(page);
  await chat(page).getByRole("button", { name: "Todos · toda tu junta" }).click();
  await chat(page).getByLabel("Pregúntale a toda tu junta").fill("¿Qué me faltó preguntar?");
  await chat(page).getByLabel("Pregúntale a toda tu junta").press("Enter");
  await expect.poll(async () => (await envios(page)).map((e: any) => e.role)).toEqual(["ceo", "cfo"]);
});

test("las preguntas de ejemplo son para después de la Reunión y se envían con un clic", async ({ page }) => {
  await abrir(page);
  await chat(page).getByRole("button", { name: "¿Qué quedó pendiente?" }).click();
  await expect.poll(async () => (await envios(page)).map((e: any) => e.text)).toEqual(["¿Qué quedó pendiente?"]);
});
