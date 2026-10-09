// Grabar desde el panel (PLAN.md, tarea 21): «En vivo» inicia y detiene la grabación con los comandos de
// Meetily, guarda la Reunión con la transcripción que vio y abre su detalle, donde las Decisiones aparecen
// en cuanto el Motor las propone. IPC y eventos de Tauri simulados (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");
const roles = [{ id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras.", calibrated: true, status: "active" }];

// Las funciones no cruzan a la página como argumento de addInitScript: los modos se arman allá.
async function abrir(page: Page, ruta: string, extra: Record<string, unknown> = {}, grabando = false, modo: "normal" | "falla-al-iniciar" | "decisiones-tardias" = "normal") {
  await page.addInitScript({ path: IPC });
  await page.addInitScript(
    ([r, e, g, m]) => {
      const w = window as any;
      w.__LLAMADAS__ = [];
      const anotar = (cmd: string) => (args: unknown) => {
        w.__LLAMADAS__.push({ cmd, args });
        return null;
      };
      w.__SOTTOLY_IPC__ = {
        sottoly_list_roles: r,
        get_recording_state: { is_recording: g, is_paused: false, is_active: g, recording_duration: g ? 75 : null, active_duration: null },
        start_recording_with_devices_and_meeting: anotar("start"),
        stop_recording: anotar("stop"),
        api_save_transcript: (args: unknown) => (w.__LLAMADAS__.push({ cmd: "save", args }), { meeting_id: "m9" }),
        ...e,
      };
      if (m === "falla-al-iniciar") w.__SOTTOLY_IPC__.start_recording_with_devices_and_meeting = () => new Error("Permiso de micrófono denegado");
      if (m === "decisiones-tardias") w.__SOTTOLY_IPC__.sottoly_get_decisions = () => w.__DECISIONES__ ?? null;
    },
    [roles, extra, grabando, modo] as const,
  );
  await page.goto(ruta);
}

const llamadas = (page: Page) => page.evaluate(() => (window as any).__LLAMADAS__);

async function emitir(page: Page, evento: string, payload: unknown) {
  await page.waitForFunction((e) => (window as any).__sottoly_listening(e), evento);
  await page.evaluate(([e, p]) => (window as any).__sottoly_emit(e, p), [evento, payload] as const);
}

test("sin grabación en curso, «Iniciar grabación» la inicia y la pantalla pasa a Grabando", async ({ page }) => {
  await abrir(page, "/sottoly/en-vivo");
  await page.getByRole("button", { name: "Iniciar grabación" }).click();
  await expect.poll(async () => (await llamadas(page)).map((l: any) => l.cmd)).toContain("start");
  await emitir(page, "recording-started", { message: "ok" });
  await expect(page.getByText("Grabando", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Detener y revisar Decisiones" })).toBeVisible();
});

test("si ya hay una grabación en curso, se ve Grabando con el botón para detener", async ({ page }) => {
  await abrir(page, "/sottoly/en-vivo", {}, true);
  await expect(page.getByText("Grabando", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Iniciar grabación" })).toHaveCount(0);
});

test("al detener, guarda la Reunión con toda la transcripción en vivo y con quién habló, y abre su detalle", async ({ page }) => {
  await abrir(page, "/sottoly/en-vivo", { api_get_meeting: { id: "m9", title: "Reunión de prueba", created_at: "", updated_at: "", transcripts: [] } }, true);
  await emitir(page, "transcript-update", { text: "Son dieciocho millones.", speaker: "counterpart", is_partial: false, timestamp: "10:00:01", audio_start_time: 1, audio_end_time: 3, duration: 2 });
  await emitir(page, "transcript-update", { text: "Ok, sue", speaker: "user", is_partial: true, timestamp: "10:00:04", audio_start_time: 4, audio_end_time: 5, duration: 1 });
  await emitir(page, "transcript-update", { text: "Ok, suena razonable.", speaker: "user", is_partial: false, timestamp: "10:00:04", audio_start_time: 4, audio_end_time: 6, duration: 2 });
  await page.getByRole("button", { name: "Detener y revisar Decisiones" }).click();
  await expect.poll(async () => (await llamadas(page)).map((l: any) => l.cmd)).toContain("stop");
  await emitir(page, "recording-stopped", { message: "ok", folder_path: "/tmp/reunion-9", meeting_name: "Reunión de prueba" });
  await expect(page).toHaveURL(/\/sottoly\/reunion\/?\?id=m9/);
  const guardado = (await llamadas(page)).find((l: any) => l.cmd === "save").args;
  expect(guardado.meetingTitle).toBe("Reunión de prueba");
  expect(guardado.folderPath).toBe("/tmp/reunion-9");
  expect(guardado.transcripts.map((t: any) => [t.text, t.speaker])).toEqual([
    ["Son dieciocho millones.", "counterpart"],
    ["Ok, suena razonable.", "user"],
  ]);
});

test("si no se puede iniciar la grabación, lo dice", async ({ page }) => {
  await abrir(page, "/sottoly/en-vivo", {}, false, "falla-al-iniciar");
  await page.getByRole("button", { name: "Iniciar grabación" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No se pudo iniciar la grabación" })).toBeVisible();
});

test("las Decisiones que el Motor propone después de abrir la Reunión aparecen sin recargar", async ({ page }) => {
  await abrir(page, "/sottoly/reunion?id=m9", { api_get_meeting: { id: "m9", title: "Reunión de prueba", created_at: "", updated_at: "", transcripts: [] } }, false, "decisiones-tardias");
  await expect(page.getByRole("heading", { level: 1, name: "Reunión de prueba" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Decisiones por revisar" })).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__DECISIONES__ = {
      reviewed: false,
      decisions: [{ id: "d1", kind: "decision", owner: "user", text: "Se contrata el plan anual.", due: null, source: "engine", meeting_id: "m", created_at: "", approved: false }],
    };
  });
  await emitir(page, "summary", { type: "summary", decisions: [] });
  await expect(page.getByRole("region", { name: "Decisiones por revisar" })).toContainText("Se contrata el plan anual.");
});
