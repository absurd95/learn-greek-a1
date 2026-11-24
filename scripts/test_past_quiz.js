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
run('state.data = fixture; state.verbSets = sets; openCategory("past-conjugations"); openQuizSetup()');
assert.equal(element("quiz-past-forms").value, "first");
assert.ok(run('state.quizScope.length > 10 && state.quizScope.every(item => item.card.tense === "aorist" && item.pronoun === firstPersonOrImpersonal(item.card))'));
assert.ok(run('state.quizScope.some(item => item.form === "συνέβη")'));
const lessonAorists = 'αγοράζω:αγόρασα απαντάω:απάντησα αρχίζω:άρχισα βάζω:έβαλα βγαίνω:βγήκα βλέπω:είδα γεννιέμαι:γεννήθηκα γνωρίζω:γνώρισα γράφω:έγραψα γυρίζω:γύρισα διαβάζω:διάβασα δουλεύω:δούλεψα θέλω:θέλησα θυμάμαι:θυμήθηκα κάνω:έκανα κατεβαίνω:κατέβηκα λέω:είπα μαθαίνω:έμαθα μεγαλώνω:μεγάλωσα μπαίνω:μπήκα παντρεύομαι:παντρεύτηκα παραγγέλνω:παράγγειλα παίρνω:πήρα πεθαίνω:πέθανα πηγαίνω:πήγα πλένω:έπλυνα ρωτάω:ρώτησα σκουπίζω:σκούπισα σπουδάζω:σπούδασα συμπληρώνω:συμπλήρωσα συνεχίζω:συνέχισα ταξιδεύω:ταξίδεψα τελειώνω:τελείωσα τρώω:έφαγα φέρνω:έφερα φτάνω:έφτασα φοράω:φόρεσα'.split(' ');
const firstForms = run('state.quizScope.map(item => [item.card.greek, item.form])');
assert.equal(lessonAorists.length, 37);
for (const pair of lessonAorists) {
  const [verb, past] = pair.split(':');
  const forms = firstForms.find(([greek]) => greek.toLowerCase().split(/\s*\/\s*/).includes(verb))?.[1];
  assert.ok(forms?.split(/\s*\/\s*/).includes(past), pair);
}
assert.ok(firstForms.every(([, form]) => !['ήμουν', 'είχα'].includes(form)));
assert.ok(run('eligibleQuizItems(state.quizScope).every(item => item.card.tense === "aorist")'));
assert.ok(run('state.quizScope.some(item => item.form === "γεννήθηκα" && presentHint(item.card) === "γεννιέμαι")'));
for (const form of ["έπιασα", "έσωσα", "έσβησα", "έσπασα", "φόρεσα"]) {
  assert.ok(firstForms.some(([, past]) => past.split(/\s*\/\s*/).includes(form)), form);
}
element("quiz-past-forms").value = "all"; run("updateQuizSetup()");
assert.ok(run('state.quizScope.some(item => item.card.tense === "imperfect" && item.form === "ήμουν") && state.quizScope.some(item => item.card.tense === "imperfect" && item.form === "είχα")'));
element("quiz-past-forms").value = "first"; run("updateQuizSetup()");
run('beginQuiz()');
assert.ok(run('state.quizDeck.length > 0 && state.quizDeck.every(item => item.pronoun === firstPersonOrImpersonal(item.card))'));
run('state.selectedCards = new Set([state.deck.find(card => card.tense === "aorist" && card.forms["εγώ"]).id]); openQuizSetup(true)');
element("quiz-kind").value = "self";
for (const mode of ["el-ru", "ru-el", "mixed"]) {
  element("quiz-mode").value = mode; run("updateQuizSetup(); beginQuiz()");
  assert.equal(run("state.quizDeck.length"), 1);
  assert.ok(!element("quiz-note").textContent.includes("Настоящее:"));
  run('answerSelfQuiz(false); restoreQuiz("self")');
  assert.match(element("quiz-note").textContent, /Настоящее: /);
  const answers = run("progress.practice[quizKey(state.quizDeck[0])].answers");
  run("answerSelfQuiz(true)");
  assert.ok(!element("quiz-note").textContent.includes("Настоящее:"));
  assert.equal(run("progress.practice[quizKey(state.quizDeck[0])].answers"), answers);
}
element("quiz-past-forms").value = "all"; run("updateQuizSetup()");
for (const mode of ["el-ru", "ru-el", "mixed"]) {
  element("quiz-mode").value = mode; run("updateQuizSetup(); beginQuiz()");
  assert.equal(run("state.quizDeck.length"), 6);
  const example = run("state.quizDeck[0].card.formExamples[state.quizDeck[0].pronoun][0]");
  if (mode === "ru-el") { assert.ok(element("quiz-note").classes.has("hidden")); assert.ok(element("quiz-speak-button").classes.has("hidden")); }
  else { assert.ok(element("quiz-note").textContent.includes(example.greek)); assert.ok(!element("quiz-note").textContent.includes(example.russian)); }
  run("answerSelfQuiz(true); restoreQuiz('self')");
  assert.equal(run("state.quizMode"), mode); assert.ok(element("quiz-note").textContent.includes(example.russian));
  assert.equal(run("state.quizDeck.length"), 6);
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
storage.set("greek-a1-self-quiz-direction", "ru-el");
run('openCategory("irregular-aorist"); state.selectedCards = new Set(["past-verb-2026091601"]); openQuizSetup(true); updateQuizSetup(); beginQuiz()');
assert.equal(run('state.quizKind'), 'self');
assert.equal(element('quiz-question').textContent, 'Λέω');
assert.ok(!element('quiz-note').textContent.includes('είπα'));
run('answerSelfQuiz(false); restoreQuiz("self")');
assert.match(element('quiz-feedback').textContent, /είπα/);
assert.equal(run("state.quizSpokenText"), "είπα");
assert.equal(storage.get("greek-a1-self-quiz-direction"), "ru-el");
assert.equal(run('state.quizDeck[0].card.id'), 'past-verb-2026091601');
run('openCategory("irregular-aorist"); state.selectedCards = new Set(["past-verb-20261116008"]); openQuizSetup(true); updateQuizSetup(); beginQuiz()');
assert.equal(element('quiz-question').textContent, 'Συμβαίνει');
run('answerSelfQuiz(false); restoreQuiz("self")');
assert.match(element('quiz-feedback').textContent, /συνέβη/);
const required = 'ακούω μένω ανεβαίνω μπαίνω αρέσω παθαίνω αρρωσταίνω παίρνω βάζω παραγγέλνω βγάζω πεθαίνω βγαίνω πέφτω βλέπω πηγαίνω πάω βρίσκω πίνω δίνω πλένω καίω στέλνω κάνω συμβαίνει καταλαβαίνω τρώω κατεβαίνω υπάρχω κλαίω φέρνω λέω φεύγω μαθαίνω φταίω'.split(' ');
const irregular = sets.find(set => set.id === 'irregular');
for (const name of required) {
  const verb = fixture.verbs.find(card => card.greek.toLowerCase() === name);
  assert.ok(verb && irregular.verbIds.includes(verb.id), name);
  assert.ok(fixture['past-conjugations'].some(card => card.verbId === verb.id), name);
}
run('openCategory("dictionary")');
for (const query of ['ΜΠΙΡΑ', 'μπύρα']) {
  assert.ok(run(`state.listQuery = "${query}"; visibleWordList().visible.some(card => card.id === "word-2026081407")`));
}
assert.ok(run('state.listQuery = "γι\' αυτό"; visibleWordList().visible.some(card => card.id === "word-20261118041")'));

const patterns = ["aorist-a", "aorist-e", "aorist-ax", "aorist-ix"].map(value => ({ value, checked: true }));
element("quiz-aorist-patterns").querySelectorAll = selector => selector === "input:checked" ? patterns.filter(input => input.checked) : patterns;
run('openCategory("aorist-patterns"); openQuizSetup()');
assert.deepEqual(patterns.map(({value}) => sets.find(set => set.id === value).verbIds.length), [10, 11, 3, 4]);
assert.equal(run("state.quizScope.length"), 28);
assert.equal(element("quiz-limit").value, "10");
assert.equal(run('state.quizScope.filter(item => item.card.forms["εγώ"] === "κοίταξα").length'), 1);
assert.ok(run('state.quizScope.some(item => item.card.forms["εγώ"] === "στενοχώρεσα / στενοχώρησα")'));
patterns.forEach(input => input.checked = input.value === "aorist-e");
run("updateQuizSetup()");
assert.equal(run("state.quizScope.length"), 11);
run('var callCard = state.quizScope.find(item => item.card.forms["εγώ"] === "κάλεσα").card; state.selectedCards = new Set([callCard.id]); state.quizSelectedOnly = true; updateQuizSetup(); beginQuiz()');
assert.equal(run("state.quizDeck.length"), 1);
assert.match(element("quiz-question").textContent, /Καλώ — /);
assert.ok(!element("quiz-note").textContent.includes("Κάλεσα"));
run('answerSelfQuiz(false); restoreQuiz("self")');
assert.match(element("quiz-feedback").textContent, /Καλώ → κάλεσα/);
assert.equal(run("state.quizSpokenText"), "κάλεσα");
assert.ok(run('progress.practice[callCard.id + ":pattern-recall"].lastCorrect === false && !progress.practice[callCard.id + ":εγώ"]'));
run('answerSelfQuiz(true)');
assert.ok(run('progress.practice[callCard.id + ":pattern-recall"].answers === 1'));
console.log("OK: aorist pattern groups, selected cards, hidden answer, pronunciation, restore and isolated progress");
