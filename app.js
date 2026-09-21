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
const state = { data: {}, deck: [], quizDeck: [], category: "new", wordTopic: null, wordPartOfSpeech: "all", index: 0, revealed: false, listMode: false, listQuery: "", expandedConjugations: new Set(), quizDirection: "el-ru", quizIndex: 0, quizAnswer: null, quizSpokenText: "", answered: false };
const IRREGULAR_VERBS = new Set(["conjugation-020", "conjugation-024", "conjugation-025", "conjugation-039", "conjugation-047", "conjugation-048", "conjugation-049", "conjugation-050", "conjugation-051"]);
const saved = JSON.parse(localStorage.getItem("greek-a1-progress") || "{}");
const progress = { favorites: saved.favorites || [], mistakes: saved.mistakes || [], learned: saved.learned || [] };
const $ = (id) => document.getElementById(id);

function saveProgress() { localStorage.setItem("greek-a1-progress", JSON.stringify(progress)); }
function allCards() { return SOURCES.flatMap(([key, label]) => (state.data[key] || []).map(card => ({ ...card, type: key, typeLabel: label }))); }
function themedWordCards() { return allCards().filter(card => card.type === "words" || card.type === "professions"); }
function getWordTopicDeck(topic = "all", partOfSpeech = "all") {
  return themedWordCards().filter(card => (topic === "all" || card.topic === topic) && (partOfSpeech === "all" || card.partOfSpeech === partOfSpeech));
}
function showScreen(id) { document.querySelectorAll(".screen").forEach(el => el.classList.toggle("active", el.id === id)); window.scrollTo({ top: 0, behavior: "smooth" }); }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }
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
}

function renderWordTopics() {
  $("word-topic-grid").innerHTML = WORD_TOPICS.map(([key, label, symbol]) => {
    const count = getWordTopicDeck(key).length;
    return `<button class="category topic-card" data-word-topic="${key}"><span class="symbol">${symbol}</span><strong>${label}</strong><small>${count} карточек</small></button>`;
  }).join("");
  showScreen("word-topics");
}

function renderPartOfSpeechFilter() {
  const available = new Set(getWordTopicDeck(state.wordTopic).map(card => card.partOfSpeech));
  $("word-pos-filter").innerHTML = PARTS_OF_SPEECH.filter(([key]) => key === "all" || available.has(key)).map(([key, label]) => `<button type="button" data-word-pos="${key}" aria-pressed="${state.wordPartOfSpeech === key}">${label}</button>`).join("");
}

function openWordTopic(topic) {
  stopSpeaking();
  state.category = "words"; state.wordTopic = topic; state.wordPartOfSpeech = "all"; state.deck = getWordTopicDeck(topic); state.index = 0; state.revealed = false; state.listMode = false; state.listQuery = "";
  const label = WORD_TOPICS.find(([key]) => key === topic)?.[1] || "Слова";
  $("study-title").textContent = label; $("study-kicker").textContent = "Слова по теме"; $("study-back-button").dataset.go = "word-topics";
  $("word-pos-filter").classList.remove("hidden"); renderPartOfSpeechFilter(); $("word-list-search").value = ""; showScreen("study"); renderCard();
}

function openCategory(category) {
  stopSpeaking();
  state.category = category; state.wordTopic = null; state.wordPartOfSpeech = "all"; state.deck = getDeck(category); state.index = 0; state.revealed = false; state.listMode = category === "dictionary"; state.listQuery = ""; state.expandedConjugations.clear();
  const title = { new: "Новые", all: "Все слова", dictionary: "Словарь", favorites: "Избранное", mistakes: "Ошибки", words: "Слова", verbs: "Глаголы", adverbs: "Наречия", phrases: "Фразы", professions: "Профессии", nationalities: "Национальности", months: "Месяцы", weekdays: "Дни недели", conjugations: "Спряжения" }[category];
  $("study-title").textContent = title; $("study-kicker").textContent = category === "conjugations" ? "Таблицы форм" : category === "dictionary" ? "Быстрый поиск" : "Карточки";
  $("study-back-button").dataset.go = "dashboard"; $("word-pos-filter").classList.add("hidden");
  $("word-list-search").value = ""; showScreen("study"); renderCard();
}

function renderCard() {
  const card = state.deck[state.index];
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
  const query = state.listQuery.toLocaleLowerCase("ru");
  const sorted = [...state.deck].sort((left, right) => left.greek.localeCompare(right.greek, "el", { sensitivity: "base" }));
  const visible = sorted.filter(card => !query || `${card.greek} ${card.russian} ${card.typeLabel}`.toLocaleLowerCase("ru").includes(query));
  const itemLabel = state.category === "conjugations" ? "глаголов" : "карточек";
  $("word-list-summary").textContent = query ? `Найдено: ${visible.length} из ${sorted.length}` : `${sorted.length} ${itemLabel} · по греческому алфавиту`;
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

function beginQuiz() {
  stopSpeaking();
  state.quizIndex = 0;
  state.answered = false;
  state.quizDeck = state.category === "conjugations"
    ? shuffle(state.deck.flatMap(card => Object.entries(card.forms).map(([pronoun, form]) => ({ card, pronoun, form, russian: card.russianForms?.[pronoun] }))).filter(item => item.russian))
    : shuffle(state.deck.map(card => ({ card })));
  $("quiz-direction").classList.toggle("hidden", state.category === "conjugations");
  showScreen("quiz");
  renderQuestion();
}
function renderQuizDirection() {
  document.querySelectorAll("[data-quiz-direction]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.quizDirection === state.quizDirection)));
}
function quizDistractors(card) {
  const pool = state.wordTopic
    ? getWordTopicDeck(state.wordTopic).filter(candidate => candidate.partOfSpeech === card.partOfSpeech)
    : allCards().filter(candidate => candidate.type === card.type);
  return shuffle(pool.filter(candidate => candidate.id !== card.id && !translationsOverlap(candidate.russian, card.russian))).slice(0, 3);
}
function renderQuestion() {
  const item = state.quizDeck[state.quizIndex]; if (!item) return;
  const card = item.card;
  state.answered = false; $("quiz-next").classList.add("hidden"); $("quiz-feedback").textContent = "";
  $("quiz-counter").textContent = `${state.quizIndex + 1} / ${state.quizDeck.length}`;
  if (item.form) {
    $("quiz-title").textContent = "Переведите форму глагола";
    $("quiz-question").textContent = item.form;
    $("quiz-speak-button").classList.remove("hidden");
    state.quizSpokenText = item.form;
    state.quizAnswer = item.russian;
    const alternatives = state.quizDeck.filter(candidate => candidate.card.id !== card.id && candidate.pronoun !== item.pronoun && !translationsOverlap(candidate.russian, item.russian)).map(candidate => candidate.russian);
    const options = shuffle([item.russian, ...shuffle([...new Set(alternatives)]).slice(0, 3)]);
    $("quiz-options").innerHTML = options.map(text => `<button class="quiz-option" data-correct="${text === item.russian}">${text}</button>`).join("");
    return;
  }
  renderQuizDirection();
  if (state.quizDirection === "ru-el") {
    $("quiz-title").textContent = "Выберите слово по-гречески";
    $("quiz-question").textContent = card.russian;
    $("quiz-speak-button").classList.add("hidden");
    state.quizSpokenText = "";
    state.quizAnswer = card.greek;
    const distractors = quizDistractors(card);
    const options = shuffle([card, ...distractors]);
    $("quiz-options").innerHTML = options.map(option => `<button class="quiz-option" data-correct="${option.id === card.id}">${escapeHTML(option.greek)}</button>`).join("");
    return;
  }
  $("quiz-title").textContent = "Выберите перевод";
  $("quiz-question").textContent = card.greek;
  $("quiz-speak-button").classList.remove("hidden");
  state.quizSpokenText = card.greek;
  state.quizAnswer = card.russian;
  const distractors = quizDistractors(card);
  const options = shuffle([card, ...distractors]);
  $("quiz-options").innerHTML = options.map(option => `<button class="quiz-option" data-correct="${option.id === card.id}">${option.russian}</button>`).join("");
}
function answerQuiz(button) {
  if (state.answered) return; state.answered = true;
  const card = state.quizDeck[state.quizIndex].card, correct = button.dataset.correct === "true";
  button.classList.add(correct ? "correct" : "wrong");
  document.querySelectorAll(".quiz-option").forEach(option => { option.disabled = true; if (option.dataset.correct === "true") option.classList.add("correct"); });
  if (correct) progress.mistakes = progress.mistakes.filter(id => id !== card.id); else if (!progress.mistakes.includes(card.id)) progress.mistakes.push(card.id);
  if (!progress.learned.includes(card.id)) progress.learned.push(card.id);
  saveProgress(); $("quiz-feedback").textContent = correct ? "Верно! Μπράβο!" : `Правильный ответ: ${state.quizAnswer}`; $("quiz-next").classList.remove("hidden"); renderDashboard();
}

document.addEventListener("click", event => {
  const category = event.target.closest("[data-category]")?.dataset.category; if (category) category === "grammar" ? showScreen("grammar") : category === "words" ? renderWordTopics() : openCategory(category);
  const wordTopic = event.target.closest("[data-word-topic]")?.dataset.wordTopic; if (wordTopic) openWordTopic(wordTopic);
  const wordPos = event.target.closest("[data-word-pos]")?.dataset.wordPos;
  if (wordPos) {
    state.wordPartOfSpeech = wordPos; state.deck = getWordTopicDeck(state.wordTopic, wordPos); state.index = 0; state.revealed = false; state.listQuery = ""; $("word-list-search").value = ""; renderPartOfSpeechFilter(); renderCard();
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
  const quizDirection = event.target.closest("[data-quiz-direction]");
  if (quizDirection && !state.answered) {
    state.quizDirection = quizDirection.dataset.quizDirection;
    renderQuestion();
  }
});
$("flashcard").addEventListener("click", event => { if (!event.target.closest("button")) reveal(); });
$("flashcard").addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reveal(); } });
$("favorite-button").addEventListener("click", () => { const id = state.deck[state.index]?.id; if (id) toggleFavorite(id); });
$("speak-button").addEventListener("click", () => { const text = state.deck[state.index]?.greek; if (text) speakGreek(text); });
$("quiz-speak-button").addEventListener("click", () => { if (state.quizSpokenText) speakGreek(state.quizSpokenText); });
$("previous-button").addEventListener("click", () => move(-1)); $("next-button").addEventListener("click", () => move(1));
$("quiz-button").addEventListener("click", beginQuiz); $("quiz-next").addEventListener("click", () => { stopSpeaking(); state.quizIndex = (state.quizIndex + 1) % state.quizDeck.length; renderQuestion(); });
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

Promise.all(SOURCES.map(async ([key,,, path]) => [key, await fetch(path).then(response => { if (!response.ok) throw new Error(path); return response.json(); })])).then(entries => { state.data = Object.fromEntries(entries); renderDashboard(); }).catch(() => { $("category-grid").innerHTML = '<div class="empty">Не удалось загрузить словарь. Обновите страницу.</div>'; });
