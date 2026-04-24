.PHONY: help install dev build preview test check lint simulate \
        sim-quick sim-full db-init db-reset deploy-check clean

help:
	@echo ""
	@echo "  Insurance Planning Game – Makefile"
	@echo "  ===================================="
	@echo ""
	@echo "  ── Setup ─────────────────────────────────────────────"
	@echo "    make install          Install npm dependencies"
	@echo "    make db-init          ⚠️  Drop + recreate DB tables"
	@echo "    make db-reset         ⚠️  Delete all game data"
	@echo ""
	@echo "  ── Development ───────────────────────────────────────"
	@echo "    make dev              Vite dev server (localhost:5173)"
	@echo "    make test             Run all tests (Vitest)"
	@echo "    make check            TypeScript type check"
	@echo "    make simulate         Headless simulation"
	@echo "    make sim-quick        4 groups, 3 rounds"
	@echo "    make sim-full         6 groups, 6 rounds, random"
	@echo ""
	@echo "  ── Deploy ────────────────────────────────────────────"
	@echo "    make deploy-check     Tests + build (run before git push)"
	@echo ""

# ── Setup ──────────────────────────────────────────────────────────────────

install:
	npm install

db-init:
	@echo ""
	@echo "  ╔══════════════════════════════════════════════════╗"
	@echo "  ║  ⚠️  DANGER ZONE – IRREVERSIBLE OPERATION        ║"
	@echo "  ║  ALL tables and data will be PERMANENTLY         ║"
	@echo "  ║  DELETED and recreated from scratch.             ║"
	@echo "  ║  Type  YES  (uppercase) to confirm.              ║"
	@echo "  ╚══════════════════════════════════════════════════╝"
	@echo ""
	@read -p "  Confirm: " confirm; \
	  if [ "$$confirm" != "YES" ]; then \
	    echo "  Aborted."; exit 1; \
	  fi
	@npx tsx scripts/db_init.ts

db-reset:
	@chmod +x scripts/reset_supabase.sh
	@./scripts/reset_supabase.sh

# ── Development ────────────────────────────────────────────────────────────

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

test:
	npm test

test-watch:
	npm run test:watch

check:
	npm run check

lint:
	npm run lint

# ── Simulation ─────────────────────────────────────────────────────────────

simulate:
	npm run simulate

sim-quick:
	npm run sim:quick

sim-full:
	npm run sim:full

# ── Deploy ─────────────────────────────────────────────────────────────────

deploy-check: test build
	@echo ""
	@echo "  ✅ Tests passed, build successful."
	@echo "  Ready for: git push origin main"
	@echo ""

# ── Cleanup ────────────────────────────────────────────────────────────────

clean:
	rm -rf dist node_modules/.vite
