import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/lib/japanese/conjugation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exportsObject = {};
new Function("exports", compiled)(exportsObject);
const { conjugateVerb } = exportsObject;

const examples = [
  ["食べる", "たべる", "ru", "食べれば", "たべれば", "食べなければ", "たべなければ"],
  ["買う", "かう", "u", "買えば", "かえば", "買わなければ", "かわなければ"],
  ["書く", "かく", "u", "書けば", "かけば", "書かなければ", "かかなければ"],
  ["泳ぐ", "およぐ", "u", "泳げば", "およげば", "泳がなければ", "およがなければ"],
  ["話す", "はなす", "u", "話せば", "はなせば", "話さなければ", "はなさなければ"],
  ["待つ", "まつ", "u", "待てば", "まてば", "待たなければ", "またなければ"],
  ["死ぬ", "しぬ", "u", "死ねば", "しねば", "死ななければ", "しななければ"],
  ["読む", "よむ", "u", "読めば", "よめば", "読まなければ", "よまなければ"],
  ["遊ぶ", "あそぶ", "u", "遊べば", "あそべば", "遊ばなければ", "あそばなければ"],
  ["帰る", "かえる", "u", "帰れば", "かえれば", "帰らなければ", "かえらなければ"],
  ["ある", "ある", "u", "あれば", "あれば", "なければ", "なければ"],
  ["行く", "いく", "u", "行けば", "いけば", "行かなければ", "いかなければ"],
  ["する", "する", "suru", "すれば", "すれば", "しなければ", "しなければ"],
  ["勉強する", "べんきょうする", "suru", "勉強すれば", "べんきょうすれば", "勉強しなければ", "べんきょうしなければ"],
  ["来る", "くる", "kuru", "来れば", "くれば", "来なければ", "こなければ"],
  ["くる", "くる", "kuru", "くれば", "くれば", "こなければ", "こなければ"],
  ["持って来る", "もってくる", "kuru", "持って来れば", "もってくれば", "持って来なければ", "もってこなければ"],
];

for (const [base, reading, type, ba, baReading, negative, negativeReading] of examples) {
  test(`conditional forms for ${base} (${type})`, () => {
    const forms = conjugateVerb(base, reading, type);
    assert.deepEqual(forms.ba, { form: ba, reading: baReading });
    assert.deepEqual(forms.nakereba, { form: negative, reading: negativeReading });
    assert.equal(Object.keys(forms).length, 13);
    assert.ok(forms.masu && forms.te && forms.ta);
  });
}
