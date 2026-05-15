# SQL Playground — PRD

## Problem Statement

I want to practice SQL interview questions from sites like DataLemur and LeetCode against a real SQL engine without setting up Postgres locally, creating tables by hand, or fighting a heavyweight workflow. Most problems include at least table schemas, and many include sample rows and a target question. The missing piece is a fast environment where I can load that content and immediately start querying it.

I want a personal web app that makes the schema-to-query loop extremely short. I should be able to load a question's tables, inspect either curated or generated sample data, write SQL, run it, and iterate in seconds.

I also want a second path for learning data modeling: starting from a blank scenario, creating my own tables and relationships, letting the app generate sample rows, and then querying that schema without switching tools.

## Solution

Build a static, local-first web app that:

1. Greets me with a home screen that presents two clear ways to choose a source side by side — practice with sample data, or use my own tables — so I never have to discover the second option behind a button.
2. Lets me paste DataLemur-style table definitions, with or without sample rows, for one or more tables.
3. Parses that input into a structured draft model.
4. Generates deterministic read-only sample data when the prompt has schema but no rows.
5. Presents that draft as a schema editor plus read-only mock data preview.
6. Validates edits locally and keeps the last valid applied dataset separate from the current draft when needed.
7. Loads the last valid applied tables into an in-browser DuckDB instance.
8. Gives me a SQL editor and a Run action.
9. Shows the query result table or execution error immediately.
10. Ships with a small built-in exercise library so I can start practicing immediately and switch among multiple prompts without re-pasting everything.
11. Provides a Setup mode for schema/import work and a Query mode where the SQL workbench takes most of the screen.
12. Provides a blank-schema authoring path where I can create tables, columns, and simple relationships without first pasting a fake prompt.
13. Keeps built-in exercise Setup views structured-first, without showing raw import-style text by default.
14. Supports result-based answer checking for seeded exercises.
15. Makes SQL dialect visible and lets users override the active dialect when they want to practice a different flavor.

No backend. No accounts. No heavyweight IDE complexity.

The goal of v1 is not to be a full SQL trainer. The goal is to be the fastest possible way to turn an interview prompt, schema block, or blank schema idea into a runnable SQL sandbox that feels invisible while you use it.

## User Stories

1. As a SQL interview candidate, I want to paste a question's table definitions and example rows into the app, so that I can start practicing without writing `CREATE TABLE` statements myself.
2. As a SQL interview candidate, I want to load multiple related tables in one session, so that I can practice joins and subqueries against realistic prompts.
3. As a SQL interview candidate, I want the app to understand common interview data types like integer, string, float, boolean, and timestamp, so that my queries behave as expected.
4. As a SQL interview candidate, I want dashes and blank values in example rows to be treated consistently as null when appropriate, so that pasted sample data loads correctly.
5. As a SQL interview candidate, I want to paste schema-only table definitions when a prompt does not include example rows, so that the app can still create a runnable practice dataset.
6. As a SQL interview candidate, I want generated sample data to be deterministic and visibly labeled, so that query results are stable and I understand when data is synthetic.
7. As a SQL interview candidate, I want built-in exercises to keep their curated rows, so that canonical examples like the DoorDash `75.00` result remain meaningful.
8. As a SQL interview candidate, I want to inspect a structured preview of the parsed tables before running queries, so that I can catch parser mistakes early.
9. As a SQL interview candidate, I want to edit table names, column names, and declared types after import, so that I can fix schema mistakes without going back to raw text.
10. As a SQL interview candidate, I want to inspect the loaded mock rows for each table, so that I can reason about the data while writing SQL without manually editing the example data.
11. As a SQL interview candidate, I want the pasted text to matter only at import time, so that once I am editing the structured preview I am not fighting a second source of truth.
12. As a SQL interview candidate, I want invalid schema edits to stay local to the draft and show inline validation, so that one bad change does not poison the runnable dataset.
13. As a SQL interview candidate, I want the app to preserve the last valid applied dataset until I fix invalid schema edits, so that I do not lose a working sandbox while correcting imported data.
14. As a SQL interview candidate, I want a Setup mode focused on prompt, schema, and sample data review, so that import and correction have enough room.
15. As a SQL interview candidate, I want a Query mode where the SQL editor and result panel take most of the screen, so that the app feels like a real workbench while practicing.
16. As a SQL interview candidate, I want a SQL editor with syntax highlighting, so that writing queries feels like a real development environment.
17. As a SQL interview candidate, I want to run my query with a button and a keyboard shortcut, so that I can iterate quickly.
18. As a SQL interview candidate, I want query results to render as a table, so that I can compare my output to the prompt visually.
19. As a SQL interview candidate, I want SQL errors to display clearly in the UI, so that I can fix broken queries without guessing what happened.
20. As a SQL interview candidate, I want to rerun edited queries against the same temporary dataset, so that I can iterate without reimporting the question.
21. As a SQL interview candidate, I want to reset the current session and start a new question easily, so that old tables do not leak into later practice.
22. As a SQL interview candidate, I want the app to work entirely in the browser, so that I can use it without deploying or maintaining a backend.
23. As a SQL interview candidate, I want several built-in exercises available from the first-load home chooser, so that I can practice different SQL patterns without collecting prompts myself.
24. As a SQL interview candidate, I want to switch between built-in exercises quickly, so that I can move between drills without rebuilding the sandbox from scratch.
25. As a future maintainer, I want parsing, mock data generation, model normalization, structured editing, seeded exercise metadata, and query execution to live in separate modules, so that the app stays testable and the UI stays thin.
26. As a future maintainer, I want the parser and SQL runtime wrappers to expose stable interfaces, so that the implementation can evolve without rewriting the whole app.
27. As a student learning SQL and data modeling, I want to start from a blank schema, so that I can design tables instead of only consuming existing prompts.
28. As a student learning SQL and data modeling, I want to add tables and columns without pasting raw prompt text, so that the app supports authoring as well as import.
29. As a student learning SQL and data modeling, I want to declare simple relationships explicitly, so that joins are intentional and not only inferred from column names.
30. As a student learning SQL and data modeling, I want generated sample rows to appear for authored schemas too, so that I can query what I just designed without entering row data by hand.
31. As a SQL learner using a built-in exercise, I want Setup to show the schema and rows directly instead of raw import-style text, so that the app feels like practice and not parser debug UI.
32. As a SQL learner using a built-in exercise, I want to check whether my result matches the expected answer, so that I can practice without manually comparing rows.
33. As a SQL learner, I want to see which SQL dialect an exercise is using, so that I can practice the right syntax expectations.
34. As a SQL learner, I want to override the dialect when I choose to practice a different flavor of SQL, so that the product can act like a lab instead of a fixed worksheet.
35. As a user, I want a clear distinction between practicing with sample data and using my own tables, so that I am not deciding which hidden mode the product is in.

## Implementation Decisions

**Stack**

- Vite + React + TypeScript
- DuckDB-Wasm for in-browser SQL execution
- Monaco Editor for SQL editing

**Product constraints**

- The app is single-user and local-first.
- Sessions are ephemeral in v1. Reloading the page may reset the problem and query state.
- The app is optimized for small interview-style datasets, not large CSV imports or analytics workloads.
- The app supports writing and running SQL, plus result-based answer checking for seeded exercises. It does not need full tutoring or grading in v1.
- The built-in exercise library is intentionally small in v1: roughly 4-8 curated prompts under `Practice with sample data`. Growth in exercise count is not a product goal.
- The first authoring flow should stay schema-first and row-free: users author tables and relationships, and the app generates sample rows.
- The product should prefer invisible utility over visible configuration. Every control needs to earn its place in the workflow.

**Modules**

- **SchemaParser**
  - Pure module.
  - Input: pasted DataLemur-style text describing one or more tables, with or without example rows.
  - Output: structured draft model such as `{ tables: [{ name, columns, rows }] }`.
  - Responsibilities:
    - detect table names
    - parse column names and declared types
    - parse example rows
    - ignore `Example Output:` blocks rather than treating them as additional input rows
    - normalize blanks and placeholder values to null when appropriate
    - emit parse warnings or errors when input is ambiguous or malformed
  - The parser is a one-shot import step, not the primary editing surface.

- **MockDataGenerator**
  - Pure module.
  - Input: a normalized table schema with missing or empty rows.
  - Output: deterministic read-only sample rows for that schema.
  - Responsibilities:
    - generate a small fixed number of rows, defaulting to 12
    - produce type-correct values for integer, string, float, boolean, and timestamp columns
    - apply light per-column heuristics such as `*_id`, `status`, date/timestamp names, amounts, and names
    - keep identical shared `*_id` columns aligned when that relationship is explicit or obvious
    - label generated rows distinctly from curated or imported rows in the UI
    - avoid composite-key inference, FK-to-PK guessing across different names, and realistic business distributions in v1

- **QuestionModelNormalizer**
  - Pure module.
  - Input: raw parsed table structures from `SchemaParser`.
  - Output: normalized internal model with stable typing and row shapes.
  - Responsibilities:
    - preserve column order
    - validate row width against schema
    - normalize supported types to a small internal enum
    - prepare values for downstream SQL loading
    - refuse or isolate invalid values rather than silently coercing them into broken runtime state

- **QuestionEditor**
  - Structured UI module.
  - Input: parsed or normalized question model plus editable draft state.
  - Output: user edits expressed as draft updates and validation state.
  - Responsibilities:
    - render schema fields as editable controls while keeping sample rows read-only
    - support renaming tables and columns
    - support changing declared column types
    - support adding and removing tables
    - support adding and removing columns
    - support declaring simple relationships for authored schemas
    - keep mock sample rows visible for inspection, but not directly editable
    - keep the structured draft, not the raw pasted text, as the source of truth after import
    - surface schema-level validation errors without poisoning the last valid applied dataset

- **Relationship metadata**
  - The first authoring flow should model explicit relationships at the column level.
  - Proposed shape: `references?: { table: string; column: string }` on a column definition.
  - Responsibilities:
    - express simple foreign-key intent without introducing a second top-level relationship graph
    - integrate with existing join-hint UI and generated-query context
    - remain optional for imported prompts that do not declare relationships explicitly

- **DuckDBRunner**
  - Thin async wrapper around DuckDB-Wasm.
  - Interface:
    - `init()`
    - `reset()`
    - `loadTables(questionModel)`
    - `runQuery(sql)`
    - `compareResults(userQuery, expectedQuery)` or equivalent result-comparison path for seeded answer checks
  - Responsibilities:
    - database lifecycle
    - table creation
    - row loading
    - query execution
    - result shaping for UI display
    - stable result comparison for seeded answer checking

- **SessionState**
  - Application-state module.
  - Responsibilities:
    - current source: selected practice exercise, imported tables, or authored schema
    - selected dialect and any user override
    - current workspace mode: Setup or Query
    - current import text while the user is importing a prompt
    - current parsed draft model
    - current editable draft values and validation state
    - current last valid applied question model
    - current SQL text
    - last query result or error
    - reset behavior

- **UI components**
  - `HomeChooser`: home-screen landing surface that presents `Practice with sample data` and `Use my own tables` as the app's first view. Replaces the Phase 15 `SourceChooser` overlay.
  - `ExerciseLibrary`: curated practice entries shown inside the home chooser, not as a permanent rail
  - `SchemaAuthoringEntry`: blank-schema entry point for starting from scratch under `Use my own tables`
  - `HomeLink`: persistent affordance in the workspace header that returns to the home chooser
  - `ImportPanel`: paste raw question text once and trigger import
  - `QuestionEditor`: editable structured table/schema view
  - `QueryEditor`: Monaco-based SQL editor
  - `ResultPanel`: result table or error output
  - `Toolbar`: home, run, and reset actions
  - `WorkspaceModeSwitch`: plain segmented control for switching between Setup and Query modes

**Architectural decisions**

- Parsing and SQL execution logic must not live inside React components.
- DuckDB-Wasm should be wrapped behind a stable interface so it remains an implementation detail.
- The parser should target the common DataLemur-style format first rather than trying to support arbitrary pasted text on day one. The parser powers the import path only; blank-schema authoring is a separate entry point and does not depend on parsing.
- After import, the structured draft becomes the editing surface, but the runnable dataset should remain the last valid applied model until draft validation passes again.
- Sample rows should be treated as read-only mock data in v1. Users can inspect them, and schema changes may revalidate those rows, but users should not manually edit cell values or add/remove rows.
- When a prompt has schema but no sample rows, the app should generate deterministic sample rows rather than forcing the user to enter table data manually.
- The app's first surface is a home chooser, not the workspace. Phase 15 made the workspace permanent and reached the chooser through a `Change source` modal, but UX review found that hiding both intents behind one button kept new users from discovering `Use my own tables`. The home chooser fixes that by making the primary product choice the first thing users see.
- The workspace is reached by selecting an intent and is the dominant surface once active. A persistent `Home` link in the workspace header returns to the chooser without using a modal.
- The home chooser expresses two user intents: `Practice with sample data` and `Use my own tables`. The first screen should not render the full exercise catalog. `Practice with sample data` starts a curated default, while deeper exercise browsing can remain secondary. `Import prompt/schema` and `Create schema` are sibling actions under the second intent.
- Both intents must be equally visible on the chooser. Neither is allowed to become the silent default by being entered on first load.
- `Import prompt/schema` and `Create schema` should be visually distinct from curated practice exercises. They are source actions, not practice cards.
- A blank-schema authoring flow should exist under `Use my own tables`. Users should be able to create tables, columns, and simple relationships from scratch without first fabricating import text.
- Seeded exercises should not show raw import-style schema text by default. Their Setup view should be structured-reference-first: prompt, schema, relationships, and sample rows. Raw text should remain primary only for the Custom Import path.
- Built-in exercises should open in the practice/query workspace by default, with schema context visible there. Setup remains available for structured reference, but it is not the default canvas for seeded practice. Custom import and blank-schema authoring should open in Setup because the dataset is still being prepared.
- Built-in exercises should keep curated rows when available; generated sample data is a fallback for schema-only imports, not a replacement for known good example data.
- Authored schemas should also rely on generated sample rows. The authoring surface is for schema design, not manual row entry.
- Generated sample data should be intentionally simple and per-column in v1. Cross-table foreign-key alignment, composite-key inference, and relationship-aware generation are out of scope until real usage proves the need. For authored schemas, that means sample values may be type-correct but domain-generic.
- Exercises should carry a default dialect, and users may override that dialect across seeded, imported, or authored flows when they intentionally want to practice another flavor.
- Dialect visibility is in scope; true engine fragmentation is not. The runtime can stay simple while the UX makes dialect expectations explicit.
- Parse warnings should be surfaced at import time so the user can repair bad input early, and then be complemented by structured editor validations once the model is editable.
- Query execution should remain explicit through `Run`. Dataset edits may update the last valid applied model, but they should not silently rerun the query on every keystroke.
- Destructive actions that would discard user work should confirm inline within the workspace. This includes replacing a non-empty query with `Reveal solution` and resetting custom/imported authoring work.
- Built-in exercises should live in source as static metadata and load instantly without reparsing external content.
- The app should use a single-screen layout with a home-chooser landing surface and a workspace that the user enters by selecting an intent. The Setup/Query mode switch should appear only where Setup is a meaningful phase (Custom Import, New Schema) and stay hidden for seeded practice where Setup adds no value. No routing-heavy workflows and no permanent exercise rail.
- Blank-schema authoring should default to Setup mode because the user is defining the dataset before querying it.

## Testing Decisions

A good test for this project validates observable behavior through stable module interfaces rather than testing implementation details.

The highest-value automated tests are:

- **SchemaParser**
  - parses a realistic multi-table interview prompt
  - parses schema-only table definitions without requiring example rows
  - handles blank values and dashes as null
  - rejects malformed row counts with useful diagnostics
  - preserves table and column ordering

- **MockDataGenerator**
  - generates deterministic row values from a schema-only model
  - emits type-correct values for all supported scalar types
  - keeps output stable between test runs
  - only aligns identical shared `*_id` columns where the relationship is explicit or obvious

- **QuestionModelNormalizer**
  - validates row width against schema
  - normalizes supported scalar types consistently
  - produces stable value representations for the SQL loader

- **QuestionEditor**
  - applies table, column, and type edits to the structured model
  - preserves invariants through draft validation rather than by reparsing raw text
  - isolates invalid draft edits from the last valid applied dataset
  - rebuilds the executed dataset from the applied model, not from stale import text or invalid draft state

- **DuckDBRunner**
  - is validated in the browser in Phase 1 rather than through a Node-only harness
  - should gain automated integration coverage later only if browser validation exposes runner-specific defects

- **Critical UI flow**
  - load a built-in exercise
  - switch to a second built-in exercise
  - run a query
  - see results
  - see an error for invalid SQL
  - confirm seeded Setup hides raw import-style text
  - confirm Custom Import still shows the raw import surface
  - confirm `Example Output:` blocks in Custom Import do not pollute imported table rows
  - confirm `Check my answer` reports match, mismatch, or query-error-prevented-checking

There is no prior art in the repo, so test boundaries should reinforce the intended module split from the start.

## Out of Scope

- Arbitrary expected-output parsing from prompt text
- Tutoring, grading, or explanatory answer feedback beyond seeded result-set comparison
- Parsing `Example Output:` into reusable expected-result data for custom imports before custom-import answer checking needs expected-result data
- User-authored saved problem libraries
- Draft query persistence
- Round-tripping edited structured data back into raw import text
- Manual row/cell data editing
- Automatic relationship inference or rich relationship-aware generated data beyond explicit references and obvious shared `*_id` alignment
- User accounts or sync
- Sharing or importing problems by URL
- Large file ingestion
- Mobile-first UX
- True multi-engine SQL execution
- LLM-generated schemas
- AI hints, schema critique, solution generation, or grading

## Further Notes

- The built-in exercise library should include the DoorDash bad-experience example plus a few additional curated prompts that cover filtering, aggregation, joins, and ranking.
- Schema-only imports should still become runnable by generating clearly labeled deterministic sample data.
- Blank authored schemas should become runnable through the same generated-row path, without exposing manual row editing.
- Built-in exercise Setup should prioritize structured schema context over raw source text. If source visibility is needed later, it should be an optional disclosure rather than the default surface.
- `Check my answer` should stay result-based and lightweight. It should confirm match, mismatch, or query-error-prevented-checking, without trying to become a full tutor.
- Dialect overrides should make the app feel like an SQL practice lab, but the UI should still stay quiet. The override is available when wanted, not something the user must constantly think about.
- Parser reliability is still the biggest import-time risk, but the editable structured preview deliberately reduces the cost of imperfect parsing by letting the user correct the imported model directly.
- Invalid draft edits must never crash the app or generate invalid schema SQL. Recovery UX matters more than broad edit surface area.
- The table editor should feel like schema correction and authoring, not spreadsheet authoring. Mock rows are reference material, not a manual data-entry surface.
- The Query workspace should visually dominate when the user is practicing. Setup can remain one click away through a mode switch, but the SQL editor should not be trapped in a cramped split once the dataset is ready.
- DuckDB-Wasm bundle size is acceptable for a personal tool, especially if loaded lazily.
- Phase 1 integration truth lives in the shipped browser runtime, not in a separate Node-specific DuckDB-Wasm test harness.
- Once the core paste-to-query loop is stable, the next most defensible additions are lightweight persistence and tighter dialect/runtime honesty. They should not be built before the base workflow feels solid.
