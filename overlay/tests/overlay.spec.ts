import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

// Mensaje `suggestion` tal como lo define engine/src/protocol.ts (SuggestionMessage).
const suggestion = {
  type: "suggestion",
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
  return page.evaluate(
    ([e, p]) => (window as any).__sottoly.emit(e, p),
    [event, payload] as const,
  );
}

const card = (page: Page) => page.getByTestId("suggestion-card");

test("llega una Sugerencia y aparece la tarjeta con Persona · Rol, texto y motivo", async ({ page }) => {
  await openOverlay(page);
  await expect(card(page)).toBeHidden();

  await emit(page, "suggestion", suggestion);

  await expect(card(page)).toBeVisible();
  await expect(card(page).getByTestId("suggestion-who")).toHaveText("Betty · CFO");
  await expect(card(page).getByTestId("suggestion-text")).toHaveText(suggestion.text);
  await expect(card(page).getByTestId("suggestion-reason")).toHaveText(suggestion.reason);
});

test("el Rol de la tarjeta es el role_label del protocolo, no el id", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", { ...suggestion, role: "ceo", role_label: "CEO adversarial", persona: "Sheldon" });
  await expect(card(page).getByTestId("suggestion-who")).toHaveText("Sheldon · CEO adversarial");
});

test("un mensaje que no cumple el protocolo no muestra tarjeta", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", { ...suggestion, text: "" });
  const { role_label: _, ...withoutLabel } = suggestion;
  await emit(page, "suggestion", withoutLabel);
  await emit(page, "suggestion", { type: "summary", decisions: [] });
  await expect(card(page)).toBeHidden();
});

test("útil y no útil emiten suggestion-feedback sin contenido y cierran la tarjeta", async ({ page }) => {
  await openOverlay(page);

  await emit(page, "suggestion", suggestion);
  await card(page).getByRole("button", { name: "Útil", exact: true }).click();
  await expect(card(page)).toBeHidden();

  await emit(page, "suggestion", { ...suggestion, role: "ceo", role_label: "CEO adversarial", persona: "Sheldon" });
  await card(page).getByRole("button", { name: "No útil" }).click();
  await expect(card(page)).toBeHidden();

  const feedback = await page.evaluate(() => (window as any).__sottoly.feedback);
  expect(feedback).toEqual([
    { role: "cfo", useful: true },
    { role: "ceo", useful: false },
  ]);
});

test("la tarjeta se desvanece a los ~12 s", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", suggestion);
  await expect(card(page)).toBeVisible();

  await page.clock.runFor(11_000);
  await expect(card(page)).toBeVisible();

  await page.clock.runFor(2_000);
  await expect(card(page)).toBeHidden();
});

test("una Sugerencia nueva reemplaza a la visible y reinicia los 12 s", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", suggestion);
  await page.clock.runFor(8_000);

  await emit(page, "suggestion", { ...suggestion, text: "No aceptes el plazo todavía." });
  await expect(card(page)).toHaveCount(1);
  await expect(card(page).getByTestId("suggestion-text")).toHaveText("No aceptes el plazo todavía.");

  await page.clock.runFor(8_000);
  await expect(card(page)).toBeVisible();
});

test("el atajo de silenciar oculta la tarjeta y bloquea Sugerencias hasta reactivar", async ({ page }) => {
  await openOverlay(page);
  await emit(page, "suggestion", suggestion);
  await expect(card(page)).toBeVisible();

  await emit(page, "overlay-mute-toggle");
  await expect(card(page)).toBeHidden();
  await expect(page.getByTestId("muted-indicator")).toBeVisible();

  await emit(page, "suggestion", suggestion);
  await expect(card(page)).toBeHidden();

  await emit(page, "overlay-mute-toggle");
  await expect(page.getByTestId("muted-indicator")).toBeHidden();
  await emit(page, "suggestion", suggestion);
  await expect(card(page)).toBeVisible();
});

// Sin tarjeta, la ventana transparente no debe bloquear los clics de la app de abajo.
function ignoreCursorCalls(page: Page) {
  return page.evaluate(() =>
    (window as any).__sottoly.ipc
      .filter((c: any) => c.cmd === "plugin:window|set_ignore_cursor_events")
      .map((c: any) => c.args.value),
  );
}

test("sin tarjeta la ventana deja pasar el ratón; con tarjeta lo recibe", async ({ page }) => {
  await openOverlay(page);
  await expect.poll(() => ignoreCursorCalls(page)).toEqual([true]);

  await emit(page, "suggestion", suggestion);
  await expect.poll(() => ignoreCursorCalls(page)).toEqual([true, false]);

  await card(page).getByRole("button", { name: "Útil", exact: true }).click();
  await expect.poll(() => ignoreCursorCalls(page)).toEqual([true, false, true]);
});
