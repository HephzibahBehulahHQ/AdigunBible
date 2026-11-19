function renderMatthewVerse(verse, escapeHtml) {
  const words = [...verse.text.matchAll(/[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:['’\-][\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)?/gu)];
  const glosses = verse.glosses.map(([phrase, meaning, language]) => ({
    parts: phrase.split(" "),
    meaning,
    language,
  })).sort((a, b) => b.parts.length - a.parts.length);
  let html = "";
  let cursor = 0;
  let red = false;

  for (let i = 0; i < words.length;) {
    const word = words[i];
    const speech = verse.wordsOfJesus?.some(([start, end]) => i >= start && i < end) ?? false;
    const gloss = glosses.find(({parts}) => parts.every((part, j) =>
      words[i + j]?.[0].startsWith(part) &&
      words[i + j][0].replace(/(?:❤️|🙏|✨|🔥|🫶|🌍|😭|👀|💯|🕊️)$/u, "") === part &&
      (verse.wordsOfJesus?.some(([start, end]) => i + j >= start && i + j < end) ?? false) === speech
    ));
    const length = gloss?.parts.length ?? 1;
    const last = words[i + length - 1];
    const end = last.index + last[0].length;
    html += escapeHtml(verse.text.slice(cursor, word.index));
    if (red !== speech) {
      html += speech ? '<span class="words-of-jesus">' : '</span>';
      red = speech;
    }
    const content = escapeHtml(verse.text.slice(word.index, end));
    html += gloss
      ? '<span class="verse-gloss" title="' + escapeHtml(gloss.meaning) +
        '" lang="' + escapeHtml(gloss.language) + '" dir="auto">' + content + '</span>'
      : content;
    cursor = end;
    i += length;
  }
  return html + escapeHtml(verse.text.slice(cursor)) + (red ? "</span>" : "");
}
