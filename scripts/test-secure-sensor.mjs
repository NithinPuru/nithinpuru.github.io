// Regression test for the secure sensor + PUF explorer's model (public/secure_sensor_with_puf/model.js).
// Checks the published-cipher and maths building blocks, then the full attack verdict table, for several
// configurations, against the reviewed snapshot in secure-sensor-verdicts.json. A model change that flips
// a verdict fails here, so it has to be looked at (and the snapshot regenerated with --update) on purpose.
//
//   npm run test:sensor            # check
//   npm run test:sensor -- --update  # rewrite the snapshot after reviewing the diff
import { readFileSync, writeFileSync } from "node:fs";

const here = new URL(".", import.meta.url).pathname;
const src = readFileSync(new URL("../public/secure_sensor_with_puf/model.js", import.meta.url), "utf8");
// Function scope, not vm: the model is 3-4x slower in a vm context.
const M = new Function(src + `
return { simulate, handleRequest, TASKS, DEFAULTS, lab, state, grainSelfTest, erfcc, enroll, reconstruct, SRAMPUF,
  makeRng, failTail, ATTACKS, energySDSM, energyWords, PAPER, PUF_BITS, costModel };`)();

let failures = 0;
const check = (name, ok, detail = "") => { if (!ok) failures++; console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? "  " + detail : ""}`); };

// ---- building blocks
const g = M.grainSelfTest();
check("Grain-128a matches the paper's test vectors", g.ok, `${g.details.filter(d => d.ok).length}/${g.details.length}`);

for (const [x, v] of [[1, 0.157299207], [3, 2.209049699e-5], [5, 1.537459794e-12]]) {
  const e = Math.abs(M.erfcc(x) - v) / v;
  check(`erfc(${x}) relative error < 1e-6`, e < 1e-6, e.toExponential(1));
}

{ // BCH: every pattern of up to t errors is corrected exactly; the helper data never needs the secret
  const t = 40, puf = new M.SRAMPUF(3), en = M.enroll(puf, t, M.makeRng(5)), r = M.makeRng(9);
  let ok = true;
  for (const wt of [0, 1, 17, t]) {
    const w = en.w.slice(), idx = new Set();
    while (idx.size < wt) idx.add(r.int(M.PUF_BITS));
    idx.forEach(i => { w[i] ^= 1; });
    const rc = M.reconstruct(w, en.h, t);
    ok = ok && rc.ok && rc.key.every((b, i) => b === en.key[i]);
  }
  check("BCH corrects up to t errors exactly", ok);
}

{ // the energy model behind the cost section reproduces Fig. 4(b) of the paper
  let worst = 0;
  for (const [osr, , srnr, tri, sd] of M.PAPER.energy) {
    worst = Math.max(worst, Math.abs(M.energyWords(srnr, M.PAPER.power.trivium) * 1e6 - tri), Math.abs(M.energySDSM(osr, M.PAPER.power.sdsm) * 1e6 - sd));
  }
  check("energy model reproduces Fig. 4(b) within 0.05 µJ", worst < 0.05, `worst ${worst.toFixed(3)} µJ`);
}

{ // cost model: counting the original design's LFSRs with the cited cells lands near the paper's measured 24 µW
  const r = M.costModel();
  check("cost model: original design within 30% of the measured 24 µW", Math.abs(r.rows.orig.p / 24 - 1) < 0.3, r.rows.orig.p.toFixed(1) + " µW");
  check("cost model: Trivium count within 15% of the synthesised 2,390 GE", Math.abs(r.check.trivium[0] / r.check.trivium[1] - 1) < 0.15, Math.round(r.check.trivium[0]) + " GE");
}

{ // calibration: two channels of one chip land near the paper's measured bit-flip probabilities
  Object.assign(M.state, M.DEFAULTS);
  const o = M.TASKS.calib({}, () => {}), r = o.rows[0];
  check("Fig. 4(c) zero-input bit flips within 3 points of 50.05%", Math.abs(r.zero - 0.5005) < 0.03, (r.zero * 100).toFixed(1) + "%");
  check("Fig. 4(c) same-message bit flips within 3 points of 49.8%", Math.abs(r.same - 0.498) < 0.03, (r.same * 100).toFixed(1) + "%");
}

{ // PUF reliability: the exact tail agrees with a Monte Carlo run where it is large enough to count
  Object.assign(M.state, M.DEFAULTS, { temp: 110, bch_t: 30 });
  const o = M.TASKS.pufRel({ N: 4000 }, () => {}), mc = o.fails / o.N, sd = Math.sqrt(o.pNow * (1 - o.pNow) / o.N);
  check("PUF failure rate: exact vs Monte Carlo within 4 sigma", Math.abs(mc - o.pNow) < 4 * sd + 1e-3, `exact ${o.pNow.toExponential(2)}, MC ${mc.toExponential(2)}`);
  Object.assign(M.state, M.DEFAULTS);
  check("default chip key-failure rate below 1e-6", M.simulate({ scheme: "proposed" }).key_fail < 1e-6);
}

// ---- the verdict table
const CONFIGS = {
  default: {},
  "counter + MAC off": { mac: false },
  "perfect replica, no dither, no noise": { dither: false, int_noise: 0, lab: { mismatch: 0 } },
  "S2D buffer off": { buffer: 1 },
  "biased PUF (0.6)": { puf_bias: 0.6 },
};
const table = {}, LAB0 = { ...M.lab };          // each configuration starts from the page's default lab knobs
for (const [name, cfg] of Object.entries(CONFIGS)) {
  const { lab: labCfg = {}, ...st } = cfg;
  const S0 = { ...M.DEFAULTS, ...st }, L0 = { ...LAB0, ...labCfg };
  const lab = M.handleRequest({ type: "lab", state: S0, lab: L0 }, null, true).LR.res;
  const row = {};
  for (const a of M.ATTACKS) {
    const live = ["baseline", "proposed"].map(scheme => M.simulate({ ...S0, scheme, attack: a.id, atk: L0 }).atk.v);
    row[a.id] = { lab: [lab[a.id].base.v, lab[a.id].prop.v], live };
  }
  table[name] = row;
}
// lab and live model must agree wherever both judge the same thing
for (const [name, row] of Object.entries(table)) for (const [id, r] of Object.entries(row)) {
  if (["hleak", "htamper"].includes(id)) continue;                 // the lab varies these knobs itself
  if (r.lab.join() !== r.live.join()) check(`${name} / ${id}: lab and live model agree`, false, `lab ${r.lab} vs live ${r.live}`);
}
const snapFile = here + "secure-sensor-verdicts.json";
if (process.argv.includes("--update")) {
  writeFileSync(snapFile, JSON.stringify(table, null, 1) + "\n");
  console.log("snapshot written:", snapFile);
} else {
  const want = JSON.parse(readFileSync(snapFile, "utf8"));
  let diffs = 0;
  for (const [name, row] of Object.entries(want)) for (const [id, r] of Object.entries(row)) {
    const got = table[name] && table[name][id];
    if (!(got && got.lab.join() === r.lab.join() && got.live.join() === r.live.join())) { diffs++; console.log(`     ${name} / ${id}: want ${JSON.stringify(r)}, got ${JSON.stringify(got)}`); }
  }
  check("verdict table matches the reviewed snapshot", diffs === 0, `${Object.keys(table).length} configurations × ${M.ATTACKS.length} attacks × 2 designs × lab + live`);
}
console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);
