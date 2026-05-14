# Plan: SQL Playground

> Source PRD: [PRD.md](../PRD.md)

## Architectural decisions

Durable decisions that apply across Phase 1:

- **Stack**: Vite + React + TypeScript. DuckDB-WASM for SQL execution. Monaco for the editor once the browser tracer is proven. No backend, no router, no persistence in v1.
- **Canonical data shape**: every layer flows through a question model:
  ```
  {
    tables: [{ name, columns: [{ name, type }], rows: unknown[][] }]
  }
  ```
  Column types: `integer | string | timestamp | float | boolean`. Null-like values are normalized before loading into DuckDB.
- **Module seams**:
  - `QuestionModel` (shared type)
  - `SqlGenerator` (`QuestionModel` → DuckDB SQL, pure)
  - `DuckDBRunner` (browser-only runtime wrapper around duckdb-wasm)
  - later: `SchemaParser`, `QuestionModelNormalizer`, `QuestionEditor`, `SessionState`
- **DB lifecycle**: each question/session owns its own temporary in-memory database. Resetting the session rebuilds the schema from scratch.
- **Import/edit lifecycle**: raw pasted text is an import affordance only. After import, the structured question model shown in the editor becomes the source of truth for editing, while the SQL runtime uses the last valid applied dataset.
- **Exercise navigation**: the app includes a small built-in exercise library plus a custom import entry. Switching exercises should feel instant and should privilege query-writing over library management.
- **Schema-only editing**: sample rows are visible as mock evidence, but not directly editable. Users can correct table names, column names, and declared types; row values remain read-only in v1.
- **Schema-only imports**: prompts without example rows should still become runnable through deterministic generated sample data. Built-in exercises keep curated rows when available.
- **Generated data scope**: generated rows are per-column, simple, and deterministic. Do not infer cross-table foreign-key relationships, composite keys, or realistic business distributions in v1.
- **Workspace modes**: the app uses plain Setup and Query modes rather than a permanent 50/50 split. Setup focuses on import/schema/sample data. Query gives the SQL workbench most of the screen. Built-ins default to Query; custom imports default to Setup.
- **Run semantics**: query execution is explicit through `Run` or the keyboard shortcut. Dataset edits should not rerun the query on every keystroke.
- **Testing stance for Phase 1**:
  - prefer pure unit tests where correctness risk is real
  - use the browser tracer as the integration source of truth
  - do **not** spend more time on a Node-specific DuckDB-Wasm harness unless the shipped browser runtime exposes runner defects

---

## Phase 1: Tracer bullet — hardcoded DoorDash end-to-end

**User stories**: PRD 16, 18, 20, 21, 22, 23

**Status**: complete

### What to build

Prove DuckDB-WASM works in the browser by running the DoorDash problem end-to-end with no parser, no editor, and no persistence. Hand-write a `QuestionModel` for the DoorDash problem as a TypeScript constant. Pipe it through `SqlGenerator` to produce `CREATE TABLE` + `INSERT` SQL. Initialize `DuckDBRunner`, load the schema, run a hardcoded correct query, and render the result as a basic HTML table.

This phase deliberately front-loads the riskiest shipped dependency before any UI investment. It also replaces the abandoned Node integration harness as the canonical integration check.

### Acceptance criteria

- [x] App loads in a browser via `vite dev` and displays the result table for the DoorDash query.
- [x] `QuestionModel`, `SqlGenerator`, and `DuckDBRunner` exist as separate modules with no React imports.
- [x] DuckDB-WASM bundle loads and initializes without console errors.
- [x] The rendered result row matches `bad_experience_pct = 75.00`.
- [x] A short implementation note in the repo records that Phase 1 integration truth lives in the browser runtime, not in a Node-specific DuckDB-Wasm test harness.

## Phase 1 testing note

The attempted Node-side `DuckDBRunner` integration harness is intentionally deferred. It consumed time without increasing confidence in the code that will actually ship, because the browser runtime is the real execution target. For Phase 1:

- `SqlGenerator` gets pure unit tests.
- `DuckDBRunner` is validated through the browser tracer.
- If runner-specific defects appear later, browser-mode automated tests can be added then.

---

## Phase 2: Editable query + Monaco + error rendering

**User stories**: PRD 16, 17, 18, 19, 20

**Status**: complete

### What to build

Replace the hardcoded query with a Monaco editor mounted in the page. Add a Run button and a Cmd/Ctrl+Enter shortcut that re-runs the query against the existing (still-hardcoded) DoorDash schema. Result panel renders either the result table or the DuckDB error message inline. Problem definition is still the hardcoded `QuestionModel` from Phase 1.

### Acceptance criteria

- [x] Monaco editor renders with SQL syntax highlighting and preserves multiline formatting.
- [x] Cmd/Ctrl+Enter and the Run button both execute the current editor contents.
- [x] A correct DoorDash query produces the expected result table.
- [x] A syntactically invalid query shows the DuckDB error message inline (not in a console or alert).
- [x] Re-running modified queries does not require reloading the schema (same DB instance).

---

## Phase 3a: Import + read-only structured preview

**User stories**: PRD 1, 2, 3, 4, 8, 10, 21

**Status**: substantially complete

### What to build

Build `SchemaParser` as a pure module that turns DataLemur-style pasted text into a draft `QuestionModel`. Add a small import surface where the user pastes the prompt and triggers import. After import, render a read-only structured preview of the inferred tables, columns, types, and sample rows so the user can inspect what was parsed before editing.

Cover the type set (`integer | string | timestamp | float | boolean`), DataLemur's `MM/DD/YYYY HH:MM:SS` timestamp format, and dash/blank → NULL normalization.

### Acceptance criteria

- [x] Importing the full DoorDash schema block produces an identical `QuestionModel` to Phase 1's hardcoded version.
- [x] The structured preview shows table names, column names, types, and sample rows.
- [x] Parser warnings are shown at import time for malformed or ambiguous input.
- [x] Dashes (`-`) and blank cells in example rows are treated as NULL.
- [x] Additional pasted problem shapes, including float-heavy and messier formatting, load and parse correctly in automated tests.

---

## Phase 3b: Editable structured preview as source of truth

**User stories**: PRD 8, 9, 11, 12, 13, 20

**Status**: complete for current v1 scope

### What to build

Make the structured preview editable at the schema level only. The user should be able to rename tables and columns and change declared column types, while sample rows remain visible as read-only mock data. After import, these schema edits become the editing source of truth for the session. The app should maintain a clear distinction between the current draft and the last valid applied dataset. Invalid edits stay local to the draft, show inline validation, and do not generate invalid schema SQL or poison the runnable dataset.

### Acceptance criteria

- [x] Table names and column names can be edited inline.
- [x] Column types can be changed through a structured control such as a dropdown.
- [x] Sample rows remain visible for inspection but are not directly editable.
- [x] Editing the structured preview updates the draft immediately and rebuilds DuckDB only from the last valid applied model.
- [x] Invalid schema edits show inline errors and do not crash the app or generate invalid SQL.
- [x] `Run` is disabled or otherwise blocked while the draft has validation errors.
- [x] The user can correct a parser mistake in the structured editor and then run SQL successfully without reimporting the raw prompt.

---

## Phase 4: Setup/Query workspace + generated sample data

**User stories**: PRD 5, 6, 7, 14, 15, 16, 18, 20, 23

**Status**: complete

### What to build

Replace the current always-split workspace with a plain mode switch:

- **Setup mode**: prompt/import surface, structured schema editor, and read-only sample rows have the primary canvas.
- **Query mode**: SQL editor and results have the primary canvas; schema status stays visible but does not consume half the page.

Then add schema-only import support. If the parser finds table names and columns but no example rows, run a pure `MockDataGenerator` that creates a small deterministic set of read-only sample rows. This makes schema-only prompts runnable without asking the user to manually enter table data.

Built-in exercises should keep curated rows. Generation is a fallback for missing rows, not a replacement for known-good prompt data.

### TDD sequence

1. [x] RED: `MockDataGenerator` creates 5 deterministic rows for a schema with `integer`, `string`, `float`, `boolean`, and `timestamp` columns.
2. [x] GREEN: implement per-column type-safe generation with stable output.
3. [x] RED: generation applies light column-name heuristics such as `*_id`, `status`, timestamp/date names, amount-like numeric names, and name/title-like strings.
4. [x] GREEN: add simple deterministic heuristics without cross-table relationship inference.
5. [x] RED: a schema-only parsed question becomes a valid `QuestionModel` with generated read-only rows.
6. [x] GREEN: wire generation after parse/normalization only when rows are missing.
7. [x] RED: built-in exercises with curated rows do not get regenerated.
8. [x] GREEN: preserve seeded rows and label generated rows distinctly in the UI.
9. [x] RED: built-in exercise loads in Query mode and custom import loads in Setup mode.
10. [x] GREEN: add `Setup` / `Query` segmented mode state and responsive layout.
11. [x] Browser smoke: schema-only import -> generated rows visible -> switch to Query -> run `SELECT * FROM table LIMIT 5`.

### Acceptance criteria

- [x] A schema-only prompt imports successfully without manual row entry.
- [x] Generated rows are deterministic, type-correct, and visibly labeled as generated sample data.
- [x] The generator defaults to 5 rows per table.
- [x] The generator does not attempt cross-table key alignment or foreign-key inference.
- [x] Built-in exercises preserve curated sample rows.
- [x] Built-in exercises open in Query mode by default.
- [x] Custom import opens in Setup mode by default.
- [x] Query mode gives the SQL editor and result panel a materially larger portion of the workbench than the current split layout.
- [x] Setup mode remains one click away without introducing a drawer in v1.
- [x] Tests cover the pure generator and the schema-only import path.

---

## Known Follow-Ups

The main remaining v1 risk is parser variability rather than structured editing or dataset application semantics. Phase 4 adds generated data and a better workspace shape, but it should not expand into a full data-modeling product.

After Phase 4, the next work should focus on:

- broader prompt-shape coverage against real DataLemur-style inputs
- parser hardening for messier formatting and float-heavy examples
- runtime polish for result shaping, especially typed numerics such as `DECIMAL`
- expanding the exercise library while keeping schema-first import and query flows fast

---

## Phase 5: Parser hardening + result shaping polish

**User stories**: PRD 1, 3, 4, 5, 6, 8, 18, 25, 26

**Status**: complete

### What to build

Harden the import path against more realistic prompt shapes before expanding the exercise library further. This phase keeps the current product surface intact and improves the reliability of the existing schema-to-query loop.

Work should proceed in two tracks:

- **Parser hardening**: add one real prompt-shape test at a time and only widen the parser enough to satisfy the new contract.
- **Result shaping polish**: normalize DuckDB numeric output cleanly so DECIMAL and related typed numeric results render correctly without query-specific workarounds.

### TDD sequence

1. [x] RED: a markdown-style prompt with pipe-delimited column and example tables parses into the expected `QuestionModel`.
2. [x] GREEN: teach `SchemaParser` to ignore markdown separator rows and split pipe-delimited fields.
3. [x] RED: a second messy prompt shape fails for a specific documented reason.
4. [x] GREEN: harden the parser without widening into arbitrary free-form text.
5. [x] RED: a decimal-returning DuckDB result renders incorrectly through the runner/result path.
6. [x] GREEN: normalize typed numeric values consistently.

### Acceptance criteria

- [x] The parser handles at least one markdown-style prompt shape in automated tests.
- [x] Parser hardening remains incremental and test-driven, not a broad rewrite.
- [x] Result shaping covers DECIMAL output through a stable public interface.
- [x] Existing Phase 4 flows continue to pass unchanged.

---

## Phase 6: Semantic generator v1 + relationship hints

**User stories**: PRD 5, 6, 7, 10, 14, 15, 18, 23, 25

**Status**: completed

### What to build

Make generated sample data feel more believable without turning the product into a configurable data-generation tool. The app should stay query-first and guided: users define or import schema, and the product generates useful practice data automatically.

This phase should keep the current Setup/Query split, avoid new generator configuration controls, and improve only the default behavior:

- **Column semantic inference**: use a small fixed dictionary of column-name heuristics such as `name`, `city`, `country`, `region`, `email`, `status`, `*_id`, `amount`, `price`, `revenue`, and timestamps.
- **Cross-table key alignment**: when two tables share the same `*_id` column name, generate values from the same pool so joins are useful.
- **Lightweight relationship hints**: surface a quiet caption-level hint in Setup such as `joins on: customer_id, trip_id` rather than a full diagram.
- **Default row count**: generate 12 rows by default with no selector in the UI.

The product goal is not realism for its own sake. The goal is to make the schema feel real enough that users stop thinking about the data generator and start writing SQL.

### TDD sequence

1. [x] RED: semantic generation produces believable values for a small fixed dictionary such as `city`, `country`, `email`, `status`, `amount`, and `name`.
2. [x] GREEN: teach `MockDataGenerator` narrow, deterministic semantic inference with type-safe fallbacks.
3. [x] RED: two tables sharing a `*_id` column generate disjoint values and make a join useless.
4. [x] GREEN: align shared `*_id` value pools across tables.
5. [x] RED: Setup provides no clear relationship hint for obviously joinable tables.
6. [x] GREEN: add quiet caption-level join hints without introducing a diagram.

### Acceptance criteria

- [x] Generated sample data defaults to 12 rows per table.
- [x] Semantic generation uses a small fixed dictionary and deterministic output.
- [x] Shared `*_id` columns across tables generate joinable value pools.
- [x] Setup surfaces lightweight relationship hints without adding a graph or diagram.
- [x] Query mode remains the dominant workspace and no new generator configuration UI is introduced.

### Out Of Scope For Phase 6

- Per-column override controls
- Row count selector
- Relationship diagram
- Multi-column or composite-key alignment
- FK-to-PK alignment when names differ, such as `orders.customer_id` → `customers.id`
- Distribution realism or faker-style tuning

## Phase 7: Curated exercise expansion

**User stories**: PRD 1, 2, 3, 8, 9, 12, 16, 19, 21

**Status**: completed

### What to build

Expand the seeded exercise library so the app feels immediately useful for interview prep and SQL practice without asking users to import their own prompt first.

This phase should improve the breadth of realistic practice content while keeping the product query-first:

- **More curated exercises**: add several new seeded problems with curated prompts, schema, mock rows, and starter queries.
- **Exercise variety**: broaden coverage across joins, grouping, window functions, date arithmetic, filtering, and ranking.
- **Library polish**: keep exercise summaries, theme tags, and difficulty labels consistent so the left rail remains easy to scan.
- **Generator non-goal**: do not expand semantic generation or relationship inference as part of this phase. New exercises should pressure-test the current implementation, not widen it speculatively.

### TDD sequence

1. [x] RED: the current seed library is too small to cover the intended interview-practice range.
2. [x] GREEN: add at least three new curated exercises with complete prompt, seeded dataset, and starter query definitions.
3. [x] RED: the exercise library can drift in metadata quality or duplicate coverage without any contract.
4. [x] GREEN: add test coverage for exercise count, metadata consistency, and basic theme diversity.
5. [x] RED: a newly added seeded exercise could accidentally fall back to generated rows.
6. [x] GREEN: add a regression test that seeded exercises keep curated rows in the UI.

### Acceptance criteria

- [x] The app ships with at least three additional curated seeded exercises.
- [x] The seeded library covers multiple SQL practice shapes, not just joins or aggregations.
- [x] Every new seeded exercise has a prompt, a starter query, curated rows, and clear metadata.
- [x] Seeded exercises continue to prefer curated rows over generated fallback rows.
- [x] No new generator controls or inference heuristics are introduced in this phase.

### Out Of Scope For Phase 7

- Expanding the semantic generation dictionary
- FK-to-PK alignment where column names differ
- Relationship diagrams or richer schema visualization
- Persistence, progress tracking, or grading

## Phase 8: Practice-first workspace

**User stories**: PRD 1, 2, 3, 4, 8, 9, 11, 12, 17, 20

**Status**: completed

### What to build

Shift the workspace from "queryable schema tool" toward "SQL practice app" for seeded exercises, while preserving the custom import path as an optional advanced workflow.

This phase should make the default seeded experience quieter and more practice-oriented:

- **Visible problem statement**: keep the exercise prompt or summary visible in the main workspace so users do not have to bounce back to the rail to remember the task.
- **Hidden canonical solution**: stop preloading the answer query in the editor for seeded exercises; only reveal it on demand.
- **Read-only reference schema**: keep schema and sample rows visible but non-editable by default.
- **Optional advanced editing**: preserve custom import recovery by hiding editing behind an explicit `Edit schema` action.
- **Answer checking**: allow users to compare their query result against the canonical seeded answer without requiring the exact same SQL text.
- **Seed correctness verification**: verify the seeded exercises actually return the documented result against their curated rows.

### TDD sequence

1. [x] RED: seeded exercises drop users into Query mode without showing the problem in the working surface.
2. [x] GREEN: render a practice brief in the workspace and keep the seeded editor empty on first load.
3. [x] RED: canonical seeded SQL is either preloaded or inaccessible.
4. [x] GREEN: add `Reveal solution` and keep the canonical query hidden until requested.
5. [x] RED: schema editing remains the default surface for practice flows.
6. [x] GREEN: make schema read-only by default and gate custom import editing behind `Edit schema`.
7. [x] RED: there is no deterministic way to check a user's answer except by reading rows manually.
8. [x] GREEN: compare seeded result sets against the canonical answer through a stable result-comparison path.
9. [x] RED: newly added seeded exercises are still not verified in a real browser against their documented outputs.
10. [x] GREEN: add browser verification for the seeded exercises introduced in Phase 7.

### Acceptance criteria

- [x] Seeded exercises show the problem statement in the workspace without relying on the rail alone.
- [x] Seeded editors start blank instead of preloading the canonical query.
- [x] `Reveal solution` is available for seeded exercises and custom import remains freeform.
- [x] Seeded schema previews are read-only by default.
- [x] Custom import still allows schema recovery editing through an explicit toggle.
- [x] `Check my answer` compares result sets rather than SQL text.
- [x] Seeded exercise browser checks verify the documented outputs for the Phase 7 additions.

### Out Of Scope For Phase 8

- Replacing Setup/Query mode with a single unified layout
- AI hints, tutoring, or grading
- Persistence or progress tracking

## Phase 9: Query-context workspace

**User stories**: PRD 1, 2, 3, 4, 8, 11, 12, 17, 20, 22

**Status**: complete

### What to build

Keep Query as the main workspace, but stop making it feel blind. Users should be able to see the relevant schema context while writing SQL, without bouncing back and forth between Setup and Query.

This phase should improve orientation and reference access rather than add new SQL features:

- **Query-side schema rail**: add a compact schema sidebar or reference panel inside Query mode that shows table names, columns, types, and join hints.
- **Orientation-first seeded flow**: stop defaulting seeded exercises into isolated querying with no context. Seeded cases should either open in Setup first or show equivalent schema context immediately in Query.
- **Compact reference behavior**: schema context should be collapsible or visually secondary so the editor still owns the main canvas.
- **Mode split reassessment**: evaluate whether Setup/Query should remain separate modes once Query includes enough reference context.

### TDD sequence

1. [x] RED: users in Query mode cannot see table structure or join hints without leaving the editor.
2. [x] GREEN: render a compact schema rail in Query mode with tables, columns, and join hints.
3. [x] RED: seeded exercises still default to an orientation-poor view on first open.
4. [x] GREEN: change the seeded default so users see schema context before or alongside the first query interaction.
5. [x] RED: schema context overwhelms the editor or becomes a second full workspace.
6. [x] GREEN: make the reference panel compact/collapsible and preserve editor dominance.
7. [x] RED: the Setup/Query split is no longer clearly justified once Query has schema context.
8. [x] GREEN: keep the split for now because Setup still owns import/recovery, and codify the setup-first seeded flow plus query-side schema rail in tests.

### Acceptance criteria

- [x] Query mode shows schema context without forcing users back to Setup.
- [x] Seeded exercises no longer open into a blind editor.
- [x] The SQL editor remains the primary focus of the workspace.
- [x] Schema context is compact, readable, and does not feel like a second competing tool surface.
- [x] The resulting Setup/Query behavior is simpler or more justified than the current split.

### Out Of Scope For Phase 9

- AI hints or tutoring
- New generator controls or richer mock-data realism
- Persistence or progress tracking

## Phase 10: Dialect-aware practice

**User stories**: PRD 1, 2, 3, 4, 8, 10, 11, 17, 20, 22

**Status**: planned

### What to build

Keep the runtime simple, but stop pretending SQL flavor differences do not matter.

This phase should make dialect an explicit part of practice without turning the app into a true multi-engine product:

- **Dialect metadata**: add a dialect profile to seeded exercises and imported prompts, such as `Postgres`, `Snowflake`, `BigQuery`, or `Generic SQL`.
- **Visible dialect chip**: show the active dialect near the problem brief and query workspace so users know what syntax expectations apply.
- **Custom-import dialect choice**: let users choose a dialect when importing their own schema/problem so the app can frame the exercise correctly.
- **Dialect-aware guidance**: surface quiet hints or warnings when the current dialect and the underlying runtime are likely to diverge on common syntax.
- **Runtime simplicity**: keep DuckDB as the execution engine for now; do not introduce multiple SQL backends in this phase.

### TDD sequence

1. [ ] RED: seeded exercises do not communicate which SQL dialect they represent.
2. [ ] GREEN: add dialect metadata to the exercise model and render it in the UI.
3. [ ] RED: custom imports implicitly behave like generic SQL with no user control.
4. [ ] GREEN: add import-time dialect selection and carry it through the session state.
5. [ ] RED: users can write dialect-specific syntax with no guidance when DuckDB is likely to disagree.
6. [ ] GREEN: surface narrow dialect-aware hints/warnings for the most common mismatches.
7. [ ] RED: dialect support is drifting toward a backend explosion rather than a practice aid.
8. [ ] GREEN: codify single-runtime behavior in tests and docs.

### Acceptance criteria

- [ ] Every seeded exercise exposes a visible dialect label.
- [ ] Custom imports let the user pick a dialect without requiring engine setup.
- [ ] The workspace can warn about common dialect/runtime mismatches without blocking query execution.
- [ ] The app remains DuckDB-backed in this phase.
- [ ] Dialect support improves learning context without turning the product into a configurable SQL IDE.

### Out Of Scope For Phase 10

- True multi-engine execution
- Query transpilation across dialects
- Full SQL linting or parser-level dialect validation
- AI tutoring or auto-rewriting syntax
