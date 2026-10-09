#!/usr/bin/env node
// Exercise the real PWA quiz functions without a browser or external packages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const elements = new Map();
const storage = new Map();
function element(id) {
  if (!elements.has(id)) elements.set(id, {
    value: id === "quiz-limit" ? "10" : id === "quiz-mode" ? "ru-el" : "all",
    innerHTML: "", textContent: "", dataset: {}, style: {},
    classList: { toggle() {}, add() {}, remove() {} },
    setAttribute() {}, querySelectorAll() { return []; },
  });
  return elements.get(id);
}
const context = vm.createContext({
  console, Date, Map, Set, Math, JSON,
  localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  },
  window: { scrollTo() {} },
  document: {
    getElementById: element,
    querySelectorAll: () => [],
    querySelector: () => element("selector"),
  },
  alert: message => { throw new Error(message); },
  fixture: {
    data: Object.fromEntries(["words", "verbs", "adverbs", "phrases", "professions", "nationalities", "months", "weekdays", "conjugations"]
      .map(name => [name, JSON.parse(fs.readFileSync(path.join(root, "data", name + ".json"), "utf8"))])),
    sets: JSON.parse(fs.readFileSync(path.join(root, "data/verb-sets.json"), "utf8")),
  },
});
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
vm.runInContext(source.slice(0, source.indexOf('document.addEventListener("click"')), context);
const run = code => vm.runInContext(code, context);
run("state.data = fixture.data; state.verbSets = fixture.sets;");
assert.equal(run('getDeck("passive-a2").length'), 20);
assert.equal(run('getDeck("passive-a2-forms").length'), 20);
assert.equal(run('getDeck("passive-a2").every(card => card.type === "verbs")'), true);
assert.equal(run('getDeck("passive-a2-forms").every(card => card.type === "conjugations")'), true);

for (const category of ["passive-a2", "passive-a2-forms"]) {
  run('state.category = ' + JSON.stringify(category) + '; state.deck = getDeck(state.category); state.quizScope = quizItems(state.deck);');
  const count = category.endsWith("-forms") ? 120 : 20;
  assert.equal(run("state.quizScope.length"), count);
  assert.equal(run("eligibleQuizItems(state.quizScope).length"), count);
  for (const direction of ["el-ru", "ru-el", "mixed"]) {
    element("quiz-mode").value = direction;
    run("startQuiz(state.quizScope)");
    assert.equal(run("state.quizDeck.length"), 10);
    assert.equal(run("new Set(state.session.keys).size"), 10);
    assert.equal(run("state.quizDeck.every(item => state.quizScope.includes(item))"), true);
    if (category.endsWith("-forms") && direction === "ru-el") {
      assert.equal(element("quiz-question").textContent, run("state.quizDeck[0].russian"));
      assert.equal(run("state.quizAnswer"), run("state.quizDeck[0].form"));
    }
    run("answerQuiz({dataset:{correct:'false'}, classList:{add(){}}})");
    assert.equal(run("progress.practice[quizKey(state.quizDeck[0])].lastCorrect"), false);
    // Reset the selector like a real reload, then restore the recorded mode.
    element("quiz-mode").value = "el-ru";
    run("restoreQuiz()");
    assert.equal(element("quiz-mode").value, direction);
    assert.equal(run("state.answered"), true);
    for (let i = 1; i < 10; i++) {
      run("state.quizIndex = " + i + "; renderQuestion(); answerQuiz({dataset:{correct:'true'},classList:{add(){}}});");
    }
    run("finishQuiz()");
    assert.match(element("quiz-result-score").textContent, /^9 из 10/);
    if (category.endsWith("-forms")) {
      assert.ok(element("quiz-result-errors").innerHTML.includes(run("state.quizDeck[0].form")));
      assert.ok(element("quiz-result-errors").innerHTML.includes(run("state.quizDeck[0].russian")));
    }
    assert.equal(storage.has("greek-a1-active-quiz"), false);
    assert.equal(run("state.quizScope.filter(item => progress.practice[quizKey(item)]?.lastCorrect === false).length >= 1"), true);
    run("var previousKeys = new Set(state.session.seen); startQuiz(state.quizScope.filter(item => !previousKeys.has(quizKey(item))), state.quizScope, [...previousKeys]);");
    assert.equal(run("state.session.keys.some(key => previousKeys.has(key))"), false);
    // Lexical binding is reused between cases.
    run("previousKeys.clear()");
  }
}
console.log("OK: both A2 modes, 20 verbs / 120 forms, all directions, progress, restore, results and non-repeating batches");
