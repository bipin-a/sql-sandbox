# Product and Code Review: 2026-05-14

## Scope

Reviewed the most recent app state as a product manager and code reviewer, with emphasis on:

- Whether the app feels obvious without explanation.
- Whether Custom Import and New Schema match the new two-flow product direction.
- Whether the code reflects the roadmap in `PRD.md`, `VISION.md`, and `plans/sql-playground.md`.
- Whether recent parser, runner, schema-authoring, and UI changes introduce bugs or friction.

## Verification

Passed:

- `npm test -- --run`
- `npm run build`
- `npm run test:e2e`

Manual UI walkthrough:

- Opened the app at `http://localhost:5173/`.
- Checked seeded practice startup.
- Opened Custom Import.
- Imported a prompt containing `Example Input:` plus `Example Output:`.
- Confirmed `Example Output:` rows are ignored by the parser.
- Opened New Schema.
- Added a table, applied schema, and inspected Query mode.
- Checked narrow/mobile-width behavior.

## Executive Summary

The recent technical direction is good: the app now has the right underlying primitives for raw prompt import, draft validation, applied datasets, editable structured data, generated sample rows, and a real browser smoke path.

The main remaining problem is product shape. The UI says there are two flows, but visually it still behaves like an exercise catalog with Custom Import and New Schema attached underneath. That contradicts the current product direction: users should immediately understand whether they want to practice with sample data or use their own tables.

The code mostly supports the plan, but the UI composition and state ownership are becoming too concentrated in `App.tsx`. At review time, `src/ui/App.tsx` is 1532 lines and owns most of the product. That is already causing visible inconsistencies, especially around New Schema setup versus Query mode.

## Product Issues

### P1: Custom Import and New Schema Are Physically Buried

The left rail groups `Practice` above `Use your own schema`, but the Practice section contains enough large cards that Custom Import and New Schema are below the fold on desktop and far down the page on narrow screens.

This is the biggest product mismatch right now. The product direction is two source intents:

- Practice with sample data.
- Use my own tables.

The current UI still communicates:

- Pick from a catalog.
- If you keep scrolling, there are utility tools.

Recommended fix:

- Remove the permanent side rail and the hidden `Change source` modal as primary navigation surfaces.
- Make the first screen a home chooser with `Practice with sample data` and `Use my own tables`.
- Enter the workspace only after the user chooses an intent.
- Put a simple `Home` affordance in the workspace header for returning to that chooser.
- Under `Use my own tables`, expose `Import prompt/schema` and `Create schema` immediately.
- Keep seeded exercises inside the home chooser, not as the dominant always-visible surface.

### P1: The Visual Hierarchy Still Communicates Catalog First

Even after grouping, Custom Import and New Schema use the same card treatment as seeded exercises. They appear as more items in the same rail pattern rather than as a separate source flow.

This is a visual-contract issue, not just a layout issue. A user should be able to distinguish "practice problem" from "bring my own schema" without reading every card.

Recommended fix:

- Use a home chooser, not another rail treatment or hidden modal.
- Make `Import prompt/schema` and `Create schema` action-like entries under `Use my own tables`.
- Use distinct iconography, chip color, or card density so own-table actions do not look like seeded exercises.

### P2: Seeded Exercise Count Conflicts With The Product Direction

The app currently shows a large seeded list, and `src/seed/exercises.test.ts` enforces minimum counts like `>= 8` seeded exercises.

That pushes the app toward a catalog product, but the docs now say the catalog should stay small and curated. The product is the practice loop, not a library.

Recommended fix:

- Change the test from "at least many exercises" to "small curated set exists."
- Prefer a range like `4-8` seeded exercises.
- Test diversity of exercise content rather than raw count.

### P1: New Schema Setup Does Not Show Generated Rows After Apply

In New Schema, applying an empty authored schema generates sample rows for Query mode, but the Setup preview still shows no rows. The generated rows exist on the applied model, while the setup preview still renders the draft model.

This makes Apply feel weak or broken because the user does not see what dataset they just created.

Recommended fix:

- After Apply, either update the draft preview with generated rows or show an explicit applied snapshot preview.
- Prefer an `Apply and query` CTA that transitions to Query mode and shows the generated sample data.

### P2: New Schema Still Uses Import-Centric Copy

The New Schema screen says `Imported tables`.

That copy is wrong for manual schema authoring. It exposes internal history from the import flow and makes the app feel tool-like.

Recommended fix:

- Use `Schema`, `Tables`, or `Draft schema`.
- Reserve `Imported` language for Custom Import only.

### P2: Custom Import Query Mode Has Stale Prompt Copy

After a Custom Import succeeds, Query mode still shows copy like `Paste a DataLemur-style prompt...`, and the SQL editor starts with a placeholder comment telling the user to import a prompt.

That is confusing because the user already imported the prompt.

Recommended fix:

- After import, show a dataset summary instead of the import instructions.
- Start the SQL editor empty or with a useful starter query like `SELECT * FROM deliveries LIMIT 20;`.

### P2: Relationship Controls Appear Too Early

In New Schema, every column shows a relationship dropdown even when there are no valid reference targets.

This adds configuration weight before the user has done anything that requires relationships.

Recommended fix:

- Hide relationship controls until there are at least two tables or at least one valid reference target.
- Consider an explicit `Add relationship` action instead of a dropdown on every column.

### P2: Apply Schema Does Not Clearly Advance The User

After clicking Apply Schema, the app remains in Setup mode. There is no strong confirmation and no automatic transition to querying.

Recommended fix:

- Rename the primary CTA to `Apply and query`.
- On success, switch to Query mode.
- If staying in Setup, show a clear applied-state confirmation and generated-row preview.

### P2: Reset Case Is Destructive In Custom Flows

`Reset case` has the same treatment across seeded exercises, Custom Import, and New Schema. In seeded exercises, reset is low-risk. In Custom Import or New Schema, reset can silently discard a pasted prompt or authored schema.

Recommended fix:

- Rename the action in custom flows to the specific consequence, such as `Clear import` or `Reset schema`.
- Add confirmation before discarding user-provided schema content.
- Keep seeded exercise reset lightweight.

### P3: Some Labels Are Still Jargony

`Runnable snapshot` is accurate internally but not product-obvious.

Recommended fix:

- Replace with `Ready to query`, `Dataset ready`, or similar user-facing language.

### P3: Narrow Layout Makes The Main Flow Hard To Reach

At mobile or narrow desktop widths, the rail stacks before the workspace, so the user must scroll through the entire navigation before reaching the active work area.

Mobile-first is not required by the PRD, but narrow windows should not make the core task feel buried.

Recommended fix:

- On narrow widths, put the active workspace first and collapse navigation behind a compact selector.

## Code Quality Issues

### P1: `App.tsx` Is Carrying Too Many Responsibilities

`src/ui/App.tsx` is 1532 lines and currently owns:

- Studio shell.
- Exercise rail.
- Import flow.
- New Schema authoring.
- Draft validation.
- Applied dataset state.
- Query workspace.
- Result rendering.

This does not match the intended module seams in the plan and makes product bugs easier to introduce.

Recommended fix:

- Remove the permanent rail and extract the replacement `HomeChooser`.
- Extract `QuestionEditor` or `SchemaEditor`.
- Extract `useQuestionDraft` for draft, validation, pending changes, and apply behavior.
- Keep `SqlWorkbench` focused on editor, run, results, and answer checking.

### P1: Draft And Applied State Are Inconsistent For Generated Rows

`handleApplySchema()` applies `ensureQuestionSampleRows()` to the applied question, but the setup preview renders the draft question. That is why generated rows are visible in Query mode but not Setup mode.

Recommended fix:

- Decide which model represents the visible post-apply state.
- Keep setup and query views rendering from the same applied snapshot after successful apply.

### P2: State Updates Have Side Effects Inside A React Updater

`syncDraft()` calls validation and other state setters inside a `setDraftQuestion()` updater.

That is fragile because updater functions can be invoked more than once under React development behavior, and it makes state transitions harder to reason about.

Recommended fix:

- Compute the next draft and validation result outside the updater where possible.
- Or move draft editing into a reducer so each transition is explicit.

### P2: Some Validation Errors Are Hidden

`evaluateDraftQuestion()` can emit a table-level "at least one column" error, but the UI does not visibly render that table-level key. A user can remove the only column and see Apply disabled without a clear local explanation.

Recommended fix:

- Render table-level validation messages near the table header.

### P2: Numeric Validation Is Too Permissive

Edited float values are coerced with `Number.parseFloat()`. Inputs like `12abc` can be accepted as `12`.

Recommended fix:

- Use `Number(value)` or a stricter numeric parser.
- Keep invalid numeric drafts local until fixed.

### P3: Parser `Example Output` Handling Has A Small Edge Case

The parser now correctly ignores `Example Output:` for normal DataLemur-style prompts. The current implementation searches for the output header from the table start, not from after `Example Input:`.

That is fine for expected prompt shapes, but a malformed prompt with an output header before input could create confusing behavior.

Recommended fix:

- Search for `Example Output:` only after the matched `Example Input:` block.

### P3: Practice Filtering Is Mode-Negative

The rail uses `mode !== "custom"` to build practice exercises. That could accidentally include future utility modes.

Recommended fix:

- Filter practice exercises explicitly, such as `!exercise.mode` or `exercise.mode === "practice"`.

## Plan Alignment

Aligned:

- Custom Import is structured-first and no longer treats `Example Output:` as input rows.
- Parser warnings and draft validation are visible enough for the current import flow.
- Editing structured data can become the source of truth.
- New Schema exists as a setup-first flow.
- Generated rows exist for authored schemas.
- The browser smoke path is valuable and already caught a real `CREATE TABLE` reapply issue.

Not yet aligned:

- The visual IA does not yet express the two-flow product model.
- The seeded exercise list is too dominant.
- New Schema still has import-flavored wording.
- Generated sample rows are not visible in Setup after apply.
- `App.tsx` does not reflect the planned architecture seams.

## Recommended Next Work

1. Fix the information architecture first.

   Replace the hidden `Change source` modal with a home chooser. The first screen should teach the two intents, and the workspace should only appear after the user chooses `Practice with sample data` or `Use my own tables`.

2. Clean up New Schema copy and apply behavior.

   Rename import-flavored labels, hide premature relationship controls, and make `Apply and query` the obvious next step.

3. Refactor the highest-risk `App.tsx` seams.

   Pull out the rail and draft/apply state before adding more validation logic. The current monolith is already creating cross-mode inconsistencies.

4. Tighten validation bugs.

   Fix numeric parsing and render table-level validation errors.

5. Continue parser and dialect work after the product shell is clear.

   More parsing polish matters, but it should not outrank the app being obvious on first open.

## Bottom Line

The implementation progress is real and directionally correct. The app has the right technical foundation now. This gap was addressed by Phase 16, which replaced the hidden `Change source` flow with a first-load home chooser and aligned the shell with the product definition.

## Addendum: UX walkthrough after Phase 15

Phase 15 shipped the workspace-first inversion and the `Change source` modal. A second walkthrough as a first-time user surfaced a more fundamental issue and several smaller ones. Addressed in `plans/sql-playground.md` Phase 16.

### Primary finding: hidden first-run choice

The two top-level intents (`Practice with sample data`, `Use my own tables`) are the most important choice in the product. After Phase 15 they are both hidden behind a single `Change source` button in the toolbar.

- A new user lands directly inside a seeded exercise without ever choosing it.
- They never see that `Use my own tables` exists unless they open the modal.
- `Change source` reads as a settings-style affordance, not as the primary product entry point.
- "Source" is internal jargon. Users think in terms of "practice" vs "my own data."

The fix is to make the chooser the home screen, not a modal. The workspace becomes the surface the user enters by selecting an intent, with a persistent `Home` affordance to return.

### Secondary findings

- **Dev-phase string leaks**: the workbench header still reads `Phase 2: editable DoorDash query`. Internal codename in production UI.
- **`Casefile Desk` kicker**: leftover decoration from an earlier metaphor; meaningless to users.
- **Setup/Query tabs are dead UI for practice**: in seeded practice the user lands in Query and has no reason to visit Setup. The tabs are always rendered. They should be conditional.
- **`Reveal solution` is destructive**: one click overwrites the user's in-progress query with the canonical answer. No confirmation. A misclick destroys work.
- **`window.confirm` for reset**: native browser dialog used to confirm `Start over` in custom flows. Jarring and inconsistent with the rest of the UI.
- **Dataset status card adds no value on the happy path**: `Runnable snapshot / Dataset is current and ready to query` is chrome that announces nothing actionable when the dataset is fine. Should be conditional.
- **`Imported tables` heading is wrong for authoring**: the structured preview always uses `Imported tables`, including in the New Schema flow where nothing was imported.
- **`Apply schema` disabled with no hint**: in authoring, the button is disabled until everything validates, but users get no inline cue about what is blocking it.
- **Toolbar hierarchy is flat**: difficulty chip and two ghost buttons sit in the same actions cluster with no visual ranking, so nothing reads as primary.
- **`Reset case` vs `Start over` label swap is too subtle**: the same button changes label based on mode, and users do not notice.
- **Inline red error styling is ad hoc**: red error text is set with inline `style={{ color: "#b00020" }}` in several places instead of a shared class, drifting from the rest of the design system.

The next best slice is not more parser hardening. It is the IA correction: make the two flows impossible to miss, then clean up New Schema so it feels like authoring a schema rather than operating an import tool.
