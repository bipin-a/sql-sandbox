# Plan: SQL Playground

> Source PRD: [PRD.md](../PRD.md)

## Architectural decisions

Durable decisions that apply across all phases:

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
- **Exercise navigation**: the app includes a small curated practice set, not a growing catalog. Roughly 4-8 seeded exercises is enough. Switching exercises should feel instant and should privilege query-writing over library management.
- **Schema-only editing**: sample rows are visible as mock evidence, but not directly editable. Users can correct table names, column names, and declared types; row values remain read-only in v1.
- **Schema-only imports**: prompts without example rows should still become runnable through deterministic generated sample data. Built-in exercises keep curated rows when available.
- **Generated data scope**: generated rows are simple and deterministic. Identical shared `*_id` alignment is in scope; relationship inference, composite keys, FK-to-PK guessing across different names, and realistic business distributions are not.
- **Workspace modes**: the app uses plain Setup and Query modes rather than a permanent 50/50 split. Setup focuses on prompt/schema/sample data. Query gives the SQL workbench most of the screen. Built-ins open in Query with schema context visible there; custom imports and blank-schema authoring open in Setup.
- **Entry paths**: the two top-level intents (`Practice with sample data`, `Use my own tables`) are the primary product choice and must be visible on first load. Superseded by Phase 16: the modal `Change source` affordance from Phase 15 hid the second intent from new users and is replaced by a home-screen chooser that the workspace returns to via a persistent `Home` link.
- **Source chooser shape**: curated exercises live under `Practice with sample data`. `Import prompt/schema` and `Create schema` are sibling actions under `Use my own tables`. The chooser is the app's home surface (not a modal) and may leave space for future Recent/Saved sections, but v1 should not implement persistence.
- **Dialect stance**: exercises carry a default SQL dialect, users may override it when they intentionally want to practice another flavor, and the runtime stays single-engine until multi-engine execution earns its cost.
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
- [x] The generator defaults to 5 rows per table in this phase. Phase 6 later raises the current default to 12.
- [x] The generator stays narrow: identical shared `*_id` alignment is allowed, but foreign-key inference and richer relationship modeling are absent.
- [x] Built-in exercises preserve curated sample rows.
- [x] Built-in exercises open in a query-focused workspace by default.
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
- keeping the curated exercise set small while improving schema-first import and query flows

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
- **Library polish**: keep exercise summaries, theme tags, and difficulty labels consistent so the practice picker remains easy to scan.
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
- **Orientation-aware seeded flow**: keep seeded exercises query-first, but never blind. Schema context should already be visible when the user lands in the practice workspace.
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

## Phase 10: Seeded Setup cleanup

**User stories**: PRD 14, 15, 23, 24, 31

**Status**: complete

### What to build

Remove the remaining parser-shaped UI from curated practice. Seeded Setup should feel like reference context, not import tooling.

This phase is intentionally tiny and independently shippable:

- **No raw source panel on seeded Setup**: hide import-style text for built-in exercises by default.
- **Two-surface contract for now**: keep the raw text panel only on Custom Import and remove it from seeded exercises. Blank-schema authoring will inherit the no-raw-text rule in Phase 13.
- **Structured-first orientation**: let seeded Setup focus on problem statement, schema, rows, and relationship hints.

### TDD sequence

1. [x] RED: seeded Setup still exposes raw import-style source text.
2. [x] GREEN: render seeded Setup with structured reference only, no raw text panel.
3. [x] RED: the change could accidentally remove the import panel from Custom Import.
4. [x] GREEN: codify the two-surface contract in tests: seeded has no import panel, custom import does.

### Acceptance criteria

- [x] Seeded Setup no longer shows raw import-style source text by default.
- [x] Custom Import still shows the raw text import surface.
- [x] The resulting Setup surface feels quieter and more practice-oriented.

### Out Of Scope For Phase 10

- Manual schema authoring controls
- Dialect selection or runtime behavior
- AI hints or tutoring

## Phase 11: Custom import output-block hardening

**User stories**: PRD 1, 4, 8, 19, 35

**Status**: complete

### What to build

Harden the parser for the most common pasted tutorial shape before making Custom Import more prominent in the IA.

This phase should stay small and contained:

- **Ignore output examples safely**: when a pasted prompt includes `Example Output:`, the parser should stop treating those lines as input rows.
- **Preserve current import contract**: schema plus `Example Input:` should continue to parse exactly as before.
- **Do not broaden answer-checking yet**: this phase is about safe import, not about turning output examples into expected-result data.

### TDD sequence

1. [x] RED: a prompt with `Example Input:` followed by `Example Output:` pollutes imported table rows.
2. [x] GREEN: stop row parsing at `Example Output:` and ignore the output block safely.
3. [x] RED: the hardening could accidentally break schema-only or example-input-only imports.
4. [x] GREEN: preserve the existing import contracts in tests.

### Acceptance criteria

- [x] `Example Output:` blocks no longer create bogus imported rows.
- [x] Existing schema-only and example-input import paths continue to pass unchanged.
- [x] The parser contract remains narrow: `Example Output:` is ignored, not yet parsed into expected-result data.

### Out Of Scope For Phase 11

- Parsing output examples into answer-checking data before custom-import answer checking needs expected-result data
- Navigation or rail changes
- Blank-schema authoring

## Phase 12: Two-source rail navigation

**User stories**: PRD 10, 14, 15, 23, 24, 31, 35

**Status**: complete; superseded by Phase 15 for primary navigation

### What to build

Reshape the rail so the product reads as two source groups, not as a flat list of exercises plus tools.

Historical note: this phase improved the tracer-era rail, but later product review found that a permanent rail still made the app feel like a catalog. Phase 15 replaces this with a workspace-first source chooser.

- **Practice group**: keep a small curated seeded set visible.
- **Use your own schema group**: place `Custom Import` and `New schema` together as sibling entries.
- **Shared workspace shell**: keep the current query workspace and schema-context behavior, but make entry-path differences legible through grouping.

### TDD sequence

1. [x] RED: the rail currently presents seeded exercises and import tooling as one flat list.
2. [x] GREEN: group the rail into `Practice` and `Use your own schema`.
3. [x] RED: regrouping the rail could break seeded query-first behavior or hide Custom Import.
4. [x] GREEN: preserve seeded query-first flow and explicit Custom Import access in tests.

### Acceptance criteria

- [x] The rail exposes `Practice` and `Use your own schema` as the two top-level source groups.
- [x] Curated exercises remain easy to start from and continue to open query-first.
- [x] `Custom Import` and `New schema` appear as distinct sibling entries under `Use your own schema`.
- [x] The resulting navigation feels cleaner without making the rail feel smaller or secondary.

### Out Of Scope For Phase 12

- Changing the query workspace itself
- Blank-schema authoring controls
- Dialect UX
- AI help

## Phase 13: New schema MVP

**User stories**: PRD 3, 6, 10, 12, 13, 15, 17, 20, 27, 28, 30

**Status**: complete

### What to build

Add the `New schema` path under the bring-your-own-tables flow: start from nothing, design a simple schema, and query it immediately.

This phase should make authoring possible without turning the app into a spreadsheet:

- **New schema entry point**: add a distinct blank-schema entry under the bring-your-own-tables flow, beside `Custom Import`.
- **Table authoring**: support adding and removing tables from scratch.
- **Column authoring**: support adding and removing columns with editable names and types.
- **Generated rows only**: authored schemas should get deterministic generated sample rows through the existing mock-data path.
  The first version may produce type-correct but domain-generic values.
- **No row editing**: keep data-entry concerns out of the authoring surface.

### TDD sequence

1. [x] RED: there is no first-class way to begin with a blank schema.
2. [x] GREEN: add a `New schema` entry point that initializes an empty authoring session in Setup mode.
3. [x] RED: authored schemas cannot add or remove tables.
4. [x] GREEN: support add/remove table actions and keep the structured draft valid.
5. [x] RED: authored tables cannot add or remove columns from scratch.
6. [x] GREEN: support add/remove column actions with name/type editing.
7. [x] RED: authored schemas still require manual row entry before they can be queried.
8. [x] GREEN: run authored schemas through deterministic sample-row generation and the existing Query flow.

### Acceptance criteria

- [x] The app offers a visible blank-schema entry point.
- [x] Users can add and remove tables without pasting raw prompt text.
- [x] Users can add and remove columns and edit their names and types.
- [x] Authored schemas become runnable through generated sample rows.
- [x] The authoring surface remains schema-focused; manual row editing is still absent.

### Out Of Scope For Phase 13

- Explicit relationship declarations
- LLM-generated schemas
- LLM-generated sample rows
- Schema critique or tutoring
- Per-column semantic hint controls
- Spreadsheet-style row editing
- Rich ER diagrams or auto-layout visualizations

## Phase 14: Explicit relationships

**User stories**: PRD 6, 10, 29, 30

**Status**: complete

### What to build

Add simple relationship declaration on top of blank-schema authoring so joins become explicit, not only inferred.

- **Column-level references**: use metadata such as `references?: { table: string; column: string }`, not a separate top-level relationship graph.
- **Relationship UI**: allow users to declare simple `table.column -> table.column` references while editing a schema.
- **Reference visibility**: surface both quiet join hints and explicit reference labels in structured Setup and query-side schema context.
- **Generated-key alignment**: when a relationship is explicit, ensure referenced IDs exist in generated sample rows.

### TDD sequence

1. [x] RED: joins in authored schemas rely only on implicit `*_id` matching.
2. [x] GREEN: allow simple explicit relationship declarations on columns.
3. [x] RED: explicit relationships are not visible in the structured reference surfaces.
4. [x] GREEN: render both text hints and explicit reference labels where users inspect schema context.
5. [x] RED: explicit references do not affect generated sample rows at all.
6. [x] GREEN: ensure generated child IDs map to existing referenced parent IDs.

### Acceptance criteria

- [x] Users can declare simple explicit column references.
- [x] Authored schemas show both join hints and explicit relationship labels.
- [x] Generated sample rows respect explicit reference targets at the ID-existence level.
- [x] The relationship model stays simple and column-scoped.

### Out Of Scope For Phase 14

- Relationship type diagrams or auto-layout visualizations
- Composite keys
- FK-to-PK guessing across different names
- Rich distribution modeling

## Phase 15: Source chooser IA inversion

**User stories**: PRD 10, 14, 15, 23, 24, 31, 35

**Status**: complete; superseded by Phase 16 for first-run discoverability. The workspace-first inversion was correct, but hiding both intents behind a single `Change source` button meant new users never discovered `Use my own tables`. Phase 16 replaces the modal chooser with a landing screen.

### What to build

Invert the navigation so the SQL workspace is the permanent surface and source choice appears only when the user needs to change what they are working on.

Phase 12 created the right conceptual grouping, but the live UI still uses a permanent side rail. That keeps the product feeling like a catalog. This phase should remove the rail as the primary navigation surface:

- **Current source header**: show the loaded source in the workspace header, such as an exercise title, imported table summary, or new schema summary.
- **Change source overlay**: use a single `Change source` affordance that opens a centered chooser.
- **Two user intents**: chooser presents `Practice with sample data` and `Use my own tables`, not internal modes.
- **Own-table actions**: under `Use my own tables`, expose `Import prompt/schema` and `Create schema`.
- **Curated practice list**: show seeded exercises inside the chooser, not as an always-visible rail.
- **Future extension slot**: leave room for future Recent/Saved sections in the chooser layout, but do not implement persistence in this phase.
- **Safe custom reset**: avoid silently discarding pasted or authored schema content through the generic `Reset case` action.

### TDD sequence

1. [x] RED: the main app renders a permanent exercise/source rail beside the workspace.
2. [x] GREEN: replace the permanent rail with a workspace header that shows current source plus `Change source`.
3. [x] RED: a user cannot choose between `Practice with sample data` and `Use my own tables` from a single obvious source surface.
4. [x] GREEN: add a centered source chooser overlay with those two intent groups.
5. [x] RED: seeded exercises are unavailable without the old rail.
6. [x] GREEN: list curated practice exercises inside the chooser and preserve seeded query-first behavior.
7. [x] RED: import and blank-schema entry points still look like practice exercises or are buried in the chooser.
8. [x] GREEN: show `Import prompt/schema` and `Create schema` as distinct own-table actions and preserve setup-first behavior.
9. [x] RED: custom-flow reset can discard user-provided schema content with no warning.
10. [x] GREEN: rename or confirm destructive reset behavior for custom flows while keeping seeded reset lightweight.
11. [x] Browser smoke: first-load workspace reads as SQL workbench; `Change source` opens both intents; Custom Import remains setup-first; New Schema remains setup-first; seeded practice remains query-first.

### Acceptance criteria

- [x] The permanent side rail is gone from the normal workspace.
- [x] The workspace header clearly states the current source and offers `Change source`.
- [x] The chooser presents `Practice with sample data` and `Use my own tables` as the two source intents.
- [x] `Import prompt/schema` and `Create schema` are visually distinct from curated practice exercises.
- [x] Practice remains fast to start and does not require a separate landing page.
- [x] Custom Import and New Schema remain setup-first.
- [x] Seeded exercises remain query-first.
- [x] Reset behavior is safe for user-provided schema content.

### Out Of Scope For Phase 15

- New parser capabilities
- New schema-authoring field types
- Dialect execution changes
- Persistence or saved projects

## Phase 16: Home-screen chooser + IA cleanup

**User stories**: PRD 1, 10, 14, 15, 23, 24, 31, 35

**Status**: complete

### Why

Phase 15 made the workspace permanent and hid the source chooser behind a `Change source` button. UX review on 2026-05-14 found that this design fails first-run discoverability: users are dropped into a default seeded exercise, never realize the second intent (`Use my own tables`) exists, and "Change source" reads as a settings affordance rather than the primary product choice. The fix is to make the two intents the landing surface and reach the workspace by selection, not by default.

Phase 16 also cleans up leftover UX artifacts surfaced in the same review: dev-phase strings leaking into the workbench header, conditional copy that hides mode changes from the user, native `window.confirm` dialogs, and chrome that adds no value on the happy path.

### What to build

- **Home screen as landing surface**: first load renders a centered two-card chooser (`Practice with sample data`, `Use my own tables`) instead of dropping the user into a seeded exercise. It must not show the full seeded exercise catalog on first load. `Practice with sample data` starts a curated default; detailed exercise browsing is secondary and out of this slice.
- **Return to home**: the workspace header replaces the `Change source` button with a `← Home` (or equivalent) link that returns to the chooser without forcing a modal.
- **In-memory draft preservation**: returning Home preserves current Custom Import text and New Schema draft state in memory for the current session. Seeded practice returns Home immediately with no warning. Destructive reset remains separate.
- **Conditional Setup/Query tabs**: hide the Setup/Query mode switch for seeded practice, where Setup adds no value. Keep the switch for Custom Import and New Schema where setup is a real phase.
- **Remove leftover dev strings**: the workbench title `Phase 2: editable DoorDash query` and the `Casefile Desk` kicker should be removed or replaced with neutral copy.
- **Safer `Reveal solution`**: confirm before overwriting a non-empty editor query so users do not lose in-progress work on a misclick.
- **Inline reset confirmation**: replace `window.confirm` for destructive reset in custom flows with an inline confirmation pattern that does not jolt the user out of the app.
- **Quieter dataset status**: hide the `Runnable snapshot / Dataset is current and ready to query` card on the happy path; surface it only when there is something actionable to say (draft errors, generated rows, etc.).
- **Context-correct schema heading**: rename `Imported tables` in the structured preview so authored schemas no longer read as imported.
- **Apply-button disabled hint**: when `Apply schema` is disabled in authoring, surface a brief reason inline (e.g. `2 issues to fix`) so users do not click into silence.

### TDD sequence

1. [x] RED: first load drops the user directly into a seeded exercise with no visible entry choice.
2. [x] GREEN: first load renders a home-screen chooser with both intents visible; selecting an intent enters the workspace.
3. [x] RED: there is no way back to the home chooser without using the modal.
4. [x] GREEN: workspace header offers a `Home` link that returns to the chooser; remove the modal entry path.
5. [x] RED: returning Home discards in-progress import text or authored schema work.
6. [x] GREEN: preserve Custom Import and New Schema drafts in memory when returning Home; seeded practice returns Home immediately.
7. [x] RED: seeded practice still renders the Setup/Query mode switch even though Setup adds no value there.
8. [x] GREEN: gate the mode switch to flows where it is meaningful (Custom Import, New Schema).
9. [x] RED: the workbench header still reads `Phase 2: editable DoorDash query`.
10. [x] GREEN: replace dev-phase strings with neutral product copy.
11. [x] RED: `Reveal solution` overwrites a non-empty editor query with no confirmation.
12. [x] GREEN: confirm before destroying user-entered SQL.
13. [x] RED: destructive reset for custom flows uses a native browser `confirm()` dialog.
14. [x] GREEN: inline confirmation pattern replaces native dialogs.
15. [x] RED: the dataset status card is always visible even when it has nothing useful to say.
16. [x] GREEN: hide the card on the happy path; show it only when state is interesting.
17. [x] RED: the structured preview heading reads `Imported tables` for authored schemas.
18. [x] GREEN: heading reflects whether the schema was imported or authored.
19. [x] Browser smoke: first load shows the chooser; `Practice` enters a query-first workspace with no Setup tab; `Home` returns to the chooser; `Use my own tables → Import` enters Setup-first; `Use my own tables → Create` enters Setup-first.

### Acceptance criteria

- [x] First load shows a home chooser with both intents visible; the workspace is never the initial surface.
- [x] The home chooser does not show the full seeded exercise catalog.
- [x] Both intents (`Practice with sample data`, `Use my own tables`) reach their respective flows from the chooser without traversing a modal.
- [x] The workspace exposes a `Home` affordance that returns to the chooser.
- [x] Returning Home preserves Custom Import and New Schema drafts in memory for the current session.
- [x] Setup/Query mode switch is hidden where Setup has no purpose (seeded practice) and visible where Setup is a real phase (Custom Import, New Schema).
- [x] No dev-phase or internal-codename strings appear in user-facing copy.
- [x] `Reveal solution` confirms before overwriting non-empty queries.
- [x] Destructive reset for custom flows uses inline confirmation rather than `window.confirm`.
- [x] The dataset status card does not appear on the happy path and is reserved for actionable states.
- [x] Structured-preview heading reflects whether the schema was imported or authored.
- [x] Disabled `Apply schema` surfaces a short inline hint about what is blocking it.

### Out Of Scope For Phase 16

- New parser capabilities
- Dialect work (owned by Phase 17)
- Full exercise browser redesign
- Persistence, Recent/Saved sections, or saved projects
- Visual redesign beyond the IA changes listed above
- AI hints or tutoring

## Phase 17: Dialect-aware practice

**User stories**: PRD 1, 2, 3, 4, 8, 10, 17, 20, 22, 33, 34

**Status**: planned

### What to build

- **Default dialect metadata**: each exercise carries a default dialect, such as `Postgres`, `Snowflake`, or `Generic SQL`.
- **User override**: users may override the active dialect across seeded, imported, or authored flows when they intentionally want to practice another flavor.
- **Visible dialect chip**: show the active dialect near the problem brief and query workspace so users know what syntax expectations apply.
- **Dialect-aware guidance**: surface quiet hints or warnings when the chosen dialect and the underlying runtime are likely to diverge on common syntax.
- **Runtime simplicity**: keep DuckDB as the execution engine for now; do not introduce multiple SQL backends in this phase.

### TDD sequence

1. [ ] RED: exercises and sessions do not communicate which SQL dialect they represent.
2. [ ] GREEN: add default dialect metadata and render it in the UI.
3. [ ] RED: users cannot intentionally practice a different dialect without switching exercises or inputs.
4. [ ] GREEN: add a quiet dialect override control that works across seeded, import, and authoring flows.
5. [ ] RED: users can write dialect-specific syntax with no guidance when DuckDB is likely to disagree.
6. [ ] GREEN: surface narrow dialect-aware hints or warnings for the most common mismatches.
7. [ ] RED: dialect support is drifting toward a backend explosion rather than a practice aid.
8. [ ] GREEN: codify single-runtime behavior in tests and docs.

### Acceptance criteria

- [ ] Every exercise exposes a visible default dialect.
- [ ] Users can override the active dialect when they intentionally want a different practice flavor.
- [ ] The workspace can warn about common dialect/runtime mismatches without blocking query execution.
- [ ] The app remains DuckDB-backed in this phase.
- [ ] Dialect support improves learning context without turning the product into a configurable SQL IDE.

### Out Of Scope For Phase 17

- True multi-engine execution
- Query transpilation across dialects
- Full SQL linting or parser-level dialect validation
- AI tutoring or auto-rewriting syntax
