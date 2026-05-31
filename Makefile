# Crypteon — convenience targets. Run `make help` to list everything.
#
# Author: Ankush Bhadwar

COMPOSE ?= docker compose
IMAGE   ?= crypteon:latest
PORT    ?= 8080

.DEFAULT_GOAL := help
.PHONY: help build up down restart logs ps shell health cli image-cli clean dokploy dev test desktop dmg exe appimage desktop-all

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

build: ## Build the web image via docker compose
	$(COMPOSE) build

up: ## Build (if needed) and start the web app in the background
	$(COMPOSE) up -d --build
	@echo "Crypteon is starting -> http://localhost:$(PORT)/"

down: ## Stop and remove the containers
	$(COMPOSE) down

restart: ## Restart the running stack
	$(COMPOSE) restart

logs: ## Follow web app logs
	$(COMPOSE) logs -f crypteon

ps: ## Show container status
	$(COMPOSE) ps

shell: ## Open a shell inside the running web container
	$(COMPOSE) exec crypteon sh

health: ## Curl the in-container health endpoint
	$(COMPOSE) exec crypteon wget -qO- http://127.0.0.1/health || true

cli: ## Run the dockerized CLI (use ARGS="list" or ARGS="run --key base64")
	$(COMPOSE) run --rm crypteon-cli $(ARGS)

image-cli: ## Build the standalone CLI image
	docker build -f Dockerfile.cli -t crypteon-cli:latest .

dokploy: ## Bring up the Traefik/Dokploy production stack
	$(COMPOSE) -f docker-compose.dokploy.yml up -d --build

dev: ## Run the SvelteKit dev server locally (no Docker)
	cd app && npm run dev

test: ## Run the JS unit tests
	cd app && npx vitest run

desktop: ## Run the desktop app locally (Electron)
	cd desktop && npm install && npm start

dmg: ## Build the macOS .dmg installer (run on macOS)
	cd desktop && npm install && npm run dist:mac

exe: ## Build the Windows .exe installer
	cd desktop && npm install && npm run dist:win

appimage: ## Build the Linux AppImage + .deb
	cd desktop && npm install && npm run dist:linux

desktop-all: ## Build desktop installers for all platforms
	cd desktop && npm install && npm run dist:all

clean: ## Remove containers, images, and build artifacts
	-$(COMPOSE) down --rmi local --volumes
	-rm -rf app/build app/.svelte-kit
