const SOURCES = [
  ["words", "Слова", "λέξη", "./data/words.json"],
  ["verbs", "Глаголы", "ρήμα", "./data/verbs.json"],
  ["adverbs", "Наречия", "τώρα", "./data/adverbs.json"],
  ["phrases", "Фразы", "…", "./data/phrases.json"],
  ["conjugations", "Спряжения", "εγώ", "./data/conjugations.json"]
];
const state = { data: {}, deck: [], category: "new", index: 0, revealed: false, quizIndex: 0, answered: false };
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
    ...SOURCES.map(([key, label, symbol]) => [key, label, symbol, getDeck(key).length])
  ];
  $("category-grid").innerHTML = sections.map(([key, label, symbol, count]) => `<button class="category" data-category="${key}"><span class="symbol">${symbol}</span><strong>${label}</strong><small>${count} карточек</small></button>`).join("");
}

function openCategory(category) {
  stopSpeaking();
  state.category = category; state.deck = getDeck(category); state.index = 0; state.revealed = false;
  const title = { new: "Новые", all: "Все слова", favorites: "Избранное", mistakes: "Ошибки", words: "Слова", verbs: "Глаголы", adverbs: "Наречия", phrases: "Фразы", conjugations: "Спряжения" }[category];
  $("study-title").textContent = title; $("study-kicker").textContent = category === "conjugations" ? "Таблицы форм" : "Карточки";
  showScreen("study"); renderCard();
}

function renderCard() {
  const card = state.deck[state.index];
  $("empty-state").classList.toggle("hidden", Boolean(card));
  $("flashcard").classList.toggle("hidden", !card); $("study-actions").classList.toggle("hidden", !card);
  if (!card) return;
  $("card-counter").textContent = `${state.index + 1} / ${state.deck.length}`;
  $("card-kind").textContent = card.typeLabel; $("card-front").textContent = card.greek; $("card-back").textContent = card.russian;
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

function beginQuiz() { stopSpeaking(); state.quizIndex = 0; state.answered = false; state.deck = shuffle(state.deck); showScreen("quiz"); renderQuestion(); }
function renderQuestion() {
  const card = state.deck[state.quizIndex]; if (!card) return;
  state.answered = false; $("quiz-next").classList.add("hidden"); $("quiz-feedback").textContent = "";
  $("quiz-counter").textContent = `${state.quizIndex + 1} / ${state.deck.length}`; $("quiz-question").textContent = card.greek;
  const distractors = shuffle(allCards().filter(item => item.id !== card.id && item.russian !== card.russian)).slice(0, 3);
  const options = shuffle([card, ...distractors]);
  $("quiz-options").innerHTML = options.map(item => `<button class="quiz-option" data-answer="${item.id}">${item.russian}</button>`).join("");
}
function answerQuiz(button) {
  if (state.answered) return; state.answered = true;
  const card = state.deck[state.quizIndex], correct = button.dataset.answer === card.id;
  button.classList.add(correct ? "correct" : "wrong");
  document.querySelectorAll(".quiz-option").forEach(option => { option.disabled = true; if (option.dataset.answer === card.id) option.classList.add("correct"); });
  if (correct) progress.mistakes = progress.mistakes.filter(id => id !== card.id); else if (!progress.mistakes.includes(card.id)) progress.mistakes.push(card.id);
  if (!progress.learned.includes(card.id)) progress.learned.push(card.id);
  saveProgress(); $("quiz-feedback").textContent = correct ? "Верно! Μπράβο!" : `Правильный ответ: ${card.russian}`; $("quiz-next").classList.remove("hidden"); renderDashboard();
}

document.addEventListener("click", event => {
  const category = event.target.closest("[data-category]")?.dataset.category; if (category) openCategory(category);
  const go = event.target.closest("[data-go]")?.dataset.go; if (go) showScreen(go);
  if (event.target.closest(".quiz-option")) answerQuiz(event.target.closest(".quiz-option"));
  const formButton = event.target.closest(".speak-form");
  if (formButton) {
    const forms = Object.values(state.deck[state.index]?.forms || {});
    const form = forms[Number(formButton.dataset.formIndex)];
    if (form) speakGreek(form);
  }
});
$("flashcard").addEventListener("click", event => { if (!event.target.closest("button")) reveal(); });
$("flashcard").addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); reveal(); } });
$("favorite-button").addEventListener("click", () => { const id = state.deck[state.index]?.id; if (!id) return; progress.favorites = progress.favorites.includes(id) ? progress.favorites.filter(item => item !== id) : [...progress.favorites, id]; saveProgress(); renderCard(); });
$("speak-button").addEventListener("click", () => { const text = state.deck[state.index]?.greek; if (text) speakGreek(text); });
$("quiz-speak-button").addEventListener("click", () => { const text = state.deck[state.quizIndex]?.greek; if (text) speakGreek(text); });
$("previous-button").addEventListener("click", () => move(-1)); $("next-button").addEventListener("click", () => move(1));
$("quiz-button").addEventListener("click", beginQuiz); $("quiz-next").addEventListener("click", () => { stopSpeaking(); state.quizIndex = (state.quizIndex + 1) % state.deck.length; renderQuestion(); });

let installPrompt;
window.addEventListener("beforeinstallprompt", event => { event.preventDefault(); installPrompt = event; $("install-button").classList.remove("hidden"); });
$("install-button").addEventListener("click", async () => { if (!installPrompt) return; installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; $("install-button").classList.add("hidden"); });
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js"));

Promise.all(SOURCES.map(async ([key,,, path]) => [key, await fetch(path).then(response => { if (!response.ok) throw new Error(path); return response.json(); })])).then(entries => { state.data = Object.fromEntries(entries); renderDashboard(); }).catch(() => { $("category-grid").innerHTML = '<div class="empty">Не удалось загрузить словарь. Обновите страницу.</div>'; });
