// Pantalla «En vivo» y chat con la junta (PLAN.md, tarea 13): durante la Reunión, la transcripción
// llega por `transcript-update`, las Sugerencias por `suggestion`, y el chat va y vuelve por el puente
// (`sottoly_chat_send` → `chat_delta` / `chat_reply` / `chat_error`). IPC y eventos simulados (ipc.js).
import { expect, test, type Page } from "@playwright/test";
import { join } from "node:path";

const IPC = join(__dirname, "ipc.js");

const roles = [
  { id: "cfo", role: "CFO", persona: "Betty", gate_definition: "Cifras sin aclarar.", calibrated: false, status: "active" },
  { id: "ceo", role: "CEO adversarial", persona: "Sheldon", gate_definition: "Acuerdos sin datos.", calibrated: false, status: "active" },
  { id: "cto", role: "CTO", persona: "Ada", gate_definition: "Plazos sin estimar.", calibrated: false, status: "experimental" },
];

const sugerencia = {
  type: "suggestion", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty",
  text: "Pregunta si los dieciocho millones incluyen IVA.", reason: "Mencionó el total sin impuestos.", confidence: 0.9,
};

async function abrir(page: Page, envio: "ok" | "sin-reunion" = "ok") {
  await page.addInitScript({ path: IPC });
  await page.addInitScript((modo) => {
    (window as any).__SOTTOLY_IPC__ = {
      sottoly_list_roles: (window as any).__ROLES__,
      sottoly_chat_send: (args: unknown) => {
        (window as any).__ENVIOS__ = [...((window as any).__ENVIOS__ ?? []), args];
        if (modo === "sin-reunion") return new Error("No hay una Reunión en curso");
        return "c1";
      },
    };
  }, envio);
  await page.addInitScript((r) => ((window as any).__ROLES__ = r), roles);
  await page.goto("/sottoly/en-vivo");
  await expect(page.getByRole("heading", { level: 1, name: "En vivo" })).toBeVisible();
}

const emitir = (page: Page, evento: string, payload: unknown) =>
  page.evaluate(([e, p]) => (window as any).__sottoly_emit(e, p), [evento, payload] as const);

const frase = (text: string, speaker: string, t: number) => ({ text, speaker, is_partial: false, audio_start_time: t, audio_end_time: t + 2 });
const chat = (page: Page) => page.getByRole("complementary", { name: "Chat con la junta" });
const envios = (page: Page) => page.evaluate(() => (window as any).__ENVIOS__ ?? []);

test("las frases llegan a la transcripción en vivo con quién habló, y las parciales no", async ({ page }) => {
  await abrir(page);
  await emitir(page, "transcript-update", frase("El servicio anual les queda en dieciocho millones.", "counterpart", 62));
  await emitir(page, "transcript-update", { ...frase("Ok, suena", "user", 69), is_partial: true });
  await emitir(page, "transcript-update", frase("Ok, suena razonable.", "user", 69));
  const lineas = page.getByRole("list", { name: "Transcripción en vivo" }).getByRole("listitem");
  await expect(lineas).toHaveCount(2);
  await expect(lineas.nth(0)).toContainText("Contraparte");
  await expect(lineas.nth(0)).toContainText("dieciocho millones");
  await expect(lineas.nth(1)).toContainText("Tú");
  await expect(lineas.nth(1)).toContainText("Ok, suena razonable.");
});

test("una Sugerencia aparece en la transcripción y «Responder» la cita en el chat", async ({ page }) => {
  await abrir(page);
  await emitir(page, "suggestion", sugerencia);
  const tarjeta = page.getByRole("article", { name: "Sugerencia de Betty" });
  await expect(tarjeta).toContainText("Pregunta si los dieciocho millones incluyen IVA.");
  await tarjeta.getByRole("button", { name: "Responder a Betty" }).click();
  await expect(chat(page)).toContainText("Sobre: «Pregunta si los dieciocho millones incluyen IVA.»");
  await chat(page).getByLabel("Pregúntale a Betty").fill("¿Y si me dice que el IVA va aparte?");
  await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
  await expect.poll(() => envios(page)).toEqual([{ role: "cfo", text: "¿Y si me dice que el IVA va aparte?", replyTo: "s1" }]);
});

test("la respuesta del Rol llega en streaming y se completa", async ({ page }) => {
  await abrir(page);
  await chat(page).getByLabel("Pregúntale a Betty").fill("¿Qué dijo del anticipo?");
  await chat(page).getByRole("button", { name: "Enviar" }).click();
  await expect(chat(page)).toContainText("¿Qué dijo del anticipo?");
  await emitir(page, "chat_delta", { type: "chat_delta", id: "c1", role: "cfo", text: "Pidió un anticipo" });
  await expect(chat(page)).toContainText("Pidió un anticipo");
  await expect(chat(page).getByText("Escribiendo…")).toBeVisible();
  await emitir(page, "chat_reply", { type: "chat_reply", id: "c1", role: "cfo", text: "Pidió un anticipo del cincuenta por ciento para empezar." });
  await expect(chat(page)).toContainText("Pidió un anticipo del cincuenta por ciento para empezar.");
  await expect(chat(page).getByText("Escribiendo…")).toBeHidden();
});

test("si el Rol no puede responder, el chat lo dice", async ({ page }) => {
  await abrir(page);
  await chat(page).getByLabel("Pregúntale a Betty").fill("¿Cuánto cuesta?");
  await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
  await expect(chat(page)).toContainText("¿Cuánto cuesta?");
  await emitir(page, "chat_error", { type: "chat_error", id: "c1" });
  await expect(chat(page)).toContainText("Betty no pudo responder. Inténtalo de nuevo.");
});

test("sin una Reunión en curso, enviar avisa que hay que iniciar la grabación", async ({ page }) => {
  await abrir(page, "sin-reunion");
  await chat(page).getByLabel("Pregúntale a Betty").fill("Hola");
  await chat(page).getByLabel("Pregúntale a Betty").press("Enter");
  await expect(chat(page).getByRole("alert").filter({ hasText: "Inicia la grabación" })).toBeVisible();
});

test("eliges con quién hablas entre los Roles activos de la junta", async ({ page }) => {
  await abrir(page);
  const betty = chat(page).getByRole("button", { name: "Betty · CFO" });
  const sheldon = chat(page).getByRole("button", { name: "Sheldon · CEO adversarial" });
  await expect(betty).toHaveAttribute("aria-pressed", "true");
  await expect(chat(page).getByRole("button", { name: "Ada · CTO" })).toHaveCount(0);
  await sheldon.click();
  await expect(sheldon).toHaveAttribute("aria-pressed", "true");
  await chat(page).getByLabel("Pregúntale a Sheldon").fill("¿Ves algún riesgo?");
  await chat(page).getByLabel("Pregúntale a Sheldon").press("Enter");
  await expect.poll(() => envios(page)).toEqual([{ role: "ceo", text: "¿Ves algún riesgo?", replyTo: null }]);
});
