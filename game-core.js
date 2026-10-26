/* Shared, browser-independent rules for the article and stress games. */
const GreekGames = (() => {
  const genders = ["masculine", "feminine", "neuter"];
  const singularArticles = { masculine: "ο", feminine: "η", neuter: "το" };
  const clean = value => String(value).normalize("NFC").toLocaleLowerCase("el").trim();
  const shuffle = (items, random = Math.random) => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const inCollections = (card, ids) => !ids?.length || ids.some(id => card.collectionIds?.includes(id));
  const article = entry => entry.number === "plural" ? (entry.gender === "neuter" ? "τα" : "οι") : singularArticles[entry.gender];
  function nounEntries(cards, settings = {}) {
    const all = cards.filter(card => card.partOfSpeech === "noun").flatMap(card =>
      (card.nounForms || []).flatMap(form => ["singular", "plural"].filter(number => form[number]).map(number => ({
        key: card.id + ":noun:" + form.key + ":" + number, cardId: card.id, variantKey: form.key,
        text: form[number], number, gender: form.gender, russian: card.russian, note: card.note || "",
        singular: form.singular, plural: form.plural, type: card.type || "words", collectionIds: card.collectionIds || [],
      }))));
    // Ambiguity is checked across the whole dictionary, not just the selected theme.
    const meanings = new Map();
    for (const entry of all) {
      const key = clean(entry.text) + ":" + entry.number;
      if (!meanings.has(key)) meanings.set(key, new Set());
      meanings.get(key).add(entry.gender);
    }
    const seen = new Set();
    return all.filter(entry => {
      const key = clean(entry.text) + ":" + entry.number;
      if (meanings.get(key).size !== 1 || seen.has(key)) return false;
      if (settings.number && settings.number !== "mixed" && settings.number !== entry.number) return false;
      if (!inCollections(entry, settings.collectionIds)) return false;
      seen.add(key); return true;
    });
  }
  // Only remove acute accents; preserve diaeresis and all other spelling.
  const stripStress = value => String(value).normalize("NFD").replace(/\u0301/g, "").normalize("NFC");
  const vowel = value => /^[αεηιουω]$/u.test(stripStress(value).normalize("NFD").replace(/\u0308/g, "").toLowerCase());
  function syllables(text) {
    const letters = Array.from(text.normalize("NFC").toLowerCase());
    let count = 0;
    for (let i = 0; i < letters.length; i++) {
      if (!vowel(letters[i])) continue;
      count++;
      const pair = stripStress(letters[i]) + stripStress(letters[i + 1] || "");
      if (["αι", "ει", "οι", "υι", "ου", "αυ", "ευ"].includes(pair) &&
          !letters[i].normalize("NFD").includes("\u0301") &&
          !String(letters[i + 1]).normalize("NFD").includes("\u0308")) i++;
    }
    return count;
  }
  function stressInfo(text) {
    const letters = Array.from(String(text).normalize("NFC"));
    const positions = letters.flatMap((letter, index) => letter.normalize("NFD").includes("\u0301") ? [index] : []);
    if (!/^[\p{Script=Greek}\u0300-\u036f]+$/u.test(text) || positions.length !== 1 || syllables(text) < 2) return null;
    return { plain: stripStress(text), stressIndex: positions[0], vowelIndices: letters.flatMap((letter, index) => vowel(letter) ? [index] : []) };
  }
  function stressEntries(cards, settings = {}) {
    const entries = [];
    for (const card of cards) {
      if (!["words", "professions", "verbs", "adverbs"].includes(card.type)) continue;
      if (settings.type && settings.type !== "all" && card.type !== settings.type) continue;
      if (!inCollections(card, settings.collectionIds)) continue;
      const forms = card.nounForms?.length ? card.nounForms.flatMap(form =>
        ["singular", "plural", ...(settings.includeCases ? ["genitiveSingular", "genitivePlural"] : [])]
          .filter(name => form[name]).map(name => ({ key: form.key + ":" + name, text: form[name], formName: name }))) :
        card.greek.split(/\s*[/·]\s*/).map((text, index) => ({ key: "lemma-" + index, text: text.replace(/^(ο|η|το|οι|τα)\s+/iu, "").trim(), formName: "lemma" }));
      for (const form of forms) {
        const info = stressInfo(form.text); if (!info) continue;
        entries.push({ key: card.id + ":stress:" + form.key, cardId: card.id, text: form.text,
          russian: card.russian, note: card.note || "", formName: form.formName, type: card.type, ...info });
      }
    }
    // Accept all attested accent positions if spelling variants share the same plain form.
    const groups = new Map();
    for (const entry of entries) {
      const key = clean(entry.plain);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    return [...groups.values()].map(group => ({
      ...group[0], acceptedIndices: [...new Set(group.map(entry => entry.stressIndex))],
      spellings: [...new Set(group.map(entry => entry.text))],
    }));
  }
  const metricKey = (entry, settings, target) => settings.kind === "stress" ? entry.key :
    settings.mode === "board" ? "board:" + target + ":" + entry.key : "single:" + entry.key;
  function filterPractice(pool, settings, metrics) {
    if (!settings.material || settings.material === "all") return pool;
    return pool.filter(entry => {
      const targets = settings.kind === "articles" && settings.mode === "board" && settings.target === "rotate" ? genders : [settings.target];
      const prior = targets.map(target => metrics[metricKey(entry, settings, target)]);
      return settings.material === "errors" ? prior.some(row => row?.lastCorrect === false) : prior.every(row => !row?.answers);
    });
  }
  function buildBoard(pool, target, used = [], random = Math.random) {
    const seen = new Set(used), surfaces = new Set();
    const available = shuffle(pool.filter(entry => !seen.has(entry.key)), random).filter(entry => {
      const key = clean(entry.text); if (surfaces.has(key)) return false; surfaces.add(key); return true;
    });
    const positive = available.filter(entry => entry.gender === target);
    const negative = available.filter(entry => entry.gender !== target);
    if (!positive.length || !negative.length) return null;
    const size = Math.min(10, available.length);
    let yes = Math.min(positive.length, Math.max(1, Math.floor(size * .4)), size - 1);
    yes = Math.max(yes, size - negative.length);
    const entries = shuffle([...positive.slice(0, yes), ...negative.slice(0, size - yes)], random);
    return { target, entries };
  }
  const gradeBoard = (board, selected) => {
    const keys = new Set(selected);
    return board.entries.map(entry => ({ entry, selected: keys.has(entry.key), expected: entry.gender === board.target,
      correct: keys.has(entry.key) === (entry.gender === board.target) }));
  };
  const updateMetric = (metrics, key, correct, now = new Date().toISOString()) => {
    const previous = metrics[key] || { answers: 0, correct: 0 };
    metrics[key] = { answers: previous.answers + 1, correct: previous.correct + Number(correct), lastCorrect: correct, lastAt: now };
  };
  return { genders, singularArticles, article, shuffle, nounEntries, stripStress, vowel, syllables, stressInfo,
    stressEntries, metricKey, filterPractice, buildBoard, gradeBoard, updateMetric };
})();
if (typeof module !== "undefined") module.exports = GreekGames;
