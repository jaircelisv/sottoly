// Integración del sidecar: líneas JSONL entran por stdin y salen Sugerencias por stdout,
// con los proveedores grabados (SOTTOLY_PROVIDERS=recorded: sin keys, determinista).
import { expect, test } from "bun:test";
import { join } from "node:path";
import { loadFixtures } from "./evals";
import { OutboundMessage } from "./protocol";

const ROOT = join(import.meta.dir, "../..");
const fixture = loadFixtures(join(ROOT, "evals/fixtures")).find((f) => f.id === "contador-iva")!;

test("una Reunión por stdin produce la Sugerencia de Betty por stdout", async () => {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", SOTTOLY_PROVIDERS: "recorded", SOTTOLY_TODAY: "2026-10-07" },
  });
  const lines = [
    { type: "session", event: "start", roles: fixture.roles },
    ...fixture.segments.map((s) => ({ type: "segment", ...s })),
  ];
  for (const line of lines) proc.stdin.write(JSON.stringify(line) + "\n");
  proc.stdin.end();

  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);
  expect(await proc.exited).toBe(0);
  expect(stderr).not.toContain("provider_failed");

  const out = stdout.trim().split("\n").filter(Boolean).map((l) => OutboundMessage.parse(JSON.parse(l)));
  const finals = out.filter((m) => m.type === "suggestion");
  expect(finals).toHaveLength(1);
  expect(finals[0]).toMatchObject({ type: "suggestion", role: "cfo", persona: "Betty" });
  // La tarjeta aparece con el delta, antes del final y con el mismo id.
  expect(out[0]).toMatchObject({ type: "suggestion_delta", id: (finals[0] as { id: string }).id });
  // Al cerrar (EOF), las Decisiones candidatas: lo último que sale, ninguna aprobada (SPEC §6).
  const last = out.at(-1)!;
  expect(last.type).toBe("summary");
  const decisions = (last as { decisions: { approved: boolean; source: string }[] }).decisions;
  expect(decisions.length).toBeGreaterThan(0);
  expect(decisions.every((d) => !d.approved && d.source === "engine")).toBe(true);
}, 20_000);
