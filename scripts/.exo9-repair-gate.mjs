import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = process.cwd();
const readerPath = path.join(root, "Exodus/.exo9-rotating-repair.html");
const reader = readFileSync(readerPath, "utf8");
const event = process.argv[2];
const auditOnly = event === "--audit-only";
const skipManualReview = false;

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

const renderAnnotatedStart = readFileSync(path.join(root, "Matthew", "render-verse.js"), "utf8");
const renderAnnotatedVerse = new Function(
  "escapeHtml",
  `${renderAnnotatedStart}; return renderMatthewVerse;`,
)(escapeHtml);
const annotatedBookFolders = { MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John" };
const annotatedChapterMaps = { MAT: "matthewChapters", MRK: "markChapters", LUK: "lukeChapters", JHN: "johnChapters" };

function loadAnnotatedChapter(evidence, sourceText) {
  const folder = annotatedBookFolders[evidence.book];
  if (!folder) fail(`${evidence.book} ${evidence.chapter}: annotated chapter modules are not supported for this book`);
  const expectedModule = `${folder}/chapter-${evidence.chapter}.js`;
  if (evidence.chapterModule !== expectedModule) fail(`${evidence.book} ${evidence.chapter}: chapterModule must be ${expectedModule}`);
  if (!/^[A-Za-z_$][\w$]*$/.test(evidence.chapterVar ?? "")) fail(`${evidence.book} ${evidence.chapter}: chapterVar is invalid`);
  const resolvedPath = path.resolve(root, expectedModule);
  if (!resolvedPath.startsWith(`${root}${path.sep}`)) fail(`${evidence.book} ${evidence.chapter}: chapterModule escapes the project`);
  const source = sourceText ?? readFileSync(resolvedPath, "utf8");
  const chapter = vm.runInNewContext(`${source}\n;${evidence.chapterVar}`, Object.create(null), {
    filename: expectedModule,
    timeout: 1000,
  });
  if (!chapter || chapter.book !== ({ MAT: "Matthew", MRK: "Mark", LUK: "Luke", JHN: "John" })[evidence.book] ||
      chapter.chapter !== evidence.chapter || !Array.isArray(chapter.verses)) {
    fail(`${evidence.book} ${evidence.chapter}: chapter module does not contain the expected chapter object`);
  }
  return chapter;
}

function readChapterContent(evidence, sourceText) {
  if (evidence.chapterModule) {
    const chapter = loadAnnotatedChapter(evidence, sourceText);
    return {
      chapter,
      verses: chapter.verses.map((verse) => verse.text),
      glosses: Object.fromEntries(chapter.verses.map((verse) => [String(verse.number), verse.glosses])),
    };
  }
  return {
    chapter: null,
    verses: extractDeclaration(evidence.versesVar, "\n];", sourceText ?? reader),
    glosses: extractDeclaration(evidence.glossesVar, "\n};", sourceText ?? reader),
  };
}

const paletteAtWordEnd = /^(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/u;
const paletteGlobal = /(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)/gu;
function normalizeGlossPhrase(value) {
  return [...value.replace(paletteGlobal, "").matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)]
    .map(([word]) => word)
    .join(" ");
}
const coreLanguages = ["pcm", "yo", "de", "he"];
const chapterLanguages = ["fr", "ig", "ha", "jam"];
const rotatingLanguages = ["es", "ar", "pt", "sw", "hi", "zh", "tl", "ko", "ja", "it", "nl"];
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
const canonicalSequence = Object.entries(canonicalBookChapters)
  .flatMap(([book, count]) => Array.from({ length: count }, (_, index) => `${book}-${index + 1}`));
// Main already published through Exodus 16; the next chapter release is Exodus 17.
const releaseBaseline = canonicalSequence.indexOf("EXO-16");

const renderStart = reader.indexOf("function renderVerseText(");
const renderEnd = reader.indexOf("\nfunction openChapter", renderStart);
if (renderStart < 0 || renderEnd < 0) fail("Could not locate the reader verse renderer");
const renderVerseText = new Function("escapeHtml", `${reader.slice(renderStart, renderEnd)}; return renderVerseText;`)(escapeHtml);
if (!/data\.verses\.map\(\([^)]*\)=>[^\n]*n:i\+1/.test(reader) ||
    !reader.includes("id=\"v'+v.n+'\"") || !reader.includes("class=\"vnum\">'+v.n+'")) {
  fail("Reader must render verse array positions as ordered external verse numbers");
}

function auditChapter(evidence, { requirePublished = true, requireVisualReview = false } = {}) {
  if (!evidence || typeof evidence !== "object") fail("Release evidence must be a JSON object");
  const { book, chapter, versesVar, glossesVar, expectedVerseCount } = evidence;
  if (!/^[A-Z0-9]{3}$/.test(book ?? "") || !(book in canonicalBookChapters)) fail("Evidence book must be a canonical three-character code");
  if (!Number.isInteger(chapter) || chapter < 1) fail("Evidence chapter must be a positive integer");
  if (!Number.isInteger(expectedVerseCount) || expectedVerseCount < 1) fail("Evidence needs the verified verse count");
  if (!evidence.chapterModule && !/^[A-Za-z_$][\w$]*$/.test(versesVar ?? "")) fail("Evidence versesVar is invalid");
  if (!evidence.chapterModule && !/^[A-Za-z_$][\w$]*$/.test(glossesVar ?? "")) fail("Evidence glossesVar is invalid");

  const { chapter: moduleChapter, verses, glosses } = readChapterContent(evidence);
  if (!Array.isArray(verses) || verses.length !== expectedVerseCount) {
    fail(`${book} ${chapter}: expected ${expectedVerseCount} verses, found ${verses?.length ?? "no array"}`);
  }
  if (moduleChapter) {
    const mapName = annotatedChapterMaps[book];
    const moduleTag = new RegExp(`<script\\b[^>]*\\bsrc=["']${evidence.chapterModule.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}['"][^>]*>`, "iu");
    if (!moduleTag.test(reader) || !reader.includes(`${chapter}:${evidence.chapterVar}`) ||
        !reader.includes(`${book}:${mapName}`)) {
      fail(`${book} ${chapter}: reader does not load and register ${evidence.chapterModule}`);
    }
    if (!/\.words-of-jesus\s*\{\s*color\s*:/iu.test(reader) ||
        !/body\[data-theme=["']light["']\]\s+\.words-of-jesus\s*\{\s*color\s*:/iu.test(reader)) {
      fail(`${book} ${chapter}: reader must set Jesus speech to red in dark and light themes`);
    }
    if (requirePublished && moduleChapter.inReview) fail(`${book} ${chapter} is still marked in editorial review`);
  }
  if (!moduleChapter) {
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
  }
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
    const moduleVerse = moduleChapter?.verses[index];
    if (moduleVerse && (moduleVerse.number !== number || !Array.isArray(moduleVerse.wordsOfJesus))) {
      fail(`${book} ${chapter}:${number}: annotated verse numbering or Jesus speech ranges are missing`);
    }
    for (const [start, end] of moduleVerse?.wordsOfJesus ?? []) {
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > verse.length) {
        fail(`${book} ${chapter}:${number}: Jesus speech range is outside the verse text`);
      }
    }
    const html = moduleVerse
      ? renderAnnotatedVerse(moduleVerse, escapeHtml)
      : renderVerseText(verse, verseGlosses);
    if (moduleVerse?.wordsOfJesus.length && !html.includes('class="words-of-jesus"')) {
      fail(`${book} ${chapter}:${number}: Jesus speech range did not render as red-letter markup`);
    }
    const spans = [...html.matchAll(/<span class="verse-gloss" title="([^"]*)" lang="([^"]*)" dir="auto">([^<]*)<\/span>/g)];
    const usedSpans = new Set();
    const glossedWords = new Set(spans.flatMap((span) =>
      [...span[3].replace(paletteGlobal, "").matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu)]
        .map(([word]) => word.toLocaleLowerCase()),
    ));
    for (const [phrase, meaning, language] of verseGlosses) {
      if ([phrase, meaning, language].some((value) => typeof value !== "string" || !value.trim())) {
        fail(`${book} ${chapter}:${number} has an invalid glossary row`);
      }
      const visiblePhrase = phrase;
      const renderedIndex = spans.findIndex((span, spanIndex) => !usedSpans.has(spanIndex) &&
        normalizeGlossPhrase(span[3]) === normalizeGlossPhrase(visiblePhrase) &&
        span[1] === escapeHtml(meaning) && span[2] === language);
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
  if (moduleChapter) {
    const rotatingUsed = rotatingLanguages.filter((language) => (languageTotals[language] ?? 0) > 0);
    if (rotatingUsed.length < 2) {
      fail(`${book} ${chapter} needs switches from at least two rotating languages; found ${rotatingUsed.length}`);
    }
  }

  if (!skipManualReview) {
    if (evidence.gateVersion !== 1) fail(`${book} ${chapter}: gateVersion must be 1`);
    const visualDeferred = evidence.status === "passed_with_visual_deferral";
    if (evidence.status !== "passed" && !visualDeferred) fail(`${book} ${chapter}: evidence status must be passed or explicitly deferred`);
    if (visualDeferred) {
      const deferral = evidence.visualDeferral;
      if (deferral?.approvedBy !== "owner" ||
          typeof deferral.approvalReference !== "string" || !deferral.approvalReference.trim() ||
          !Number.isFinite(Date.parse(deferral.approvedAt ?? ""))) {
        fail(`${book} ${chapter}: visual deferral needs a dated owner approval reference`);
      }
      if (requireVisualReview) fail(`${book} ${chapter}: deferred visual review blocks whole-corpus completion`);
    }
    if (typeof evidence.reviewer !== "string" || !evidence.reviewer.trim()) fail(`${book} ${chapter}: reviewer is required`);
    if (!Number.isFinite(Date.parse(evidence.reviewedAt ?? ""))) fail(`${book} ${chapter}: reviewedAt must be a valid date`);
    for (const check of requiredManualChecks) {
      const expected = visualDeferred && check === "readerRendering" ? "deferred" : "pass";
      if (evidence.checks?.[check] !== expected) fail(`${book} ${chapter}: manual check “${check}” must be ${expected}`);
    }
    for (let number = 1; number <= verses.length; number += 1) {
      const review = evidence.verseReviews?.[String(number)];
      for (const check of ["voice", "meaning", "languages", "rendering"]) {
        const expected = visualDeferred && check === "rendering" ? "deferred" : "pass";
        if (review?.[check] !== expected) {
          fail(`${book} ${chapter}:${number}: verse review “${check}” must be ${expected}`);
        }
      }
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
      .filter((name) => /^[A-Z0-9]{3}-\d+\.json$/.test(name))
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
  } else if (event === "--pr" || event === "--pr-draft") {
    const base = process.env.GITHUB_BASE_REF;
    if (!base) fail("GITHUB_BASE_REF is required for pull request validation");
    const changedFiles = execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
      .split(/\r?\n/).filter(Boolean);
    const changedEvidence = changedFiles.filter((file) => /^release-evidence\/[A-Z0-9]{3}-\d+\.json$/.test(file));
    if (changedEvidence.length !== 1) fail(`A chapter release PR must change exactly one evidence file; found ${changedEvidence.length}`);
    if (!changedFiles.includes("index.html")) fail("A chapter release PR must update the reader content in index.html");
    const allowed = new Set([
      "index.html",
      changedEvidence[0],
      ".github/workflows/pages.yml",
      "scripts/release-gate.mjs",
    ]);
    const evidence = readEvidence(path.join(root, changedEvidence[0]));
    if (path.basename(changedEvidence[0]) !== `${evidence.book}-${evidence.chapter}.json`) {
      fail(`${changedEvidence[0]}: evidence filename must match its book and chapter`);
    }
    if (evidence.chapterModule) {
      if (typeof evidence.chapterModule !== "string" || !changedFiles.includes(evidence.chapterModule)) {
        fail(`${evidence.book} ${evidence.chapter}: PR must change its chapter module`);
      }
      allowed.add(evidence.chapterModule);
      const supportingFilePattern = new RegExp(`^${annotatedBookFolders[evidence.book]}/[^/]+\\.(?:txt|md)$`, "u");
      for (const file of evidence.supportingFiles ?? []) {
        if (typeof file !== "string" || !supportingFilePattern.test(file)) {
          fail(`${evidence.book} ${evidence.chapter}: invalid supporting file path`);
        }
        allowed.add(file);
      }
    }
    const unexpected = changedFiles.filter((file) => !allowed.has(file));
    if (unexpected.length) fail(`Chapter release PR contains unrelated changes: ${unexpected.join(", ")}`);
    const baseEvidence = execFileSync("git", ["ls-tree", "-r", "--name-only", `origin/${base}`, "--", "release-evidence"], { encoding: "utf8" })
      .split(/\r?\n/).filter((file) => /^release-evidence\/[A-Z0-9]{3}-\d+\.json$/.test(file))
      .map((file) => path.basename(file, ".json"));
    const released = new Set(baseEvidence);
    let lastReleased = releaseBaseline;
    while (released.has(canonicalSequence[lastReleased + 1])) lastReleased += 1;
    const outOfOrder = baseEvidence.find((id) => canonicalSequence.indexOf(id) > lastReleased);
    if (outOfOrder) fail(`Published chapter evidence has a gap before ${outOfOrder}`);
    const expected = canonicalSequence[lastReleased + 1];
    if (`${evidence.book}-${evidence.chapter}` !== expected) {
      fail(`Next chapter release must be ${expected}; found ${evidence.book}-${evidence.chapter}`);
    }
    const baseReader = execFileSync("git", ["show", `origin/${base}:index.html`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    let beforeVerses;
    let afterVerses;
    let beforeGlosses;
    let afterGlosses;
    if (evidence.chapterModule) {
      let beforeModule = null;
      try {
        beforeModule = execFileSync("git", ["show", `origin/${base}:${evidence.chapterModule}`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
      } catch {}
      const beforeContent = beforeModule ? readChapterContent(evidence, beforeModule) : null;
      const afterContent = readChapterContent(evidence);
      beforeVerses = beforeContent?.verses ?? null;
      beforeGlosses = beforeContent?.glosses ?? null;
      afterVerses = afterContent.verses;
      afterGlosses = afterContent.glosses;
    } else {
      beforeVerses = extractOptionalDeclaration(evidence.versesVar, "\n];", baseReader);
      afterVerses = extractDeclaration(evidence.versesVar, "\n];");
      beforeGlosses = extractOptionalDeclaration(evidence.glossesVar, "\n};", baseReader);
      afterGlosses = extractDeclaration(evidence.glossesVar, "\n};");
    }
    if (JSON.stringify(beforeVerses) === JSON.stringify(afterVerses) || JSON.stringify(beforeGlosses) === JSON.stringify(afterGlosses)) {
      fail(`${evidence.book} ${evidence.chapter}: PR must change the target chapter text and glossary`);
    }
    auditChapter(evidence, { requirePublished: event === "--pr" });
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
    const deferred = [...evidenceByChapter].filter(([, item]) => item.evidence.status === "passed_with_visual_deferral");
    if (deferred.length) fail(`Whole-corpus visual review is incomplete: ${deferred.map(([id]) => id).join(", ")}`);
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
      auditChapter(evidence, { requireVisualReview: true });
    }
    console.log(`PASS whole corpus: all 66 books and ${canonicalChapterTotal} chapters validated`);
  } else {
    fail("Usage: node scripts/release-gate.mjs --pr | --pr-draft | --main | --corpus | --audit-only <BOOK> <CHAPTER>");
  }
} catch (error) {
  console.error(`RELEASE GATE FAILED: ${error.message}`);
  process.exitCode = 1;
}
