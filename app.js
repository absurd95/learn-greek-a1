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
const state = { data: {}, deck: [], quizDeck: [], category: "new", index: 0, revealed: false, quizIndex: 0, quizAnswer: null, quizSpokenText: "", answered: false };
const saved = JSON.parse(localStorage.getItem("greek-a1-progress") || "{}");
const progress = { favorites: saved.favorites || [], mistakes: saved.mistakes || [], learned: saved.learned || [] };
const $ = (id) => document.getElementById(id);

function saveProgress() { localStorage.setItem("greek-a1-progress", JSON.stringify(progress)); }
function allCards() { return SOURCES.flatMap(([key, label]) => (state.data[key] || []).map(card => ({ ...card, type: key, typeLabel: label }))); }
function showScreen(id) { document.querySelectorAll(".screen").forEach(el => el.classList.toggle("active", el.id === id)); window.scrollTo({ top: 0, behavior: "smooth" }); }
function shuffle(items) { return [...items].sort(() => Math.random() - .5); }

function stopSpeaking() {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

function speakGreek(text) {
  const status = $("speech-status");
  if (!("speechSynthesis" in window) || typeof SpeechSynthesisUtterance === "undefined") {
    if (status) status.textContent = "Озвучивание не поддерживается этим браузером";
    return;
  }
  stopSpeaking();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const greekVoice = voices.find(voice => voice.lang.toLowerCase().startsWith("el"));
  utterance.lang = "el-GR";
  utterance.rate = .82;
  utterance.pitch = 1;
  if (greekVoice) utterance.voice = greekVoice;
  utterance.onstart = () => { if (status) status.textContent = "Произношу…"; };
  utterance.onend = () => { if (status) status.textContent = ""; };
  utterance.onerror = () => { if (status) status.textContent = "Не найден греческий голос на устройстве"; };
  window.speechSynthesis.speak(utterance);
}

function getDeck(category) {
  const all = allCards();
  if (category === "all") return all;
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
    ...SOURCES.map(([key, label, symbol]) => [key, label, symbol, getDeck(key).length]),
    ["grammar", "Грамматика", "§", "14 тем"]
  ];
  $("category-grid").innerHTML = sections.map(([key, label, symbol, count]) => `<button class="category" data-category="${key}"><span class="symbol">${symbol}</span><strong>${label}</strong><small>${typeof count === "number" ? `${count} карточек` : count}</small></button>`).join("");
}

function openCategory(category) {
  stopSpeaking();
  state.category = category; state.deck = getDeck(category); state.index = 0; state.revealed = false;
  const title = { new: "Новые", all: "Все слова", favorites: "Избранное", mistakes: "Ошибки", words: "Слова", verbs: "Глаголы", adverbs: "Наречия", phrases: "Фразы", professions: "Профессии", nationalities: "Национальности", months: "Месяцы", weekdays: "Дни недели", conjugations: "Спряжения" }[category];
  $("study-title").textContent = title; $("study-kicker").textContent = category === "conjugations" ? "Таблицы форм" : "Карточки";
  showScreen("study"); renderCard();
}

function renderCard() {
  const card = state.deck[state.index];
  $("empty-state").classList.toggle("hidden", Boolean(card));
  $("flashcard").classList.toggle("hidden", !card); $("study-actions").classList.toggle("hidden", !card);
  if (!card) return;
  $("card-counter").textContent = `${state.index + 1} / ${state.deck.length}`;
  $("card-kind").textContent = card.group ? `${card.typeLabel} · ${card.group}` : card.typeLabel; $("card-front").textContent = card.greek; $("card-back").textContent = card.russian;
  $("card-back").classList.toggle("hidden", !state.revealed); $("card-hint").classList.toggle("hidden", state.revealed);
  $("favorite-button").textContent = progress.favorites.includes(card.id) ? "★" : "☆";
  const table = $("conjugation-table");
  table.innerHTML = card.forms ? Object.entries(card.forms).map(([pronoun, form], index) => `<div class="conjugation-row"><span>${pronoun}</span><strong>${form}</strong><button class="speak-form" type="button" data-form-index="${index}" aria-label="Произнести ${form}" title="Произнести ${form}">🔊</button></div>`).join("") : "";
  table.classList.toggle("hidden", !state.revealed || !card.forms);
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
  showScreen("quiz");
  renderQuestion();
}
function renderQuestion() {
  const item = state.quizDeck[state.quizIndex]; if (!item) return;
  const card = item.card;
  state.answered = false; $("quiz-next").classList.add("hidden"); $("quiz-feedback").textContent = "";
  $("quiz-counter").textContent = `${state.quizIndex + 1} / ${state.quizDeck.length}`;
  if (item.form) {
    $("quiz-title").textContent = "Переведите форму глагола";
    $("quiz-question").textContent = item.form;
    state.quizSpokenText = item.form;
    state.quizAnswer = item.russian;
    const alternatives = state.quizDeck.filter(candidate => candidate.card.id !== card.id && candidate.pronoun !== item.pronoun && candidate.russian !== item.russian).map(candidate => candidate.russian);
    const options = shuffle([item.russian, ...shuffle([...new Set(alternatives)]).slice(0, 3)]);
    $("quiz-options").innerHTML = options.map(text => `<button class="quiz-option" data-correct="${text === item.russian}">${text}</button>`).join("");
    return;
  }
  $("quiz-title").textContent = "Выберите перевод";
  $("quiz-question").textContent = card.greek;
  state.quizSpokenText = card.greek;
  state.quizAnswer = card.russian;
  const distractors = shuffle(allCards().filter(candidate => candidate.type === card.type && candidate.id !== card.id && candidate.russian !== card.russian)).slice(0, 3);
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
  const category = event.target.closest("[data-category]")?.dataset.category; if (category) category === "grammar" ? showScreen("grammar") : openCategory(category);
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
});
$("flashcard").addEventListener("click", event => { if (!event.target.closest("button")) reveal(); });
$("flashcard").addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reveal(); } });
$("favorite-button").addEventListener("click", () => { const id = state.deck[state.index]?.id; if (!id) return; progress.favorites = progress.favorites.includes(id) ? progress.favorites.filter(item => item !== id) : [...progress.favorites, id]; saveProgress(); renderCard(); });
$("speak-button").addEventListener("click", () => { const text = state.deck[state.index]?.greek; if (text) speakGreek(text); });
$("quiz-speak-button").addEventListener("click", () => { if (state.quizSpokenText) speakGreek(state.quizSpokenText); });
$("previous-button").addEventListener("click", () => move(-1)); $("next-button").addEventListener("click", () => move(1));
$("quiz-button").addEventListener("click", beginQuiz); $("quiz-next").addEventListener("click", () => { stopSpeaking(); state.quizIndex = (state.quizIndex + 1) % state.quizDeck.length; renderQuestion(); });
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
