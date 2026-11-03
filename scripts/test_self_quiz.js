#!/usr/bin/env node
// Exercise the actual quiz logic and persisted state without a browser.
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, ".."), elements = new Map(), storage = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, { value: id === "quiz-limit" ? "10" : id === "quiz-mode" ? "el-ru" : "all", innerHTML: "", textContent: "", dataset: {}, style: {}, classes,
      classList: { add: n => classes.add(n), remove: n => classes.delete(n), toggle: (n, enabled) => enabled ? classes.add(n) : classes.delete(n) },
      setAttribute() {}, querySelectorAll: () => [] });
  }
  return elements.get(id);
}
const files = ["words", "verbs", "adverbs", "phrases", "professions", "nationalities", "months", "weekdays", "conjugations"];
const fixture = { data: Object.fromEntries(files.map(name => [name, JSON.parse(fs.readFileSync(path.join(root, "data", name + ".json"), "utf8"))])),
  situations: JSON.parse(fs.readFileSync(path.join(root, "data/situations.json"), "utf8")), sets: JSON.parse(fs.readFileSync(path.join(root, "data/verb-sets.json"), "utf8")) };
const ctx = vm.createContext({ console, Date, Math, Map, Set, JSON, fixture,
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  document: { getElementById: element, querySelectorAll: () => [], querySelector: () => element("selector") }, window: { scrollTo() {} },
  alert: m => { throw Error(m); } });
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
vm.runInContext(fs.readFileSync(path.join(root, "game-core.js"), "utf8"), ctx);
vm.runInContext(source.slice(0, source.indexOf('document.addEventListener("click"')), ctx);
const run = code => vm.runInContext(code, ctx);
run(`state.data = fixture.data; state.verbSets = fixture.sets; state.situations = fixture.situations;
     openCategory("important-phrases"); state.selectedCards = new Set(["phrase-2026103115"]); openQuizSetup(true);`);
// Preserve an ordinary in-progress test while starting a self-assessment.
element("quiz-kind").value = "choice"; run("beginQuiz()");
const ordinary = storage.get("greek-a1-active-quiz"); assert.ok(ordinary);
run("openQuizSetup(true)"); element("quiz-kind").value = "self"; run("updateQuizSetup(); beginQuiz()");
assert.equal(run("state.quizDeck.length"), 1);
assert.equal(element("quiz-question").textContent, "Έχω δίκιο.");
assert.ok(!element("quiz-feedback").textContent.includes("Я прав"));
assert.ok(element("quiz-note").classes.has("hidden"));
assert.equal(storage.get("greek-a1-active-quiz"), ordinary);
run("answerSelfQuiz(false)");
assert.match(element("quiz-feedback").textContent, /Я прав/);
assert.ok(!element("quiz-note").classes.has("hidden"));
assert.equal(run('progress.practice["phrase-2026103115"].answers'), 1);
assert.equal(run('progress.practice["phrase-2026103115"].correct'), 0);
assert.equal(run('progress.practice["phrase-2026103115"].lastSource'), "self");
assert.ok(run('progress.mistakes.includes("phrase-2026103115")'));
run("answerSelfQuiz(true); answerSelfQuiz(true)");
assert.equal(run('progress.practice["phrase-2026103115"].answers'), 1);
assert.equal(run('progress.practice["phrase-2026103115"].correct'), 1);
assert.ok(!run('progress.mistakes.includes("phrase-2026103115")'));
run("restoreQuiz('self')");
assert.equal(run("state.answered"), true);
assert.match(element("quiz-feedback").textContent, /самооценка: знаю/);
assert.equal(storage.get("greek-a1-active-quiz"), ordinary);
run("answerSelfQuiz(false); finishQuiz()");
assert.match(element("quiz-result-score").textContent, /Самооценка: знаю 0, не знаю 1/);
assert.equal(storage.has("greek-a1-active-self-quiz"), false);
assert.equal(storage.get("greek-a1-active-quiz"), ordinary);
run("startQuiz(state.quizDeck.filter(item => state.session.answers.some(a => a.key === quizKey(item) && !a.correct)), state.quizScope, state.session.seen)");
assert.equal(run("state.quizDeck[0].card.id"), "phrase-2026103115");
assert.ok(storage.has("greek-a1-active-self-quiz"));
// A later result from a different session remains the latest result after correcting an older answer.
run(`answerSelfQuiz(false); restoreQuiz("choice"); answerQuiz({dataset:{correct:"true"},classList:{add(){}}}); restoreQuiz("self"); answerSelfQuiz(true);`);
assert.equal(run('progress.practice["phrase-2026103115"].lastCorrect'), true);
assert.notEqual(run('progress.practice["phrase-2026103115"].lastSource'), "self");
// Self mode has no distractor requirement, works for a one-card deck and respects filters.
run(`openCategory("verbs"); state.deck = state.deck.slice(0,1); openQuizSetup();`);
element("quiz-kind").value = "self"; run("updateQuizSetup()");
assert.match(element("quiz-setup-summary").textContent, /1 доступных вопросов из 1/);
element("quiz-pool").value = "unpracticed"; run("beginQuiz(); answerSelfQuiz(false)");
assert.equal(run("state.quizDeck.length"), 1);
run("openQuizSetup();"); element("quiz-kind").value = "self"; element("quiz-pool").value = "mistakes"; run("updateQuizSetup(); beginQuiz()");
assert.equal(run("state.quizDeck.length"), 1);
// Subsequent batches stay inside the originally requested error filter.
run(`openCategory("verbs"); state.deck = state.deck.slice(0, 20); state.deck.forEach((card, i) => {
       progress.practice[card.id] = {answers: 1, correct: i < 15 ? 0 : 1, lastCorrect: i >= 15};
     }); openQuizSetup();`);
element("quiz-kind").value = "self"; element("quiz-pool").value = "mistakes";
run("updateQuizSetup(); beginQuiz()");
assert.equal(run("state.quizScope.length"), 15);
assert.equal(run("state.quizDeck.length"), 10);
run(`for (var i = 0; i < state.quizDeck.length; i++) { state.quizIndex = i; answerSelfQuiz(true); }
     finishQuiz(); var seenBatch = new Set(state.session.seen); startQuiz(state.quizScope.filter(item => !seenBatch.has(quizKey(item))), state.quizScope, [...seenBatch]);`);
assert.equal(run("state.quizDeck.length"), 5);
assert.ok(run("state.quizDeck.every(item => state.quizScope.includes(item) && !seenBatch.has(quizKey(item)))"));
// Each selected conjugation produces six independently scored forms.
element("quiz-pool").value = "all";
run(`openCategory("passive-a2-forms"); state.selectedCards = new Set([state.deck[0].id]); openQuizSetup(true);`);
element("quiz-kind").value = "self"; run("updateQuizSetup(); beginQuiz(); answerSelfQuiz(false)");
assert.equal(run("state.quizScope.length"), 6);
assert.ok(run("quizKey(state.quizDeck[0]).includes(':')"));
assert.equal(run("progress.practice[quizKey(state.quizDeck[0])].lastSource"), "self");
// Situational phrases remain selectable in self-assessment, even though ordinary situational tests exclude them.
run(`state.selectedSituations = new Set(["rental"]); openSelectedSituations(); state.selectedCards = new Set(["phrase-2026103115"]);
     state.selectedCards = new Set([state.deck.find(card => card.type === "phrases").id]); openQuizSetup(true);`);
element("quiz-kind").value = "self"; run("updateQuizSetup(); beginQuiz()");
assert.equal(run("state.quizDeck[0].card.type"), "phrases");
// Static UI invariant: mode selector belongs to quiz setup, not game setup.
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
assert.ok(html.indexOf('id="quiz-kind"') > html.indexOf('id="quiz-setup"'));
assert.ok(html.indexOf('id="quiz-kind"') < html.indexOf('id="quiz"'));
console.log("OK: self assessment, correction, independent sessions, filters, forms and situational phrases");
