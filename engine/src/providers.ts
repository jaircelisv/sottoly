// Proveedores reales (ModelProvider): Jev para la Compuerta y Anthropic para la Redacción.
// Los IDs de modelo vienen de config.json; las keys, del entorno (TYPESAFE_AI_API_KEY, ANTHROPIC_API_KEY).
import { experimental_evaluate, Output, streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createTypeSafeAi } from "@ai-sdk/typesafe-ai";
import { Draft, DraftOutput, type Drafter } from "./draft";
import type { ChoiceEvaluator } from "./gate";

export function jevEvaluator(modelId: string): ChoiceEvaluator {
  const model = createTypeSafeAi().evaluationModel(modelId);
  return async (state, question) => {
    const { answers } = await experimental_evaluate({ model, state, questions: { gate: question } });
    const answer = answers.gate;
    if (answer.type !== "choice") throw new Error(`unexpected answer type ${answer.type}`);
    return { choice: answer.choice, probabilities: answer.probabilities };
  };
}

/** Redacción en streaming: `onText` recibe el texto acumulado del objeto parcial. `fetch` solo para pruebas. */
export function anthropicDrafter(modelId: string, maxTokens: number, fetch?: typeof globalThis.fetch): Drafter {
  const model = createAnthropic({ fetch, apiKey: fetch ? "recorded" : undefined })(modelId);
  return async ({ system, prompt }, onText) => {
    const result = streamText({
      model,
      system,
      prompt,
      maxOutputTokens: maxTokens,
      output: Output.object({ schema: DraftOutput }),
      onError: () => {}, // el error llega al esperar `output`
    });
    let last = "";
    for await (const partial of result.partialOutputStream) {
      if (partial?.skip) continue; // declina: nada que mostrar
      const text = partial?.text;
      if (typeof text === "string" && text && text !== last) {
        last = text;
        onText?.(text);
      }
    }
    return Draft.parse(await result.output); // sin `skip` (grabaciones previas) = no declina
  };
}
