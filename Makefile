.DEFAULT_GOAL := help

.PHONY: help
help: ## Muestra esta lista de comandos
	@echo "Screeps - comandos disponibles:"
	@echo ""
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

.PHONY: install
install: ## Instala las dependencias del proyecto
	bun install

.PHONY: build
build: ## Compila el bot sin subirlo (genera dist/main.js)
	bun run build

.PHONY: lint
lint: ## Corre ESLint sobre src/
	bun run lint

.PHONY: test
test: ## Corre los tests unitarios
	bun run test-unit

.PHONY: test-integration
test-integration: ## Muestra cómo habilitar los tests de integración
	bun run test-integration

.PHONY: push-main
push-main: ## Compila y sube el código al servidor oficial (branch main)
	bun run push-main

.PHONY: push-pserver
push-pserver: ## Compila y sube el código a un servidor privado
	bun run push-pserver

.PHONY: push-season
push-season: ## Compila y sube el código al servidor de season
	bun run push-season

.PHONY: push-sim
push-sim: ## Compila y sube el código al simulador
	bun run push-sim

.PHONY: watch-main
watch-main: ## Compila y sube en modo watch (branch main)
	bun run watch-main

.PHONY: watch-pserver
watch-pserver: ## Modo watch hacia un servidor privado
	bun run watch-pserver

.PHONY: watch-season
watch-season: ## Modo watch hacia el servidor de season
	bun run watch-season

.PHONY: watch-sim
watch-sim: ## Modo watch hacia el simulador
	bun run watch-sim

.PHONY: clean
clean: ## Borra los artefactos de build (dist/, cache de TS)
	rm -rf dist .rpt2_cache tsc-out
