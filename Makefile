.PHONY: dev dev-down seed test test-e2e build start clean-host-modules

dev:
	docker compose -f docker-compose.dev.yml up --build

dev-down:
	docker compose -f docker-compose.dev.yml down

seed:
	docker compose -f docker-compose.dev.yml run --rm --entrypoint bun dev run --cwd apps/server scripts/seed.ts

test:
	docker compose -f docker-compose.dev.yml run --rm --entrypoint bun dev test apps/server/test/db.test.ts

test-e2e:
	docker compose -f docker-compose.e2e.yml up --build --abort-on-container-exit --exit-code-from e2e; \
	docker compose -f docker-compose.e2e.yml down

build:
	docker compose build

start:
	docker compose up --build

clean-host-modules:
	chmod +x scripts/rm-host-modules.sh && ./scripts/rm-host-modules.sh
