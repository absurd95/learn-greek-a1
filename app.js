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
const state = { data: {}, collections: [], situations: [], verbSets: [], aliases: {}, deck: [], quizDeck: [], category: "new", wordTopic: null, selectedCollections: new Set(), selectedSituations: new Set(), situationType: "all", wordPartOfSpeech: "all", index: 0, revealed: false, listMode: false, listQuery: "", listSort: "el", expandedConjugations: new Set(), quizDirection: localStorage.getItem("greek-a1-quiz-direction") || "el-ru", quizMode: "el-ru", quizIndex: 0, quizAnswer: null, quizSpokenText: "", answered: false, session: null, quizScope: [] };
state.selectedCards = new Set(); state.selectingCards = false; state.quizCandidatePool = [];
function resetCardSelection() { state.selectedCards.clear(); state.selectingCards = false; }
const IRREGULAR_VERBS = new Set(["conjugation-020", "conjugation-024", "conjugation-025", "conjugation-039", "conjugation-047", "conjugation-048", "conjugation-049", "conjugation-050", "conjugation-051"]);
const saved = JSON.parse(localStorage.getItem("greek-a1-progress") || "{}");
const progress = { favorites: saved.favorites || [], mistakes: saved.mistakes || [], learned: saved.learned || [], practice: saved.practice || {}, games: { articles: saved.games?.articles || {}, stress: saved.games?.stress || {} } };
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

function isConjugationCategory(category = state.category) { return category === "conjugations" || category === "passive-a2-forms"; }
function verbSetDeck(forms = false) {
  const set = state.verbSets.find(item => item.id === "passive-a2");
  const verbs = (state.data.verbs || []).filter(card => set?.verbIds.includes(card.id));
  const names = new Set(verbs.map(card => normalizedSearch(card.greek)));
  return allCards().filter(card => forms ? card.type === "conjugations" && names.has(normalizedSearch(card.greek)) : card.type === "verbs" && set?.verbIds.includes(card.id));
}
function getDeck(category) {
  if (category === "passive-a2" || category === "passive-a2-forms") return verbSetDeck(category.endsWith("-forms"));
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
    ["passive-a2", "Глаголы на -μαι · A2", "-μαι", getDeck("passive-a2").length],
    ...SOURCES.map(([key, label, symbol]) => [key, label, symbol, key === "words" ? themedWordCards().length : getDeck(key).length]),
    ["game-articles", "Артикли и род", "ο η το", "2 режима"],
    ["game-stress", "Ударение", "ά", "игра"],
    ["grammar", "Грамматика", "§", "16 тем"]
  ];
  $("category-grid").innerHTML = sections.map(([key, label, symbol, count]) => `<button class="category" data-category="${key}"><span class="symbol">${symbol}</span><strong>${label}</strong><small>${typeof count === "number" ? `${count} карточек` : count}</small></button>`).join("");
  $("resume-quiz").classList.toggle("hidden", !localStorage.getItem("greek-a1-active-quiz"));
  $("resume-game").classList.toggle("hidden", !localStorage.getItem("greek-a1-active-game"));
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
  resetCardSelection();
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
  resetCardSelection();
  state.category = "situations"; state.wordTopic = null; state.situationType = "all"; state.deck = situationDeck(); state.index = 0; state.revealed = false; state.listMode = false; state.listQuery = "";
  $("word-list-search").value = "";
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
  resetCardSelection();
  state.category = category; state.wordTopic = null; state.selectedCollections.clear(); state.wordPartOfSpeech = "all"; state.deck = getDeck(category); state.index = 0; state.revealed = false; state.listMode = category === "dictionary"; state.listQuery = ""; state.expandedConjugations.clear();
  const title = { new: "Новые", all: "Все слова", dictionary: "Словарь", favorites: "Избранное", mistakes: "Ошибки", words: "Слова", verbs: "Глаголы", adverbs: "Наречия", phrases: "Фразы", professions: "Профессии", nationalities: "Национальности", months: "Месяцы", weekdays: "Дни недели", conjugations: "Спряжения", "passive-a2": "Глаголы на -μαι · A2", "passive-a2-forms": "Глаголы на -μαι · A2" }[category];
  $("study-title").textContent = title; $("study-kicker").textContent = isConjugationCategory(category) ? "Таблицы форм" : category === "dictionary" ? "Быстрый поиск" : "Карточки";
  $("study-back-button").dataset.go = "dashboard"; $("word-pos-filter").classList.add("hidden"); $("situation-type-filter").classList.add("hidden");
  $("word-list-search").value = ""; showScreen("study"); renderCard();
}

function renderCard() {
  const passiveSet = state.category === "passive-a2" || state.category === "passive-a2-forms";
  $("verb-set-mode").classList.toggle("hidden", !passiveSet);
  $("verb-set-description").classList.toggle("hidden", !passiveSet);
  $("verb-set-description").textContent = passiveSet ? state.verbSets.find(item => item.id === "passive-a2")?.description || "" : "";
  $("verb-set-mode").querySelectorAll("button").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.category === state.category)));
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

function visibleWordList() {
  const query = normalizedSearch(state.listQuery);
  const sorted = [...state.deck].sort((left, right) => state.listSort === "ru" ? left.russian.localeCompare(right.russian, "ru") : sortHead(left).localeCompare(sortHead(right), "el", { sensitivity: "base" }));
  const visible = sorted.filter(card => {
    if (!query) return true;
    const conjugation = card.type === "verbs" ? state.data.conjugations?.find(item => normalizedSearch(item.greek) === normalizedSearch(card.greek)) : null;
    return normalizedSearch(`${card.greek} ${card.russian} ${card.typeLabel} ${card.note || ""} ${Object.values(card.forms || conjugation?.forms || {}).join(" ")}`).includes(query);
  });
  return { query, sorted, visible };
}
function renderWordList() {
  const { query, sorted, visible } = visibleWordList();
  renderSelectionControls();
  const itemLabel = isConjugationCategory() ? "глаголов" : "карточек";
  $("word-list-summary").textContent = query ? `Найдено: ${visible.length} из ${sorted.length}` : `${sorted.length} ${itemLabel} · по ${state.listSort === "ru" ? "русскому переводу" : "греческому алфавиту"}`;
  $("word-list-empty").classList.toggle("hidden", visible.length > 0);
  $("word-list").innerHTML = visible.map(card => {
    const favorite = progress.favorites.includes(card.id);
    const select = state.selectingCards ? `<label class="card-selection"><input type="checkbox" data-select-card="${escapeHTML(card.id)}" ${state.selectedCards.has(card.id) ? "checked" : ""} aria-label="Выбрать ${escapeHTML(card.greek)}"><span>В тест</span></label>` : "";
    const label = card.group ? `${card.typeLabel} · ${card.group}` : card.typeLabel;
    if (isConjugationCategory()) {
      const expanded = state.expandedConjugations.has(card.id);
      const special = IRREGULAR_VERBS.has(card.id) || state.category === "passive-a2-forms" && /Особая модель|Особые формы/.test(card.note || "");
      const forms = Object.entries(card.forms || {}).map(([pronoun, form], index) => {
        const russian = card.russianForms?.[pronoun] || "";
        return `<div class="conjugation-list-form"><span>${escapeHTML(pronoun)}</span><strong>${escapeHTML(form)}</strong><small>${escapeHTML(russian)}</small><button class="speak-form" type="button" data-list-form-card="${escapeHTML(card.id)}" data-list-form-index="${index}" aria-label="Произнести ${escapeHTML(form)}">🔊</button></div>`;
      }).join("");
      return `<article class="word-list-row conjugation-list-item${expanded ? " expanded" : ""}">${select}<button class="conjugation-list-toggle" type="button" data-conjugation-toggle="${escapeHTML(card.id)}" aria-expanded="${expanded}"><span class="word-list-copy"><span class="word-list-greek"><strong>${escapeHTML(card.greek)}</strong><span>${escapeHTML(card.group || "")}</span>${special ? '<span class="irregular-badge">особый</span>' : ""}</span><span class="conjugation-list-translation">${escapeHTML(card.russian)}</span></span><span class="conjugation-chevron" aria-hidden="true">⌄</span></button><div class="conjugation-list-forms"${expanded ? "" : " hidden"}>${card.note ? `<p class="word-list-note">${escapeHTML(card.note)}</p>` : ""}${forms}<button class="word-list-favorite" type="button" data-list-favorite="${escapeHTML(card.id)}" aria-label="${favorite ? "Убрать из избранного" : "Добавить в избранное"}">${favorite ? "★" : "☆"}</button></div></article>`;
    }
    return `<article class="word-list-row">${select}<div class="word-list-copy"><div class="word-list-greek"><strong>${escapeHTML(card.greek)}</strong><span>${escapeHTML(label)}</span></div><p>${escapeHTML(card.russian)}</p>${card.note ? `<small class="word-list-note">${escapeHTML(card.note)}</small>` : ""}</div><div class="word-list-actions"><button class="word-list-speak" type="button" data-list-speak="${escapeHTML(card.id)}" aria-label="Произнести ${escapeHTML(card.greek)}">🔊</button><button class="word-list-favorite" type="button" data-list-favorite="${escapeHTML(card.id)}" aria-label="${favorite ? "Убрать из избранного" : "Добавить в избранное"}">${favorite ? "★" : "☆"}</button></div></article>`;
  }).join("");
}
function renderSelectionControls() {
  $("selection-toggle").setAttribute("aria-pressed", String(state.selectingCards));
  for (const id of ["selection-all", "selection-clear", "selection-quiz"]) $(id).classList.toggle("hidden", !state.selectingCards);
  $("selection-quiz").disabled = !state.selectedCards.size;
  $("selection-summary").textContent = state.selectingCards ? `Выбрано: ${state.selectedCards.size}` : "";
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
function quizItems(cards) { return isConjugationCategory() ? cards.flatMap(card => Object.entries(card.forms || {}).map(([pronoun, form]) => ({ card, pronoun, form, russian: card.russianForms?.[pronoun] })).filter(item => item.russian)) : cards.map(card => ({ card })); }
function sameQuizKind(left, right) { return left.card.type === right.card.type && (left.card.type !== "words" && left.card.type !== "professions" || left.card.partOfSpeech === right.card.partOfSpeech && (left.card.partOfSpeech !== "numeral" || left.card.numeralKind === right.card.numeralKind)); }
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
function eligibleQuizItems(pool, candidates = pool) { return pool.filter(item => quizCandidates(item, candidates, "el-ru").length && quizCandidates(item, candidates, "ru-el").length); }
function openQuizSetup(selectedOnly = false) {
  stopSpeaking(); state.quizCandidatePool = quizItems(state.deck);
  state.quizScope = selectedOnly ? state.quizCandidatePool.filter(item => state.selectedCards.has(item.card.id)) : state.quizCandidatePool;
  $("quiz-mode").value = localStorage.getItem("greek-a1-quiz-direction") || "el-ru";
  const eligible = eligibleQuizItems(state.quizScope, state.quizCandidatePool).length;
  $("quiz-setup-summary").textContent = `${selectedOnly ? "Выбранные карточки. " : ""}${eligible} доступных вопросов из ${state.quizScope.length}; ${state.quizScope.length - eligible} исключено: нет однозначно неверного варианта в разделе. Поиск в списке на тест не влияет.`;
  showScreen("quiz-setup");
}
function saveQuizSession() { localStorage.setItem("greek-a1-active-quiz", JSON.stringify(state.session)); renderDashboard(); }
function startQuiz(items, scope = state.quizScope, previousSeen = []) {
  const limit = $("quiz-limit").value === "all" ? items.length : Number($("quiz-limit").value);
  const candidates = state.quizCandidatePool.length ? state.quizCandidatePool : scope;
  const pool = eligibleQuizItems(scope, candidates);
  const allowed = new Set(pool.map(quizKey));
  const selected = shuffle(items.filter(item => allowed.has(quizKey(item)))).slice(0, limit);
  const skipped = items.length - items.filter(item => allowed.has(quizKey(item))).length;
  if (!selected.length) { $("quiz-setup-summary").textContent = items.length ? `Нет однозначных вопросов. Исключено: ${skipped}. Расширьте раздел или подборку.` : "Нет карточек для выбранного фильтра. Выберите другой материал или отметьте больше слов."; showScreen("quiz-setup"); return; }
  state.quizMode = $("quiz-mode").value;
  document.querySelector("#quiz .back-button").dataset.go = "study";
  localStorage.setItem("greek-a1-quiz-direction", state.quizMode);
  state.session = { keys: selected.map(quizKey), scopeKeys: scope.map(quizKey), candidateKeys: candidates.map(quizKey), seen: previousSeen, answers: [], index: 0, mode: state.quizMode, category: state.category, skipped };
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
  const source = isConjugationCategory(savedSession.category) ? allCards().filter(card => card.type === "conjugations").flatMap(card => Object.entries(card.forms || {}).map(([pronoun, form]) => ({ card, pronoun, form, russian: card.russianForms?.[pronoun] })).filter(item => item.russian)) : allCards().map(card => ({ card }));
  const byKey = new Map(source.map(item => [quizKey(item), item]));
  const deck = savedSession.keys.map(key => byKey.get(key));
  if (deck.some(item => !item)) { localStorage.removeItem("greek-a1-active-quiz"); alert("Словарь обновился, часть вопросов исчезла. Выберите тему заново."); renderDashboard(); return; }
  state.session = savedSession; state.quizDeck = deck; state.quizScope = savedSession.scopeKeys.map(key => byKey.get(key)).filter(Boolean); state.quizCandidatePool = (savedSession.candidateKeys || savedSession.scopeKeys).map(key => byKey.get(key)).filter(Boolean); state.quizMode = savedSession.mode; state.quizIndex = savedSession.index;
  state.category = savedSession.category; state.deck = [...new Map(state.quizScope.map(item => [item.card.id, item.card])).values()]; $("quiz-mode").value = savedSession.mode; document.querySelector("#quiz .back-button").dataset.go = "dashboard"; showScreen("quiz"); renderQuestion();
}
function renderQuestion() {
  const item = state.quizDeck[state.quizIndex]; if (!item) return;
  const direction = quizDirectionAt(state.quizIndex);
  const pool = state.quizCandidatePool.length ? state.quizCandidatePool : state.quizScope;
  const distractors = quizCandidates(item, pool, direction).slice(0, 3);
  const answer = item.pronoun ? (direction === "ru-el" ? item.form : item.russian) : item.card[direction === "ru-el" ? "greek" : "russian"];
  const prompt = item.pronoun ? (direction === "ru-el" ? item.russian : item.form) : item.card[direction === "ru-el" ? "russian" : "greek"];
  state.quizAnswer = answer; state.quizSpokenText = direction === "ru-el" ? "" : prompt;
  $("quiz-direction").classList.add("hidden");
  $("quiz-title").textContent = direction === "ru-el" ? "Выберите слово по-гречески" : "Выберите перевод";
  $("quiz-question").textContent = prompt;
  $("quiz-speak-button").classList.toggle("hidden", !state.quizSpokenText);
  $("quiz-counter").textContent = `${state.quizIndex + 1} / ${state.quizDeck.length}`;
  const optionLabel = candidate => candidate.pronoun ? (direction === "ru-el" ? candidate.form : candidate.russian) : candidate.card[direction === "ru-el" ? "greek" : "russian"];
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
    const greek = item.pronoun ? `${item.pronoun}: ${item.form}` : item.card.greek;
    const russian = item.pronoun ? item.russian : item.card.russian;
    return `<article class="result-error"><strong>${escapeHTML(greek)}</strong> — ${escapeHTML(russian)}${item.card.note ? `<p>${escapeHTML(item.card.note)}</p>` : ""}</article>`;
  }).join("") || "Ошибок нет!";
  $("quiz-retry").classList.toggle("hidden", correct === answers.length);
  $("quiz-more").classList.toggle("hidden", !eligibleQuizItems(state.quizScope, state.quizCandidatePool).some(item => !state.session.seen.includes(quizKey(item))));
  localStorage.removeItem("greek-a1-active-quiz"); renderDashboard(); showScreen("quiz-result");
}


let gameKind = "articles", gameSession = null, gamePool = [], gameSelection = new Set();
const GAME_STORAGE = "greek-a1-active-game";
const genderLabels = { masculine: "мужского", feminine: "женского", neuter: "среднего" };
const formLabels = { singular: "ед. число", plural: "мн. число", genitiveSingular: "родительный, ед. число", genitivePlural: "родительный, мн. число", lemma: "словарная форма" };
function readGameSettings() {
  return { kind: gameKind, mode: $("game-mode").value, number: $("game-number").value,
    target: $("game-target").value, type: $("game-type").value, material: $("game-material").value,
    limit: $("game-limit").value, includeCases: $("game-cases").checked,
    collectionIds: [...$("game-collections").querySelectorAll("input:checked")].map(input => input.value) };
}
function rawGamePool(settings) {
  return settings.kind === "articles" ? GreekGames.nounEntries(themedWordCards(), settings) : GreekGames.stressEntries(allCards(), settings);
}
function gameMetrics(kind = gameKind) { return progress.games[kind]; }
function gameSetupSummary() {
  const settings = readGameSettings();
  $("game-target-label").classList.toggle("hidden", settings.kind !== "articles" || settings.mode !== "board");
  $("game-limit-label").classList.toggle("hidden", settings.kind === "articles" && settings.mode === "board");
  const pool = GreekGames.filterPractice(rawGamePool(settings), settings, gameMetrics());
  let possible = pool.length > 0;
  if (settings.kind === "articles" && settings.mode === "board")
    possible = (settings.target === "rotate" ? GreekGames.genders : [settings.target]).some(target => GreekGames.buildBoard(pool, target));
  $("game-setup-summary").textContent = possible ? `${pool.length} доступных форм. ${settings.mode === "board" && settings.kind === "articles" ? "В раунде до 10 слов; нужны слова разных родов." : "Без повторов в пределах занятия."}` :
    "Нет подходящих заданий. Расширьте подборку, измените число или выберите весь материал.";
  $("game-start").disabled = !possible;
}
function openGameSetup(kind) {
  stopSpeaking(); gameKind = kind;
  let prior = {}; try { prior = JSON.parse(localStorage.getItem("greek-a1-game-settings-" + kind) || "{}"); } catch {}
  $("game-setup-title").textContent = kind === "articles" ? "Артикли и род" : "Ударение";
  $("game-article-options").classList.toggle("hidden", kind !== "articles");
  $("game-stress-options").classList.toggle("hidden", kind !== "stress");
  for (const [id, value] of Object.entries({ mode: prior.mode || "single", number: prior.number || "singular", target: prior.target || "rotate", type: prior.type || "all", material: prior.material || "all", limit: prior.limit || "10" })) $("game-" + id).value = value;
  $("game-cases").checked = Boolean(prior.includeCases);
  $("game-collections").innerHTML = state.collections.map(item => `<label><input type="checkbox" value="${escapeHTML(item.id)}"${prior.collectionIds?.includes(item.id) ? " checked" : ""}> ${escapeHTML(item.title)}</label>`).join("");
  $("game-instructions").textContent = kind === "articles" ?
    "Артикль в задании скрыт. Во множественном числе οι — общий артикль мужского и женского рода, τα — среднего. Слова общего рода без контекста исключены." :
    "Нажмите на гласную, над которой должен стоять знак ударения. Озвучивание и правильное написание появятся после ответа. В родительном ударение может измениться.";
  gameSetupSummary(); showScreen("game-setup");
}
function gameUnits(settings, pool, used = [], rotation = 0) {
  const usedKeys = new Set(used);
  if (settings.kind === "articles" && settings.mode === "board") {
    const targets = settings.target === "rotate" ? [...GreekGames.genders.slice(rotation % 3), ...GreekGames.genders.slice(0, rotation % 3)] : [settings.target];
    for (const target of targets) {
      const board = GreekGames.buildBoard(pool, target, used);
      if (board) return [{ target, keys: board.entries.map(entry => entry.key) }];
    }
    return [];
  }
  const remaining = GreekGames.shuffle(pool.filter(entry => !usedKeys.has(entry.key)));
  return remaining.slice(0, settings.limit === "all" ? remaining.length : Number(settings.limit)).map(entry => ({ keys: [entry.key] }));
}
function saveGame() { localStorage.setItem(GAME_STORAGE, JSON.stringify(gameSession)); renderDashboard(); }
function startGameUnits(settings, pool, units, used = [], rotation = 0) {
  if (!units.length) { openGameSetup(settings.kind); $("game-setup-summary").textContent = "Подходящие формы закончились. Выберите другую подборку или начните новое занятие."; return; }
  stopSpeaking(); gamePool = pool; gameKind = settings.kind; gameSelection.clear();
  gameSession = { version: 1, settings, scopeKeys: pool.map(entry => entry.key), units, index: 0, answers: [], used, rotation };
  saveGame(); renderGame();
}
function beginGame() {
  const settings = readGameSettings(), pool = GreekGames.filterPractice(rawGamePool(settings), settings, gameMetrics());
  localStorage.setItem("greek-a1-game-settings-" + gameKind, JSON.stringify(settings));
  startGameUnits(settings, pool, gameUnits(settings, pool));
}
function resumeGame() {
  let session; try { session = JSON.parse(localStorage.getItem(GAME_STORAGE)); } catch {}
  if (!session || session.version !== 1 || !["articles", "stress"].includes(session.settings?.kind) ||
      !Array.isArray(session.units) || !session.units.length || !Array.isArray(session.scopeKeys) ||
      !Array.isArray(session.answers) || !Number.isInteger(session.index) || session.index < 0 || session.index >= session.units.length) {
    localStorage.removeItem(GAME_STORAGE); renderDashboard(); return;
  }
  const available = rawGamePool(session.settings), byKey = new Map(available.map(entry => [entry.key, entry]));
  if (session.units.some(unit => !Array.isArray(unit.keys) || unit.keys.some(key => !byKey.has(key)))) {
    localStorage.removeItem(GAME_STORAGE); openGameSetup(session.settings.kind);
    $("game-setup-summary").textContent = "Словарь обновился, часть форм больше недоступна. Результаты сохранены; выберите новое занятие."; return;
  }
  gamePool = session.scopeKeys.map(key => byKey.get(key)).filter(Boolean);
  gameSession = session; gameKind = session.settings.kind; gameSelection = new Set(session.selected || []);
  renderGame();
}
function gameEntry(key) { return gamePool.find(entry => entry.key === key); }
function nounFeedback(entry) {
  const singular = entry.singular ? GreekGames.singularArticles[entry.gender] + " " + entry.singular : "";
  const plural = entry.plural ? (entry.gender === "neuter" ? "τα " : "οι ") + entry.plural : "";
  return [singular, plural].filter(Boolean).join(" → ") + " — " + entry.russian;
}
function renderGame() {
  const session = gameSession, unit = session.units[session.index], answer = session.answers[session.index];
  const board = session.settings.kind === "articles" && session.settings.mode === "board", stress = session.settings.kind === "stress";
  $("game-play-title").textContent = stress ? "Ударение" : "Артикли и род";
  $("game-counter").textContent = board ? `Раунд · ${unit.keys.length} слов` : `${session.index + 1} / ${session.units.length}`;
  $("game-board-check").classList.toggle("hidden", !board || Boolean(answer));
  $("game-next").classList.toggle("hidden", !answer); $("game-feedback").classList.toggle("hidden", !answer);
  $("game-audio").classList.toggle("hidden", !answer || board); $("game-feedback").innerHTML = "";
  if (board) {
    $("game-question").textContent = `Отметьте все слова ${genderLabels[unit.target]} рода`;
    $("game-context").textContent = "Отметьте нужные слова и нажмите «Проверить». Во множественном числе род нельзя определить по одному артиклю οι.";
    $("game-choices").className = "game-board";
    $("game-choices").innerHTML = unit.keys.map((key, index) => {
      const entry = gameEntry(key), row = answer?.rows.find(row => row.key === key);
      return `<button type="button" data-game-tile="${index}" aria-pressed="${answer ? row.selected : gameSelection.has(key)}"${answer ? " disabled" : ""} class="${row ? row.correct ? "correct" : "wrong" : ""}"><strong>${escapeHTML(entry.text)}</strong><small>${entry.number === "plural" ? "мн. число" : "ед. число"}</small>${row ? `<span>${row.correct ? "Верно" : row.expected ? "Пропущено" : "Лишнее"}</span>` : ""}</button>`;
    }).join("");
    if (answer) $("game-feedback").innerHTML = `<b>${answer.correct ? "Все слова отмечены верно!" : "Есть пропущенные или лишние слова."} ${answer.rows.filter(row => row.correct).length} из ${unit.keys.length} решений.</b>` +
      unit.keys.map(key => `<p>${escapeHTML(nounFeedback(gameEntry(key)))}</p>`).join("");
  } else {
    const entry = gameEntry(unit.keys[0]);
    $("game-context").textContent = stress ? formLabels[entry.formName] || "словарная форма" : `${entry.number === "plural" ? "Множественное" : "Единственное"} число. Выберите артикль.`;
    $("game-question").textContent = stress ? "Где поставить ударение?" : entry.text;
    $("game-choices").className = stress ? "stress-word" : "game-options";
    if (stress) $("game-choices").innerHTML = Array.from(entry.plain).map((letter, index) => entry.vowelIndices.includes(index) ?
        `<button type="button" data-game-stress="${index}" aria-label="Буква ${escapeHTML(letter)}, позиция ${index + 1}"${answer ? " disabled" : ""} class="${answer && entry.acceptedIndices.includes(index) ? "correct" : answer && answer.choice === index ? "wrong" : ""}">${escapeHTML(letter)}</button>` :
        `<span>${escapeHTML(letter)}</span>`).join("");
    else {
      const options = entry.number === "plural" ? ["οι", "τα"] : ["ο", "η", "το"];
      $("game-choices").innerHTML = options.map(option => `<button type="button" data-game-article="${option}"${answer ? " disabled" : ""} class="${answer && option === GreekGames.article(entry) ? "correct" : answer && option === answer.choice ? "wrong" : ""}">${option}</button>`).join("");
    }
    if (answer) {
      const spelling = stress ? entry.spellings.join(" / ") : nounFeedback(entry);
      let explanation = "";
      if (stress) {
        const letters = Array.from(entry.text), index = entry.stressIndex;
        const pair = GreekGames.stripStress((letters[index - 1] || "") + letters[index]).toLowerCase();
        if (["αι", "ει", "οι", "υι", "ου", "αυ", "ευ"].includes(pair)) explanation = `В сочетании ${pair} знак ударения стоит над второй буквой.`;
      }
      $("game-feedback").innerHTML = `<b>${answer.correct ? "Верно!" : "Правильный ответ:"}</b><p class="game-correct-word">${escapeHTML(spelling)}</p>${stress ? `<p>${escapeHTML(entry.russian)}</p>` : ""}${explanation ? `<p>${escapeHTML(explanation)}</p>` : ""}${entry.note ? `<p>${escapeHTML(entry.note)}</p>` : ""}`;
    }
  }
  showScreen("game-play");
}
function answerGame(choice) {
  if (!gameSession || gameSession.answers[gameSession.index]) return;
  const unit = gameSession.units[gameSession.index], settings = gameSession.settings;
  let answer;
  if (settings.kind === "articles" && settings.mode === "board") {
    const rows = GreekGames.gradeBoard({ target: unit.target, entries: unit.keys.map(gameEntry) }, [...gameSelection]);
    answer = { correct: rows.every(row => row.correct), rows: rows.map(row => ({ key: row.entry.key, correct: row.correct, selected: row.selected, expected: row.expected })) };
    for (const row of rows) GreekGames.updateMetric(gameMetrics(), GreekGames.metricKey(row.entry, settings, unit.target), row.correct);
  } else {
    const entry = gameEntry(unit.keys[0]), correct = settings.kind === "stress" ? entry.acceptedIndices.includes(Number(choice)) : choice === GreekGames.article(entry);
    answer = { correct, choice: settings.kind === "stress" ? Number(choice) : choice };
    GreekGames.updateMetric(gameMetrics(), GreekGames.metricKey(entry, settings), correct);
  }
  gameSession.answers[gameSession.index] = answer; delete gameSession.selected;
  saveProgress(); saveGame(); renderGame(); $("game-next").focus();
}
function nextGameQuestion() {
  if (!gameSession?.answers[gameSession.index]) return;
  stopSpeaking(); gameSelection.clear();
  if (gameSession.index + 1 < gameSession.units.length) {
    gameSession.index++; delete gameSession.selected; saveGame(); renderGame(); $("game-question").focus(); return;
  }
  finishGame();
}
function finishGame() {
  const session = gameSession;
  session.used = [...new Set([...session.used, ...session.units.flatMap(unit => unit.keys)])];
  const correct = session.answers.filter(answer => answer.correct).length;
  const isBoard = session.settings.kind === "articles" && session.settings.mode === "board";
  $("game-result-score").textContent = isBoard ?
    `${correct} из ${session.units.length} раундов полностью верно · ${session.answers.reduce((n, answer) => n + answer.rows.filter(row => row.correct).length, 0)} из ${session.units.reduce((n, unit) => n + unit.keys.length, 0)} решений` :
    `${correct} из ${session.units.length} · ${Math.round(100 * correct / session.units.length)}%`;
  $("game-result-errors").innerHTML = session.units.flatMap((unit, index) => {
    if (session.answers[index].correct) return [];
    const keys = isBoard ? session.answers[index].rows.filter(row => !row.correct).map(row => row.key) : unit.keys;
    return keys.map(key => {
      const entry = gameEntry(key);
      return `<article class="result-error"><b>${escapeHTML(session.settings.kind === "stress" ? entry.spellings.join(" / ") : nounFeedback(entry))}</b>${session.settings.kind === "stress" ? `<p>${escapeHTML(entry.russian)}</p>` : ""}</article>`;
    });
  }).join("") || "<p>Ошибок нет!</p>";
  $("game-retry").classList.toggle("hidden", correct === session.units.length);
  $("game-more").classList.toggle("hidden", !gameUnits(session.settings, gamePool, session.used, session.rotation + 1).length);
  localStorage.removeItem(GAME_STORAGE); renderDashboard(); showScreen("game-result"); $("game-result-title").focus();
}


document.addEventListener("click", event => {
  const category = event.target.closest("[data-category]")?.dataset.category; if (category) category.startsWith("game-") ? openGameSetup(category.slice(5)) : category === "grammar" ? showScreen("grammar") : category === "words" ? renderWordTopics() : openCategory(category);
  const wordTopic = event.target.closest("[data-word-topic]")?.dataset.wordTopic; if (wordTopic) openWordTopic(wordTopic);
  const collection = event.target.closest("[data-collection]")?.dataset.collection;
  if (collection) { state.selectedCollections.has(collection) ? state.selectedCollections.delete(collection) : state.selectedCollections.add(collection); renderWordTopics(); }
  const situation = event.target.closest("[data-situation]")?.dataset.situation;
  if (situation) { state.selectedSituations.has(situation) ? state.selectedSituations.delete(situation) : state.selectedSituations.add(situation); renderSituations(); }
  const situationType = event.target.closest("[data-situation-type]")?.dataset.situationType;
  if (situationType) { resetCardSelection(); state.situationType = situationType; state.deck = situationDeck(); state.index = 0; state.revealed = false; renderSituationFilter(); renderCard(); }
  const wordPos = event.target.closest("[data-word-pos]")?.dataset.wordPos;
  if (wordPos) {
    resetCardSelection();
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
$("quiz-button").addEventListener("click", () => openQuizSetup());
$("study-list-quiz").addEventListener("click", () => openQuizSetup());
$("selection-toggle").addEventListener("click", () => { state.selectingCards = !state.selectingCards; renderWordList(); });
$("selection-all").addEventListener("click", () => { visibleWordList().visible.forEach(card => state.selectedCards.add(card.id)); renderWordList(); });
$("selection-clear").addEventListener("click", () => { state.selectedCards.clear(); renderWordList(); });
$("selection-quiz").addEventListener("click", () => openQuizSetup(true));
$("word-list").addEventListener("change", event => { const input = event.target.closest("[data-select-card]"); if (!input) return; input.checked ? state.selectedCards.add(input.dataset.selectCard) : state.selectedCards.delete(input.dataset.selectCard); renderSelectionControls(); });
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

$("resume-game").addEventListener("click", resumeGame);
$("game-start").addEventListener("click", beginGame);
$("game-setup").addEventListener("change", gameSetupSummary);
$("game-board-check").addEventListener("click", () => answerGame());
$("game-next").addEventListener("click", nextGameQuestion);
$("game-audio").addEventListener("click", () => {
  if (!gameSession?.answers[gameSession.index]) return;
  speakGreek(gameEntry(gameSession.units[gameSession.index].keys[0]).text);
});
$("game-choices").addEventListener("click", event => {
  if (!gameSession || gameSession.answers[gameSession.index]) return;
  const tile = event.target.closest("[data-game-tile]");
  if (tile) {
    const key = gameSession.units[gameSession.index].keys[Number(tile.dataset.gameTile)];
    gameSelection.has(key) ? gameSelection.delete(key) : gameSelection.add(key);
    gameSession.selected = [...gameSelection]; saveGame();
    tile.setAttribute("aria-pressed", String(gameSelection.has(key))); return;
  }
  const stress = event.target.closest("[data-game-stress]");
  if (stress) answerGame(Number(stress.dataset.gameStress));
  const article = event.target.closest("[data-game-article]");
  if (article) answerGame(article.dataset.gameArticle);
});
$("game-retry").addEventListener("click", () => {
  const prior = gameSession;
  startGameUnits(prior.settings, gamePool, prior.units.filter((unit, index) => !prior.answers[index].correct), prior.used, prior.rotation);
});
$("game-more").addEventListener("click", () => {
  const prior = gameSession, settings = { ...prior.settings, limit: "10" };
  startGameUnits(settings, gamePool, gameUnits(settings, gamePool, prior.used, prior.rotation + 1), prior.used, prior.rotation + 1);
});
$("game-settings").addEventListener("click", () => openGameSetup(gameKind));

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));

Promise.all([...SOURCES.map(async ([key,,, path]) => [key, await fetch(path).then(response => { if (!response.ok) throw new Error(path); return response.json(); })]), ...[["collections", "./data/collections.json"], ["aliases", "./data/id-aliases.json"], ["situations", "./data/situations.json"], ["verbSets", "./data/verb-sets.json"]].map(async ([key, path]) => [key, await fetch(path).then(response => { if (!response.ok) throw new Error(path); return response.json(); })])]).then(entries => { const data = Object.fromEntries(entries); state.collections = data.collections; state.aliases = data.aliases; state.situations = data.situations; state.verbSets = data.verbSets; delete data.verbSets; delete data.collections; delete data.aliases; delete data.situations; state.data = data; migrateProgress(); renderDashboard(); }).catch(() => { $("category-grid").innerHTML = '<div class="empty">Не удалось загрузить словарь. Обновите страницу.</div>'; });
