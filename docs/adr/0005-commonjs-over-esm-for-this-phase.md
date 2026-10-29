# CommonJS over ESM for this phase

OllaSieve keeps CommonJS (`require` / `module.exports`) as the module system for the current phase, and locks this decision in rather than migrating to ESM in the observability work. The codebase was written and tested under CommonJS from the start (v0.1.0 scaffolding), and the package manifest never carried `"type": "module"`.

Rationale to stay: the Express 4 error-handling model is callback and promise based but does not catch rejected promises from async route handlers, so every async handler must either wrap in `asyncHandler` or return a promise chain handled via `next(err)`. Migrating to ESM now would couple a pure module-system change to that correctness work and risk churning the diff while the team is still establishing the observability and wiring patterns.

Rationale to revisit: ESM gives static `import` graphs, native `import()` for dynamic loading of adapters, and removes the interop shims the CommonJS adapter factory currently needs. If a future phase needs top-level await, named exports analysis, or subpath exports for plugin loading, the migration should be its own ticket with its own tests.

Fallback if the async-handler gap ever shows up as an operational problem: swap the web framework (Fastify or Hono) before rewriting modules. A framework migration would fix the async error story without forcing the ESM change.

Consequences: all source uses `require`/`module.exports`; new code should match. No `import` statements are introduced without a recorded decision.
