# Round-trip harness (EpiDoc-CN fidelity contract)

Verifies parse→build is TREE-IDENTICAL (comments excepted) + generation-stable
for every EpiDoc-CN XML shape the app handles.

Usage:
1. Populate `files/` with the XML to test and list the basenames in `manifest.txt`:
   - the vault sample: `stonehistory/AI/spaces/epidoc-cn-profile/epiwen-sample/**/*.xml`
   - the corpus: `epiwen-public/collections/epidoc-cn/*.xml`
   (prefix copies `v_`/`a_` to avoid collisions)
2. Open `rt-test/harness.html` through the dev server (preview) — results render
   as PASS/FAIL/UNSTABLE per file with the first tree diff.

`files/` and `manifest.txt` are gitignored — catalog data never enters the app repo.
Last full run 2026-07-07: 74/75 PASS (1 SKIP: the sitedesc prose doc, no builder).
