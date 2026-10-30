const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, ".."), G = require("../game-core.js");
const names = ["words", "professions", "verbs", "adverbs", "conjugations", "phrases", "nationalities", "months", "weekdays"];
const data = Object.fromEntries(names.map(type => [type, JSON.parse(fs.readFileSync(path.join(root, "data", type + ".json"), "utf8"))]));
const cards = names.flatMap(type => data[type].map(card => ({ ...card, type })));
for (const number of ["singular", "plural", "mixed"]) {
  const pool = G.nounEntries(cards, { number });
  assert.ok(pool.length > 100);
  assert.equal(new Set(pool.map(item => item.text + ":" + item.number)).size, pool.length);
  assert.ok(!pool.some(item => ["κτηνίατρος", "υπάλληλος", "αρχιτέκτονας"].includes(item.text)));
  for (const gender of G.genders) {
    const board = G.buildBoard(pool, gender);
    assert.equal(board.entries.length, 10);
    assert.ok(board.entries.some(item => item.gender === gender));
    assert.ok(board.entries.some(item => item.gender !== gender));
    const selected = board.entries.filter(item => item.gender === gender).map(item => item.key);
    assert.ok(G.gradeBoard(board, selected).every(row => row.correct));
    assert.ok(G.gradeBoard(board, selected.slice(1)).some(row => !row.correct));
    assert.ok(G.gradeBoard(board, [...selected, board.entries.find(item => item.gender !== gender).key]).some(row => !row.correct));
    assert.ok(G.buildBoard(pool, gender, board.entries.map(item => item.key)).entries.every(item => !board.entries.some(prior => prior.key === item.key)));
  }
}
const plural = G.nounEntries(cards, { number: "plural" });
assert.equal(G.article(plural.find(item => item.text === "τσάντες")), "οι");
assert.equal(G.article(plural.find(item => item.text === "ναύτες")), "οι");
assert.equal(G.article(plural.find(item => item.text === "μαθήματα")), "τα");
assert.ok(!G.nounEntries(cards, { number: "singular" }).some(item => item.text === "λεφτά"));
const sample = G.nounEntries(cards, { number: "singular" });
const two = [sample.find(x => x.gender === "feminine"), sample.find(x => x.gender === "neuter")];
assert.equal(G.buildBoard(two, "feminine").entries.length, 2);
assert.equal(G.buildBoard(two, "masculine"), null);
assert.equal(G.buildBoard([], "feminine"), null);
assert.equal(G.stripStress("μαΐου"), "μαϊου");
assert.equal(G.stripStress("ΰ"), "ϋ");
assert.equal(G.stripStress("ΜΆΘΗΜΑ"), "ΜΑΘΗΜΑ");
for (const value of ["πού", "πώς", "ή", "μπλε", "τα πράγματα", "πράγματά"]) assert.equal(G.stressInfo(value), null, value);
assert.deepEqual(G.stressInfo("κουλούρι").stressIndex, 5);
assert.equal(G.stressInfo("μαΐου").plain, "μαϊου");
const rentalNouns = G.nounEntries(cards, { number: "singular" });
for (const [word, expected] of [["ενοίκιο", "το"], ["νοίκι", "το"], ["μονοκατοικία", "η"], ["κατοικίδιο", "το"], ["σκυλάκος", "ο"], ["σκυλάκι", "το"]]) {
  const entry = rentalNouns.find(item => item.text === word);
  assert.ok(entry, word + " missing from article game");
  assert.equal(G.article(entry), expected);
}
for (const [word, expected] of [["ισόγειο", "το"], ["ημιώροφος", "ο"], ["πεζοδρόμιο", "το"], ["οδός", "η"], ["υπόγεια διάβαση", "η"]]) {
  const entry = rentalNouns.find(item => item.text === word);
  assert.ok(entry, word + " missing from article game");
  assert.equal(G.article(entry), expected);
}
const dogs = data.words.find(card => card.id === "word-2026080424");
assert.deepEqual(dogs.nounForms.slice(0, 3).map(form => form.key), ["variant-1", "variant-2", "variant-3"]);
const base = G.stressEntries(cards), cases = G.stressEntries(cards, { includeCases: true });
for (const word of ["ενοίκιο", "νοίκι", "σκυλάκος", "σκυλάκι", "νοικιού", "σκυλακιού"]) assert.ok(cases.some(item => item.text === word), word + " missing from stress game");
for (const word of ["ισόγειο", "ημιώροφος", "πεζοδρόμιο"]) assert.ok(base.some(item => item.text === word), word + " missing from stress game");
assert.ok(cases.length > base.length);
assert.ok(!base.some(item => item.formName.startsWith("genitive")));
for (const word of ["μαθήματος", "μαθημάτων", "ανθρώπου", "ανθρώπων", "παιδιού", "παιδιών"])
  assert.ok(cases.some(item => item.text === word), word);
for (const entry of cases) {
  assert.ok(entry.acceptedIndices.every(index => entry.vowelIndices.includes(index)));
  assert.equal((entry.plain.normalize("NFD").match(/\u0301/g) || []).length, 0);
  assert.ok(!["phrases", "conjugations"].includes(entry.type));
}
const alternate = G.stressEntries([{ id: "alt", type: "words", greek: "παράθυρου / παραθύρου", russian: "окна" }]);
assert.equal(alternate.length, 1); assert.equal(alternate[0].acceptedIndices.length, 2);
const metrics = {}, settings = { kind: "articles", mode: "single", material: "errors" };
G.updateMetric(metrics, G.metricKey(sample[0], settings), false, "2026-10-26");
assert.equal(G.filterPractice(sample, settings, metrics).length, 1);
assert.ok(!G.filterPractice(sample, { ...settings, material: "unpracticed" }, metrics).some(item => item.key === sample[0].key));
const genderKey = G.metricKey(sample[0], { kind: "articles", mode: "board" }, "feminine");
assert.notEqual(genderKey, G.metricKey(sample[0], settings));
assert.equal((fs.readFileSync(path.join(root, "index.html"), "utf8").match(/data-genitive-example/g) || []).length, 24);

// Integration: run the actual app functions against a small DOM stand-in.
const elements = new Map(), storage = new Map();
function element(id) {
  if (!elements.has(id)) {
    const classes = new Set();
    elements.set(id, { value: "all", checked: false, innerHTML: "", textContent: "", dataset: {}, style: {}, classes,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), toggle: (name, on) => on ? classes.add(name) : classes.delete(name) },
      querySelectorAll: () => [], setAttribute() {}, focus() {} });
  }
  return elements.get(id);
}
const context = vm.createContext({ console, Date, Map, Set, Math, JSON, fixture: data,
  localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
  document: { getElementById: element, querySelectorAll: () => [], querySelector: () => element("selector") },
  window: { scrollTo() {} },
});
vm.runInContext(fs.readFileSync(path.join(root, "game-core.js"), "utf8"), context);
const source = fs.readFileSync(path.join(root, "app.js"), "utf8");
vm.runInContext(source.slice(0, source.indexOf('document.addEventListener("click"')), context);
const run = code => vm.runInContext(code, context);
run("state.data = fixture");
for (const kind of ["articles", "stress"]) {
  run(`var settings = { kind: "${kind}", mode: "single", number: "singular", type: "all", material: "all", limit: "10" };
       var pool = rawGamePool(settings); startGameUnits(settings, pool, gameUnits(settings, pool));`);
  assert.ok(element("game-audio").classes.has("hidden"));
  assert.equal(element("game-feedback").innerHTML, "");
  if (kind === "stress") assert.ok(!element("game-choices").innerHTML.includes(run("gameEntry(gameSession.units[0].keys[0]).text")));
  run(kind === "stress" ? "answerGame(gameEntry(gameSession.units[0].keys[0]).acceptedIndices[0])" : "answerGame(GreekGames.article(gameEntry(gameSession.units[0].keys[0])))");
  assert.ok(!element("game-audio").classes.has("hidden"));
  assert.equal(run("gameSession.answers[0].correct"), true);
  const snapshot = storage.get("greek-a1-progress");
  run("answerGame('invalid')");
  assert.equal(storage.get("greek-a1-progress"), snapshot);
  run("gameSession = null; resumeGame()");
  assert.equal(run("gameSession.answers[0].correct"), true);
  assert.ok(!element("game-audio").classes.has("hidden"));
  run("nextGameQuestion()");
  assert.equal(run("gameSession.index"), 1);
  assert.ok(element("game-audio").classes.has("hidden"));
  run("for (var i=1;i<gameSession.units.length;i++){answerGame(-1); nextGameQuestion();}");
  assert.match(element("game-result-score").textContent, /^1 из 10/);
  assert.equal(storage.has("greek-a1-active-game"), false);
  assert.equal(run("Object.keys(progress.practice).length"), 0);
  run("var previous = new Set(gameSession.used); var next = gameUnits(gameSession.settings, gamePool, gameSession.used);");
  assert.equal(run("next.some(unit => unit.keys.some(key => previous.has(key)))"), false);
}
run(`settings = { kind: "articles", mode: "board", number: "plural", target: "feminine", material: "all" };
     pool = rawGamePool(settings); startGameUnits(settings, pool, gameUnits(settings, pool));
     var unit = gameSession.units[0];
     gameSelection = new Set(unit.keys.filter(key => gameEntry(key).gender === unit.target));
     gameSession.selected = [...gameSelection]; saveGame(); gameSelection.clear(); resumeGame(); answerGame();`);
assert.equal(run("gameSession.answers[0].correct"), true);
run("nextGameQuestion()");
assert.match(element("game-result-score").textContent, /1 из 1 раундов/);
run("startGameUnits(settings, pool, gameUnits(settings, pool)); gameSession.units[0].keys[0]='missing'; saveGame(); resumeGame();");
assert.equal(storage.has("greek-a1-active-game"), false);
assert.match(element("game-setup-summary").textContent, /Словарь обновился/);
console.log("OK: noun genders, plural articles, all board modes, stress/diaeresis, genitive forms, scoring, progress, restore and no repeated batches");
