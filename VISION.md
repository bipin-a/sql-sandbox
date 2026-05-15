# SQL Playground Vision

## North Star

Turn an interview prompt, schema block, or blank scenario into a runnable SQL sandbox in under 30 seconds, with zero infrastructure setup.

The app has two source intents:

1. Practice with sample data
2. Use my own tables

The core practice loop is:

1. Choose a built-in exercise from the home chooser
2. Land directly in a query-first workspace with schema context visible
3. Use curated or generated sample data without manually entering rows
4. Iterate on the query without friction

And, for data-modeling practice:

1. Start from a blank schema
2. Add tables, columns, and relationships explicitly
3. Let the app generate sample rows for that authored schema
4. Query the result immediately

This product is not trying to be a full SQL trainer, a collaborative database tool, or a grading platform in v1. A small built-in exercise library is useful because it shortens time-to-practice, but broader library management is not the product. The home chooser is the first surface; the workspace is the main work surface after source selection. If a feature does not improve the schema-to-query loop, it is a candidate for deferral.
The app should feel like a guided sandbox, not a configurable tool.
The tool should feel invisible. Only the utility should be felt.

## Design Mantra

`QuestionModel` is the seam. Everything bends around it.

That principle drives three rules:

1. Pure modules where correctness matters; thin wrappers where libraries live.
2. One source of truth at a time.
3. Test where bugs hide, verify where bugs ship.

And one product rule:

4. The interface should do only what the user needs next, and nothing that makes them think about the tool itself.

## Product Principles

### Paste Once, Edit Structurally

Raw pasted text is an import affordance, not the permanent workspace.

After import, the structured question model becomes the source of truth for the session. The app should not maintain a live synchronization loop between raw text and the edited structured model in v1.

The editing experience should distinguish between:

- the current draft the user is editing
- the last valid applied dataset the SQL runtime is using

Invalid draft edits should remain local and visible, not corrupt the runnable dataset.

For built-in exercises, the raw source text should not be the default representation of the problem. Seeded practice should be structured-reference-first: problem statement, schema, relationships, and sample rows. Raw text belongs to import workflows, not the main seeded workspace.

For Custom Import, the parser should safely ignore `Example Output:` blocks until the product explicitly decides to use them. Output examples should not pollute imported table rows.

### Recovery Over Parser Perfection

The parser does not need to be perfect to make the product useful.

It does need to get the user close enough that the structured editor makes recovery fast and obvious. A parser failure is acceptable only if correction is painless.

The same rule applies to typed editing: invalid values should be recoverable inline, with clear feedback, without crashing the app or destroying the last valid dataset.

### Real SQL, Minimal Ceremony

Users should work against a real SQL engine with as little setup friction as possible. DuckDB-Wasm is the implementation choice because it supports that goal without introducing backend complexity.

### Dialect Matters, Runtime Stays Simple

SQL flavor differences are part of the learning experience, especially for interview prep. The product should make dialect visible and teach users where syntax expectations come from, but it should stay runtime-simple until true multi-engine execution clearly earns its cost.

### Generated Data Is A Fallback

Users should not have to manually enter row data just to make a schema runnable.

When a prompt includes curated sample rows, the app should preserve them. When a prompt only includes schema, the app should generate simple deterministic sample rows. The generated rows are not meant to be realistic production data. Their job is to make the schema executable and inspectable, with only narrow semantic inference and obvious shared `*_id` alignment where it helps joins work.

The UI should call this "generated sample data," not random data. Stable data makes query results repeatable and testable.

When a user authors a schema from scratch, the same rule applies: users author schemas, the app generates the rows.

### Setup And Query Are Different Modes

Setup is for import, schema correction, and sample-data inspection.

Query is for writing SQL and reading results. In Query mode, the workbench should visually dominate the page. Setup should remain one click away, but it should not permanently consume half the canvas once the dataset is ready.

For seeded exercises, the workspace should behave like practice, not a demo: the problem statement should stay visible, schema should default to read-only reference, and the canonical solution should stay hidden until the user asks for it.

While writing SQL, users should keep schema context visible without leaving the query workspace. Query should feel like the main canvas, but not a blind one.

Built-in exercises should open directly into the practice/query workspace, with schema context already visible there. Custom imports should continue to open in Setup mode by default.

Setup should not mean the same thing for every entry path:

- Seeded exercises: structured reference, not raw source text
- Custom import: raw import text plus structured preview
- Manual schema authoring: structured controls only, with no raw-text surface

Navigation should make those differences legible through a home chooser, not through a permanent side rail, hidden modal, or pile of unrelated entries:

- Practice with sample data
- Use my own tables

The first screen should show both intents side by side. It should not show the full exercise catalog. The user enters the workspace by choosing one of the intents, not by being dropped into a default exercise and not by scanning ten prompts first. Once inside the workspace, the header should show the current source, such as `First-Order Bad Experience`, `Imported tables: deliveries`, or `New schema`, and provide a simple `Home` affordance for returning to the chooser. `Use my own tables` should never feel like a secondary tool hidden below the catalog. Import and Create Schema should look like bring-your-own-tables actions, not like more practice cards.

### Narrow Scope Wins

V1 should stay intentionally small:

- no auth
- no backend
- no full grading or tutoring beyond lightweight seeded answer checks
- no persistence until it is clearly needed
- no user-authored problem library management
- no exercise-library growth as a product goal beyond a small curated set
- no configurable data-generator surface area
- no manual spreadsheet-style row editing
- no speculative features that do not improve the core loop

## System Spine

The product should remain legible as a small pipeline:

`ImportPanel -> SchemaParser -> QuestionModelNormalizer -> MockDataGenerator -> QuestionEditor -> SqlGenerator -> DuckDBRunner -> ResultPanel`

The query path sits beside that pipeline:

`QueryEditor -> DuckDBRunner -> ResultPanel`

Source choice sits before the pipeline, not inside it:

`HomeChooser -> current source -> Setup or Query workspace`

Responsibilities:

- `SchemaParser` imports pasted prompt text into a draft model
- `HomeChooser` presents the two source intents before the workspace opens
- `QuestionModelNormalizer` enforces runtime invariants
- `MockDataGenerator` fills schema-only imports with deterministic read-only rows
- `QuestionEditor` lets the user correct imported schemas directly
- `SqlGenerator` turns the edited model into executable SQL
- `DuckDBRunner` loads and queries DuckDB-Wasm
- `QueryEditor` is the SQL-writing surface
- `ResultPanel` shows results or execution errors clearly

## What Good V1 Looks Like

A good v1 lets a user:

1. Load a built-in exercise and start querying immediately
2. Paste a messy interview prompt or schema-only table definition
3. Import it into a structured preview
4. Get generated sample data when the prompt has schema but no rows
5. Fix parser mistakes without going back to raw text
6. See local validation when a draft edit is invalid
7. Keep using the last valid dataset until the draft is fixed
8. Switch to a query-focused workspace with enough room to work
9. Run SQL successfully and iterate quickly
10. Understand which SQL dialect an exercise or imported prompt expects
11. Create a small schema from scratch and query it without leaving the app

If the app still feels slower or more fragile than manually setting up a local database, v1 is not good enough.

## Strengths of the Current Plan

- The architecture has a real seam in `QuestionModel`
- The runtime was proven early in the real browser
- Scope has stayed small and explicit
- The editor and query loop are already working
- The structured-preview direction reduces reliance on a perfect parser
- The home chooser gives immediate practice options without turning v1 into a library product

## Current Risks

### Parser Variability

Interview prompts are inconsistent. Markdown tables, plain text alignment, null markers, timestamp formats, and row formatting will vary more than the current seed problem suggests.

### Generated Data Scope

Generated sample data can become a hidden data-modeling project if v1 tries to infer rich foreign-key graphs, distributions, or realistic business semantics. The first version should stay narrow, deterministic, and visibly synthetic, with only obvious shared `*_id` alignment and quiet join hints.

### Structured Editor Scope Creep

The editable preview must remain a correction surface, not grow into a full spreadsheet or admin tool.

### Runtime Normalization Boundaries

`QuestionModelNormalizer` must stay narrow and well-defined. It should enforce invariants between imported or edited data and runtime execution, not become a second parser or a hidden editor.

### Draft vs Applied State

If draft edits and the runnable dataset are conflated, every editing feature becomes brittle. The product needs an explicit notion of "draft has errors" versus "applied dataset is safe to run."

### Browser-Only Runtime Verification

The current runner is verified in the real browser, not through a Node-side harness. That is correct for now, but browser automation coverage should be added once the import and editing flow stabilizes.

### No Persistence Yet

Ephemeral state is acceptable while the workflow is being proven, but it will likely become one of the first real user pain points once the import/edit/query flow is useful.

## Phase Guidance

### Phase 1

Prove the runtime spine in the real browser with a hardcoded model.

Status: complete.

### Phase 2

Prove the editable SQL loop on top of the hardcoded model.

Status: largely complete.

### Phase 3a

Add import plus read-only structured preview.

Success means imported prompts become a visible, inspectable model.

### Phase 3b

Make the structured preview editable and use it as the session source of truth.

Success means the user can recover from parser mistakes without reimporting raw text.

### Phase 4

Add Setup/Query workspace modes and deterministic generated sample data for schema-only imports.

Success means the user can paste only a schema, inspect generated rows, and then work primarily in a larger SQL query surface.

## Decision Filters

When choosing between options, prefer the one that:

1. Shortens the paste-to-query loop
2. Keeps `QuestionModel` as the clean seam
3. Reduces hidden state or dual sources of truth
4. Improves recovery from imperfect imports
5. Preserves a small, testable v1
6. Keeps generated data simple, deterministic, and honest

Reject or defer work that mainly adds breadth instead of improving the core loop.
