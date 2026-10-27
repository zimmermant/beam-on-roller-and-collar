// Mutation audit. Each row (tools/rows-generic.mjs and tools/rows-sim.mjs) breaks ONE behaviour in ONE file, runs the whole suite, and
// requires it to FAIL. A test that no mutation can fail is a test that cannot fail.
//
//   node tools/mutations.mjs              every row must be caught (the baseline suite runs first and must be green and non-empty)
//   node tools/mutations.mjs --only=TEXT  run only the rows whose file or name contains TEXT (case-insensitive);
//                                         for working on a few rows (coverage is meaningless for a partial run)
//   node tools/mutations.mjs --from=N     skip the first N rows (to resume, or to run only the newest rows)
//   node tools/mutations.mjs --dry        only check that every row applies, is unique, changes something and parses (seconds)
//   node tools/mutations.mjs --coverage   ALSO list every test that NO row makes fail (a test with no demonstrated teeth);
//                                         add --strict to exit 1 if there is any
//
// A row is REJECTED (and the run fails) if it is not a real behavioural mutation:
//   - its find text must be present exactly once, and the replacement must change something;
//   - a mutated .js/.mjs file must still PARSE (a syntax error makes every test fail trivially);
//   - no test FILE may fail to load (same reason);
//   - it may fail at most MAX_FAILING tests (a blunt mutation that breaks everything covers every test and proves
//     nothing). A row may carry its own limit as a fifth element, { max: N }, but only where the mutated thing
//     (the minus sign, say) is genuinely used by that many tests.
// A row's file is a src/ file name, or 'build.js', or a test-side or tools path ('test/unit-rule.js', 'test/units.test.js',
// 'tools/browser-harness.js'), so the tests of a helper (and of the drift test) are shown to fail too. The harness's
// browser-only functions cannot be mutated this way (node does not run them); its SIM copies and API are.
//
// EQUIVALENT MUTANTS. Some mutations cannot change behaviour (`x * 1` for `x`, a rewrite whose result is
// identical for every input the program can see, an `if` guard that duplicates one a line below). A suite cannot
// fail on those and must not: such a row can only ever show MISSED. Do not "fix" the suite for it; DROP the row,
// or find a replacement that really changes what the program does. Every MISSED row is either a missing test
// (write it) or an equivalent mutant (delete it): decide which, deliberately. If the mutated thing is a GUARD that no
// input can reach (`+ 0` after a clamp that cannot give -0), delete the guard from the code, not the test.
//
// RUNTIME. The whole suite runs once per row (every test file in parallel). The toy takes about two seconds per row (179 rows: six minutes);
// the reference project's full audit of 927 rows took 53 minutes. So: run the full audit rarely (before a release,
// after a refactor), and use --only= while writing rows.
//
// The run works on a TEMPORARY COPY of the project (COPY below, in the system temp directory). The real repository
// is never written, so an interrupted run (Ctrl-C) cannot leave a mutated source behind. The copy is removed at
// the end and on SIGINT / SIGTERM. Paths are relative to this file, so the tool works in any project folder.
import { readFileSync, writeFileSync, readdirSync, mkdtempSync, cpSync, rmSync, existsSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { GENERIC } from './rows-generic.mjs';
import { SIM_ROWS } from './rows-sim.mjs';

// rows-generic.mjs: rows for the files you do NOT edit when adopting the kit (build, unit rule, template markers, hover CSS,
// the FIELDS rules, the store, presets, controls). rows-sim.mjs: rows for your physics, scene, panel, harness SIM: replace.
const MUTATIONS = [...GENERIC, ...SIM_ROWS];

const MAX_FAILING = 12;
// What the suite needs to run. Add a file or folder here if a test reads it (tools/ is copied for the harness drift test).
const COPY = ['src', 'test', 'tools', 'build.js', 'package.json', '.gitignore'];

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const work = mkdtempSync(join(tmpdir(), 'sim-mut-'));
const root = work;                       // every path below reads, writes and runs inside the copy
for (const f of COPY) if (existsSync(join(repo, f))) cpSync(join(repo, f), join(work, f), { recursive: true });
const cleanup = () => rmSync(work, { recursive: true, force: true });
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { cleanup(); process.exit(130); });

// A project whose FIELDS has no input with `snap` (or `mark`) cannot catch the rows that break snap/zero-label/keyboard
// (or mark) code, and its tests for them skip themselves (test/snap.js). Such rows (opts { needsSnap: true } / { needsMark: true })
// are skipped and the skipped tests are not listed as uncovered; the run says so. Read from the real table, not by pattern.
const { FIELDS } = await import(pathToFileURL(join(repo, 'src', 'fields.js')).href);
const HAS = { needsSnap: FIELDS.some(f => f.snap), needsMark: FIELDS.some(f => f.mark) };
const skipNote = Object.entries(HAS).filter(([, has]) => !has).map(([k]) => k.replace('needs', '').toLowerCase());

const TEST_FILES = readdirSync(join(root, 'test')).filter(f => f.endsWith('.test.js')).sort();

function runFile(f) {
  return new Promise(resolve => {
    // TAP is pinned: runSuite parses "ok N - name" lines, and newer Node versions print the spec reporter by
    // default, which would leave every row with zero tests (all "MISSED", baseline "0 of 0").
    const p = spawn(process.execPath, ['--test', '--test-reporter=tap', join(root, 'test', f)], { cwd: root });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', () => resolve({ f, out }));
  });
}

// Run every test file in parallel; return the failing test ids and every test id.
async function runSuite() {
  const results = await Promise.all(TEST_FILES.map(runFile));
  const failing = [], all = [];
  for (const { f, out } of results) {
    for (const m of out.matchAll(/^(not )?ok \d+ - (.*)$/gm)) {
      const id = `${f} :: ${m[2]}`;
      all.push(id);
      if (m[1]) failing.push(id);
    }
  }
  return { failing, all };
}

// The baseline, once, before any row: if the parser finds no tests (a reporter change, a bad glob) every mutation
// would look uncaught, and if a test already fails every mutation would look caught. Either way the audit is void.
const first = await runSuite();
console.log(`baseline: ${first.all.length} tests, ${first.failing.length} failing`);
if (first.all.length === 0 || first.failing.length > 0) {
  console.error('ABORT: the baseline must be green and non-empty: a parser that finds no tests makes every mutation look uncaught' +
    (first.failing.length ? `\n  failing before any mutation:\n    ${first.failing.slice(0, 10).join('\n    ')}` : ''));
  cleanup();
  process.exit(2);
}

const coverage = process.argv.includes('--coverage');
const strict = process.argv.includes('--strict');
const dry = process.argv.includes('--dry');
const onlyArg = process.argv.find(a => a.startsWith('--only='));
const only = onlyArg ? onlyArg.slice('--only='.length).toLowerCase() : null;
const fromArg = process.argv.find(a => a.startsWith('--from='));
const from = fromArg ? Number(fromArg.slice('--from='.length)) : 0;
let bad = 0, ran = 0, skippedRows = 0;
const everFailed = new Set();
for (const [file, what, find, replace, opts = {}] of MUTATIONS.slice(from)) {
  if (only && !`${file} ${what}`.toLowerCase().includes(only)) continue;
  if (Object.keys(HAS).some(k => opts[k] && !HAS[k])) { skippedRows++; continue; }
  ran++;
  const path = /^(build\.js|package\.json|\.gitignore)$/.test(file) || /^(test|tools)\//.test(file) ? join(root, file) : join(root, 'src', file);
  const original = readFileSync(path, 'utf8');
  if (!original.includes(find)) { console.log(`?? CANNOT APPLY  ${file}: ${what}  (pattern not found)`); bad++; continue; }
  if (original.split(find).length > 2) { console.log(`?? AMBIGUOUS     ${file}: ${what}  (pattern occurs more than once)`); bad++; continue; }
  if (original.replace(find, () => replace) === original) { console.log(`?? NO-OP         ${file}: ${what}  (the replacement changes nothing)`); bad++; continue; }
  try {
    writeFileSync(path, original.replace(find, () => replace));
    // Only JavaScript can be syntax-checked; a mutated HTML or CSS file is checked by the tests that read it,
    // and by the file-level-failure guard below.
    if (/\.(m?js)$/.test(file)) {
      const parse = spawnSync(process.execPath, ['--check', path], { encoding: 'utf8' });
      if (parse.status !== 0) { console.log(`?? DOES NOT PARSE ${file}: ${what}`); bad++; continue; }
    }
    if (dry) continue;
    const { failing } = await runSuite();
    // A test file that fails to LOAD is reported as a failure named after the file itself.
    const fileLevel = failing.filter(id => / :: (?:.*[\\/])?test[\\/].*\.test\.js$/.test(id));
    if (fileLevel.length) { console.log(`?? BREAKS LOADING ${file}: ${what}  (${fileLevel.join(', ')})`); bad++; continue; }
    const limit = opts.max || MAX_FAILING;
    if (failing.length > limit) {
      console.log(`?? TOO BLUNT     ${String(failing.length).padStart(3)} failing  ${file}: ${what}  (limit ${limit}; raise it with { max: N } only if that many tests really use the mutated thing)`);
      for (const id of failing.slice(0, 15)) console.log(`      ${id}`);
      if (failing.length > 15) console.log(`      ... and ${failing.length - 15} more`);
      bad++; continue;
    }
    failing.forEach(id => everFailed.add(id));
    const ok = failing.length > 0;
    if (!ok) bad++;
    console.log(`${ok ? 'caught ' : 'MISSED '} ${String(failing.length).padStart(3)} failing  ${file}: ${what}`);
  } finally {
    writeFileSync(path, original);   // restores the copy between rows; the repo is never touched
  }
}
if (skipNote.length) {
  console.log(`no input in src/fields.js has ${skipNote.join(' or ')}: skipped ${skippedRows} row(s) that need one, and tests that skip themselves are not listed as uncovered`);
}
if (only && ran === 0) { console.log(`no row matches --only=${only}`); cleanup(); process.exit(1); }
const base = await runSuite();
console.log(`\nbaseline after restore: ${base.failing.length} failing of ${base.all.length} tests`);
let uncovered = [];
if (coverage) {
  // a test that skips itself (`# SKIP`) because no input has snap/mark is not "uncovered": there is nothing for it to test
  const skipsOk = (id) => / # SKIP\b/.test(id) && skipNote.length > 0;
  uncovered = base.all.filter(id => !everFailed.has(id) && !skipsOk(id));
  console.log(`\n${base.all.length - uncovered.length} of ${base.all.length} tests are made to fail by at least one mutation.`);
  if (uncovered.length) {
    console.log(`${uncovered.length} test(s) that NO mutation makes fail:`);
    for (const id of uncovered) console.log(`   ${id}`);
  } else {
    console.log('every test is made to fail by at least one mutation');
  }
}
cleanup();
if (bad || base.failing.length !== 0) { console.log(`${bad} mutation(s) not caught`); process.exit(1); }
console.log(dry ? `dry run: all ${ran} rows apply, are unique, change something and parse (nothing was run against the tests)` : `all ${ran} mutations caught`);
if (strict && uncovered.length) process.exit(1);
