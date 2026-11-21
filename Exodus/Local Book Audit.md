# Exodus local book audit

Date: 2026-11-21. Reader branch: `codex/exodus-6-gloss-repair` (`c15a9aab568b29bb7eea7e31d9002384947c2f83`). Gate fix branch: `codex/exodus-gate-hardening` (`9e4691b4bfb18d271b3e3e7dc11c45b130c94830`). Nothing was pushed, merged, or deployed.

- All 40 chapter arrays are present with 1,213 verses. Every chapter matches its canonical verse count and has a navigation entry and verse glossary list.
- The local book audit found zero core-language shortfalls, unpaired words, chapter-language gaps, navigation gaps, or missing glossary lists.
- The rendered-gloss gate passed all 40 chapters after decoding HTML entities in displayed phrases and ignoring a curly apostrophe alone as a signal of a foreign word. These gate corrections are saved only on the local gate fix branch.
- Exodus 9 gained a contextual Spanish switch; Exodus 17 gained Spanish and Swahili switches; Exodus 6:9 gained a contextual Yoruba hover gloss. Their individual gates passed.
- Reader visual review is deferred by the owner. This book is not marked release complete. Whole-corpus validation remains pending.

Recheck: `node scripts/audit-local-exodus.mjs codex/exodus-6-gloss-repair`. The book gate is generated locally by `scripts/build-local-exodus-book-gate.mjs`; its current candidate reader is `Exodus/.exo6-gloss-repair.html`.
