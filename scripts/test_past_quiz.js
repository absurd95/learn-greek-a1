#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, ".."), elements = new Map(), storage = new Map();
function element(id) {
  if (!elements.has(id)) { const classes = new Set(); elements.set(id, { value: id === "quiz-limit" ? "all" : id === "quiz-mode" ? "el-ru" : "all", textContent: "", innerHTML: "", dataset: {}, style: {}, classes,
    classList: { add: n => classes.add(n), remove: n => classes.delete(n), toggle: (n, enabled) => enabled ? classes.add(n) : classes.delete(n) }, setAttribute() {}, querySelectorAll: () => [] }); }
  return elements.get(id);
}
const names = ["words", "verbs", "adverbs", "phrases", "professions", "nationalities", "months", "weekdays", "conjugations", "past-conjugations"];
const fixture = Object.fromEntries(names.map(name => [name, JSON.parse(fs.readFileSync(path.join(root, "data", name + ".json"), "utf8"))]));
const sets = JSON.parse(fs.readFileSync(path.join(root, "data/verb-sets.json"), "utf8"));
const ctx = vm.createContext({ fixture, sets, console, Date, Math, Map, Set, JSON,
  localStorage: { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) },
  document: { getElementById: element, querySelectorAll: () => [], querySelector: () => element("selector") }, window: { scrollTo() {} }, alert: m => { throw Error(m); } });
vm.runInContext(fs.readFileSync(path.join(root, "game-core.js"), "utf8"), ctx);
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
vm.runInContext(source.slice(0, source.indexOf('document.addEventListener("click"')), ctx);
const run = code => vm.runInContext(code, ctx);
run('state.data = fixture; state.verbSets = sets; openCategory("past-conjugations"); state.selectedCards = new Set([state.deck[0].id]); openQuizSetup(true)');
element("quiz-kind").value = "self";
for (const mode of ["el-ru", "ru-el", "mixed"]) {
  element("quiz-mode").value = mode; run("updateQuizSetup(); beginQuiz()");
  assert.equal(run("state.quizDeck.length"), 6);
  const example = run("state.quizDeck[0].card.formExamples[state.quizDeck[0].pronoun][0]");
  if (mode === "ru-el") { assert.ok(element("quiz-note").classes.has("hidden")); assert.ok(element("quiz-speak-button").classes.has("hidden")); }
  else { assert.ok(element("quiz-note").textContent.includes(example.greek)); assert.ok(!element("quiz-note").textContent.includes(example.russian)); }
  run("answerSelfQuiz(true); restoreQuiz('self')");
  assert.equal(run("state.quizMode"), mode); assert.ok(element("quiz-note").textContent.includes(example.russian));
}
assert.ok(run('Object.keys(progress.practice).every(key => key.startsWith(state.quizDeck[0].card.id + ":"))'));
run(`var pastKey = quizKey(state.quizDeck[0]); var pastCount = progress.practice[pastKey].answers;
     var presentId = fixture.conjugations.find(card => card.greek.toLowerCase() === state.quizDeck[0].card.greek.toLowerCase()).id;
     openCategory("conjugations"); state.selectedCards = new Set([presentId]); openQuizSetup(true);`);
element("quiz-kind").value = "self"; element("quiz-mode").value = "el-ru";
run("updateQuizSetup(); beginQuiz(); answerSelfQuiz(true)");
assert.equal(run("progress.practice[pastKey].answers"), run("pastCount"));
assert.ok(run('quizKey(state.quizDeck[0]).startsWith(presentId + ":")'));
run('openCategory("all"); openQuizSetup()'); element("quiz-kind").value = "self"; run("updateQuizSetup()");
assert.ok(run('state.quizScope.every(item => item.card.type !== "past-conjugations")'));
run('openCategory("irregular");'); assert.ok(run("state.deck.length") >= 9);
run('openCategory("irregular-past");'); assert.ok(run("state.deck.length") >= 9);
// Related verbs must not be offered as misleading distractors in any tense.
run(`var fatVerbs = ["verb-2026111009", "verb-2026111010"].map(id => fixture.verbs.find(c => c.id === id));
     var fatPresent = fatVerbs.map(v => fixture.conjugations.find(c => c.greek.toLowerCase() === v.greek.toLowerCase()));
     var fatPast = fatVerbs.map(v => fixture["past-conjugations"].find(c => c.verbId === v.id));`);
for (const direction of ["el-ru", "ru-el"]) for (const [name, type] of [["fatVerbs", "verbs"], ["fatPresent", "conjugations"], ["fatPast", "past-conjugations"]]) {
  assert.equal(run(`quizCandidates({card:{...${name}[0],type:"${type}"}}, [{card:{...${name}[1],type:"${type}"}}], "${direction}").length`), 0);
}
console.log("OK: past forms, directions, examples, restore and independent keys");
