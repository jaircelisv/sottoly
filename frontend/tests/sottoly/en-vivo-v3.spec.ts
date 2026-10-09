// En vivo, versión 3 (PLAN.md, tarea 23; diseño aprobado, canvas «1c»): la sesión en vivo sobrevive al cambio
// de pestaña, el chat muestra el formato y lleva al último mensaje, preguntas de ejemplo, el eco se oculta con
// aviso y no se guarda, y «Grabando» dice desde hace cuánto. IPC y eventos simulados (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");
const roles = [
  { id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras.", calibrated: true, status: "active" },
  { id: "ceo", role: "CEO adversarial", persona: "Sheldon", gate_definition: "Acuerdos.", calibrated: true, status: "active" },
];
const sugerencia = {
  type: "suggestion", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty",
  text: "Pide el calendario de pagos por escrito.", reason: "Habló de cuotas sin fechas.", confidence: 0.9,
};

// Las funciones no cruzan a la página como argumento de addInitScript: se arman allá.
async function abrir(page: Page, grabando = false) {
  await page.addInitScript({ path: IPC });
  await page.addInitScript(
    ([r, g]) => {
      const w = window as any;
      w.__ENVIOS__ = [];
      w.__GUARDADO__ = null;
      let n = 0;
      w.__SOTTOLY_IPC__ = {
        sottoly_list_roles: r,
        api_get_meetings: [],
        get_recording_state: { is_recording: g, is_paused: false, is_active: g, recording_duration: g ? 75 : null, active_duration: null },
        sottoly_chat_send: (args: unknown) => (w.__ENVIOS__.push(args), `c${++n}`),
        stop_recording: () => null,
        api_save_transcript: (args: unknown) => ((w.__GUARDADO__ = args), { meeting_id: "m9" }),
        api_get_meeting: { id: "m9", title: "Reunión", created_at: "", updated_at: "", transcripts: [] },
      };
    },
    [roles, grabando] as const,
  );
  await page.goto("/sottoly/en-vivo");
  await expect(page.getByRole("heading", { level: 1, name: "En vivo" })).toBeVisible();
}

async function emitir(page: Page, evento: string, payload: unknown) {
  await page.waitForFunction((e) => (window as any).__sottoly_listening(e), evento);
  await page.evaluate(([e, p]) => (window as any).__sottoly_emit(e, p), [evento, payload] as const);
}

const frase = (text: string, speaker: string, t: number) => ({ text, speaker, is_partial: false, audio_start_time: t, audio_end_time: t + 3 });
const transcripcion = (page: Page) => page.getByRole("list", { name: "Transcripción en vivo" });
const chat = (page: Page) => page.getByRole("complementary", { name: "Chat con la junta" });
const conversacion = (page: Page) => chat(page).getByRole("list", { name: "Conversación" });
const envios = (page: Page) => page.evaluate(() => (window as any).__ENVIOS__);

test("lo que se ve en En vivo sigue ahí al volver de Roles, y lo que llegó mientras tanto también", async ({ page }) => {
  await abrir(page, true);
  await emitir(page, "transcript-update", frase("El plan anual cuesta doce millones.", "counterpart", 4));
  await emitir(page, "suggestion", sugerencia);
  await chat(page).getByLabel("Pregúntale a Betty").fill("¿Es caro?");
  await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
  await emitir(page, "chat_reply", { type: "chat_reply", id: "c1", role: "cfo", text: "Depende de lo que incluya." });

  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "Roles" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Tu junta" })).toBeVisible();
  await emitir(page, "transcript-update", frase("Se paga en cuatro cuotas.", "counterpart", 9));
  await page.getByRole("navigation", { name: "Secciones" }).getByRole("link", { name: "En vivo" }).click();

  await expect(transcripcion(page)).toContainText("El plan anual cuesta doce millones.");
  await expect(transcripcion(page)).toContainText("Se paga en cuatro cuotas.");
  await expect(page.getByRole("article", { name: "Sugerencia de Betty" })).toBeVisible();
  await expect(conversacion(page)).toContainText("¿Es caro?");
  await expect(conversacion(page)).toContainText("Depende de lo que incluya.");
  await expect(page.getByText("Grabando", { exact: true })).toBeVisible();
});

test("una frase del Usuario que repite lo que la Contraparte acaba de decir se oculta y avisa que uses audífonos", async ({ page }) => {
  await abrir(page);
  await emitir(page, "transcript-update", frase("Analiza tus extractos bancarios, a veces tenemos gastos hormiga.", "counterpart", 10));
  await emitir(page, "transcript-update", frase("analiza tus extractos bancarios a veces tenemos gastos hormiga", "user", 11));
  await emitir(page, "transcript-update", frase("¿Y eso cuánto me cuesta al año?", "user", 15));
  await expect(transcripcion(page).getByRole("listitem")).toHaveCount(2);
  await expect(transcripcion(page)).toContainText("¿Y eso cuánto me cuesta al año?");
  const aviso = page.getByRole("status").filter({ hasText: "Usa audífonos" });
  await expect(aviso).toContainText("1 frase repetida");
  await aviso.getByRole("button", { name: "Ver ocultas" }).click();
  await expect(transcripcion(page).getByRole("listitem")).toHaveCount(3);
});

test("al detener, la Reunión se guarda sin las frases de eco", async ({ page }) => {
  await abrir(page, true);
  await emitir(page, "transcript-update", frase("El anticipo es del cincuenta por ciento.", "counterpart", 1));
  await emitir(page, "transcript-update", frase("El anticipo es del cincuenta por ciento.", "user", 2));
  await emitir(page, "transcript-update", frase("Prefiero pagar contra entrega.", "user", 6));
  await page.getByRole("button", { name: "Detener y revisar Decisiones" }).click();
  await emitir(page, "recording-stopped", { message: "ok", folder_path: "/tmp/reunion-9", meeting_name: "Reunión" });
  await expect(page).toHaveURL(/\/sottoly\/reunion\/?\?id=m9/);
  const guardado = await page.evaluate(() => (window as any).__GUARDADO__);
  expect(guardado.transcripts.map((t: any) => [t.text, t.speaker])).toEqual([
    ["El anticipo es del cincuenta por ciento.", "counterpart"],
    ["Prefiero pagar contra entrega.", "user"],
  ]);
});

test("la respuesta del Rol se ve con formato, sin asteriscos, y dice de quién es", async ({ page }) => {
  await abrir(page);
  await chat(page).getByLabel("Pregúntale a Betty").fill("¿Qué está vendiendo?");
  await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
  await emitir(page, "chat_reply", {
    type: "chat_reply", id: "c1", role: "cfo",
    text: "Está vendiendo un **curso**. Antes de pagar, pregunta:\n\n- cuánto cuesta en total\n- qué incluye",
  });
  const respuesta = conversacion(page).getByRole("listitem").filter({ hasText: "Está vendiendo un" });
  await expect(respuesta.locator("strong")).toHaveText("curso");
  await expect(respuesta.getByRole("listitem")).toHaveCount(2);
  await expect(respuesta).not.toContainText("**");
  await expect(respuesta).toContainText("Betty");
});

test("con el chat vacío hay preguntas de ejemplo, y una se envía con un clic", async ({ page }) => {
  await abrir(page);
  await chat(page).getByRole("button", { name: "Resume lo último" }).click();
  await expect.poll(() => envios(page)).toEqual([{ role: "cfo", text: "Resume lo último", replyTo: null }]);
  await expect(conversacion(page)).toContainText("Resume lo último");
});

test("el chat tiene su propio scroll y baja hasta la última respuesta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await abrir(page);
  for (let i = 1; i <= 8; i++) {
    await chat(page).getByLabel("Pregúntale a Betty").fill(`Pregunta ${i}`);
    await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
    await emitir(page, "chat_reply", { type: "chat_reply", id: `c${i}`, role: "cfo", text: `Respuesta ${i}: ${"una idea larga ".repeat(12)}` });
  }
  const lista = conversacion(page);
  expect(await lista.evaluate((el) => ({ overflow: getComputedStyle(el).overflowY, cabe: el.scrollHeight <= el.clientHeight }))).toEqual({ overflow: "auto", cabe: false });
  await expect.poll(() => lista.evaluate((el) => el.scrollTop + el.clientHeight >= el.scrollHeight - 4)).toBe(true);
});

test("«Grabando» dice desde hace cuánto", async ({ page }) => {
  await abrir(page, true);
  await expect(page.getByText("Grabando", { exact: true })).toBeVisible();
  const tiempo = page.getByLabel("Tiempo de grabación");
  await expect(tiempo).toHaveText(/^01:1[5-9]$/);
  const antes = await tiempo.textContent();
  await expect.poll(() => tiempo.textContent(), { timeout: 4000 }).not.toBe(antes);
});
