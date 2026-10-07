// Overlay de Sottoly: muestra una Sugerencia a la vez, sin robar el foco.
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { parseCancel, parseDelta, parseSuggestion, type SuggestionDelta, type SuggestionMessage } from "./suggestion";

const VISIBLE_MS = 12_000;
const FADE_MS = 400;
// Red de seguridad del streaming: sin final ni cancelación en 8 s desde el último delta, se oculta.
const PARTIAL_TIMEOUT_MS = 8_000;

const root = document.querySelector<HTMLElement>("[data-testid=overlay]")!;
const card = root.querySelector<HTMLElement>("[data-testid=suggestion-card]")!;
const who = card.querySelector<HTMLElement>("[data-testid=suggestion-who]")!;
const text = card.querySelector<HTMLElement>("[data-testid=suggestion-text]")!;
const reason = card.querySelector<HTMLElement>("[data-testid=suggestion-reason]")!;
const actions = card.querySelector<HTMLElement>(".actions")!;
const mutedIndicator = root.querySelector<HTMLElement>("[data-testid=muted-indicator]")!;

let current: SuggestionMessage | null = null;
// Redacción en curso: id de la tarjeta parcial visible (sin motivo ni botones).
let partialId: string | null = null;
// Ids que ya tuvieron su final: un delta tardío de esos se ignora.
const finalized = new Set<string>();
let muted = false;
let timers: ReturnType<typeof setTimeout>[] = [];

// Sin tarjeta, la ventana transparente deja pasar el ratón a la app de abajo.
function passCursorThrough(ignore: boolean) {
  getCurrentWindow()
    .setIgnoreCursorEvents(ignore)
    .catch((e) => console.warn("[overlay] setIgnoreCursorEvents", e));
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function hide() {
  clearTimers();
  current = null;
  partialId = null;
  card.classList.remove("fading");
  card.hidden = true;
  passCursorThrough(true);
}

function show(suggestion: SuggestionMessage) {
  clearTimers();
  finalized.add(suggestion.id);
  partialId = null;
  current = suggestion;
  reason.hidden = false;
  actions.hidden = false;
  who.textContent = `${suggestion.persona} · ${suggestion.role_label}`;
  text.textContent = suggestion.text;
  reason.textContent = suggestion.reason;
  card.classList.remove("fading");
  card.hidden = false;
  passCursorThrough(false);
  timers.push(
    setTimeout(() => card.classList.add("fading"), VISIBLE_MS),
    setTimeout(hide, VISIBLE_MS + FADE_MS),
  );
}

function showPartial(d: SuggestionDelta) {
  if (finalized.has(d.id)) return;
  clearTimers();
  current = null;
  partialId = d.id;
  who.textContent = `${d.persona} · ${d.role_label}`;
  text.textContent = d.text;
  reason.hidden = true;
  actions.hidden = true;
  card.classList.remove("fading");
  card.hidden = false;
  // Sin botones no hay nada que clicar: la ventana sigue dejando pasar el ratón.
  passCursorThrough(true);
  timers.push(setTimeout(hide, PARTIAL_TIMEOUT_MS));
}

// Métricas sin contenido (SPEC §7): solo el Rol y si fue útil.
function sendFeedback(useful: boolean) {
  if (!current) return;
  void emit("suggestion-feedback", { role: current.role, useful });
  hide();
}

card.querySelector("[data-feedback=useful]")!.addEventListener("click", () => sendFeedback(true));
card.querySelector("[data-feedback=not-useful]")!.addEventListener("click", () => sendFeedback(false));

async function start() {
  passCursorThrough(true);
  await listen("suggestion", (event) => {
    const suggestion = parseSuggestion(event.payload);
    if (suggestion && !muted) show(suggestion);
  });
  await listen("suggestion_delta", (event) => {
    const d = parseDelta(event.payload);
    if (d && !muted) showPartial(d);
  });
  await listen("suggestion_cancel", (event) => {
    const c = parseCancel(event.payload);
    if (c && c.id === partialId) hide();
  });
  // El atajo global se registra en Rust (overlay.rs) porque esta ventana no toma el foco.
  await listen("overlay-mute-toggle", () => {
    muted = !muted;
    mutedIndicator.hidden = !muted;
    if (muted) hide();
  });
  root.dataset.ready = "true";
}

void start();
