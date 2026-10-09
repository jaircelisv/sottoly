// Detalle de la Reunión, versión 2 (PLAN.md, tarea 27; diseño aprobado, canvas «5»): la pantalla hace scroll,
// el título se cambia con un clic, las Sugerencias de la junta se guardan con la Reunión y aparecen en la
// transcripción en su momento, y «Guardar en mi Memoria» dice cuántas Decisiones faltan. IPC simulado (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");

const linea = (i: number, t: number, speaker: string, text: string) => ({ id: `t${i}`, text, timestamp: "", audio_start_time: t, speaker });
const reunion = (transcripts: unknown[]) => ({ id: "m1", title: "Reunión 2026-10-09 00:12", created_at: "2026-10-09T05:12:00Z", updated_at: "", transcripts });
const decision = (i: number, text: string) => ({
  id: `d${i}`, kind: "decision", owner: "user", text, due: null, source: "engine", meeting_id: "m1", created_at: "", approved: false,
});

async function abrir(page: Page, datos: { transcripts?: unknown[]; sugerencias?: unknown[] | null; decisiones?: unknown[] } = {}) {
  await page.addInitScript({ path: IPC });
  await page.addInitScript(
    ([r, s, d]) => {
      const w = window as any;
      w.__LLAMADAS__ = [];
      w.__SOTTOLY_IPC__ = {
        api_get_meeting: r,
        sottoly_get_suggestions: s,
        sottoly_get_decisions: d ? { reviewed: false, decisions: d } : null,
        api_save_meeting_title: (args: unknown) => (w.__LLAMADAS__.push({ cmd: "title", args }), { message: "ok" }),
      };
    },
    [reunion(datos.transcripts ?? [linea(1, 1, "counterpart", "Hola.")]), datos.sugerencias ?? null, datos.decisiones ?? null] as const,
  );
  await page.goto("/sottoly/reunion?id=m1");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}

const llamadas = (page: Page) => page.evaluate(() => (window as any).__LLAMADAS__);

test("la pantalla del detalle hace scroll cuando la Reunión es larga", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  const largas = Array.from({ length: 80 }, (_, i) => linea(i, i * 5, "counterpart", `Frase número ${i + 1} de una Reunión larga.`));
  await abrir(page, { transcripts: largas });
  const ultima = page.getByText("Frase número 80 de una Reunión larga.");
  await expect(ultima).not.toBeInViewport();
  // Con la rueda del mouse, como una persona (desplazar por programa funciona aunque la página no tenga scroll).
  await page.mouse.move(700, 400);
  for (let i = 0; i < 12; i++) await page.mouse.wheel(0, 1500);
  await expect(ultima).toBeInViewport();
  await expect(page.getByRole("heading", { level: 1 })).not.toBeInViewport();
});

test("el título se cambia con un clic y se guarda", async ({ page }) => {
  await abrir(page);
  await page.getByRole("button", { name: "Cambiar el título" }).click();
  const campo = page.getByRole("textbox", { name: "Título de la Reunión" });
  await campo.fill("Cotización del servicio contable");
  await campo.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "Cotización del servicio contable" })).toBeVisible();
  await expect.poll(() => llamadas(page)).toEqual([{ cmd: "title", args: { meetingId: "m1", title: "Cotización del servicio contable" } }]);
});

test("las Sugerencias de la junta aparecen en la transcripción en su momento, con la marca que les diste", async ({ page }) => {
  await abrir(page, {
    transcripts: [linea(1, 4, "counterpart", "Son dieciocho millones."), linea(2, 9, "user", "¿Con IVA?")],
    sugerencias: [{ id: "s1", role: "cfo", persona: "Betty", role_label: "CFO", text: "Pregunta si incluye IVA.", reason: "Precio sin impuestos.", at: 6, useful: true }],
  });
  const items = page.getByRole("list", { name: "Transcripción" }).getByRole("listitem");
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Son dieciocho millones.");
  await expect(items.nth(1).getByRole("article", { name: "Sugerencia de Betty" })).toContainText("Pregunta si incluye IVA.");
  await expect(items.nth(1)).toContainText("Marcaste: Útil");
  await expect(items.nth(2)).toContainText("¿Con IVA?");
  await expect(page.getByText(/1 Sugerencia de tu junta/)).toBeVisible();
});

test("«Guardar en mi Memoria» dice cuántas Decisiones faltan por revisar", async ({ page }) => {
  await abrir(page, { decisiones: [decision(1, "Se contrata el plan anual."), decision(2, "Se paga en cuatro cuotas.")] });
  const seccion = page.getByRole("region", { name: "Decisiones por revisar" });
  await expect(seccion).toContainText("Falta revisar 2 Decisiones.");
  await expect(seccion).toContainText("0 de 2 revisadas");
  await seccion.getByRole("listitem").filter({ hasText: "Se contrata el plan anual." }).getByRole("button", { name: "Aprobar" }).click();
  await expect(seccion).toContainText("Falta revisar 1 Decisión.");
  await expect(seccion).toContainText("1 de 2 revisadas");
  await seccion.getByRole("listitem").filter({ hasText: "Se paga en cuatro cuotas." }).getByRole("button", { name: "Descartar" }).click();
  await expect(seccion).not.toContainText("Falta revisar");
  await expect(seccion.getByRole("button", { name: "Guardar en mi Memoria" })).toBeEnabled();
});

test("al detener, las Sugerencias se guardan con la Reunión, con la marca que les diste", async ({ page }) => {
  await page.addInitScript({ path: IPC });
  await page.addInitScript(() => {
    const w = window as any;
    w.__LLAMADAS__ = [];
    w.__SOTTOLY_IPC__ = {
      sottoly_list_roles: [{ id: "cfo", role: "CFO", persona: "Betty", status: "active" }],
      get_recording_state: { is_recording: true, recording_duration: 30 },
      stop_recording: () => null,
      api_save_transcript: () => ({ meeting_id: "m9" }),
      sottoly_save_suggestions: (args: unknown) => (w.__LLAMADAS__.push({ cmd: "suggestions", args }), null),
      api_get_meeting: { id: "m9", title: "Reunión", created_at: "", updated_at: "", transcripts: [] },
    };
  });
  await page.goto("/sottoly/en-vivo");
  const emitir = async (e: string, p: unknown) => {
    await page.waitForFunction((x) => (window as any).__sottoly_listening(x), e);
    await page.evaluate(([x, y]) => (window as any).__sottoly_emit(x, y), [e, p] as const);
  };
  await emitir("transcript-update", { text: "Son dieciocho millones.", speaker: "counterpart", is_partial: false, audio_start_time: 12 });
  await emitir("suggestion", { id: "s1", role: "cfo", persona: "Betty", role_label: "CFO", text: "Pregunta si incluye IVA.", reason: "Precio sin impuestos." });
  await page.getByRole("article", { name: "Sugerencia de Betty" }).getByRole("button", { name: "Útil", exact: true }).click();
  await page.getByRole("button", { name: "Detener y revisar Decisiones" }).click();
  await emitir("recording-stopped", { message: "ok", folder_path: "/tmp/reunion-9", meeting_name: "Reunión" });
  await expect(page).toHaveURL(/\/sottoly\/reunion\/?\?id=m9/);
  expect(await llamadas(page)).toEqual([
    {
      cmd: "suggestions",
      args: {
        folderPath: "/tmp/reunion-9",
        suggestions: [{ id: "s1", role: "cfo", persona: "Betty", role_label: "CFO", text: "Pregunta si incluye IVA.", reason: "Precio sin impuestos.", at: 12, useful: true }],
      },
    },
  ]);
});
