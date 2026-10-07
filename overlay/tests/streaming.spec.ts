// Overlay con streaming (PLAN.md, tarea 5): suggestion_delta → suggestion final → o suggestion_cancel.
// Contrato acordado entre sesiones: `text` del delta es el texto ACUMULADO; el final manda.
import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

const delta = { type: "suggestion_delta", id: "s1", role: "cfo", role_label: "CFO", persona: "Betty", text: "Pregunta si" };
const final = {
  type: "suggestion",
  id: "s1",
  role: "cfo",
  role_label: "CFO",
  persona: "Betty",
  text: "Pregunta si ese valor incluye IVA.",
  reason: "Mencionó un precio sin aclarar impuestos.",
  confidence: 0.82,
};

async function openOverlay(page: Page) {
  await page.clock.install();
  await page.addInitScript({ path: fileURLToPath(new URL("../.test-dist/harness.js", import.meta.url)) });
  await page.goto("/overlay/index.html");
  await expect(page.getByTestId("overlay")).toHaveAttribute("data-ready", "true");
}

function emit(page: Page, event: string, payload?: unknown) {
  return page.evaluate(([e, p]) => (window as any).__sottoly.emit(e, p), [event, payload] as const);
}

const card = (page: Page) => page.getByTestId("suggestion-card");
const cardText = (page: Page) => card(page).getByTestId("suggestion-text");
const reason = (page: Page) => card(page).getByTestId("suggestion-reason");
const useful = (page: Page) => card(page).getByRole("button", { name: "Útil", exact: true });

test("un delta muestra la tarjeta parcial con Persona · Rol y el texto, sin motivo ni botones", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", delta);
  await expect(card(page)).toBeVisible();
  await expect(card(page).getByTestId("suggestion-who")).toHaveText("Betty · CFO");
  await expect(cardText(page)).toHaveText("Pregunta si");
  await expect(reason(page)).toBeHidden();
  await expect(useful(page)).toBeHidden();
});

test("los deltas del mismo id reemplazan el texto por el acumulado", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", delta);
  await emit(page, "suggestion_delta", { ...delta, text: "Pregunta si ese valor" });
  await expect(cardText(page)).toHaveText("Pregunta si ese valor");
});

test("el final del mismo id completa la tarjeta con motivo y botones, y manda aunque sea más corto", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", { ...delta, text: "Pregunta si ese valor incluye IVA y retención" });
  await expect(cardText(page)).toHaveText("Pregunta si ese valor incluye IVA y retención");
  await emit(page, "suggestion", final);
  await expect(cardText(page)).toHaveText(final.text);
  await expect(reason(page)).toHaveText(final.reason);
  await expect(useful(page)).toBeVisible();
});

test("el desvanecido de 12 s corre desde el final, no desde el primer delta", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", delta);
  await expect(card(page)).toBeVisible();
  await page.clock.runFor(5_000);
  await emit(page, "suggestion", final);
  await page.clock.runFor(11_000);
  await expect(card(page)).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(card(page)).toBeHidden();
});

test("suggestion_cancel oculta la tarjeta parcial de ese id", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", delta);
  await expect(card(page)).toBeVisible();
  await emit(page, "suggestion_cancel", { type: "suggestion_cancel", id: "s1" });
  await expect(card(page)).toBeHidden();
});

test("un cancel de otro id no oculta la tarjeta visible", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", delta);
  await emit(page, "suggestion_cancel", { type: "suggestion_cancel", id: "otro" });
  await expect(card(page)).toBeVisible();
});

test("sin final en 8 s desde el último delta, la tarjeta parcial se oculta", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion_delta", delta);
  await page.clock.runFor(5_000);
  await emit(page, "suggestion_delta", { ...delta, text: "Pregunta si ese valor" });
  await page.clock.runFor(7_000);
  await expect(card(page)).toBeVisible();
  await page.clock.runFor(2_000);
  await expect(card(page)).toBeHidden();
});

test("un delta tardío de un id ya finalizado se ignora", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", final);
  await emit(page, "suggestion_delta", { ...delta, text: "Pregunta" });
  await expect(cardText(page)).toHaveText(final.text);
  await expect(useful(page)).toBeVisible();
});

test("un delta de otro id reemplaza la tarjeta visible", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", final);
  await emit(page, "suggestion_delta", { ...delta, id: "s2", role: "ceo", role_label: "CEO adversarial", persona: "Sheldon", text: "Nadie dijo" });
  await expect(card(page).getByTestId("suggestion-who")).toHaveText("Sheldon · CEO adversarial");
  await expect(cardText(page)).toHaveText("Nadie dijo");
  await expect(useful(page)).toBeHidden();
});

test("silenciado, se ignoran deltas y finales", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "overlay-mute-toggle");
  await emit(page, "suggestion_delta", delta);
  await emit(page, "suggestion", final);
  await expect(card(page)).toBeHidden();
});

test("un delta que no cumple el protocolo no muestra tarjeta", async ({ page }) => {
  await openOverlay(page);
  const { id: _, ...sinId } = delta;
  await emit(page, "suggestion_delta", sinId);
  await emit(page, "suggestion_delta", { ...delta, text: "" });
  await expect(card(page)).toBeHidden();
});
