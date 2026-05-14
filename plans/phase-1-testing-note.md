# Phase 1 Testing Note

Phase 1 integration truth lives in the browser runtime, not in a Node-specific DuckDB-Wasm harness.

Decision:

- Keep pure unit tests for `SqlGenerator`.
- Validate `DuckDBRunner` through the shipped browser tracer using the hardcoded DoorDash problem.
- Do not spend more time on Node-side DuckDB-Wasm integration unless browser validation exposes runner-specific defects.

Reason:

- The app ships in the browser, so the browser runtime is the highest-signal integration environment.
- The attempted Node harness added setup complexity without improving confidence in shipped behavior.
- The main correctness risk in Phase 1 is schema SQL generation, which is already covered by pure tests.
