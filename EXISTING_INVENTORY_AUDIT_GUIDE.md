# Existing Inventory Audit Guide

## Temporary scope

- Audit and fix only Scripture already present in the reader: Genesis 1–50, Exodus 1–40, and Leviticus 1–24.
- Do not create or save any new Scripture book or chapter locally until this inventory audit and first eligible batch merge are complete.
- Leviticus 25 is paused separately and is not part of the tracked inventory.
- The one-time release exception waives only the requirement that all 66 canonical books already be present. Every other gate remains unchanged.
- Merge only complete books that pass every remaining gate. Leviticus is currently ineligible as a complete book because chapters 25–27 are absent.

## Required review for every included chapter and verse

1. **Completeness:** Compare every chapter and verse number with a rights-cleared source. Confirm order, count, names, dates, quantities, places, speaker, and sequence. Do not add, omit, combine, or invent Scripture.
2. **Faithfulness:** Preserve the source meaning, theology, facts, dialogue intent, and emotional weight. Write original AdigunBible wording; the Gen Z Bible site is a style reference only. Never copy its verses or assets.
3. **Voice:** The text must clearly sound like a vivid, conversational Gen Z Bible, not plain English with a few slang inserts. Use natural, varied slang, abbreviations, expressive punctuation, and readable storytelling. Avoid robotic repetition and forced catchphrases.
4. **Emoji:** Ensure the rendered reader places at least one fitting emoji immediately after every word, including names and code-switched words. Keep each word intact. Check the current renderer so stored emojis are not accidentally doubled.
5. **Code-switching:** In every chapter, naturally code-switch across multiple verses in Yoruba, Deutsch, French, Igbo, Hausa, Jamaican Patois, Hebrew, and at least two additional languages. Use short, idiomatic, context-fitting words or phrases within the verse text. Do not create a parallel translation, synonym list, separate edition, or language selector. Verify unfamiliar spellings and meanings.
6. **Context and respect:** Keep God’s authority, Jesus’ teaching and compassion, prophets’ warnings, and each speaker’s intent intact. Preserve seriousness in suffering, death, judgment, and other sensitive passages; do not turn them into jokes.
7. **Rights and provenance:** Record the reference source and rights status for each chapter in `CONTENT_SOURCES.md`. If provenance or rights are uncertain, mark it unverified and exclude it from the release batch.
8. **Technical checks:** Confirm the chapter data is wired to the right reader metadata, verse numbering is correct, no placeholders appear, and the reader renders the word-level emoji and language scripts correctly. Run targeted structural checks and `git diff --check`; report results without calling a draft approved.

## Handoff and release rules

- Keep work on the existing non-release branch. Preserve other agents’ edits and avoid conflicting edits to shared files.
- Do not open a release PR, merge, or deploy while audits are in progress.
- Report the book and chapters reviewed, changes made, verse counts, all language checks, source/rights status, technical results, and remaining blockers.
- Only after every chapter in each proposed complete book passes the checks above and human editorial review may the first existing-inventory batch be merged under the one-time exception.
- After that one batch is merged and verified, the normal release gate resumes: all 66 books must be complete and pass every gate before any later Scripture merge or deployment.
- A GitHub merge does not delete the local checkout. Consider local cleanup only after the remote copy and release are verified, and only if space is still needed.
