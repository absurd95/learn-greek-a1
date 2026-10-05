const SOURCES = [
  ["words", "Слова", "λέξη", "./data/words.json"],
  ["verbs", "Глаголы", "ρήμα", "./data/verbs.json"],
  ["adverbs", "Наречия", "τώρα", "./data/adverbs.json"],
  ["phrases", "Фразы", "…", "./data/phrases.json"],
  ["professions", "Профессии", "⚒", "./data/professions.json"],
  ["nationalities", "Национальности", "◎", "./data/nationalities.json"],
  ["months", "Месяцы", "12", "./data/months.json"],
  ["weekdays", "Дни недели", "7", "./data/weekdays.json"],
  ["conjugations", "Спряжения", "εγώ", "./data/conjugations.json"]
];
const WORD_TOPICS = [
  ["all", "Все темы", "ΑΩ"], ["food", "Еда и напитки", "🍊"], ["home", "Дом и мебель", "⌂"],
  ["clothes", "Одежда", "◇"], ["education", "Учёба", "✎"], ["work", "Работа и профессии", "⚒"],
  ["people", "Люди", "◎"], ["city", "Город и покупки", "▦"], ["transport", "Транспорт и путешествия", "→"],
  ["time", "Время", "◷"], ["nature", "Природа и погода", "☀"], ["objects", "Предметы", "▣"], ["other", "Прочее", "…"]
];
const PARTS_OF_SPEECH = [["all", "Все"], ["noun", "Существительные"], ["adjective", "Прилагательные"], ["pronoun", "Местоимения"], ["numeral", "Числительные"], ["other", "Другое"]];
const state = { data: {}, collections: [], situations: [], aliases: {}, deck: [], quizDeck: [], category: "new", wordTopic: null, selectedCollections: new Set(), selectedSituations: new Set(), situationType: "all", wordPartOfSpeech: "all", index: 0, revealed: false, listMode: false, listQuery: "", listSort: "el", expandedConjugations: new Set(), quizDirection: localStorage.getItem("greek-a1-quiz-direction") || "el-ru", quizMode: "el-ru", quizIndex: 0, quizAnswer: null, quizSpokenText: "", answered: false, session: null, quizScope: [] };
const IRREGULAR_VERBS = new Set(["conjugation-020", "conjugation-024", "conjugation-025", "conjugation-039", "conjugation-047", "conjugation-048", "conjugation-049", "conjugation-050", "conjugation-051"]);
const saved = JSON.parse(localStorage.getItem("greek-a1-progress") || "{}");
const progress = { favorites: saved.favorites || [], mistakes: saved.mistakes || [], learned: saved.learned || [], practice: saved.practice || {} };
const $ = (id) => document.getElementById(id);

function saveProgress() { localStorage.setItem("greek-a1-progress", JSON.stringify(progress)); }
function migrateProgress() {
  const canonical = id => state.aliases[id] || id;
  for (const key of ["favorites", "mistakes", "learned"]) progress[key] = [...new Set(progress[key].map(canonical))];
  for (const [id, metrics] of Object.entries(progress.practice)) {
    const target = canonical(id);
    if (target === id) continue;
    const prior = progress.practice[target] || { answers: 0, correct: 0 };
    progress.practice[target] = { ...metrics, answers: prior.answers + metrics.answers, correct: prior.correct + metrics.correct };
    delete progress.practice[id];
  }
  saveProgress();
}
function allCards() { return SOURCES.flatMap(([key, label]) => (state.data[key] || []).map(card => ({ ...card, type: key, typeLabel: label }))); }
function themedWordCards() { return allCards().filter(card => card.type === "words" || card.type === "professions"); }
function getWordTopicDeck(topic = "all", partOfSpeech = "all") {
  return themedWordCards().filter(card => (topic === "all" || card.topic === topic) && (partOfSpeech === "all" || card.partOfSpeech === partOfSpeech));
}
function getSelectedWordDeck(partOfSpeech = "all") {
  const ids = state.selectedCollections;
  return themedWordCards().filter(card => [...ids].some(id => card.collectionIds?.includes(id)) && (partOfSpeech === "all" || card.partOfSpeech === partOfSpeech));
}
function normalizedSearch(value) { return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ru").trim(); }
function sortHead(card) { return card.greek.split(/\s*[/·]\s*/)[0].replace(/^(ο|η|το|οι|τα)\s+/iu, ""); }
function showScreen(id) { document.querySelectorAll(".screen").forEach(el => el.classList.toggle("active", el.id === id)); window.scrollTo({ top: 0, behavior: "smooth" }); }
function shuffle(items) { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; }
function escapeHTML(value) { return String(value).replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character]); }
function translationParts(value) {
  return String(value).toLocaleLowerCase("ru")
    .replace(/\([^)]*\)/g, "")
    .split(/\s*\/\s*|\s*;\s*|\s*,\s*/)
    .map(part => part.replace(/[.!?…]/g, "").trim())
    .filter(Boolean);
}
function translationsOverlap(left, right) {
  const leftParts = translationParts(left);
  const rightParts = translationParts(right);
  return leftParts.some(leftPart => rightParts.some(rightPart => leftPart === rightPart));
}
const CLOSE_MEANINGS = [new Set(["adverb-b47bd7fd69", "adverb-e566258347", "adverb-016463691a"])];
function linkedMeanings(left, right) { return CLOSE_MEANINGS.some(group => group.has(left.id) && group.has(right.id)); }

let activeUtterance = null;
let speechStartTimer = null;
let speechRequestId = 0;

function setSpeechStatus(message = "") {
  const status = $("speech-status");
  if (status) status.textContent = message;
}

function stopSpeaking() {
  speechRequestId += 1;
  if (speechStartTimer) window.clearTimeout(speechStartTimer);
  speechStartTimer = null;
  activeUtterance = null;
  if ("speechSynthesis" in window && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) window.speechSynthesis.cancel();
  setSpeechStatus();
}

function speakGreek(text) {
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    setSpeechStatus("Озвучивание не поддерживается этим браузером");
    return;
  }
  const synth = window.speechSynthesis;
  const mustRestart = synth.speaking || synth.pending;
  stopSpeaking();
  const requestId = speechRequestId;
  setSpeechStatus("Готовлю озвучивание…");

  const start = () => {
    speechStartTimer = null;
    if (requestId !== speechRequestId) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const greekVoice = synth.getVoices().find(voice => voice.lang.toLowerCase().startsWith("el"));
    utterance.lang = "el-GR";
    utterance.rate = .82;
    utterance.pitch = 1;
    if (greekVoice) utterance.voice = greekVoice;
    activeUtterance = utterance;
    utterance.onstart = () => setSpeechStatus("Произношу…");
    utterance.onend = () => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      setSpeechStatus();
    };
    utterance.onerror = event => {
      if (activeUtterance !== utterance) return;
      activeUtterance = null;
      if (event.error === "canceled" || event.error === "interrupted") { setSpeechStatus(); return; }
      setSpeechStatus(event.error === "not-allowed" ? "Нажмите ещё раз, чтобы разрешить озвучивание" : "Не удалось запустить озвучивание");
    };
    synth.resume();
    synth.speak(utterance);
  };

  // WebKit может молча отменить новый голос, если speak() вызвать сразу после cancel().
  if (mustRestart) speechStartTimer = window.setTimeout(start, 80);
  else start();
}

if ("speechSynthesis" in window) {
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.("voiceschanged", () => window.speechSynthesis.getVoices(), { once: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && activeUtterance) window.speechSynthesis.resume(); });
}

function getDeck(category) {
  const all = allCards();
  if (category === "all") return all;
  if (category === "dictionary") return all.filter(card => card.type === "words" || card.type === "verbs");
  if (category === "new") return all.filter(card => card.new);
  if (category === "favorites") return all.filter(card => progress.favorites.includes(card.id));
  if (category === "mistakes") return all.filter(card => progress.mistakes.includes(card.id));
  return all.filter(card => card.type === category);
}

function renderDashboard() {
  const all = allCards();
  const learnedCount = all.filter(card => progress.learned.includes(card.id)).length;
  $("progress-copy").textContent = `${learnedCount} из ${all.length} карточек уже просмотрено`;
  $("progress-bar").style.width = `${all.length ? learnedCount / all.length * 100 : 0}%`;
  const sections = [
    ["new", "Новые", "＋", getDeck("new").length],
    ["dictionary", "Словарь", "Α↔Я", getDeck("dictionary").length],
    ...SOURCES.map(([key, label, symbol]) => [key, label, symbol, key === "words" ? themedWordCards().length : getDeck(key).length]),
    ["grammar", "Грамматика", "§", "15 тем"]
  ];
  $("category-grid").innerHTML = sections.map(([key, label, symbol, count]) => `<button class="category" data-category="${key}"><span class="symbol">${symbol}</span><strong>${label}</strong><small>${typeof count === "number" ? `${count} карточек` : count}</small></button>`).join("");
  $("resume-quiz").classList.toggle("hidden", !localStorage.getItem("greek-a1-active-quiz"));
}

function renderWordTopics() {
  const query = normalizedSearch($("collection-search").value);
  $("word-topic-grid").innerHTML = WORD_TOPICS.map(([key, label, symbol]) => {
    const children = state.collections.filter(item => key === "all" ? false : item.parent === key);
    const shown = children.filter(item => !query || normalizedSearch(`${item.title} ${label}`).includes(query));
    if (query && !shown.length) return "";
    const count = getWordTopicDeck(key).length;
    return `<section class="topic-group"><button class="category topic-card" data-word-topic="${key}"><span class="symbol">${symbol}</span><strong>${label}</strong><small>${count} карточек</small></button>${shown.map(item => {
      const size = themedWordCards().filter(card => card.collectionIds?.includes(item.id)).length;
      return `<button class="collection-choice" type="button" data-collection="${item.id}" aria-pressed="${state.selectedCollections.has(item.id)}">${escapeHTML(item.title)} <small>${size}</small></button>`;
    }).join("")}</section>`;
  }).join("");
  const selected = getSelectedWordDeck().length;
  $("collection-selection-summary").textContent = state.selectedCollections.size ? `Выбрано подборок: ${state.selectedCollections.size} · ${selected} уникальных карточек` : "Можно выбрать несколько подборок";
  $("open-selected-collections").classList.toggle("hidden", !state.selectedCollections.size);
  showScreen("word-topics");
}

function renderPartOfSpeechFilter() {
  const available = new Set((state.selectedCollections.size ? getSelectedWordDeck() : getWordTopicDeck(state.wordTopic)).map(card => card.partOfSpeech));
  $("word-pos-filter").innerHTML = PARTS_OF_SPEECH.filter(([key]) => key === "all" || available.has(key)).map(([key, label]) => `<button type="button" data-word-pos="${key}" aria-pressed="${state.wordPartOfSpeech === key}">${label}</button>`).join("");
}

function openWordTopic(topic) {
  stopSpeaking();
  state.selectedCollections = new Set(state.collections.filter(item => item.parent === topic || topic === "all").map(item => item.id));
  openSelectedCollections(topic === "all" ? "Все темы" : WORD_TOPICS.find(([key]) => key === topic)?.[1]);
}
function openSelectedCollections(label = "Выбранные подборки") {
  state.category = "words"; state.wordTopic = "all"; state.wordPartOfSpeech = "all"; state.deck = getSelectedWordDeck(); state.index = 0; state.revealed = false; state.listMode = false; state.listQuery = "";
  $("study-title").textContent = label; $("study-kicker").textContent = "Слова по теме"; $("study-back-button").dataset.go = "word-topics";
  $("word-pos-filter").classList.remove("hidden"); $("situation-type-filter").classList.add("hidden"); renderPartOfSpeechFilter(); $("word-list-search").value = ""; showScreen("study"); renderCard();
}

function situationDeck() {
  const ids = new Set(state.situations.filter(item => state.selectedSituations.has(item.id)).flatMap(item => item.cardIds));
  return allCards().filter(card => ids.has(card.id) && (state.situationType === "all" || card.type === state.situationType));
}
function renderSituations() {
  $("situations-grid").innerHTML = state.situations.map(item => `<button class="collection-choice" type="button" data-situation="${item.id}" aria-pressed="${state.selectedSituations.has(item.id)}"><strong>${escapeHTML(item.title)}</strong><small>${item.cardIds.length} карточек</small></button>`).join("");
  $("situations-summary").textContent = state.selectedSituations.size ? `${state.selectedSituations.size} ситуаций · ${situationDeck().length} уникальных карточек` : "Выберите занятие";
  $("open-selected-situations").classList.toggle("hidden", !state.selectedSituations.size);
  showScreen("situations");
}
function openSelectedSituations() {
  state.category = "situations"; state.wordTopic = null; state.situationType = "all"; state.deck = situationDeck(); state.index = 0; state.revealed = false; state.listMode = false;
  $("study-title").textContent = state.selectedSituations.size === 1 ? state.situations.find(item => state.selectedSituations.has(item.id)).title : "Выбранные ситуации";
  $("study-kicker").textContent = "Ситуационное занятие"; $("study-back-button").dataset.go = "situations";
  $("word-pos-filter").classList.add("hidden"); $("situation-type-filter").classList.remove("hidden");
  renderSituationFilter(); showScreen("study"); renderCard();
}
function renderSituationFilter() {
  const types = [["all","Все"],["words","Слова"],["verbs","Глаголы"],["adverbs","Наречия"],["phrases","Фразы"],["professions","Профессии"]];
  $("situation-type-filter").innerHTML = types.filter(([key]) => key === "all" || situationDeckForAll().some(card => card.type === key)).map(([key,label]) => `<button type="button" data-situation-type="${key}" aria-pressed="${state.situationType === key}">${label}</button>`).join("");
}
function situationDeckForAll() { const prior = state.situationType; state.situationType = "all"; const cards = situationDeck(); state.situationType = prior; return cards; }

function openCategory(category) {
  stopSpeaking();
  state.category = category; state.wordTopic = null; state.selectedCollections.clear(); state.wordPartOfSpeech = "all"; state.deck = getDeck(category); state.index = 0; state.revealed = false; state.listMode = category === "dictionary"; state.listQuery = ""; state.expandedConjugations.clear();
  const title = { new: "Новые", all: "Все слова", dictionary: "Словарь", favorites: "Избранное", mistakes: "Ошибки", words: "Слова", verbs: "Глаголы", adverbs: "Наречия", phrases: "Фразы", professions: "Профессии", nationalities: "Национальности", months: "Месяцы", weekdays: "Дни недели", conjugations: "Спряжения" }[category];
  $("study-title").textContent = title; $("study-kicker").textContent = category === "conjugations" ? "Таблицы форм" : category === "dictionary" ? "Быстрый поиск" : "Карточки";
  $("study-back-button").dataset.go = "dashboard"; $("word-pos-filter").classList.add("hidden"); $("situation-type-filter").classList.add("hidden");
  $("word-list-search").value = ""; showScreen("study"); renderCard();
}

function renderCard() {
  const card = state.deck[state.index];
  const viewed = state.deck.filter(item => progress.learned.includes(item.id)).length;
  const practiced = state.deck.filter(item => progress.practice[item.id]?.answers || Object.keys(item.forms || {}).some(pronoun => progress.practice[`${item.id}:${pronoun}`]?.answers)).length;
  $("study-progress").textContent = `${viewed} просмотрено · ${practiced} тренировались · ${state.deck.length} всего`;
  $("study-list-quiz").classList.toggle("hidden", !state.listMode || !card);
  $("empty-state").classList.toggle("hidden", Boolean(card));
  $("word-list-panel").classList.toggle("hidden", !state.listMode || !card);
  $("flashcard").classList.toggle("hidden", !card || state.listMode); $("study-actions").classList.toggle("hidden", !card || state.listMode);
  $("list-toggle").textContent = state.listMode ? "Карточки" : "Показать все";
  $("list-toggle").setAttribute("aria-pressed", String(state.listMode));
  if (!card) return;
  if (state.listMode) { renderWordList(); return; }
  $("card-counter").textContent = `${state.index + 1} / ${state.deck.length}`;
  $("card-kind").textContent = card.group ? `${card.typeLabel} · ${card.group}` : card.typeLabel; $("card-front").textContent = card.greek; $("card-back").textContent = card.russian;
  $("card-back").classList.toggle("hidden", !state.revealed); $("card-hint").classList.toggle("hidden", state.revealed);
  $("card-note").textContent = card.note || ""; $("card-note").classList.toggle("hidden", !state.revealed || !card.note);
  $("favorite-button").textContent = progress.favorites.includes(card.id) ? "★" : "☆";
  const table = $("conjugation-table");
  table.innerHTML = card.forms ? Object.entries(card.forms).map(([pronoun, form], index) => `<div class="conjugation-row"><span>${pronoun}</span><strong>${form}</strong><button class="speak-form" type="button" data-form-index="${index}" aria-label="Произнести ${form}" title="Произнести ${form}">🔊</button></div>`).join("") : "";
  table.classList.toggle("hidden", !state.revealed || !card.forms);
}

function renderWordList() {
  const query = normalizedSearch(state.listQuery);
  const sorted = [...state.deck].sort((left, right) => state.listSort === "ru" ? left.russian.localeCompare(right.russian, "ru") : sortHead(left).localeCompare(sortHead(right), "el", { sensitivity: "base" }));
  const visible = sorted.filter(card => {
    if (!query) return true;
    const conjugation = card.type === "verbs" ? state.data.conjugations?.find(item => normalizedSearch(item.greek) === normalizedSearch(card.greek)) : null;
    return normalizedSearch(`${card.greek} ${card.russian} ${card.typeLabel} ${card.note || ""} ${Object.values(card.forms || conjugation?.forms || {}).join(" ")}`).includes(query);
  });
  const itemLabel = state.category === "conjugations" ? "глаголов" : "карточек";
  $("word-list-summary").textContent = query ? `Найдено: ${visible.length} из ${sorted.length}` : `${sorted.length} ${itemLabel} · по ${state.listSort === "ru" ? "русскому переводу" : "греческому алфавиту"}`;
  $("word-list-empty").classList.toggle("hidden", visible.length > 0);
  $("word-list").innerHTML = visible.map(card => {
    const favorite = progress.favorites.includes(card.id);
    const label = card.group ? `${card.typeLabel} · ${card.group}` : card.typeLabel;
    if (state.category === "conjugations") {
      const expanded = state.expandedConjugations.has(card.id);
      const special = IRREGULAR_VERBS.has(card.id);
      const forms = Object.entries(card.forms || {}).map(([pronoun, form], index) => {
        const russian = card.russianForms?.[pronoun] || "";
        return `<div class="conjugation-list-form"><span>${escapeHTML(pronoun)}</span><strong>${escapeHTML(form)}</strong><small>${escapeHTML(russian)}</small><button class="speak-form" type="button" data-list-form-card="${escapeHTML(card.id)}" data-list-form-index="${index}" aria-label="Произнести ${escapeHTML(form)}">🔊</button></div>`;
      }).join("");
      return `<article class="word-list-row conjugation-list-item${expanded ? " expanded" : ""}"><button class="conjugation-list-toggle" type="button" data-conjugation-toggle="${escapeHTML(card.id)}" aria-expanded="${expanded}"><span class="word-list-copy"><span class="word-list-greek"><strong>${escapeHTML(card.greek)}</strong><span>${escapeHTML(card.group || "")}</span>${special ? '<span class="irregular-badge">особый</span>' : ""}</span><span class="conjugation-list-translation">${escapeHTML(card.russian)}</span></span><span class="conjugation-chevron" aria-hidden="true">⌄</span></button><div class="conjugation-list-forms"${expanded ? "" : " hidden"}>${forms}</div></article>`;
    }
    return `<article class="word-list-row"><div class="word-list-copy"><div class="word-list-greek"><strong>${escapeHTML(card.greek)}</strong><span>${escapeHTML(label)}</span></div><p>${escapeHTML(card.russian)}</p>${card.note ? `<small class="word-list-note">${escapeHTML(card.note)}</small>` : ""}</div><div class="word-list-actions"><button class="word-list-speak" type="button" data-list-speak="${escapeHTML(card.id)}" aria-label="Произнести ${escapeHTML(card.greek)}">🔊</button><button class="word-list-favorite" type="button" data-list-favorite="${escapeHTML(card.id)}" aria-label="${favorite ? "Убрать из избранного" : "Добавить в избранное"}">${favorite ? "★" : "☆"}</button></div></article>`;
  }).join("");
}

function toggleFavorite(id) {
  progress.favorites = progress.favorites.includes(id) ? progress.favorites.filter(item => item !== id) : [...progress.favorites, id];
  saveProgress();
  if (state.category === "favorites") state.deck = getDeck("favorites");
  renderCard(); renderDashboard();
}

function move(step) { if (!state.deck.length) return; stopSpeaking(); state.index = (state.index + step + state.deck.length) % state.deck.length; state.revealed = false; renderCard(); }
function reveal() {
  const card = state.deck[state.index]; if (!card) return;
  state.revealed = true;
  if (!progress.learned.includes(card.id)) progress.learned.push(card.id);
  saveProgress(); renderCard(); renderDashboard();
}

function quizKey(item) { return item.pronoun ? `${item.card.id}:${item.pronoun}` : item.card.id; }
function quizItems(cards) { return state.category === "conjugations" ? cards.flatMap(card => Object.entries(card.forms || {}).map(([pronoun, form]) => ({ card, pronoun, form, russian: card.russianForms?.[pronoun] })).filter(item => item.russian)) : cards.map(card => ({ card })); }
function sameQuizKind(left, right) { return left.card.type === right.card.type && (left.card.type !== "words" && left.card.type !== "professions" || left.card.partOfSpeech === right.card.partOfSpeech); }
function quizCandidates(item, pool, direction) {
  const label = candidate => candidate.pronoun ? (direction === "ru-el" ? candidate.form : candidate.russian) : candidate.card[direction === "ru-el" ? "greek" : "russian"];
  const own = normalizedSearch(label(item));
  const seen = new Set([own]);
  return shuffle(pool.filter(candidate => {
    if (quizKey(candidate) === quizKey(item) || !sameQuizKind(item, candidate) || translationsOverlap(item.card.russian, candidate.card.russian) || linkedMeanings(item.card, candidate.card)) return false;
    const value = normalizedSearch(label(candidate));
    if (!value || seen.has(value)) return false;
    seen.add(value); return true;
  }));
}
function quizDirectionAt(index) { return state.quizMode === "mixed" ? (index % 2 ? "ru-el" : "el-ru") : state.quizMode; }
function eligibleQuizItems(pool) { return pool.filter(item => quizCandidates(item, pool, "el-ru").length && quizCandidates(item, pool, "ru-el").length); }
function openQuizSetup() {
  stopSpeaking(); state.quizScope = quizItems(state.deck);
  $("quiz-mode").value = localStorage.getItem("greek-a1-quiz-direction") || "el-ru";
  const eligible = eligibleQuizItems(state.quizScope).length;
  $("quiz-setup-summary").textContent = `${eligible} доступных вопросов из ${state.quizScope.length}; ${state.quizScope.length - eligible} исключено: нет однозначно неверного варианта. Поиск в списке на тест не влияет.`;
  showScreen("quiz-setup");
}
function saveQuizSession() { localStorage.setItem("greek-a1-active-quiz", JSON.stringify(state.session)); renderDashboard(); }
function startQuiz(items, scope = state.quizScope, previousSeen = []) {
  const limit = $("quiz-limit").value === "all" ? items.length : Number($("quiz-limit").value);
  const pool = eligibleQuizItems(scope);
  const allowed = new Set(pool.map(quizKey));
  const selected = shuffle(items.filter(item => allowed.has(quizKey(item)))).slice(0, limit);
  const skipped = items.length - items.filter(item => allowed.has(quizKey(item))).length;
  if (!selected.length) { $("quiz-setup-summary").textContent = `Нет однозначных вопросов. Исключено: ${skipped}. Объедините несколько подборок.`; showScreen("quiz-setup"); return; }
  state.quizMode = $("quiz-mode").value;
  document.querySelector("#quiz .back-button").dataset.go = "study";
  localStorage.setItem("greek-a1-quiz-direction", state.quizMode);
  state.session = { keys: selected.map(quizKey), scopeKeys: scope.map(quizKey), seen: previousSeen, answers: [], index: 0, mode: state.quizMode, category: state.category, skipped };
  state.quizDeck = selected; state.quizIndex = 0; state.quizScope = scope; saveQuizSession(); showScreen("quiz"); renderQuestion();
}
function beginQuiz() {
  const pool = state.quizScope;
  const choice = $("quiz-pool").value;
  const items = pool.filter(item => choice === "all" || (choice === "mistakes" ? progress.practice[quizKey(item)]?.lastCorrect === false : !progress.practice[quizKey(item)]?.answers));
  startQuiz(items, pool);
}
function restoreQuiz() {
  let savedSession; try { savedSession = JSON.parse(localStorage.getItem("greek-a1-active-quiz")); } catch { return; }
  if (!savedSession?.keys?.length) return;
  const source = savedSession.category === "conjugations" ? allCards().filter(card => card.type === "conjugations").flatMap(card => Object.entries(card.forms || {}).map(([pronoun, form]) => ({ card, pronoun, form, russian: card.russianForms?.[pronoun] })).filter(item => item.russian)) : allCards().map(card => ({ card }));
  const byKey = new Map(source.map(item => [quizKey(item), item]));
  const deck = savedSession.keys.map(key => byKey.get(key));
  if (deck.some(item => !item)) { localStorage.removeItem("greek-a1-active-quiz"); alert("Словарь обновился, часть вопросов исчезла. Выберите тему заново."); renderDashboard(); return; }
  state.session = savedSession; state.quizDeck = deck; state.quizScope = savedSession.scopeKeys.map(key => byKey.get(key)).filter(Boolean); state.quizMode = savedSession.mode; state.quizIndex = savedSession.index;
  state.category = savedSession.category; document.querySelector("#quiz .back-button").dataset.go = "dashboard"; showScreen("quiz"); renderQuestion();
}
function renderQuestion() {
  const item = state.quizDeck[state.quizIndex]; if (!item) return;
  const direction = item.pronoun ? "el-ru" : quizDirectionAt(state.quizIndex);
  const pool = eligibleQuizItems(state.quizScope);
  const distractors = quizCandidates(item, pool, direction).slice(0, 3);
  const answer = item.pronoun ? item.russian : item.card[direction === "ru-el" ? "greek" : "russian"];
  const prompt = item.pronoun ? item.form : item.card[direction === "ru-el" ? "russian" : "greek"];
  state.quizAnswer = answer; state.quizSpokenText = direction === "ru-el" ? "" : prompt;
  $("quiz-direction").classList.add("hidden");
  $("quiz-title").textContent = direction === "ru-el" ? "Выберите слово по-гречески" : "Выберите перевод";
  $("quiz-question").textContent = prompt;
  $("quiz-speak-button").classList.toggle("hidden", !state.quizSpokenText);
  $("quiz-counter").textContent = `${state.quizIndex + 1} / ${state.quizDeck.length}`;
  const optionLabel = candidate => candidate.pronoun ? candidate.russian : candidate.card[direction === "ru-el" ? "greek" : "russian"];
  $("quiz-options").innerHTML = shuffle([item, ...distractors]).map(candidate => `<button class="quiz-option" data-correct="${quizKey(candidate) === quizKey(item)}">${escapeHTML(optionLabel(candidate))}</button>`).join("");
  state.answered = Boolean(state.session.answers[state.quizIndex]);
  $("quiz-next").classList.toggle("hidden", !state.answered);
  $("quiz-feedback").textContent = state.answered ? (state.session.answers[state.quizIndex].correct ? "Верно!" : `Правильный ответ: ${answer}`) : "";
  if (state.answered) document.querySelectorAll(".quiz-option").forEach(option => { option.disabled = true; if (option.dataset.correct === "true") option.classList.add("correct"); });
}
function answerQuiz(button) {
  if (state.answered) return;
  const item = state.quizDeck[state.quizIndex], key = quizKey(item), correct = button.dataset.correct === "true";
  state.answered = true;
  button.classList.add(correct ? "correct" : "wrong");
  document.querySelectorAll(".quiz-option").forEach(option => { option.disabled = true; if (option.dataset.correct === "true") option.classList.add("correct"); });
  const previous = progress.practice[key] || { answers: 0, correct: 0 };
  progress.practice[key] = { answers: previous.answers + 1, correct: previous.correct + Number(correct), lastCorrect: correct, lastAt: new Date().toISOString() };
  if (correct) progress.mistakes = progress.mistakes.filter(id => id !== item.card.id); else if (!progress.mistakes.includes(item.card.id)) progress.mistakes.push(item.card.id);
  state.session.answers[state.quizIndex] = { key, correct }; state.session.seen = [...new Set([...state.session.seen, key])];
  saveProgress(); saveQuizSession();
  $("quiz-feedback").textContent = correct ? "Верно! Μπράβο!" : `Правильный ответ: ${state.quizAnswer}`;
  $("quiz-next").classList.remove("hidden"); renderDashboard();
}
function finishQuiz() {
  const answers = state.session.answers, correct = answers.filter(answer => answer.correct).length;
  $("quiz-result-score").textContent = `${correct} из ${answers.length} · ${Math.round(correct / answers.length * 100)}%${state.session.skipped ? ` · ${state.session.skipped} исключено как неоднозначные` : ""}`;
  $("quiz-result-errors").innerHTML = answers.filter(answer => !answer.correct).map(answer => {
    const item = state.quizDeck.find(candidate => quizKey(candidate) === answer.key);
    return `<article class="result-error"><strong>${escapeHTML(item.card.greek)}</strong> — ${escapeHTML(item.card.russian)}${item.card.note ? `<p>${escapeHTML(item.card.note)}</p>` : ""}</article>`;
  }).join("") || "Ошибок нет!";
  $("quiz-retry").classList.toggle("hidden", correct === answers.length);
  $("quiz-more").classList.toggle("hidden", !eligibleQuizItems(state.quizScope).some(item => !state.session.seen.includes(quizKey(item))));
  localStorage.removeItem("greek-a1-active-quiz"); renderDashboard(); showScreen("quiz-result");
}

document.addEventListener("click", event => {
  const category = event.target.closest("[data-category]")?.dataset.category; if (category) category === "grammar" ? showScreen("grammar") : category === "words" ? renderWordTopics() : openCategory(category);
  const wordTopic = event.target.closest("[data-word-topic]")?.dataset.wordTopic; if (wordTopic) openWordTopic(wordTopic);
  const collection = event.target.closest("[data-collection]")?.dataset.collection;
  if (collection) { state.selectedCollections.has(collection) ? state.selectedCollections.delete(collection) : state.selectedCollections.add(collection); renderWordTopics(); }
  const situation = event.target.closest("[data-situation]")?.dataset.situation;
  if (situation) { state.selectedSituations.has(situation) ? state.selectedSituations.delete(situation) : state.selectedSituations.add(situation); renderSituations(); }
  const situationType = event.target.closest("[data-situation-type]")?.dataset.situationType;
  if (situationType) { state.situationType = situationType; state.deck = situationDeck(); state.index = 0; state.revealed = false; renderSituationFilter(); renderCard(); }
  const wordPos = event.target.closest("[data-word-pos]")?.dataset.wordPos;
  if (wordPos) {
    state.wordPartOfSpeech = wordPos; state.deck = getSelectedWordDeck(wordPos); state.index = 0; state.revealed = false; state.listQuery = ""; $("word-list-search").value = ""; renderPartOfSpeechFilter(); renderCard();
  }
  const go = event.target.closest("[data-go]")?.dataset.go; if (go) showScreen(go);
  if (event.target.closest(".quiz-option")) answerQuiz(event.target.closest(".quiz-option"));
  const formButton = event.target.closest(".speak-form");
  if (formButton) {
    const forms = Object.values(state.deck[state.index]?.forms || {});
    const form = forms[Number(formButton.dataset.formIndex)];
    if (form) speakGreek(form);
  }
  const grammarSpeak = event.target.closest("[data-speak]");
  if (grammarSpeak) speakGreek(grammarSpeak.dataset.speak);
  const grammarImage = event.target.closest("#grammar img");
  if (grammarImage) openImageLightbox(grammarImage);
  const listSpeak = event.target.closest("[data-list-speak]");
  if (listSpeak) {
    const card = state.deck.find(item => item.id === listSpeak.dataset.listSpeak);
    if (card) speakGreek(card.greek);
  }
  const listFavorite = event.target.closest("[data-list-favorite]");
  if (listFavorite) toggleFavorite(listFavorite.dataset.listFavorite);
  const conjugationToggle = event.target.closest("[data-conjugation-toggle]");
  if (conjugationToggle) {
    const id = conjugationToggle.dataset.conjugationToggle;
    state.expandedConjugations.has(id) ? state.expandedConjugations.delete(id) : state.expandedConjugations.add(id);
    renderWordList();
  }
  const listFormButton = event.target.closest("[data-list-form-card]");
  if (listFormButton) {
    const card = state.deck.find(item => item.id === listFormButton.dataset.listFormCard);
    const form = Object.values(card?.forms || {})[Number(listFormButton.dataset.listFormIndex)];
    if (form) speakGreek(form);
  }
});
$("flashcard").addEventListener("click", event => { if (!event.target.closest("button")) reveal(); });
$("flashcard").addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reveal(); } });
$("favorite-button").addEventListener("click", () => { const id = state.deck[state.index]?.id; if (id) toggleFavorite(id); });
$("speak-button").addEventListener("click", () => { const text = state.deck[state.index]?.greek; if (text) speakGreek(text); });
$("quiz-speak-button").addEventListener("click", () => { if (state.quizSpokenText) speakGreek(state.quizSpokenText); });
$("previous-button").addEventListener("click", () => move(-1)); $("next-button").addEventListener("click", () => move(1));
$("quiz-button").addEventListener("click", openQuizSetup);
$("study-list-quiz").addEventListener("click", openQuizSetup);
$("quiz-start").addEventListener("click", beginQuiz);
$("quiz-next").addEventListener("click", () => { stopSpeaking(); if (state.quizIndex + 1 >= state.quizDeck.length) finishQuiz(); else { state.quizIndex += 1; state.session.index = state.quizIndex; saveQuizSession(); renderQuestion(); } });
$("quiz-retry").addEventListener("click", () => startQuiz(state.quizDeck.filter(item => state.session.answers.some(answer => answer.key === quizKey(item) && !answer.correct)), state.quizScope, state.session.seen));
$("quiz-more").addEventListener("click", () => { const prior = state.session.seen; const seen = new Set(prior); $("quiz-limit").value = "10"; startQuiz(state.quizScope.filter(item => !seen.has(quizKey(item))), state.quizScope, prior); });
$("quiz-topics").addEventListener("click", () => state.category === "words" ? renderWordTopics() : showScreen("dashboard"));
$("resume-quiz").addEventListener("click", restoreQuiz);
$("open-selected-collections").addEventListener("click", () => openSelectedCollections());
$("open-situations").addEventListener("click", renderSituations);
$("open-selected-situations").addEventListener("click", openSelectedSituations);
$("collection-search").addEventListener("input", renderWordTopics);
$("word-list-sort").addEventListener("change", event => { state.listSort = event.target.value; renderWordList(); });
$("list-toggle").addEventListener("click", () => { state.listMode = !state.listMode; stopSpeaking(); renderCard(); });
$("word-list-search").addEventListener("input", event => { state.listQuery = event.target.value.trim(); renderWordList(); });
$("grammar-search").addEventListener("input", event => {
  const query = event.target.value.trim().toLocaleLowerCase("ru");
  let visible = 0;
  document.querySelectorAll("[data-grammar-card]").forEach(card => {
    const matches = !query || card.textContent.toLocaleLowerCase("ru").includes(query);
    card.classList.toggle("hidden", !matches);
    if (matches) visible += 1;
  });
  $("grammar-no-results").classList.toggle("hidden", visible > 0);
});

let lightboxReturnFocus;
function openImageLightbox(source) {
  lightboxReturnFocus = source;
  $("image-lightbox-image").src = source.currentSrc || source.src;
  $("image-lightbox-image").alt = source.alt;
  $("image-lightbox-caption").textContent = source.closest("figure")?.querySelector("figcaption")?.textContent || source.alt;
  $("image-lightbox").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  $("image-lightbox-close").focus();
}
function closeImageLightbox() {
  $("image-lightbox").classList.add("hidden");
  $("image-lightbox-image").removeAttribute("src");
  document.body.style.overflow = "";
  lightboxReturnFocus?.focus();
}
$("image-lightbox-close").addEventListener("click", closeImageLightbox);
$("image-lightbox").addEventListener("click", event => { if (event.target === $("image-lightbox")) closeImageLightbox(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && !$("image-lightbox").classList.contains("hidden")) closeImageLightbox(); });

let installPrompt;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; $("install-button").classList.remove("hidden"); });
$("install-button").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("install-button").classList.add("hidden"); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));

Promise.all([...SOURCES.map(async ([key,,, path]) => [key, await fetch(path).then(response => { if (!response.ok) throw new Error(path); return response.json(); })]), ...[["collections", "./data/collections.json"], ["aliases", "./data/id-aliases.json"], ["situations", "./data/situations.json"]].map(async ([key, path]) => [key, await fetch(path).then(response => { if (!response.ok) throw new Error(path); return response.json(); })])]).then(entries => { const data = Object.fromEntries(entries); state.collections = data.collections; state.aliases = data.aliases; state.situations = data.situations; delete data.collections; delete data.aliases; delete data.situations; state.data = data; migrateProgress(); renderDashboard(); }).catch(() => { $("category-grid").innerHTML = '<div class="empty">Не удалось загрузить словарь. Обновите страницу.</div>'; });
