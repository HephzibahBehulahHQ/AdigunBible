import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const readerPath = path.join(root, "index.html");
const reader = readFileSync(readerPath, "utf8");
const event = process.argv[2];
const auditOnly = event === "--audit-only";

for (const [, attributes, source] of reader.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/giu)) {
  if (/\bsrc\s*=/iu.test(attributes)) continue;
  const type = attributes.match(/\btype\s*=\s*["']([^"']+)["']/iu)?.[1];
  if (type && !/(?:java|ecma)script/iu.test(type)) continue;
  new vm.Script(source, { filename: "index.html inline script" });
}

function fail(message) {
  throw new Error(message);
}

function extractDeclaration(name, closeMarker, source = reader) {
  const marker = `const ${name}=`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) fail(`index.html is missing ${name}`);
  const start = markerIndex + marker.length;
  const end = source.indexOf(closeMarker, start);
  if (end < 0) fail(`Could not find the end of ${name}`);
  const expression = source.slice(start, end + closeMarker.length - 1);
  return vm.runInNewContext(`(${expression})`, Object.create(null), { timeout: 1000 });
}

function extractOptionalDeclaration(name, closeMarker, source) {
  return source.includes(`const ${name}=`) ? extractDeclaration(name, closeMarker, source) : null;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

const paletteAtWordEnd = /^(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/u;
const paletteGlobal = /(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/gu;
const coreLanguages = ["pcm", "yo", "de", "he"];
const chapterLanguages = ["fr", "ig", "ha", "jam"];
const requiredManualChecks = [
  "universalVoice",
  "scriptureMeaning",
  "completenessAndOrder",
  "multilingualAccuracy",
  "sourceSyntax",
  "hoverGlosses",
  "readerNavigation",
  "readerRendering",
];
const canonicalBookChapters = {
  GEN:50, EXO:40, LEV:27, NUM:36, DEU:34, JOS:24, JDG:21, RUT:4,
  "1SA":31, "2SA":24, "1KI":22, "2KI":25, "1CH":29, "2CH":36,
  EZR:10, NEH:13, EST:10, JOB:42, PSA:150, PRO:31, ECC:12, SNG:8,
  ISA:66, JER:52, LAM:5, EZK:48, DAN:12, HOS:14, JOL:3, AMO:9,
  OBA:1, JON:4, MIC:7, NAM:3, HAB:3, ZEP:3, HAG:2, ZEC:14, MAL:4,
  MAT:28, MRK:16, LUK:24, JHN:21, ACT:28, ROM:16, "1CO":16, "2CO":13,
  GAL:6, EPH:6, PHP:4, COL:4, "1TH":5, "2TH":3, "1TI":6, "2TI":4,
  TIT:3, PHM:1, HEB:13, JAS:5, "1PE":5, "2PE":3, "1JN":5, "2JN":1,
  "3JN":1, JUD:1, REV:22,
};
const canonicalChapterTotal = Object.values(canonicalBookChapters).reduce((sum, count) => sum + count, 0);

const renderStart = reader.indexOf("function renderVerseText(");
const renderEnd = reader.indexOf("\nfunction openChapter", renderStart);
if (renderStart < 0 || renderEnd < 0) fail("Could not locate the reader verse renderer");
const renderVerseText = new Function("escapeHtml", `${reader.slice(renderStart, renderEnd)}; return renderVerseText;`)(escapeHtml);
if (!reader.includes("data.verses.map((text,i)=>({text,n:i+1}))") ||
    !reader.includes("id=\"v'+v.n+'\"") || !reader.includes("class=\"vnum\">'+v.n+'")) {
  fail("Reader must render verse array positions as ordered external verse numbers");
}

function auditChapter(evidence, { requirePublished = true } = {}) {
  if (!evidence || typeof evidence !== "object") fail("Release evidence must be a JSON object");
  const { book, chapter, versesVar, glossesVar, expectedVerseCount } = evidence;
  if (!/^[A-Z]{3}$/.test(book ?? "")) fail("Evidence book must be a three-letter uppercase code");
  if (!Number.isInteger(chapter) || chapter < 1) fail("Evidence chapter must be a positive integer");
  if (!Number.isInteger(expectedVerseCount) || expectedVerseCount < 1) fail("Evidence needs the verified verse count");
  if (!/^[A-Za-z_$][\w$]*$/.test(versesVar ?? "")) fail("Evidence versesVar is invalid");
  if (!/^[A-Za-z_$][\w$]*$/.test(glossesVar ?? "")) fail("Evidence glossesVar is invalid");

  const verses = extractDeclaration(versesVar, "\n];");
  const glosses = extractDeclaration(glossesVar, "\n};");
  if (!Array.isArray(verses) || verses.length !== expectedVerseCount) {
    fail(`${book} ${chapter}: expected ${expectedVerseCount} verses, found ${verses?.length ?? "no array"}`);
  }
  const booksStart = reader.indexOf("const books={");
  const booksEnd = reader.indexOf("\n};", booksStart);
  if (booksStart < 0 || booksEnd < 0) fail("Could not locate the reader book/navigation registry");
  const booksLines = reader.slice(booksStart, booksEnd).split(/\r?\n/);
  const bookLine = booksLines.find((line) => line.trimStart().startsWith(`${book}:{`));
  if (!bookLine) fail(`${book} ${chapter}: book is missing from reader navigation`);
  const chapterPattern = new RegExp(
    `${chapter}\\s*:\\s*\\{\\s*title\\s*:\\s*"[^"]+"\\s*,\\s*verses\\s*:\\s*${versesVar}\\s*(?:,\\s*inReview\\s*:\\s*(true|false))?\\s*\\}`,
  );
  const chapterMatch = bookLine.match(chapterPattern);
  if (!chapterMatch) fail(`${book} ${chapter}: reader navigation does not point to ${versesVar}`);
  if (requirePublished && chapterMatch[1] === "true") fail(`${book} ${chapter} is still marked in editorial review`);
  if (!/function buildChapterGrid\(\)[\s\S]*?button\.onclick=\(\)=>openChapter\(n\)/.test(reader) ||
      !/function openChapter\(n,selected=book\)[\s\S]*?chapter=n[\s\S]*?render\(\)/.test(reader)) {
    fail(`${book} ${chapter}: chapter selection does not route through the reader navigation and renderer`);
  }

  const chapterGlosses = Array.isArray(glosses["1"]) ? glosses : glosses[String(chapter)];
  if (!chapterGlosses || typeof chapterGlosses !== "object") fail(`${book} ${chapter}: glossary entry is missing`);
  const languageTotals = Object.create(null);

  for (let index = 0; index < verses.length; index += 1) {
    const number = index + 1;
    const verse = verses[index];
    if (typeof verse !== "string" || /^(?:🔟|(?:1[1-6]|[1-9])️⃣)\s/u.test(verse)) {
      fail(`${book} ${chapter}:${number} embeds a duplicate verse number; the reader numbers verses separately`);
    }

    const tokens = [...verse.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu)];
    const firstWord = 0;
    for (let tokenIndex = firstWord; tokenIndex < tokens.length; tokenIndex += 1) {
      const token = tokens[tokenIndex];
      if (!paletteAtWordEnd.test(verse.slice(token.index + token[0].length))) {
        fail(`${book} ${chapter}:${number}: “${token[0]}” is not immediately paired with a palette emoji`);
      }
    }

    const verseGlosses = chapterGlosses[String(number)];
    if (!Array.isArray(verseGlosses)) fail(`${book} ${chapter}:${number} has no glossary list`);
    const html = renderVerseText(verse, verseGlosses);
    const spans = [...html.matchAll(/<span class="verse-gloss" title="([^"]*)" lang="([^"]*)" dir="auto">([^<]*)<\/span>/g)];
    const usedSpans = new Set();
    const glossedWords = new Set(spans.flatMap((span) =>
      [...span[3].replace(paletteGlobal, "").matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)]
        .map(([word]) => word.toLocaleLowerCase()),
    ));
    for (const [phrase, meaning, language] of verseGlosses) {
      if (typeof phrase !== "string" || typeof meaning !== "string" || typeof language !== "string") {
        fail(`${book} ${chapter}:${number} has an invalid glossary row`);
      }
      const visiblePhrase = phrase;
      const renderedIndex = spans.findIndex((span, spanIndex) => !usedSpans.has(spanIndex) &&
        span[3].replace(paletteGlobal, "").trim() === visiblePhrase &&
        span[1] === meaning && span[2] === language);
      if (renderedIndex < 0) fail(`${book} ${chapter}:${number}: hover gloss does not render for “${phrase}”`);
      usedSpans.add(renderedIndex);
      languageTotals[language] = (languageTotals[language] ?? 0) + phrase.split(" ").length;
    }

    for (const token of tokens.slice(firstWord)) {
      if (/[^\u0000-\u007f]/u.test(token[0]) && !glossedWords.has(token[0].toLocaleLowerCase())) {
        fail(`${book} ${chapter}:${number}: switched word “${token[0]}” has no rendered hover gloss`);
      }
    }

    for (const language of coreLanguages) {
      const count = verseGlosses
        .filter((row) => row[2] === language)
        .reduce((total, row) => total + row[0].split(" ").length, 0);
      if (count < 4) fail(`${book} ${chapter}:${number} needs four ${language} switch words; found ${count}`);
    }
  }

  for (const language of chapterLanguages) {
    if ((languageTotals[language] ?? 0) < 4) {
      fail(`${book} ${chapter} needs at least four ${language} switch words across the chapter`);
    }
  }

  if (!auditOnly) {
    if (evidence.gateVersion !== 1) fail(`${book} ${chapter}: gateVersion must be 1`);
    if (evidence.status !== "passed") fail(`${book} ${chapter}: evidence status must be passed`);
    if (typeof evidence.reviewer !== "string" || !evidence.reviewer.trim()) fail(`${book} ${chapter}: reviewer is required`);
    if (!Number.isFinite(Date.parse(evidence.reviewedAt ?? ""))) fail(`${book} ${chapter}: reviewedAt must be a valid date`);
    for (const check of requiredManualChecks) {
      if (evidence.checks?.[check] !== "pass") fail(`${book} ${chapter}: manual check “${check}” has not passed`);
    }
  }
  console.log(`PASS ${book} ${chapter}: ${verses.length} verses, emoji coverage, language thresholds, and rendered glosses`);
}

function readEvidence(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function evidenceFiles() {
  const directory = path.join(root, "release-evidence");
  try {
    return readdirSync(directory)
      .filter((name) => /^[A-Z]{3}-\d+\.json$/.test(name))
      .map((name) => path.join(directory, name));
  } catch {
    return [];
  }
}

try {
  if (auditOnly) {
    if (process.argv.length !== 5) fail("Usage: node scripts/release-gate.mjs --audit-only <BOOK> <CHAPTER>");
    const [, , , book, chapterText] = process.argv;
    const files = evidenceFiles();
    const evidence = files.map(readEvidence).find((item) => item.book === book && item.chapter === Number(chapterText));
    if (!evidence) fail(`No evidence manifest for ${book} ${chapterText}; provide a temporary JSON manifest to run --audit-only`);
    auditChapter(evidence, { requirePublished: false });
  } else if (event === "--pr") {
    const base = process.env.GITHUB_BASE_REF;
    if (!base) fail("GITHUB_BASE_REF is required for pull request validation");
    const changedFiles = execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean);
    const changedEvidence = changedFiles.filter((file) => /^release-evidence\/[A-Z]{3}-\d+\.json$/.test(file));
    if (changedEvidence.length !== 1) fail(`A chapter release PR must change exactly one evidence file; found ${changedEvidence.length}`);
    if (!changedFiles.includes("index.html")) fail("A chapter release PR must update the reader content in index.html");
    const allowed = new Set([
      "index.html",
      changedEvidence[0],
      ".github/workflows/pages.yml",
      "scripts/release-gate.mjs",
    ]);
    const unexpected = changedFiles.filter((file) => !allowed.has(file));
    if (unexpected.length) fail(`Chapter release PR contains unrelated changes: ${unexpected.join(", ")}`);
    const evidence = readEvidence(path.join(root, changedEvidence[0]));
    if (path.basename(changedEvidence[0]) !== `${evidence.book}-${evidence.chapter}.json`) {
      fail(`${changedEvidence[0]}: evidence filename must match its book and chapter`);
    }
    const baseReader = execFileSync("git", ["show", `origin/${base}:index.html`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const beforeVerses = extractOptionalDeclaration(evidence.versesVar, "\n];", baseReader);
    const afterVerses = extractDeclaration(evidence.versesVar, "\n];");
    const beforeGlosses = extractOptionalDeclaration(evidence.glossesVar, "\n};", baseReader);
    const afterGlosses = extractDeclaration(evidence.glossesVar, "\n};");
    if (JSON.stringify(beforeVerses) === JSON.stringify(afterVerses) || JSON.stringify(beforeGlosses) === JSON.stringify(afterGlosses)) {
      fail(`${evidence.book} ${evidence.chapter}: PR must change the target chapter text and glossary`);
    }
    auditChapter(evidence);
  } else if (event === "--main") {
    const files = evidenceFiles();
    if (!files.length) fail("main has no chapter release evidence; refusing to deploy without a recorded chapter validation");
    for (const file of files) {
      const evidence = readEvidence(file);
      if (path.basename(file) !== `${evidence.book}-${evidence.chapter}.json`) fail(`${file}: filename must match its book and chapter`);
      auditChapter(evidence);
    }
    console.log(`PASS main: ${files.length} chapter release record(s) validated`);
  } else if (event === "--corpus") {
    const files = evidenceFiles();
    const evidenceByChapter = new Map(files.map((file) => {
      const evidence = readEvidence(file);
      return [`${evidence.book}-${evidence.chapter}`, { file, evidence }];
    }));
    const missing = [];
    for (const [book, count] of Object.entries(canonicalBookChapters)) {
      for (let chapter = 1; chapter <= count; chapter += 1) {
        if (!evidenceByChapter.has(`${book}-${chapter}`)) missing.push(`${book}-${chapter}`);
      }
    }
    if (missing.length) fail(`Whole-corpus evidence is incomplete (${missing.length}/${canonicalChapterTotal} chapter records missing): ${missing.slice(0, 12).join(", ")}${missing.length > 12 ? ", …" : ""}`);
    if (files.length !== canonicalChapterTotal) fail(`Expected exactly ${canonicalChapterTotal} canonical chapter records, found ${files.length}`);
    for (const { file, evidence } of evidenceByChapter.values()) {
      const expectedName = `${evidence.book}-${evidence.chapter}.json`;
      if (path.basename(file) !== expectedName) fail(`${file}: filename must be ${expectedName}`);
      auditChapter(evidence);
    }
    console.log(`PASS whole corpus: all 66 books and ${canonicalChapterTotal} chapters validated`);
  } else {
    fail("Usage: node scripts/release-gate.mjs --pr | --main | --corpus | --audit-only <BOOK> <CHAPTER>");
  }
} catch (error) {
  console.error(`RELEASE GATE FAILED: ${error.message}`);
  process.exitCode = 1;
}
