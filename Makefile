# Sottoly — punto de entrada (PLAN.md, tarea 1).
#   make verify     las suites: bun test (Motor y hooks), Playwright (overlay y panel), cargo test
#   make sidecars   llama-helper y sottoly-engine en frontend/src-tauri/binaries/
#   make demo       Next en http://localhost:3118 precalentado, luego Tauri con Sugerencias de demo
#   make measure    latencia de Segmentos con la App corriendo (LOG=app.log por defecto)
#   make worktree   NAME=<nombre>: worktree desde origin/main con el contexto privado y los binarios
#   make limpiar    borra las Reuniones de prueba de la última medición (base y transcripts.json)

SHELL := /bin/bash
.SHELLFLAGS := -eu -o pipefail -c

ROOT     := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))
TRIPLE   := $(shell rustc -vV 2>/dev/null | sed -n 's/^host: //p')
BINARIES := $(ROOT)/frontend/src-tauri/binaries
PORT     := 3118
LOG      ?= $(ROOT)/app.log

WORKTREES_DIR ?= $(HOME)/orca/workspaces/Sottoly
PRIVATE       := $(HOME)/.sottoly/CLAUDE.private.md
MEDICION      := $(HOME)/.sottoly/medicion-desde

MEETILY_DATA ?= $(HOME)/Library/Application Support/com.meetily.ai
RECORDINGS   ?= $(shell sed -n 's/.*"save_folder"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$(MEETILY_DATA)/recording_preferences.json" 2>/dev/null || true)
ifeq ($(strip $(RECORDINGS)),)
RECORDINGS := $(HOME)/Movies/meetily-recordings
endif

LLAMA_HELPER   := $(BINARIES)/llama-helper-$(TRIPLE)
SOTTOLY_ENGINE := $(BINARIES)/sottoly-engine-$(TRIPLE)

.PHONY: verify verify-engine verify-overlay verify-panel verify-rust sidecars demo measure limpiar deps worktree

# ── Dependencias ─────────────────────────────────────────────────────────────

engine/node_modules: engine/package.json engine/bun.lock
	cd engine && bun install --frozen-lockfile
	@touch $@

overlay/node_modules: overlay/package.json overlay/bun.lock
	cd overlay && bun install --frozen-lockfile
	@touch $@

frontend/node_modules: frontend/package.json frontend/pnpm-lock.yaml
	cd frontend && pnpm install --frozen-lockfile
	@touch $@

deps: engine/node_modules overlay/node_modules frontend/node_modules

# ── verify ───────────────────────────────────────────────────────────────────

verify: verify-engine verify-overlay verify-panel verify-rust

verify-engine: engine/node_modules
	cd engine && bunx tsc --noEmit && bun test
	cd engine && bun test ../scripts/sottoly/harness
	cd engine && bun src/contract.ts --check

verify-overlay: engine/node_modules overlay/node_modules
	cd overlay && bunx tsc --noEmit && bun test scripts
	cd overlay && bunx playwright install webkit >/dev/null
	cd overlay && bunx playwright test

verify-panel: frontend/node_modules
	cd frontend && pnpm exec playwright install webkit >/dev/null
	cd frontend && pnpm exec playwright test

verify-rust: sidecars
	cd frontend/src-tauri && cargo test --no-fail-fast

# ── sidecars ─────────────────────────────────────────────────────────────────

sidecars: $(LLAMA_HELPER) $(SOTTOLY_ENGINE)

$(LLAMA_HELPER):
	cargo build -p llama-helper --features metal
	mkdir -p $(BINARIES)
	cp target/debug/llama-helper $@

$(SOTTOLY_ENGINE): engine/node_modules $(wildcard engine/src/*.ts)
	mkdir -p $(BINARIES)
	cd engine && bun build src/main.ts --compile --outfile $@

# ── demo ─────────────────────────────────────────────────────────────────────
# Next primero y precalentado (sin esto Tauri abre antes de que existan los
# chunks y sale un ChunkLoadError); después Tauri sin beforeDevCommand.

demo: frontend/node_modules
	@trap 'kill 0' EXIT; \
	(cd frontend && pnpm dev) & \
	until curl -sf -o /dev/null localhost:$(PORT)/; do sleep 1; done; \
	curl -s -o /dev/null localhost:$(PORT)/_next/static/chunks/app/layout.js || true; \
	echo "App web lista en http://localhost:$(PORT)"; \
	$(MAKE) --no-print-directory sidecars; \
	cd frontend && SOTTOLY_DEMO_SUGGESTIONS=1 RUST_LOG=$${RUST_LOG:-info} \
	  pnpm tauri dev --config '{"build":{"beforeDevCommand":""}}' -- --features coreml

# ── measure ──────────────────────────────────────────────────────────────────

# La medición se registra antes de reproducir nada: desde ahí, toda Reunión es de prueba
# y make limpiar la borra. Varias mediciones seguidas conservan el primer registro.

measure:
	@mkdir -p "$(dir $(MEDICION))"
	@test -f "$(MEDICION)" || date -u +%Y-%m-%dT%H:%M:%SZ > "$(MEDICION)"
	scripts/sottoly/latency/measure.sh $(LOG)

# ── limpiar ──────────────────────────────────────────────────────────────────

limpiar:
	@scripts/sottoly/limpiar.sh "$(MEETILY_DATA)" "$(RECORDINGS)" "$(MEDICION)"

# ── worktree ─────────────────────────────────────────────────────────────────
# Cada sesión trabaja en su worktree. El contexto privado no se versiona: vive en
# ~/.sottoly/CLAUDE.private.md y el CLAUDE.local.md del worktree (ignorado) lo importa.

worktree:
	@test -n "$(NAME)" || { echo "Falta NAME: make worktree NAME=<nombre>" >&2; exit 2; }
	@test -f "$(PRIVATE)" || { echo "Falta $(PRIVATE) (el contexto privado). Créalo antes; no se crea el worktree." >&2; exit 2; }
	git fetch -q origin
	git worktree add -b sottoly/$(NAME) "$(WORKTREES_DIR)/$(NAME)" origin/main
	echo "@~/.sottoly/CLAUDE.private.md" > "$(WORKTREES_DIR)/$(NAME)/CLAUDE.local.md"
	mkdir -p "$(WORKTREES_DIR)/$(NAME)/frontend/src-tauri/binaries"
	if compgen -G "$(BINARIES)/*" >/dev/null; then cp -p $(BINARIES)/* "$(WORKTREES_DIR)/$(NAME)/frontend/src-tauri/binaries/"; fi
	@echo "Worktree listo en $(WORKTREES_DIR)/$(NAME) (rama sottoly/$(NAME))."

