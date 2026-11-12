// Squeezes the free-exercise-db list (https://github.com/yuhonas/free-exercise-db, Unlicense / public domain) into the compact file the app
// bundles: names, level, equipment, category, the muscles worked and the written steps. Pictures are left out on purpose (they would add
// tens of megabytes and the app never downloads anything to show them).
//
//   node tools/build-exercise-lib.cjs tools/exercisedb-source.json src/data/exercisedb/library.json
const fs = require('fs');
const [, , input, output] = process.argv;
if (!input || !output) {
  console.error('usage: node tools/build-exercise-lib.cjs <source.json> <library.json>');
  process.exit(1);
}
const src = JSON.parse(fs.readFileSync(input, 'utf8'));
const lib = src.map((x) => ({
  n: x.name,
  l: x.level || 'beginner',
  e: x.equipment || 'none',
  c: x.category || 'strength',
  p: x.primaryMuscles || [],
  s: x.secondaryMuscles || [],
  i: x.instructions || [],
}));
fs.writeFileSync(output, JSON.stringify(lib));
console.log(`${lib.length} exercises, ${(fs.statSync(output).size / 1024).toFixed(0)} KB`);
