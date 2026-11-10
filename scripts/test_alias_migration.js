#!/usr/bin/env node
const assert = require("node:assert/strict"), fs = require("node:fs"), vm = require("node:vm"), path = require("node:path");
const storage = new Map();
const localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
storage.set("greek-a1-progress", JSON.stringify({ favorites: ["old", "new"], mistakes: ["old", "old-correct", "old-wrong", "old-legacy"], learned: ["old"], practice: {
  "old:εγώ": { answers: 2, correct: 1, lastAt: "2020", lastEventId: "old-event" },
  "new:εγώ": { answers: 3, correct: 3, lastAt: "2021", lastEventId: "new-event" },
  "old-correct": { answers: 1, correct: 0, lastCorrect: false, lastAt: "2020" },
  "new-correct": { answers: 1, correct: 1, lastCorrect: true, lastAt: "2021" },
  "old-wrong": { answers: 1, correct: 1, lastCorrect: true, lastAt: "2020" },
  "new-wrong": { answers: 1, correct: 0, lastCorrect: false, lastAt: "2021" }
}, games: { articles: { "single:old:noun:main:singular": { answers: 1, correct: 0, lastAt: "2020" } }, stress: {} } }));
for (const key of ["greek-a1-active-quiz", "greek-a1-active-self-quiz"]) storage.set(key, JSON.stringify({ keys: ["old", "new"], scopeKeys: ["old", "new"], candidateKeys: ["old"], seen: ["old"], answers: [{ key: "old", correct: false, eventId: "event" }], index: 1 }));
storage.set("greek-a1-active-game", JSON.stringify({ scopeKeys: ["old:stress:lemma-0"], units: [{keys:["old:stress:lemma-0"]}], answers:[{rows:[{key:"old:stress:lemma-0"}]}], selected:["old:stress:lemma-0"] }));
const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const ctx = vm.createContext({ localStorage, console, document: { getElementById() {}, addEventListener() {} }, window: {}, Map, Set, JSON });
vm.runInContext(source.slice(0, source.indexOf('document.addEventListener("click"')), ctx);
vm.runInContext('state.aliases = {old:"middle", middle:"new", "old-correct":"new-correct", "old-wrong":"new-wrong", "old-legacy":"new-legacy"}; migrateProgress()', ctx);
const first = new Map(storage);
vm.runInContext('migrateProgress()', ctx);
assert.deepEqual(storage, first);
const progress = JSON.parse(storage.get("greek-a1-progress"));
assert.deepEqual(progress.favorites, ["new"]);
assert.ok(!progress.mistakes.includes("new-correct"));
assert.ok(progress.mistakes.includes("new-wrong"));
assert.ok(progress.mistakes.includes("new-legacy"));
assert.equal(progress.practice["new:εγώ"].answers, 5);
assert.equal(progress.practice["new:εγώ"].lastEventId, "new-event");
assert.ok(progress.games.articles["single:new:noun:main:singular"]);
for (const key of ["greek-a1-active-quiz", "greek-a1-active-self-quiz"]) {
  const s = JSON.parse(storage.get(key));
  assert.deepEqual(s.keys, ["new", "new"]); // Historical positions and answers are retained.
  assert.equal(s.index, 1); assert.equal(s.answers[0].eventId, "event"); assert.equal(s.answers[0].key, "new");
}
const game = JSON.parse(storage.get("greek-a1-active-game"));
assert.equal(game.units[0].keys[0], "new:stress:lemma-0");
assert.equal(game.answers[0].rows[0].key, "new:stress:lemma-0");
console.log("OK: alias migration is idempotent and preserves active sessions");
