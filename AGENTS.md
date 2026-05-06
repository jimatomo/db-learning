# AGENTS.md

## Development Commands

- Use Docker Compose for local development and verification. Do not start the web app with host-side `bun run --cwd apps/web dev`, `bun x vite`, or other direct Vite commands.
- Start the development stack with:

```sh
docker compose -f docker-compose.dev.yml up --build
```

- The app is served at `http://localhost:5173`, and the API is exposed at `http://localhost:3001`.
- Stop the development stack with:

```sh
docker compose -f docker-compose.dev.yml down
```

- Run server tests through Docker Compose:

```sh
docker compose -f docker-compose.dev.yml run --rm --entrypoint bun dev test apps/server/test/db.test.ts
```
