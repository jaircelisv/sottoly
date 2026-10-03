// Integración del sidecar: líneas JSONL entran por stdin y salen Sugerencias por stdout,
// con los proveedores grabados (SOTTOLY_PROVIDERS=recorded: sin keys, determinista).
import { expect, test } from "bun:test";
import { join } from "node:path";
import { loadFixtures } from "./evals";
import { SuggestionMessage } from "./protocol";

const ROOT = join(import.meta.dir, "../..");
const fixture = loadFixtures(join(ROOT, "evals/fixtures")).find((f) => f.id === "contador-iva")!;

test("una Reunión por stdin produce la Sugerencia de Betty por stdout", async () => {
  const proc = Bun.spawn(["bun", join(import.meta.dir, "main.ts")], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    env: { PATH: process.env.PATH ?? "", SOTTOLY_PROVIDERS: "recorded" },
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

  const out = stdout.trim().split("\n").filter(Boolean).map((l) => SuggestionMessage.parse(JSON.parse(l)));
  expect(out).toHaveLength(1);
  expect(out[0]).toMatchObject({ type: "suggestion", role: "cfo", persona: "Betty" });
}, 20_000);
