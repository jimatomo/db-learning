COMPOSE = docker compose -f docker-compose.dev.yml
LESSON ?= c
DATABASE_PATH ?= /data/app-$(LESSON).db

.PHONY: dev lesson-a lesson-b lesson-c switch-lesson dev-down seed test

dev:
	LESSON=$(LESSON) DATABASE_PATH=$(DATABASE_PATH) $(COMPOSE) up --build

lesson-a:
	$(MAKE) switch-lesson LESSON=a

lesson-b:
	$(MAKE) switch-lesson LESSON=b

lesson-c:
	$(MAKE) switch-lesson LESSON=c

switch-lesson:
	$(COMPOSE) down
	LESSON=$(LESSON) DATABASE_PATH=$(DATABASE_PATH) $(COMPOSE) up --build

dev-down:
	$(COMPOSE) down

seed:
	LESSON=$(LESSON) DATABASE_PATH=$(DATABASE_PATH) $(COMPOSE) run --rm --entrypoint bun dev run --cwd apps/server scripts/seed.ts

test:
	$(COMPOSE) run --rm --entrypoint bun dev test apps/server/test/db.test.ts
