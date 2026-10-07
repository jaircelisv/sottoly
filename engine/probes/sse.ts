// API de Anthropic simulada para las sondas: lo que escribe el modelo, como stream SSE.
import config from "../config.json";

export function sse(texto: string, trozo: number): string {
  const ev = (type: string, data: object) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
  let out = ev("message_start", {
    message: {
      id: "msg_sonda", type: "message", role: "assistant", model: config.draft.model, content: [],
      stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
    },
  });
  out += ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
  for (let i = 0; i < texto.length; i += trozo) {
    out += ev("content_block_delta", { index: 0, delta: { type: "text_delta", text: texto.slice(i, i + trozo) } });
  }
  out += ev("content_block_stop", { index: 0 });
  out += ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 10 } });
  out += ev("message_stop", {});
  return out;
}
