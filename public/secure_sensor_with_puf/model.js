// Secure sensor + PUF explorer: the behavioural model, attack experiments and analysis tasks.
// Loaded by index.html (UI + main-thread fallback), by worker.js (background runs) and by
// scripts/test-secure-sensor.mjs (regression test). No DOM access in here.

// ===== CORE-START =====
// Behavioural model of the S-DSM link (baseline) and the SRAM-PUF + Grain-128a proposal.
// Same model as the Python version, ported so every node can be probed in the browser.

const FS = 10e6, OSR = 50, FS_OUT = FS / OSR, VDD = 1.2, VCM = 0.6;
const N_FFT = 2048, N_OUT = N_FFT + 100, N_DSM = N_OUT * OSR;
const PUF_BITS = 600, ID_BITS = 16;
const PREAMBLE = Uint8Array.from({ length: 32 }, (_, i) => (i % 2 ? 0 : 1));
const SYNC = Uint8Array.from((0xB5E3).toString(2).padStart(16, "0"), c => +c);

// ---------- random numbers (seeded, so every run is repeatable)
function makeRng(seed) {
  let a = seed >>> 0, spare = null;
  const u = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    u,
    int: n => Math.floor(u() * n),
    n() {
      if (spare !== null) { const s = spare; spare = null; return s; }
      let x, y, s;
      do { x = u() * 2 - 1; y = u() * 2 - 1; s = x * x + y * y; } while (s >= 1 || s === 0);
      const m = Math.sqrt(-2 * Math.log(s) / s);
      spare = y * m; return x * m;
    },
  };
}

// ---------- keystream generators
class LFSR16 {                       // x^16 + x^14 + x^13 + x^11 + 1 (stand-in polynomial)
  constructor(seed) { this.s = (seed & 0xFFFF) || 1; }
  bit() {
    const s = this.s, fb = (s ^ (s >> 2) ^ (s >> 3) ^ (s >> 5)) & 1;
    this.s = (s >> 1) | (fb << 15); return s & 1;
  }
  bits(n) { const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = this.bit(); return o; }
}

// Grain-128a (Ågren, Hell, Johansson, Meier 2011), checked against the paper's Table 3 / Appendix A
// test vectors by grainSelfTest(). It replaces the illustrative NLFSR of earlier versions of this page.
/*
 * Grain-128a stream cipher with optional authentication.
 *
 * Specification: M. Agren, M. Hell, T. Johansson, W. Meier, "Grain-128a: a new
 * version of Grain-128 with optional authentication", International Journal of
 * Wireless and Mobile Computing 5(1):48-59, 2011, doi:10.1504/IJWMC.2011.044106.
 * Authors' copy (Lund University Publications):
 *   https://lup.lub.lu.se/search/files/3454246/2296485.pdf
 * Test vectors: Table 3 and Appendix A of that paper (reproduced verbatim in
 * GRAIN_TEST_VECTORS below).
 *
 * This is Grain-128a, NOT Grain-128AEAD / Grain-128AEADv2 (NIST LWC), which
 * changed the initialisation (key re-introduction) and the MAC.
 *
 * Bit conventions (identical to the paper's test vectors, Appendix A: "the first
 * bit emitted as keystream is the most significant one"):
 *   - Every bit array is a Uint8Array of 0/1 values, index i = bit i of the spec
 *     (keyBits[i] = k_i, ivBits[i] = IV_i, enc[i] = z_i, ...).
 *   - Hex strings are read as one big-endian bit string: bit 0 is the most
 *     significant bit of the first hex digit. So key "0123..." gives k_0..k_7 =
 *     0,0,0,0,0,0,0,1, and IV "8000..." has IV_0 = 1 (authentication mode).
 *   - 32-bit numbers (A0, R0, tag) hold element 0 in bit 31 (MSB) and element 31
 *     in bit 0: A0 = a^0_0..a^31_0 = y_0..y_31, R0 = r_0..r_31 = y_32..y_63,
 *     tag = t_0..t_31. Printed as 8 hex digits they match the paper exactly, and
 *     a w-bit tag t^(w)_i = t_(32-w+i) is simply (tag & (2^w - 1)).
 *
 * Works as a classic browser/worker script (top-level declarations, no
 * import/export) and in Node (vm, or require() via the guarded export at the end).
 */

// Pre-output generator core. State at time t: s_t..s_t+127 = s[q..q+127],
// b_t..b_t+127 = b[q..q+127]. Runs n clocks starting at q = p, writing the new
// register bits to s[q+128], b[q+128] (caller guarantees room). During
// initialisation (init = true) the pre-output bit is fed back into both
// registers; otherwise it is written to out[o + k].
function _grainRun(s, b, p, n, out, o, init) {
  for (let k = 0; k < n; k++) {
    const q = p + k;
    const b12 = b[q + 12], b95 = b[q + 95];
    // y_t = h(x) + s_t+93 + sum_{j in A} b_t+j, A = {2,15,36,45,64,73,89}
    // h = x0x1 + x2x3 + x4x5 + x6x7 + x0x4x8 with
    // (x0..x8) = (b12, s8, s13, s20, b95, s42, s60, s79, s94)
    const y =
      (b12 & s[q + 8]) ^ (s[q + 13] & s[q + 20]) ^ (b95 & s[q + 42]) ^
      (s[q + 60] & s[q + 79]) ^ (b12 & b95 & s[q + 94]) ^
      s[q + 93] ^
      b[q + 2] ^ b[q + 15] ^ b[q + 36] ^ b[q + 45] ^ b[q + 64] ^ b[q + 73] ^ b[q + 89];
    const st = s[q];
    // s_t+128 = s_t + s_t+7 + s_t+38 + s_t+70 + s_t+81 + s_t+96
    let fs = st ^ s[q + 7] ^ s[q + 38] ^ s[q + 70] ^ s[q + 81] ^ s[q + 96];
    // b_t+128 = s_t + b_t + b_t+26 + b_t+56 + b_t+91 + b_t+96 + b3b67 + b11b13
    //   + b17b18 + b27b59 + b40b48 + b61b65 + b68b84 + b88b92b93b95
    //   + b22b24b25 + b70b78b82
    let fb =
      st ^ b[q] ^ b[q + 26] ^ b[q + 56] ^ b[q + 91] ^ b[q + 96] ^
      (b[q + 3] & b[q + 67]) ^ (b[q + 11] & b[q + 13]) ^ (b[q + 17] & b[q + 18]) ^
      (b[q + 27] & b[q + 59]) ^ (b[q + 40] & b[q + 48]) ^ (b[q + 61] & b[q + 65]) ^
      (b[q + 68] & b[q + 84]) ^ (b[q + 88] & b[q + 92] & b[q + 93] & b95) ^
      (b[q + 22] & b[q + 24] & b[q + 25]) ^ (b[q + 70] & b[q + 78] & b[q + 82]);
    if (init) { fs ^= y; fb ^= y; } else out[o + k] = y;
    s[q + 128] = fs;
    b[q + 128] = fb;
  }
}

function _grainCheckBits(bits, n, name) {
  if (!bits || bits.length !== n) throw new RangeError(name + ' must have exactly ' + n + ' bits');
  for (let i = 0; i < n; i++) {
    if (bits[i] !== 0 && bits[i] !== 1) throw new RangeError(name + '[' + i + '] is not 0 or 1');
  }
}

const _GRAIN_CAP = 8192; // clocks per buffer window before sliding the registers back

class Grain128a {
  // keyBits: 128 bits (k_0..k_127), ivBits: 96 bits (IV_0..IV_95).
  // Authentication mode iff ivBits[0] === 1 (Section 2.2).
  constructor(keyBits, ivBits) {
    _grainCheckBits(keyBits, 128, 'keyBits');
    _grainCheckBits(ivBits, 96, 'ivBits');
    this._s = new Uint8Array(_GRAIN_CAP + 128); // LFSR window
    this._b = new Uint8Array(_GRAIN_CAP + 128); // NFSR window
    this._p = 0;
    // Section 2.1: b_i = k_i; s_i = IV_i (i < 96); s_96..s_126 = 1; s_127 = 0.
    for (let i = 0; i < 128; i++) this._b[i] = keyBits[i];
    for (let i = 0; i < 96; i++) this._s[i] = ivBits[i];
    for (let i = 96; i < 127; i++) this._s[i] = 1;
    this._s[127] = 0;
    // 256 clocks with the pre-output fed back into both registers.
    _grainRun(this._s, this._b, 0, 256, null, 0, true);
    this._p = 256;
  }

  _slide() {
    if (this._p === _GRAIN_CAP) {
      this._s.copyWithin(0, _GRAIN_CAP, _GRAIN_CAP + 128);
      this._b.copyWithin(0, _GRAIN_CAP, _GRAIN_CAP + 128);
      this._p = 0;
    }
  }

  // Next pre-output bit y_t (the first call after construction returns y_0).
  pre() {
    this._slide();
    const out = [0];
    _grainRun(this._s, this._b, this._p, 1, out, 0, false);
    this._p++;
    return out[0];
  }

  // Bulk form of pre(): writes the next n pre-output bits to out[o..o+n-1].
  _fill(out, o, n) {
    while (n > 0) {
      this._slide();
      const k = Math.min(n, _GRAIN_CAP - this._p);
      _grainRun(this._s, this._b, this._p, k, out, o, false);
      this._p += k;
      o += k;
      n -= k;
    }
  }
}

// Authentication mode (IV_0 = 1): enc[i] = z_i = y_(64+2i) for i < nEnc;
// auth[i] = y_(64+2i+1) (the "macstream": the bits shifted into the shift
// register, r_(32+i) = auth[i]) for i < nEnc + 64; A0 = y_0..y_31 (accumulator),
// R0 = y_32..y_63 (shift register) as 32-bit numbers, element 0 in the MSB.
// A message of L bits needs auth.length >= L.
// Non-authentication mode (IV_0 = 0): { enc } with enc[i] = z_i = y_i.
function grainKeystream(keyBits, ivBits, nEnc) {
  if (!Number.isInteger(nEnc) || nEnc < 0) throw new RangeError('nEnc must be a non-negative integer');
  const g = new Grain128a(keyBits, ivBits);
  if (ivBits[0] !== 1) {
    const enc = new Uint8Array(nEnc);
    g._fill(enc, 0, nEnc);
    return { enc };
  }
  const nAuth = nEnc + 64;
  const y = new Uint8Array(64 + 2 * nAuth); // y_0 .. y_(2 nEnc + 191)
  g._fill(y, 0, y.length);
  let A0 = 0, R0 = 0;
  for (let i = 0; i < 32; i++) {
    A0 = (A0 << 1) | y[i];
    R0 = (R0 << 1) | y[32 + i];
  }
  const enc = new Uint8Array(nEnc);
  for (let i = 0; i < nEnc; i++) enc[i] = y[64 + 2 * i];
  const auth = new Uint8Array(nAuth);
  for (let i = 0; i < nAuth; i++) auth[i] = y[65 + 2 * i];
  return { enc, auth, A0: A0 >>> 0, R0: R0 >>> 0 };
}

// Section 2.4: message m_0..m_(L-1), padding m_L = 1; for 0 <= i <= L:
// a^j_(i+1) = a^j_i + m_i r_(i+j) (0 <= j <= 31), r_(i+32) = y_(64+2i+1).
// Returns the 32-bit tag t_0..t_31 (t_0 in the MSB) as an unsigned number.
function grainTag(msgBits, ks) {
  if (!ks || !ks.auth) throw new Error('grainTag needs an authentication-mode keystream (IV_0 = 1)');
  const L = msgBits.length;
  const auth = ks.auth;
  if (auth.length < L) throw new RangeError('auth stream too short: a ' + L + '-bit message needs ' + L + ' auth bits, have ' + auth.length);
  let A = ks.A0 >>> 0;
  let R = ks.R0 >>> 0; // r_i..r_(i+31), r_i in the MSB
  for (let i = 0; i < L; i++) {
    const m = msgBits[i];
    if (m === 1) A ^= R;
    else if (m !== 0) throw new RangeError('msgBits[' + i + '] is not 0 or 1');
    R = (R << 1) | auth[i];
  }
  A ^= R; // padding bit m_L = 1
  return A >>> 0;
}

// Hex -> bits, MSB of the first hex digit first (the paper's convention).
// Whitespace and a leading "0x" are ignored. nBits defaults to 4 * digits; a
// smaller nBits keeps the leading bits (Appendix A writes the 41-bit m4 as
// "123456789e8"). Asking for more bits than the string holds is an error.
function grainHexToBits(hex, nBits) {
  let h = String(hex).replace(/\s+/g, '');
  if (/^0x/i.test(h)) h = h.slice(2);
  if (!/^[0-9a-fA-F]*$/.test(h)) throw new RangeError('not a hex string: ' + hex);
  if (nBits === undefined) nBits = 4 * h.length;
  if (!Number.isInteger(nBits) || nBits < 0 || nBits > 4 * h.length) {
    throw new RangeError('hex string holds ' + 4 * h.length + ' bits, ' + nBits + ' requested');
  }
  const bits = new Uint8Array(nBits);
  for (let i = 0; i < nBits; i++) {
    bits[i] = (parseInt(h[i >> 2], 16) >> (3 - (i & 3))) & 1;
  }
  return bits;
}

// Bits -> lowercase hex, bit 0 = MSB of the first digit. A trailing partial
// nibble is padded with zero bits on the right (41 bits -> "123456789e8").
function grainBitsToHex(bits) {
  let out = '';
  for (let i = 0; i < bits.length; i += 4) {
    let d = 0;
    for (let j = 0; j < 4; j++) d = (d << 1) | (i + j < bits.length ? bits[i + j] & 1 : 0);
    out += d.toString(16);
  }
  return out;
}

// Table 3 and Appendix A of the IJWMC paper (authors' copy, Lund University:
// https://lup.lub.lu.se/search/files/3454246/2296485.pdf), copied verbatim.
// The 320-bit "pre-output stream" is y_0..y_319; with IV_0 = 0 it is also the
// keystream ("see pre-output stream above"). keystream/macstream are 128 bits
// each (y_64, y_66, ... / y_65, y_67, ...).
const GRAIN_TEST_VECTORS = [
  {
    key: '0000000000000000 0000000000000000',
    iv: '0000000000000000 00000000',
    pre: 'c0207f221660650b 6a952ae26586136f a0904140c8621cfe 8660c0dec0969e94 36f4ace92cf1ebb7'
  },
  {
    key: '0123456789abcdef 123456789abcdef0',
    iv: '0123456789abcdef 12345678',
    pre: 'f88720c13f46e6a4 3c07eeed89161a4d d73bd6b8be8b6b11 6879714ebb630e0a 4c12f0399412982c'
  },
  {
    key: '0000000000000000 0000000000000000',
    iv: '8000000000000000 00000000',
    pre: '564b362219bd90e3 01f259cf52bf5da9 deb1845be6993abd 2d3c77c4acb90e42 2640fbd6e8ae642a',
    accumulator: '564b3622',
    register: '19bd90e3',
    keystream: '0d2b1f2ebc83da7e 6658ee3150f9ef47',
    macstream: '1cdbc7f1e52da547 36fa252828de82a0',
    tags: ['4ff6a6c1', '653017e4', '7c8d8707', '522ab34f', '4b7821c9']
  },
  {
    key: '0123456789abcdef 123456789abcdef0',
    iv: '8123456789abcdef 12345678',
    pre: '7f2acdb7adfb701f 8d2083b3c32b43f1 962b3dcabf679378 db3536bfc25bed48 3008e6bcb395a156',
    accumulator: '7f2acdb7',
    register: 'adfb701f',
    keystream: 'a49d971c976bf596 b45f93e242ded8c1',
    macstream: '3015919d61787b5c d7678db840a6571e',
    tags: ['d2d1bda8', '24dc2d89', '89275d96', '379d2899', '9226b196'],
    tag16m4: 'b196' // "The 16-bit tag for m4 authenticated using the key and IV in the right-most column is b196."
  }
];

// Appendix A messages: m0 = empty; m1 = 0 and m2 = 1 (length 1, "m1 = m2 + 1 = 0");
// m3 = 12340 (20 bits); m4 = 123456789e8 (41 bits) = the explicit bit string below.
const GRAIN_TEST_MESSAGES = [
  { hex: '', bits: 0 },
  { hex: '0', bits: 1 },
  { hex: '8', bits: 1 },
  { hex: '12340', bits: 20 },
  { hex: '123456789e8', bits: 41 }
];
const GRAIN_M4_BITSTRING = '00010010001101000101011001111000100111101';

function grainSelfTest() {
  const details = [];
  const check = (name, expected, got) => {
    details.push({ name, ok: expected === got, expected, got });
  };
  const hex32 = (x) => (x >>> 0).toString(16).padStart(8, '0');
  const strip = (h) => h.replace(/\s+/g, '');

  const m4 = grainHexToBits(GRAIN_TEST_MESSAGES[4].hex, 41);
  check('m4 hex notation = Appendix A bit string', GRAIN_M4_BITSTRING, Array.from(m4).join(''));

  GRAIN_TEST_VECTORS.forEach((tv, n) => {
    const tag = 'TV' + (n + 1) + ' ';
    const key = grainHexToBits(tv.key, 128);
    const iv = grainHexToBits(tv.iv, 96);
    const pre = strip(tv.pre);

    const g = new Grain128a(key, iv);
    const y = new Uint8Array(4 * pre.length);
    for (let i = 0; i < y.length; i++) y[i] = g.pre();
    check(tag + 'pre-output y_0..y_319 (pre())', pre, grainBitsToHex(y));

    if (iv[0] === 0) {
      const ks = grainKeystream(key, iv, 4 * pre.length);
      check(tag + 'keystream z_i = y_i (IV_0 = 0)', pre, grainBitsToHex(ks.enc));
      return;
    }
    const nEnc = 4 * strip(tv.keystream).length;
    const ks = grainKeystream(key, iv, nEnc);
    check(tag + 'accumulator A0', tv.accumulator, hex32(ks.A0));
    check(tag + 'register R0', tv.register, hex32(ks.R0));
    check(tag + 'keystream z_i = y_(64+2i)', strip(tv.keystream), grainBitsToHex(ks.enc));
    check(tag + 'macstream y_65, y_67, ...', strip(tv.macstream), grainBitsToHex(ks.auth.subarray(0, nEnc)));
    GRAIN_TEST_MESSAGES.forEach((m, j) => {
      const t = grainTag(grainHexToBits(m.hex, m.bits), ks);
      check(tag + 'tag(m' + j + ')', tv.tags[j], hex32(t));
      if (j === 4 && tv.tag16m4) {
        check(tag + '16-bit tag(m4)', tv.tag16m4, (t & 0xffff).toString(16).padStart(4, '0'));
      }
    });
  });

  return { ok: details.every((d) => d.ok), details };
}

// ---------- frame counter + MAC (proposal): Grain-128a's own authentication mode
// IV (96 bits): IV_0 = 1 selects authentication, then the receiver's 32-bit session nonce and the 32-bit
// frame counter. With the counter + MAC off the IV is all zeros: no authentication, and the same
// keystream at every power-up. In authentication mode even pre-output bits encrypt, odd bits feed the
// MAC (a 32-bit accumulator and shift register loaded from the first 64 pre-output bits).
const u32bits = v => Uint8Array.from({ length: 32 }, (_, i) => (v >>> (31 - i)) & 1);
const bitsU32 = (b, o = 0) => { let v = 0; for (let i = 0; i < 32; i++) v = ((v << 1) | (b[o + i] & 1)) >>> 0; return v; };
const IV0 = new Uint8Array(96);
const ivBits = (nonce, ctr) => { const o = new Uint8Array(96); o[0] = 1; o.set(u32bits(nonce), 1); o.set(u32bits(ctr), 33); return o; };
const keystreamNL = (key, iv, nEnc) => grainKeystream(key, iv || IV0, nEnc);
const macTag = (msg, ks) => grainTag(msg, ks);
function macMsg(ctrBits, encId, C) { const m = new Uint8Array(32 + ID_BITS + C.length); m.set(ctrBits, 0); m.set(encId, 32); m.set(C, 32 + ID_BITS); return m; }
// Receiver side: rebuild the keystream from (key, nonce, received counter) and compare tags
function macVerify(key, nonce, ctr, encId, C, tag) {
  const ks = keystreamNL(key, ivBits(nonce, ctr), ID_BITS + C.length), t = macTag(macMsg(u32bits(ctr), encId, C), ks);
  return { ok: t === tag, tag: t, ks };
}

// ---------- analog front end
const tia = (i, r) => Math.min(VDD, Math.max(0, VCM + i * r));
const s2d = (v, g) => g * (v - VCM) / (VDD / 2);

// ---------- 2nd-order 1-bit DSM (Boser-Wooley), dither at the comparator decision
// o.at: where the dither ladder acts. "comparator" perturbs the decision (gain and threshold), which
// the noise shaping pushes out of band; "feedback" scales the ±Vref fed back to both integrators.
// o.intNoise: input-referred thermal noise of the first integrator, rms in full-scale units per clock.
function dsm2(u, o, rng) {
  const n = u.length, D = new Uint8Array(n), X1 = new Float32Array(n), X2 = new Float32Array(n), DI = new Float32Array(n);
  const l1 = new LFSR16(o.seeds[0]), l2 = new LFSR16(o.seeds[1]), fb = o.at === "feedback", ni = o.intNoise || 0;
  let x1 = 0, x2 = 0, y = 1, clip = 0, dPrev = 0;
  for (let k = 0; k < n; k++) {
    const v = (y ? 1 : -1) * (fb ? 1 + dPrev : 1);
    x1 += 0.5 * (u[k] - v) + (ni ? ni * rng.n() : 0);
    x2 += 0.5 * (x1 - v);
    if (Math.abs(x1) > o.xlim || Math.abs(x2) > o.xlim) {
      clip++;
      x1 = Math.max(-o.xlim, Math.min(o.xlim, x1));
      x2 = Math.max(-o.xlim, Math.min(o.xlim, x2));
    }
    const d = o.dither ? o.amp * (l1.bit() - l2.bit()) : 0;
    y = (fb ? x2 : x2 * (1 + d) + d) + o.noise * rng.n() >= 0 ? 1 : 0;
    dPrev = d;
    D[k] = y; X1[k] = x1; X2[k] = x2; DI[k] = d;
  }
  return { D, X1, X2, DI, clip: clip / n };
}

const dsmOpts = (P, seeds) => ({ dither: P.dither, amp: P.dither_amp, seeds: seeds || P.dither_seeds, xlim: P.xlim, noise: P.comp_noise, at: P.dither_at, intNoise: P.int_noise });

// ---------- Rx decimation
function cic(D, R = OSR, order = 3) {
  let x = Float64Array.from(D, b => 2 * b - 1);
  for (let o = 0; o < order; o++) for (let i = 1; i < x.length; i++) x[i] += x[i - 1];
  let y = new Float64Array(Math.floor(x.length / R));
  for (let j = 0; j < y.length; j++) y[j] = x[j * R + R - 1];
  for (let o = 0; o < order; o++) for (let j = y.length - 1; j > 0; j--) y[j] -= y[j - 1];
  const g = R ** order;
  for (let j = 0; j < y.length; j++) y[j] /= g;
  return y;
}

const COMP_TAPS = (() => {           // flattens CIC droop up to 0.4 x fs_out (80 kHz)
  const R = OSR, N = 31, M = 15, h = new Float64Array(N), K = 512;
  const G = f => {
    if (f > 0.4) return 0;
    if (f === 0) return 1;
    return 1 / Math.abs(Math.sin(Math.PI * f) / (R * Math.sin(Math.PI * f / R))) ** 3;
  };
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (let k = 0; k <= K; k++) {
      const f = 0.5 * k / K, w = k === 0 || k === K ? 0.5 : 1;
      s += w * G(f) * Math.cos(2 * Math.PI * f * (n - M));
    }
    h[n] = 2 * s * (0.5 / K) * (0.54 - 0.46 * Math.cos(2 * Math.PI * n / (N - 1)));
  }
  const dc = h.reduce((a, b) => a + b, 0);
  return h.map(v => v / dc);
})();

function fir(x, h) {
  const y = new Float64Array(x.length);
  for (let n = 0; n < x.length; n++) {
    let s = 0;
    for (let k = 0; k < h.length && k <= n; k++) s += h[k] * x[n - k];
    y[n] = s;
  }
  return y;
}

// ---------- FFT / spectra
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

function bhWindow(n) {
  return Float64Array.from({ length: n }, (_, i) => {
    const x = 2 * Math.PI * i / (n - 1);
    return 0.35875 - 0.48829 * Math.cos(x) + 0.14128 * Math.cos(2 * x) - 0.01168 * Math.cos(3 * x);
  });
}

function sndr(y, bin) {
  const n = N_FFT, seg = y.slice(y.length - n), w = bhWindow(n);
  const mean = seg.reduce((a, b) => a + b, 0) / n;
  const re = Float64Array.from(seg, (v, i) => (v - mean) * w[i]), im = new Float64Array(n);
  fft(re, im);
  let sig = 0, tot = 0;
  for (let k = 4; k < n / 2; k++) {
    const p = re[k] ** 2 + im[k] ** 2;
    tot += p;
    if (Math.abs(k - bin) <= 4) sig += p;
  }
  return 10 * Math.log10(sig / Math.max(tot - sig, 1e-30));
}

function psd(x, fs, seg = 8192) {   // averaged, Hann-windowed periodogram
  seg = Math.min(seg, 1 << Math.floor(Math.log2(x.length)));
  const w = Float64Array.from({ length: seg }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (seg - 1)));
  const wp = w.reduce((a, b) => a + b * b, 0);
  const P = new Float64Array(seg / 2);
  let cnt = 0;
  for (let s = 0; s + seg <= x.length; s += seg / 2) {
    let mean = 0;
    for (let i = 0; i < seg; i++) mean += x[s + i];
    mean /= seg;
    const re = Float64Array.from({ length: seg }, (_, i) => (x[s + i] - mean) * w[i]), im = new Float64Array(seg);
    fft(re, im);
    for (let k = 0; k < seg / 2; k++) P[k] += (re[k] ** 2 + im[k] ** 2) / (fs * wp);
    cnt++;
  }
  return { f: Float64Array.from({ length: seg / 2 }, (_, k) => k * fs / seg), p: P.map(v => 10 * Math.log10(v / cnt + 1e-30)) };
}

// ---------- SHA-256 (stand-in for the on-chip hash)
function sha256(bytes) {
  const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const l = bytes.length, padLen = ((l + 9 + 63) >> 6) << 6, m = new Uint8Array(padLen);
  m.set(bytes); m[l] = 0x80;
  const bits = l * 8;
  m[padLen - 4] = (bits >>> 24) & 255; m[padLen - 3] = (bits >>> 16) & 255; m[padLen - 2] = (bits >>> 8) & 255; m[padLen - 1] = bits & 255;
  const W = new Uint32Array(64), rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padLen; o += 64) {
    for (let i = 0; i < 16; i++) W[i] = (m[o + 4 * i] << 24) | (m[o + 4 * i + 1] << 16) | (m[o + 4 * i + 2] << 8) | m[o + 4 * i + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(W[i - 15], 7) ^ rotr(W[i - 15], 18) ^ (W[i - 15] >>> 3);
      const s1 = rotr(W[i - 2], 17) ^ rotr(W[i - 2], 19) ^ (W[i - 2] >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25), ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + W[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22), mj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + mj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 8; i++) { out[4 * i] = H[i] >>> 24; out[4 * i + 1] = (H[i] >>> 16) & 255; out[4 * i + 2] = (H[i] >>> 8) & 255; out[4 * i + 3] = H[i] & 255; }
  return out;
}

const packBits = bits => {
  const out = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) out[i >> 3] |= 128 >> (i & 7);
  return out;
};
const unpackBits = (bytes, n) => Uint8Array.from({ length: n }, (_, i) => (bytes[i >> 3] >> (7 - (i & 7))) & 1);
const hashKey = w => unpackBits(sha256(packBits(w)).slice(0, 16), 128);   // 128-bit key

// ---------- binary BCH over GF(2^10), syndrome construction
const GF_N = 1023, EXP = new Int32Array(2 * GF_N), LOG = new Int32Array(GF_N + 1);
(() => { let x = 1; for (let i = 0; i < GF_N; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 1024) x ^= 0x409; } for (let i = GF_N; i < 2 * GF_N; i++) EXP[i] = EXP[i - GF_N]; })();
const gmul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);
const gdiv = (a, b) => (a ? EXP[(LOG[a] - LOG[b] + GF_N) % GF_N] : 0);

function bchSyndrome(bits, t) {      // odd syndromes S1, S3, ... S(2t-1); this is the helper data
  const S = new Int32Array(t);
  for (let i = 0; i < bits.length; i++) if (bits[i]) for (let j = 0; j < t; j++) S[j] ^= EXP[(i * (2 * j + 1)) % GF_N];
  return S;
}
const synToBits = S => { const o = new Uint8Array(S.length * 10); S.forEach((v, j) => { for (let b = 0; b < 10; b++) o[j * 10 + b] = (v >> (9 - b)) & 1; }); return o; };
const bitsToSyn = (bits, t) => Int32Array.from({ length: t }, (_, j) => { let v = 0; for (let b = 0; b < 10; b++) v = (v << 1) | bits[j * 10 + b]; return v; });

function bchDecode(synDiff, t, n) {  // synDiff = syndrome(w_noisy) xor h  ->  error pattern e
  const S = new Int32Array(2 * t + 1);
  for (let i = 1; i <= 2 * t; i++) S[i] = i % 2 ? synDiff[(i - 1) / 2] : gmul(S[i / 2], S[i / 2]);
  const e = new Uint8Array(n);
  if (!S.some(v => v)) return { ok: true, e, L: 0 };
  let C = [1], B = [1], L = 0, m = 1, b = 1;
  for (let k = 0; k < 2 * t; k++) {
    let d = S[k + 1];
    for (let i = 1; i <= L; i++) d ^= gmul(C[i] || 0, S[k + 1 - i]);
    if (!d) { m++; continue; }
    const coef = gdiv(d, b), T = C.slice();
    while (C.length < B.length + m) C.push(0);
    for (let i = 0; i < B.length; i++) C[i + m] ^= gmul(coef, B[i]);
    if (2 * L <= k) { L = k + 1 - L; B = T; b = d; m = 1; } else m++;
  }
  if (L > t) return { ok: false, e, L };
  let roots = 0;
  for (let pos = 0; pos < n; pos++) {
    let v = 0;
    for (let k = 0; k <= L; k++) if (C[k]) v ^= gmul(C[k], EXP[(GF_N - (pos * k) % GF_N) % GF_N]);
    if (!v) { e[pos] = 1; roots++; }
  }
  return roots === L ? { ok: true, e, L } : { ok: false, e: new Uint8Array(n), L };
}

// ---------- SRAM PUF
// erfc with small relative error in the far tails (Numerical Recipes' erfcc), so failure rates of 1e-12 are meaningful
function erfcc(x) {
  const z = Math.abs(x), t = 1 / (1 + 0.5 * z);
  const r = t * Math.exp(-z * z - 1.26551223 + t * (1.00002368 + t * (0.37409196 + t * (0.09678418 + t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))));
  return x >= 0 ? r : 2 - r;
}
const normCdf = x => 0.5 * erfcc(-x / Math.SQRT2);
function normInv(p) { let lo = -9, hi = 9; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (normCdf(m) < p) lo = m; else hi = m; } return (lo + hi) / 2; }
const minEntBit = b => -Math.log2(Math.max(b, 1 - b));          // min-entropy of one cell with P(1) = b
const pufResidual = P => Math.floor(PUF_BITS * minEntBit(P.puf_bias) - 10 * P.bch_t);   // bits left after publishing h
const pufAge = P => P.puf_age_drift * Math.sqrt(Math.max(0, P.puf_years));

// Each cell powers up to 1 when its (fixed) mismatch plus read noise is positive. bias shifts the mismatch
// mean so P(1) = bias; ageing moves each cell's mismatch by a fixed drift direction times age.
class SRAMPUF {
  constructor(seed, n = PUF_BITS, sigma25 = 0.06, bias = 0.5) {
    const r = makeRng(seed), mu = bias === 0.5 ? 0 : normInv(bias), rd = makeRng(seed * 31 + 7);
    this.mismatch = Float64Array.from({ length: n }, () => r.n() + mu);   // fixed at fabrication
    this.drift = Float64Array.from({ length: n }, () => rd.n());          // direction each cell ages in
    this.sigma25 = sigma25;
  }
  sigma(T) { return this.sigma25 * (1 + 0.008 * Math.abs(T - 25)); }
  m(i, age) { return this.mismatch[i] + (age ? age * this.drift[i] : 0); }
  read(T, rng, age = 0) {
    const s = this.sigma(T);
    return Uint8Array.from(this.mismatch, (_, i) => (this.m(i, age) + s * rng.n() > 0 ? 1 : 0));
  }
  pErr(w, T, age = 0) {               // per-cell probability of reading differently from the enrolled bit w
    const s = this.sigma(T);
    return Float64Array.from(w, (b, i) => { const q = normCdf(this.m(i, age) / s); return b ? 1 - q : q; });
  }
}
// exact P(more than t errors) for independent cells with error probabilities p (Poisson-binomial tail)
function failTail(p, t) {
  const d = new Float64Array(t + 1); d[0] = 1; let tail = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[i]; tail += d[t] * q;
    for (let k = t; k >= 1; k--) d[k] = d[k] * (1 - q) + d[k - 1] * q;
    d[0] *= 1 - q;
  }
  return tail;
}
function errDist(p) {                 // full distribution of the error count
  const d = new Float64Array(p.length + 1); d[0] = 1;
  for (let i = 0; i < p.length; i++) { const q = p[i]; for (let k = i + 1; k >= 1; k--) d[k] = d[k] * (1 - q) + d[k - 1] * q; d[0] *= 1 - q; }
  return d;
}

// Helper-data manipulation with an accept/reject oracle. Eve adds the syndrome of an error pattern e she
// chooses to h; the chip decodes syn(w') ⊕ h ⊕ syn(e) = syn(e_noise ⊕ e). She sees whether the receiver
// accepts, and (worst case) whether the decoder failed. A twin chip with a different fingerprint but the
// same noise is asked the same queries: if the answers always agree, they carry no information about w.
function manipOracle(puf, en, P, Q, seed) {
  const t = P.bch_t, r = makeRng(seed), age = pufAge(P);
  const w2 = Uint8Array.from({ length: PUF_BITS }, () => r.int(2)), h2 = bchSyndrome(w2, t), key2 = hashKey(w2);
  const byW = {}; let same = 0, acc = 0, fails = 0, lastSyn = null;
  const same32 = (a, b) => a.every((x, i) => x === b[i]);
  for (let q = 0; q < Q; q++) {
    const wt = 1 + (q % (t + 10)), e = new Uint8Array(PUF_BITS), idx = new Set();
    while (idx.size < wt) idx.add(r.int(PUF_BITS));
    idx.forEach(i => { e[i] = 1; });
    const se = bchSyndrome(e, t), wn = puf.read(P.temp, makeRng(seed + 1000 + q), age);
    const r1 = reconstruct(wn, en.h.map((v, j) => v ^ se[j]), t), a1 = same32(r1.key, en.key);
    const wn2 = w2.map((b, i) => b ^ wn[i] ^ en.w[i]), r2 = reconstruct(wn2, h2.map((v, j) => v ^ se[j]), t), a2 = same32(r2.key, key2);
    same += (a1 === a2 && r1.ok === r2.ok); acc += a1; fails += !r1.ok;
    const bw = byW[wt] || (byW[wt] = [0, 0]); bw[0]++; if (!r1.ok) bw[1]++;
    lastSyn = se;
  }
  return { Q, same, acc, fails, byW, lastSyn };
}

function enroll(puf, t, rng) {
  const w = puf.read(25, rng);
  return { w, h: bchSyndrome(w, t), key: hashKey(w) };
}

function reconstruct(wNoisy, h, t) {
  const sn = bchSyndrome(wNoisy, t);
  const diff = sn.map((v, j) => v ^ h[j]);
  const dec = bchDecode(diff, t, wNoisy.length);
  const w = wNoisy.map((b, i) => b ^ dec.e[i]);
  return { ok: dec.ok, e: dec.e, w, key: hashKey(w), synNoisy: sn };
}

// ---------- attacks
function bm2(s) {                    // Berlekamp-Massey over GF(2)
  const n = s.length, c = new Uint8Array(n + 1);
  let b = new Uint8Array(n + 1), cc = c;
  cc[0] = b[0] = 1;
  let L = 0, m = -1;
  for (let i = 0; i < n; i++) {
    let d = s[i];
    for (let j = 1; j <= L; j++) d ^= cc[j] & s[i - j];
    if (d) {
      const t = cc.slice(), sh = i - m;
      for (let j = 0; j + sh <= n; j++) cc[j + sh] ^= b[j];
      if (2 * L <= i) { L = i + 1 - L; m = i; b = t; }
    }
  }
  return { L, c: cc.slice(0, L + 1) };
}

function lfsrPredict(c, L, known, nOut) {
  const buf = Array.from(known.slice(Math.max(0, known.length - L))), out = new Uint8Array(nOut);
  for (let k = 0; k < nOut; k++) {
    let nb = 0;
    for (let j = 1; j <= L; j++) nb ^= c[j] & buf[buf.length - j];
    buf.push(nb); out[k] = nb;
  }
  return out;
}

function bmAttack(known, future) {
  const { L, c } = bm2(known), g = lfsrPredict(c, L, known, future.length);
  let ok = 0;
  for (let i = 0; i < g.length; i++) ok += g[i] === future[i];
  return { acc: ok / future.length, L, guess: g };
}

function longestRun(D) {
  let best = 0, run = 0, prev = -1;
  for (let i = 0; i < D.length; i++) { run = D[i] === prev ? run + 1 : 1; prev = D[i]; if (run > best) best = run; }
  return best;
}

// ---------- full link
const DEFAULTS = {
  scheme: "proposed", sig: "sine", amp_uA: 0.93, bin: 205, dc_uA: 0.5, force_uA: 10,
  rtia: 321.88e3, buffer: 0.5, dither: true, dither_amp: 0.022, comp_noise: 1e-3, xlim: 2.5,
  dither_at: "comparator", int_noise: 1.8e-5,                     // where the dither ladder acts; integrator thermal noise (see calibration)
  dither_seeds: [0x1D2B, 0x7A31], key16: 0xC3A5, chip_id: 0x0B77,
  chip_seed: 7, temp: 37, puf_sigma: 0.06, bch_t: 40, h_tamper: 0,
  puf_bias: 0.5, puf_years: 0, puf_age_drift: 0.03,               // P(cell = 1); years since enrolment; drift per sqrt(year)
  h_source: "own", h_edit: [], puf_edit: [], rx_key16: null,   // workbench edits (arrays are replaced, never mutated)
  mac: true, frame_ctr: 42, rx_last_ctr: 41, mitm_p: 0,          // proposal: session nonce + frame counter + MAC
  attack: "none",                                                 // an attack from the lab, run through the live model
  ber: 0, lead: 200, rx_wrong_key: false, seed: 2026,
};

function sensorCurrent(P, n) {
  const i = new Float64Array(n), f = P.bin * FS_OUT / N_FFT;
  for (let k = 0; k < n; k++) {
    const t = k / FS;
    if (P.sig === "sine") i[k] = P.amp_uA * 1e-6 * Math.sin(2 * Math.PI * f * t);
    else if (P.sig === "dc") i[k] = P.dc_uA * 1e-6;
    else if (P.sig === "forced") i[k] = P.force_uA * 1e-6;
    else if (P.sig === "zero") i[k] = 0;
  }
  return i;
}

// ---------- attacks run inside the link model
// P.attack picks one; P.atk holds its knobs. Each attack hooks in where the attacker acts:
// the sensor input, the chip's key, the channel, or only in Eve's own processing (S.atk).
const ATK_DEF = { mismatch: 0.1, kiInput: "dc", flipP: 0.1, fake: 0.3, bmBits: 64, clone: 1, hFlip: 1, chMismatch: 0.1, manipQ: 200 };

function buildFrame(D, ks, mac, ctr, idBits) {   // ks: keystreamNL-style { enc, auth?, A0?, R0? }
  const n = D.length, K = ks.enc.subarray(ID_BITS, ID_BITS + n), C = D.map((d, i) => d ^ K[i]);
  const enc_id = idBits.map((b, i) => b ^ ks.enc[i]), F = { K, C, enc_id };
  if (mac) {                         // preamble | sync | counter (clear) | enc ID | C | tag
    F.ctr_bits = u32bits(ctr);
    F.tag = macTag(macMsg(F.ctr_bits, enc_id, C), ks);
    F.frame = new Uint8Array(48 + 32 + ID_BITS + n + 32);
    F.frame.set(PREAMBLE, 0); F.frame.set(SYNC, 32); F.frame.set(F.ctr_bits, 48); F.frame.set(enc_id, 80); F.frame.set(C, 96); F.frame.set(u32bits(F.tag), 96 + n);
  } else {
    F.frame = new Uint8Array(48 + ID_BITS + n);
    F.frame.set(PREAMBLE, 0); F.frame.set(SYNC, 32); F.frame.set(enc_id, 48); F.frame.set(C, 64);
  }
  return F;
}

function bruteLFSR(ks16) {           // try every 16-bit key against 16 known keystream bits
  for (let k = 1; k <= 0xFFFF; k++) {
    const l = new LFSR16(k); let ok = true;
    for (let i = 0; i < ID_BITS && ok; i++) ok = l.bit() === ks16[i];
    if (ok) return { key: k, tries: k };
  }
  return { key: -1, tries: 0xFFFF };
}

// BM on many 64-bit windows of a keystream guess. A window "breaks" when its LFSR predicts the next 512
// real key bits; the earliest one is extended over the rest of the stream.
function windowAttack(Kguess, Ktrue, seed, tries = 80) {
  const r = makeRng(seed), n = Math.min(Kguess.length, Ktrue.length);
  let broken = 0, first = -1;
  for (let k = 0; k < tries; k++) {
    const s = 200 + r.int(Math.min(n, 30000) - 64 - 512 - 400);
    const a = bmAttack(Kguess.subarray(s, s + 64), Ktrue.subarray(s + 64, s + 64 + 512));
    if (a.acc > 0.99) { broken++; if (first < 0 || s < first) first = s; }
  }
  return { broken, tries, first };
}

function simulate(P0) {
  const P = { ...DEFAULTS, ...P0 };
  const rng = makeRng(P.seed), n = N_DSM, t = P.bch_t;
  const S = { P, n }, A = P.attack || "none", AK = { ...ATK_DEF, ...(P.atk || {}) }, base = P.scheme === "baseline";

  // Tx analog chain (some attacks set the input the chip actually sees)
  S.i_sense = sensorCurrent(P, n);
  if (A === "knownin") S.i_sense.fill(AK.kiInput === "zero" ? 0 : 0.5e-6);        // Eve forces a known input
  else if (A === "saturate") S.i_sense.fill(P.force_uA * 1e-6);                     // Eve forces a huge current
  else if (A === "clone") S.i_sense.fill(AK.fake * 1e-6);                           // the counterfeit reports what Eve wants
  else if (A === "replay") S.i_sense = S.i_sense.map(v => v * 0.4);                 // the real reading has dropped (a fault)
  S.v_tia = S.i_sense.map(i => tia(i, P.rtia));
  S.u = S.v_tia.map(v => s2d(v, P.buffer));
  const dsm = dsm2(S.u, dsmOpts(P), rng);
  Object.assign(S, { D: dsm.D, x1: dsm.X1, x2: dsm.X2, dith: dsm.DI, clip: dsm.clip });

  // key + keystream at the Tx
  const rxdb = {}, ctrTx = A === "replay" ? P.frame_ctr + 1 : P.frame_ctr;   // during a replay the chip has moved on a frame
  let ksTx;
  if (base) {
    rxdb.key16 = P.key16;
    ksTx = { enc: new LFSR16(P.key16).bits(ID_BITS + n) };
  } else {
    const puf = new SRAMPUF(P.chip_seed, PUF_BITS, P.puf_sigma, P.puf_bias);
    const en = enroll(puf, t, makeRng(P.chip_seed * 7919 + 1));      // at test, once
    S.w_enroll = en.w; S.key_enroll = en.key;
    rxdb.key = en.key; rxdb.h = en.h;
    const pufTx = A === "clone" ? new SRAMPUF(P.chip_seed + 500 + AK.clone, PUF_BITS, P.puf_sigma, P.puf_bias) : puf;
    S.mismatch = pufTx.mismatch; S.puf_tx = pufTx === puf ? "own" : "clone";
    // Rx sends h at power-up (optionally swapped or tampered on the way)
    let hBits = synToBits(en.h);
    S.h_bits = hBits.slice();
    if (P.h_source === "other") hBits = synToBits(enroll(new SRAMPUF(P.chip_seed + 1000, PUF_BITS, P.puf_sigma), t, makeRng(P.chip_seed * 31 + 5)).h);
    else if (P.h_source === "zeros") hBits = new Uint8Array(hBits.length);
    const flipH = (count, seed) => {
      const r2 = makeRng(seed), idx = new Set();
      while (idx.size < Math.min(count, hBits.length)) idx.add(r2.int(hBits.length));
      idx.forEach(i => { hBits[i] ^= 1; });
    };
    if (P.h_tamper > 0) flipH(P.h_tamper, P.seed + 99);
    if (A === "htamper") flipH(AK.hFlip, P.seed + 51);                 // Eve flips helper bits in transit
    if (A === "hmanip") {             // Eve's oracle queries; this power-up carries her last manipulated h
      S.manip = manipOracle(puf, en, P, AK.manipQ, P.seed + 57);
      const sb = synToBits(S.manip.lastSyn); hBits = hBits.map((b, i) => b ^ sb[i]);
    }
    for (const i of P.h_edit) if (i < hBits.length) hBits[i] ^= 1;          // bits the user flipped by hand
    S.h_rx_bits = hBits;
    S.h_changed = hBits.some((b, i) => b !== S.h_bits[i]);
    const hRx = bitsToSyn(hBits, t);
    S.w_noisy = pufTx.read(P.temp, makeRng(A === "clone" ? P.seed + 41 + AK.clone : P.seed + 17), pufAge(P));
    S.p_err = pufTx.pErr(S.w_enroll, P.temp, pufAge(P));              // each cell's chance of flipping at this power-up
    S.key_fail = failTail(S.p_err, t);                                 // chance a power-up like this one gets the key wrong
    S.residual = pufResidual(P);
    for (const i of P.puf_edit) if (i < PUF_BITS) S.w_noisy[i] ^= 1;         // cells the user forced to flip
    S.e_true = S.w_noisy.map((b, i) => b ^ S.w_enroll[i]);
    const rc = reconstruct(S.w_noisy, hRx, t);
    S.e_hat = rc.e; S.w_fixed = rc.w; S.key_tx = rc.key; S.fe_ok = rc.ok;
    S.syn_noisy_bits = synToBits(rc.synNoisy);
    S.n_err_true = S.e_true.reduce((a, b) => a + b, 0);
    S.n_err_fixed = rc.e.reduce((a, b) => a + b, 0);
    S.key_match = S.key_tx.every((b, i) => b === S.key_enroll[i]);
    S.ber_puf = S.n_err_true / PUF_BITS;
    S.mac = !!P.mac;
    if (S.mac) {                     // the receiver sends a fresh session nonce with h at power-up
      const rn = makeRng(P.seed + 71); S.nonce = ((rn.int(0x10000) << 16) | rn.int(0x10000)) >>> 0; rxdb.nonce = S.nonce;
    }
    ksTx = keystreamNL(S.key_tx, S.mac ? ivBits(S.nonce, ctrTx) : null, ID_BITS + n);
  }
  S.ks_tx = ksTx; S.ks_all = ksTx.enc;
  const idBits = Uint8Array.from(P.chip_id.toString(2).padStart(ID_BITS, "0"), c => +c);
  const F = buildFrame(S.D, ksTx, S.mac, ctrTx, idBits);
  Object.assign(S, { K: F.K, C: F.C, enc_id: F.enc_id, frame: F.frame, ctr_bits: F.ctr_bits, tag: F.tag });
  const body = S.mac ? 32 : 0;       // counter field before the encrypted ID

  // what reaches the receiver: the chip's frame, or one Eve substitutes
  let onAir = S.frame;
  if (A === "spoof") {               // Eve transmits a forged frame carrying a fake reading
    const uF = new Float64Array(n).fill(s2d(tia(AK.fake * 1e-6, P.rtia), P.buffer));
    const Df = dsm2(uF, dsmOpts(P), makeRng(P.seed + 31)).D;
    let ksE;
    if (base) { S.bf = bruteLFSR(S.ks_all.subarray(0, ID_BITS)); ksE = { enc: new LFSR16(S.bf.key > 0 ? S.bf.key : 1).bits(ID_BITS + n) }; }
    else {
      const gr = makeRng(P.seed + 33), gk = Uint8Array.from({ length: 128 }, () => gr.int(2));
      ksE = keystreamNL(gk, S.mac ? ivBits(S.nonce, P.frame_ctr + 1) : null, ID_BITS + n);   // nonce is public; she picks a fresh counter
    }
    const FF = buildFrame(Df, ksE, S.mac, P.frame_ctr + 1, idBits);
    S.fake = { D: Df, K: FF.K, C: FF.C }; onAir = FF.frame;
  } else if (A === "replay") {       // Eve plays back the frame she recorded while the reading was healthy
    const old = simulate({ ...P0, attack: "none" });
    S.old = { D: old.D, y: old.y, ctr: P.frame_ctr }; onAir = old.frame;
  }

  // channel
  const rc = makeRng(P.seed + 5);
  S.rx_bits = new Uint8Array(P.lead + onAir.length);
  for (let i = 0; i < P.lead; i++) S.rx_bits[i] = rc.int(2);
  S.rx_bits.set(onAir, P.lead);
  let flips = 0;
  if (P.ber > 0) for (let i = 0; i < S.rx_bits.length; i++) if (rc.u() < P.ber) { S.rx_bits[i] ^= 1; flips++; }
  S.channel_flips = flips;
  // man-in-the-middle flips a fraction of the payload bits (never the header, so sync and ID survive)
  const mp = A === "bitflip" ? AK.flipP : P.mitm_p;
  S.mitm_flips = 0;
  if (mp > 0) {
    const rm = makeRng(P.seed + 77), o = P.lead + 48 + body + ID_BITS;
    S.mitm_mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (rm.u() < mp) { S.rx_bits[o + i] ^= 1; S.mitm_mask[i] = 1; S.mitm_flips++; }
  }

  // Rx
  const hdr = new Uint8Array(48); hdr.set(PREAMBLE); hdr.set(SYNC, 32);
  let pos = -1;
  for (let i = 0; i + 48 <= S.rx_bits.length && pos < 0; i++) {
    let ok = true;
    for (let j = 0; j < 48 && ok; j++) ok = S.rx_bits[i + j] === hdr[j];
    if (ok) pos = i + 48;
  }
  S.sync_pos = pos;
  if (base) {
    S.key_rx16 = P.rx_wrong_key ? P.key16 ^ 1 : P.rx_key16 != null ? P.rx_key16 : rxdb.key16;
    S.ks_rx_all = new LFSR16(S.key_rx16).bits(ID_BITS + n);
  } else {
    S.key_rx = P.rx_wrong_key ? Uint8Array.from({ length: 128 }, () => rng.int(2)) : rxdb.key;
    if (!S.mac) S.ks_rx_all = keystreamNL(S.key_rx, null, ID_BITS + n).enc;
  }
  if (pos >= 0) {
    S.enc_id_rx = S.rx_bits.slice(pos + body, pos + body + ID_BITS);
    S.C_rx = S.rx_bits.slice(pos + body + ID_BITS, pos + body + ID_BITS + n);
  } else { S.enc_id_rx = new Uint8Array(ID_BITS); S.C_rx = new Uint8Array(n); }
  S.rx_last = A === "replay" ? Math.max(P.rx_last_ctr, P.frame_ctr) : P.rx_last_ctr;   // it accepted the original frame
  if (S.mac) {                       // counter must be fresh, and the tag must match what the Rx recomputes
    S.ctr_rx = pos >= 0 ? bitsU32(S.rx_bits, pos) : 0;
    S.tag_rx = pos >= 0 ? bitsU32(S.rx_bits, pos + body + ID_BITS + n) : 0;
    const v = macVerify(S.key_rx, rxdb.nonce, S.ctr_rx, S.enc_id_rx, S.C_rx, S.tag_rx);
    S.tag_calc = v.tag; S.mac_ok = pos >= 0 && v.ok; S.ctr_fresh = S.ctr_rx > S.rx_last;
    S.ks_rx_all = v.ks.enc;
  }
  S.K_rx = S.ks_rx_all.subarray(ID_BITS, ID_BITS + n);
  S.id_rx = S.enc_id_rx.map((b, i) => b ^ S.ks_rx_all[i]);
  S.id_ok = pos >= 0 && S.id_rx.every((b, i) => b === idBits[i]);
  S.accepted = S.id_ok && (!S.mac || (S.mac_ok && S.ctr_fresh));
  S.D_rx = S.C_rx.map((c, i) => c ^ S.K_rx[i]);
  S.y_cic = cic(S.D_rx);
  S.y = fir(S.y_cic, COMP_TAPS);
  S.u_ref = Float64Array.from({ length: S.y.length }, (_, j) => S.u[j * OSR]);
  S.sndr = P.sig === "sine" && !["knownin", "saturate", "clone"].includes(A) ? sndr(S.y, P.bin) : null;
  let bitErr = 0;
  for (let i = 0; i < n; i++) bitErr += S.D_rx[i] !== S.D[i];
  S.rx_bit_err = bitErr / n;

  // Eve: sees the channel, knows the frame format and the whole design, not the key
  S.C_eve = S.C_rx;
  S.K_eve_guess = S.C_eve.map(c => c ^ 1);            // saturation hypothesis: D = all 1s
  const er = makeRng(P.seed + 31), win = 64, fut = 512;
  let best = { acc: 0, start: 0, res: null }, broken = 0, tries = 120;
  for (let k = 0; k < tries; k++) {
    const s = 200 + er.int(n - win - fut - 400);
    const r = bmAttack(S.K_eve_guess.subarray(s, s + win), S.K.subarray(s + win, s + win + fut));
    if (r.acc > 0.99) broken++;
    if (r.acc > best.acc) best = { acc: r.acc, start: s, res: r };
  }
  S.eve_forced_best = best.acc; S.eve_forced_broken = broken / tries;
  S.eve_pred = new Uint8Array(n); S.eve_match = new Uint8Array(n);
  {
    const s = best.start, known = S.K_eve_guess.subarray(s, s + win), { L, c } = bm2(known);
    const g = lfsrPredict(c, L, known, n - s - win);
    S.eve_pred.set(g, s + win);
    for (let i = s + win; i < n; i++) S.eve_match[i] = S.eve_pred[i] === S.K[i] ? 1 : 0;
    S.eve_window = [s, s + win];
    S.eve_L = L;
  }
  S.eve_probe = bmAttack(S.K.subarray(0, 64), S.K.subarray(64, 1064));
  S.eve_id = bmAttack(S.ks_all.subarray(0, 16), S.ks_all.subarray(16, 1016));

  // the active attack, as Eve carries it out
  S.atk = A === "none" ? null : runAttack(S, P, A, AK, base);

  // summary stats
  S.ones = S.D.reduce((a, b) => a + b, 0) / n;
  S.run = longestRun(S.D);
  return S;
}

// Eve's side of each attack. Key-recovery attacks end in khat, her estimate of the keystream; she decrypts
// the recorded C with it. Frame attacks (spoof, clone, replay, bit-flip) are judged by what the receiver accepts.
function runAttack(S, P, A, AK, base) {
  const n = S.n, E = { id: A }, decode = D => fir(cic(D), COMP_TAPS);
  E.ytrue = decode(S.D);                               // the reading the chip really measured
  const guessKs = () => {
    if (base) return new LFSR16((P.key16 ^ 0x5A5A) || 1).bits(ID_BITS + n).subarray(ID_BITS, ID_BITS + n);
    const gr = makeRng(P.seed + 33), gk = Uint8Array.from({ length: 128 }, () => gr.int(2));
    return keystreamNL(gk, null, ID_BITS + n).enc.subarray(ID_BITS, ID_BITS + n);
  };
  const recover = (khat, from = 0) => {                // decrypt what she recorded with her keystream estimate
    let m = 0; for (let i = from; i < n; i++) m += khat[i] === S.K[i];
    E.khat = khat; E.from = from; E.kacc = m / Math.max(1, n - from);
    E.dhat = S.C.map((c, i) => c ^ khat[i]); E.yhat = decode(E.dhat);
    E.v = E.kacc > 0.99 ? "breached" : "safe";
  };
  const replica = (Dguess, seed) => {                  // C ⊕ guess of D, then BM windows
    const kg = S.C.map((c, i) => c ^ Dguess[i]), w = windowAttack(kg, S.K, seed);
    E.win = w; E.kguess = kg;
    const kh = kg.slice();
    let from = Math.floor(n / 2);
    if (w.first >= 0) {
      const known = kg.subarray(w.first, w.first + 64), { L, c } = bm2(known);
      kh.set(lfsrPredict(c, L, known, n - w.first - 64), w.first + 64);
      from = w.first + 64;
      if (L > 0 && c[L]) {           // an LFSR runs backwards too: s[i-L] = s[i] ^ sum_{j<L} c_j s[i-j]
        for (let i = w.first + L - 1; i >= L; i--) { let v = kh[i]; for (let j = 1; j < L; j++) v ^= c[j] & kh[i - j]; kh[i - L] = v; }
        from = 0;
      }
    }
    if (!base) {                     // BM cannot extend Grain-128a, but a good enough guess of D exposes this frame's keystream directly
      let m = 0; for (let i = 0; i < n; i++) m += kg[i] === S.K[i];
      E.raw = m / n;
      if (E.raw > 0.97) { recover(kg, 0); E.v = S.mac ? "safe" : "breached"; E.reuse = true; return; }   // without a per-frame IV every frame reuses it
    }
    recover(kh, from);
    if (!base) E.v = "safe";
  };
  switch (A) {
    case "eaves": recover(guessKs()); E.v = "safe"; break;
    case "brute":
      if (base) { E.bf = bruteLFSR(S.ks_all.subarray(0, ID_BITS)); recover(new LFSR16(E.bf.key > 0 ? E.bf.key : 1).bits(ID_BITS + n).subarray(ID_BITS, ID_BITS + n)); }
      else recover(guessKs());
      break;
    case "extract":
      if (base) recover(new LFSR16(P.key16).bits(ID_BITS + n).subarray(ID_BITS, ID_BITS + n));   // the key read out of memory
      else recover(guessKs());
      break;
    case "bm": {
      const m = Math.min(AK.bmBits, n - 1), known = S.K.subarray(0, m), { L, c } = bm2(known), kh = new Uint8Array(n);
      kh.set(known, 0); kh.set(lfsrPredict(c, L, known, n - m), m);
      E.L = L; E.m = m; recover(kh, m);
      break;
    }
    case "knownin": {
      const uR = S.u.map(v => v + AK.mismatch / 100);
      const Dr = dsm2(uR, dsmOpts(P, [0x2C4D, 0x51E7]), makeRng(P.seed + 2)).D;
      let f = 0; for (let i = 0; i < n; i++) f += Dr[i] !== S.D[i];
      E.dguess = Dr; E.flip = f / n; replica(Dr, P.seed + 3);
      break;
    }
    case "saturate": {
      const g = S.ones >= 0.5 || S.D.reduce((a, b) => a + b, 0) >= n / 2 ? 1 : 0;
      E.dguess = new Uint8Array(n).fill(g); E.guess = g; replica(E.dguess, P.seed + 23);
      break;
    }
    case "samekey": {                                   // a second frame of the same reading under the same key
      const u2 = S.u.map(v => v + AK.chMismatch / 100);
      const D2 = dsm2(u2, dsmOpts(P, [0x3A17, 0x6E29]), makeRng(P.seed + 12)).D;
      const K2 = !base && S.mac ? keystreamNL(S.key_tx, ivBits(S.nonce, P.frame_ctr + 1), ID_BITS + n).enc.subarray(ID_BITS, ID_BITS + n) : S.K;
      E.C2 = D2.map((d, i) => d ^ K2[i]); E.X = S.C.map((c, i) => c ^ E.C2[i]);
      let x = 0, fd = 0; for (let i = 0; i < n; i++) { x += E.X[i]; fd += D2[i] !== S.D[i]; }
      E.xfrac = x / n; E.dflip = fd / n; E.v = Math.abs(E.xfrac - 0.5) > 0.03 ? "leak" : "safe";
      break;
    }
    case "spoof": E.yfake = decode(S.fake.D); E.v = S.accepted ? "spoofed" : "detected"; break;
    case "clone": E.v = S.accepted ? "spoofed" : "detected"; break;
    case "replay": E.yold = S.old.y; E.v = S.accepted ? "spoofed" : "detected"; break;
    case "bitflip": E.v = !S.mitm_flips ? "safe" : S.accepted ? "spoofed" : "detected"; break;
    case "htamper": E.v = base ? "na" : S.key_match ? "safe" : "detected"; break;
    case "hleak": E.residual = pufResidual(P); E.v = base ? "na" : E.residual >= 128 ? "safe" : "weak"; break;
    case "hmanip": E.v = base ? "na" : S.manip.same === S.manip.Q ? "safe" : "leak"; break;
  }
  return E;
}

// ===== LAB-COMPUTE =====
const state = { ...DEFAULTS };       // the settings; the page edits this object, workers receive copies

const LAB_N = 30000;                 // DSM clocks used by the attack experiments (600 output samples)
const lab = { sel: "eaves", bmBits: 64, kiInput: "dc", mismatch: 0.1, chMismatch: 0.1, flipP: 0.1, clone: 1, hFlip: 1, fake: 0.3, manipQ: 200 };
let bfCache = null;

const decodeY = D => fir(cic(D), COMP_TAPS);
const xorBits = (a, b, n = Math.min(a.length, b.length)) => { const o = new Uint8Array(n); for (let i = 0; i < n; i++) o[i] = a[i] ^ b[i]; return o; };
const flipFrac = (a, b, n) => { let f = 0; for (let i = 0; i < n; i++) f += a[i] !== b[i]; return f / n; };
const rmsErr = (a, b, from = 60) => { let s = 0, n = 0; for (let i = from; i < Math.min(a.length, b.length); i++) { s += (a[i] - b[i]) ** 2; n++; } return Math.sqrt(s / Math.max(n, 1)); };
const pct = (v, d = 1) => (v * 100).toFixed(d) + "%";
const hex16 = v => "0x" + (v & 0xFFFF).toString(16).toUpperCase().padStart(4, "0");

function bmProfile(s) {              // linear complexity after each bit (same recursion as bm2)
  const n = s.length, cc = new Uint8Array(n + 1), prof = new Uint16Array(n);
  let b = new Uint8Array(n + 1), L = 0, m = -1;
  cc[0] = b[0] = 1;
  for (let i = 0; i < n; i++) {
    let d = s[i];
    for (let j = 1; j <= L; j++) d ^= cc[j] & s[i - j];
    if (d) {
      const t = cc.slice(), sh = i - m;
      for (let j = 0; j + sh <= n; j++) cc[j + sh] ^= b[j];
      if (2 * L <= i) { L = i + 1 - L; m = i; b = t; }
    }
    prof[i] = L;
  }
  return prof;
}


// Zero/DC-input replica attack on LAB_N clocks: the victim's modulator vs Eve's replica (other dither
// phase, analog mismatch mmPct % of full scale). Kb/Kp: the two designs' keystreams for this frame.
function replicaExperiment(Q, mmPct, input, Kb, Kp, mac) {
  const iA = input === "zero" ? 0 : 0.5e-6, uv = s2d(tia(iA, Q.rtia), Q.buffer);
  const Dv = dsm2(new Float64Array(LAB_N).fill(uv), dsmOpts(Q), makeRng(Q.seed)).D;
  const Dr = dsm2(new Float64Array(LAB_N).fill(uv + mmPct / 100), dsmOpts(Q, [0x2C4D, 0x51E7]), makeRng(Q.seed + 2)).D;
  const flip = flipFrac(Dv, Dr, LAB_N), one = K => {
    const Kg = xorBits(xorBits(Dv, K), Dr), w = windowAttack(Kg, K, Q.seed + 3), raw = 1 - flipFrac(Kg, K, LAB_N);
    return { w, raw };
  };
  const b = one(Kb), p = one(Kp), reuse = p.raw > 0.97;
  return { Dv, Dr, flip, base: { ...b, v: b.w.broken > 0 ? "breached" : "safe" }, prop: { ...p, reuse, v: reuse && !mac ? "breached" : "safe" } };
}

function labDsm(u, seeds, noiseSeed) {
  return dsm2(u, dsmOpts(state, seeds), makeRng(noiseSeed)).D;
}
const labU = (iA, off = 0) => { const u = new Float64Array(LAB_N), v = s2d(tia(iA, state.rtia), state.buffer) + off; u.fill(v); return u; };

// ---------------------------------------------------------------- the attacks
// Each run() returns { base, prop } outcomes: { v, head, steps[], plot }.
// v: breached | spoofed | leak | weak | safe | detected | na
const VERD = {
  breached: ["DATA BREACHED", "warn"], spoofed: ["FAKE DATA ACCEPTED", "warn"], leak: ["INFORMATION LEAKS", "warn"],
  weak: ["KEY WEAKENED", "warn"], safe: ["DATA SAFE", "good"], detected: ["ATTACK DETECTED", "good"], na: ["NOT APPLICABLE", "na"],
};

const ATTACKS = [
  { id: "eaves", name: "Passive eavesdropping", src: "paper", stop: "Encryption (both designs)",
    has: "A radio that records every bit on the air, full knowledge of the chip, no key.",
    desc: "The paper's starting point: Eve sniffs the link to learn the bioreactor's readings (and, later, to set up spoofing). She sees only the encrypted stream C. Without the key, decrypting gives white noise (paper Fig. 3).",
    run(R) {
      const o = d => {
        const Sx = R[d], y = R.yFail[d], e = rmsErr(y, R.yTrue);
        return { v: "safe", head: `Eve's reading is ${pct(e, 0)} RMS off (noise)`,
          steps: [`Records the ciphertext C: ${pct(Sx.C.subarray(0, LAB_N).reduce((a, b) => a + b, 0) / LAB_N)} ones, looks random.`,
            `Decrypts with her best guess of the ${d === "base" ? "16" : "128"}-bit key.`,
            `Gets noise: reading error ${pct(e, 0)} of full scale. No data leaks.`,
            d === "base" ? `Only safe while nobody searches the key space - see <b>Brute-force key search</b>.` : `The 128-bit key space cannot be searched.`],
          plot: { kind: "y", series: [[R.yTrue, "true"], [y, "eve"]] } };
      };
      return { base: o("base"), prop: o("prop") };
    } },

  { id: "brute", name: "Brute-force key search", src: "beyond", stop: "128-bit PUF key (proposal)",
    has: "Recorded traffic, the public chip ID, a laptop.",
    desc: "The chip ID sits encrypted right after the sync word, and the ID itself is not secret. So Eve can simply try every key until the decrypted ID is right, then decrypt everything. This only works if the key is short.",
    run(R) {
      const Sb = R.base, ks = Sb.ks_all, key = `${state.key16}|${state.chip_id}`;
      if (!bfCache || bfCache.key !== key) {
        const t0 = performance.now(); let found = -1, tries = 0;
        for (let k = 1; k <= 0xFFFF && found < 0; k++) {
          tries++; const l = new LFSR16(k); let ok = true;
          for (let i = 0; i < ID_BITS && ok; i++) ok = l.bit() === ks[i];
          if (ok) found = k;
        }
        bfCache = { key, found, tries, ms: performance.now() - t0 };
      }
      const f = bfCache, hit = f.found === ((state.key16 & 0xFFFF) || 1);
      return {
        base: { v: hit ? "breached" : "safe", head: hit ? `Key ${hex16(f.found)} found in ${f.ms.toFixed(0)} ms` : "Key not found",
          steps: [`Takes the 16 encrypted ID bits from any frame and XORs off the public ID: that is the first 16 keystream bits.`,
            `Tries keys 0x0001, 0x0002, ... in a 16-bit LFSR: ${f.tries.toLocaleString()} tries, ${f.ms.toFixed(0)} ms in this browser.`,
            hit ? `Found <b>${hex16(f.found)}</b> (the real key). Decrypts the payload: the full sensor reading.` : `No match.`],
          plot: { kind: "y", series: [[R.yTrue, "true"], [hit ? R.yTrue : R.yFail.base, "eve"]] } },
        prop: { v: "safe", head: "2¹²⁸ keys: about 10¹⁹ years",
          steps: [`Same trick: the first 16 keystream bits are known.`,
            `But the key is 128 bits. At 10¹² guesses per second the search takes about 5×10¹⁸ years.`,
            `The PUF itself cannot be guessed either: it keeps ≥ ${Math.max(0, pufResidual(state))} unknown bits after the public helper data.`],
          plot: { kind: "y", series: [[R.yTrue, "true"], [R.yFail.prop, "eve"]] } },
      };
    } },

  { id: "bm", name: "Berlekamp-Massey keystream attack", src: "beyond", stop: "Grain-128a (proposal)",
    has: "A short run of keystream bits: probed on the keystream wire, or recovered from any known-plaintext leak.",
    desc: "Berlekamp-Massey finds the shortest linear feedback register that reproduces a bit sequence. An n-bit LFSR is recovered from just 2n consecutive keystream bits; from then on Eve predicts every future key bit and decrypts everything. Set how many bits she knows.",
    knobs: [{ k: "bmBits", label: "Keystream bits Eve knows", min: 8, max: 256, step: 4, fmt: v => v + " bits" }],
    run(R) {
      const m = lab.bmBits;
      const o = (d, Sx) => {
        const a = bmAttack(Sx.K.subarray(0, m), Sx.K.subarray(m, m + 1000)), br = a.acc > 0.99;
        const prof = bmProfile(Sx.K.subarray(0, 256));
        return { v: br ? "breached" : "safe", head: `Predicts the next 1000 bits ${pct(a.acc, 0)} right`,
          steps: [`Knows ${m} consecutive keystream bits.`,
            `BM returns a linear register of length L = ${a.L}${d === "base" ? (m >= 32 ? " - the real 16-bit LFSR" : "") : " - it keeps growing with every bit, about half the bits seen"}.`,
            br ? `Runs it forward: <b>every</b> future key bit is right. Decrypts all later data.` : `Its predictions are ${pct(a.acc, 0)} right - a coin flip. Nothing decrypts.`,
            d === "base" ? `Needs only 2×16 = 32 bits.` : `No practical amount of known keystream gives a linear model of Grain-128a.`],
          plot: { kind: "lc", prof, m, lin: d === "base" } };
      };
      return { base: o("base", R.base), prop: o("prop", R.prop) };
    } },

  { id: "knownin", name: "Zero / DC input attack (replica)", src: "paper", stop: () => state.mac ? "Dither + QN (both); per-frame IV as backup" : "Dither + quantisation noise (S-DSM, both)",
    has: "Control of the sensor's input (e.g. zero or a fixed DC current) and a replica chip to run the same input on.",
    desc: "The paper's first cryptanalysis test (Fig. 4c). With a conventional ADC + stream cipher, a fixed input gives a known output, so C ⊕ known = keystream. Here Eve feeds the victim a known input, runs her replica on the same input and uses its bits as her guess of D. Dither and quantisation noise make the two modulators disagree about half the time, so the guess is useless. In this model the replica's own analog mismatch already scrambles most bits. Set it to 0 (a perfectly trimmed replica) to isolate dither: at the default strength a few % of bits still differ and short BM windows survive, so the original design breaks. Raise the dither strength to close the gap.",
    knobs: [{ k: "kiInput", t: "seg", label: "Input Eve applies", opts: [["zero", "Zero"], ["dc", "DC 0.5 µA"]] },
      { k: "mismatch", label: "Replica vs victim analog mismatch", min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) + "% FS" },
      { g: "dither", label: "Dither enabled (global)" }, { g: "dither_amp", label: "Dither strength (global)", min: 0.01, max: 0.4, step: 0.005, fmt: v => v.toFixed(3) + " ×ref" }],
    run(R) {
      const X = replicaExperiment(state, lab.mismatch, lab.kiInput, R.base.K.subarray(0, LAB_N), R.prop.K.subarray(0, LAB_N), state.mac);
      const flip = X.flip, agree = xorBits(X.Dv, X.Dr).subarray(0, 400);
      const o = d => {
        const { w, raw } = X[d], reuse = d === "prop" && X.prop.reuse, br = X[d].v === "breached";
        return { v: X[d].v, head: reuse ? `Keystream of this frame exposed (${pct(raw)})` : `Replica disagrees on ${pct(flip)} of bits`,
          steps: [`Forces the input to ${lab.kiInput === "zero" ? "zero" : "0.5 µA DC"} and records C from the victim.`,
            `Runs her replica on the same input: its bits differ from the victim's D on <b>${pct(flip)}</b> of clocks (50% = no information; the paper measured 50.05%).`,
            `Uses C ⊕ replica as the keystream and runs BM on ${w.tries} windows of 64 bits: ${w.broken} window${w.broken === 1 ? "" : "s"} came out exactly right.`,
            d === "base" ? (br ? `One clean window is enough: the 16-bit LFSR state falls out, and every later reading decrypts.` : `No clean window, so no LFSR state. The keystream stays hidden.`)
              : reuse ? (state.mac ? `The replica is so close that C ⊕ replica <i>is</i> this frame's keystream (${pct(raw)} right). But the frame counter gives every frame a fresh keystream, so nothing else decrypts.` : `The replica is so close that C ⊕ replica <i>is</i> this frame's keystream (${pct(raw)} right). With counter + MAC off every frame reuses it, so all other frames decrypt.`)
              : (w.broken ? `Even the clean windows don't help: BM cannot model Grain-128a, so nothing beyond them decrypts.` : `No clean window, and Grain-128a would resist BM anyway.`)],
          plot: { kind: "bits", bits: agree, on: "replica wrong", off: "replica right" } };
      };
      return { base: o("base"), prop: o("prop") };
    } },

  { id: "samekey", name: "Same key, same message", src: "paper", stop: () => state.mac ? "Dither + QN (both); per-frame IV (proposal)" : "Dither + quantisation noise (S-DSM, both)",
    has: "Two encryptions of the same reading under the same key (the paper uses two channels of one chip).",
    desc: "Re-using a stream-cipher key is the classic 'two-time pad' mistake: C₁ ⊕ C₂ = D₁ ⊕ D₂, the keystream cancels, and identical messages give identical ciphertexts. The original design uses the same keystream for every frame, so it relies on S-DSM here: quantisation noise and dither make D₁ ≠ D₂ even for the same input (paper: 49.8% bit flips). Set the mismatch to 0 and dither low to see the leak. With the frame counter on, the proposal gives every frame its own keystream, so K₁ ≠ K₂ and the XOR is noise whatever the modulator does.",
    knobs: [{ k: "chMismatch", label: "Mismatch between the two channels", min: 0, max: 1, step: 0.01, fmt: v => v.toFixed(2) + "% FS" },
      { g: "dither", label: "Dither enabled (global)" }, { g: "dither_amp", label: "Dither strength (global)", min: 0.01, max: 0.4, step: 0.005, fmt: v => v.toFixed(3) + " ×ref" }],
    run(R) {
      const i = sensorCurrent(state, LAB_N);
      const u1 = Float64Array.from(i, x => s2d(tia(x, state.rtia), state.buffer)), u2 = u1.map(v => v + lab.chMismatch / 100);
      const D1 = labDsm(u1, state.dither_seeds, state.seed), D2 = labDsm(u2, [0x3A17, 0x6E29], state.seed + 12);
      const flip = flipFrac(D1, D2, LAB_N), leak = Math.abs(flip - 0.5) > 0.03;
      const o = () => ({ v: leak ? "leak" : "safe", head: `C₁ ⊕ C₂ has ${pct(flip)} ones`,
        steps: [`Captures two frames carrying the same reading, encrypted with the same keystream K.`,
          `XORs them: C₁ ⊕ C₂ = D₁ ⊕ D₂, the key cancels out.`,
          `The two modulator streams differ on <b>${pct(flip)}</b> of bits (a plain stream cipher gives 0%).`,
          leak ? `Far from 50%: the XOR reveals that both frames carry nearly the same signal, and one known frame gives away the other.` : `≈50%: the XOR is noise, and Eve learns nothing from the key reuse.`],
        plot: { kind: "bits", bits: xorBits(D1, D2).subarray(0, 400), on: "C₁ ≠ C₂", off: "C₁ = C₂" } });
      const Sp = R.prop;
      if (!Sp.mac) return { base: o(), prop: o() };
      const K1 = keystreamNL(Sp.key_enroll, ivBits(Sp.nonce, state.frame_ctr), ID_BITS + LAB_N).enc.subarray(ID_BITS);
      const K2 = keystreamNL(Sp.key_enroll, ivBits(Sp.nonce, state.frame_ctr + 1), ID_BITS + LAB_N).enc.subarray(ID_BITS);
      const X = xorBits(xorBits(D1, K1), xorBits(D2, K2)), fp = X.reduce((a, b) => a + b, 0) / LAB_N;
      return { base: o(), prop: { v: Math.abs(fp - 0.5) > 0.03 ? "leak" : "safe", head: `C₁ ⊕ C₂ has ${pct(fp)} ones`,
        steps: [`Captures two frames carrying the same reading under the same key.`,
          `But they carry counters ${state.frame_ctr} and ${state.frame_ctr + 1}, so each was encrypted with its own keystream: C₁ ⊕ C₂ = D₁ ⊕ D₂ ⊕ K₁ ⊕ K₂.`,
          `The keys no longer cancel: <b>${pct(fp)}</b> of the XOR bits are 1, whatever the modulators did (${pct(flip)} of D bits differ).`,
          `The XOR is noise. Key reuse is gone, not just hidden.`],
        plot: { kind: "bits", bits: X.subarray(0, 400), on: "C₁ ≠ C₂", off: "C₁ = C₂" } } };
    } },

  { id: "saturate", name: "Forced-input saturation", src: "beyond", stop: () => state.mac ? "S2D ×0.5 buffer; per-frame IV as backup" : "S2D ×0.5 buffer",
    has: "The ability to inject a large current at the electrode.",
    desc: "If the modulator saturates, its output freezes at all 1s, so C ⊕ 1 is the keystream in the clear. The S2D buffer halves the input so the loop stays in control. Turn the buffer off (global) to see what happens.",
    knobs: [{ g: "buffer", t: "seg", label: "S2D buffer (global)", opts: [[0.5, "×0.5 (on)"], [1.0, "×1 (off)"]] },
      { g: "force_uA", label: "Forced current (global)", min: 0.5, max: 20, step: 0.5, fmt: v => v + " µA" }],
    run(R) {
      const D = labDsm(labU(state.force_uA * 1e-6), state.dither_seeds, state.seed);
      const ones = D.reduce((a, b) => a + b, 0) / LAB_N, run = longestRun(D), guess = ones >= 0.5 ? 1 : 0;
      const o = (d, Sx) => {
        const K = Sx.K.subarray(0, LAB_N), C = xorBits(D, K), Kg = C.map(c => c ^ guess);
        const w = windowAttack(Kg, K, state.seed + 23), raw = 1 - flipFrac(Kg, K, LAB_N), reuse = d === "prop" && raw > 0.97;
        const br = (w.broken > 0 && d === "base") || (reuse && !state.mac);
        return { v: br ? "breached" : "safe", head: `Modulator ${pct(ones, 0)} ones, longest run ${run}`,
          steps: [`Forces ${state.force_uA} µA; the buffer is ${state.buffer === 0.5 ? "on (×0.5)" : "<b>off</b>"}.`,
            run > 200 ? `The modulator saturates: D is stuck at ${guess}s, so C ⊕ ${guess} is the keystream itself.` : `The loop stays in control: D keeps toggling (longest run ${run} bits), so guessing D = all ${guess}s is wrong most of the time.`,
            `BM on ${w.tries} windows: ${w.broken} predicted the future keystream.`,
            d === "base" ? (br ? `The LFSR is recovered: all later data decrypts.` : `No window breaks the LFSR.`) : (reuse ? (state.mac ? `This frame's keystream is in the clear, but the frame counter gives the next frame a fresh one, and the forced reading itself is worthless.` : `This frame's keystream is in the clear, and with counter + MAC off every frame reuses it: all other frames decrypt.`) : `Nothing to learn.`)],
          plot: { kind: "bits", bits: D.subarray(2000, 2400), on: "D = 1", off: "D = 0", neutral: true } };
      };
      return { base: o("base", R.base), prop: o("prop", R.prop) };
    } },

  { id: "extract", name: "Key extraction from memory", src: "beyond", stop: "No stored key: PUF (proposal)",
    has: "Physical access to a sensor: de-capping and reading its non-volatile memory (outside the paper's non-invasive model).",
    desc: "Floating sensors can be fished out of a bioreactor. The original design must keep its pre-shared key in on-chip memory, where it survives power-off and can be read out. The proposal keeps no key: it is rebuilt from the SRAM power-up pattern, which does not exist while the chip is unpowered.",
    run(R) {
      return {
        base: { v: "breached", head: `Reads the key ${hex16(state.key16)} straight out`,
          steps: [`De-caps the chip and reads the key register / NVM.`, `Gets ${hex16(state.key16)} - the same key the receiver uses.`,
            `Decrypts every recorded and future frame, and can clone the sensor (see <b>Cloned sensor</b>).`],
          plot: { kind: "y", series: [[R.yTrue, "true"], [R.yTrue, "eve"]] } },
        prop: { v: "safe", head: "Nothing secret is stored",
          steps: [`De-caps the chip: the NVM holds no key, and the SRAM has no power-up pattern while unpowered.`,
            `The helper data h is public anyway; it gives at most ${10 * state.bch_t} bits of information about the ${PUF_BITS}-bit fingerprint.`,
            `Nothing to decrypt with. (Probing the SRAM of a <i>running</i> chip is a harder, active attack not modelled here.)`],
          plot: { kind: "y", series: [[R.yTrue, "true"], [R.yFail.prop, "eve"]] } },
      };
    } },

  { id: "spoof", name: "Spoofing: forged sensor frames (MITM)", src: "paper", stop: "Unrecoverable key (proposal)",
    has: "A transmitter in the link (man-in-the-middle) plus the best key it can get with the attacks above.",
    desc: "The threat the paper warns about: Eve poses as the sensor and feeds the server a fake reading to misinform the bioreactor's control loop. The receiver accepts a frame when the decrypted ID is right. Eve encrypts her fake reading with the best key she can get: the brute-forced key for the original design, a guess for the proposal.",
    knobs: [{ k: "fake", label: "Fake reading Eve sends", min: -0.9, max: 0.9, step: 0.05, fmt: v => v.toFixed(2) + " µA DC" }],
    run(R) {
      const Dfake = labDsm(labU(lab.fake * 1e-6), state.dither_seeds, state.seed + 31), yFake = decodeY(Dfake);
      const o = (d, Sx, Katt) => {
        const idOk = Katt.subarray(0, ID_BITS).every((b, i) => b === Sx.ks_rx_all[i]);
        const y = decodeY(xorBits(xorBits(Dfake, Katt.subarray(ID_BITS)), Sx.K_rx.subarray(0, LAB_N)));
        return { v: idOk ? "spoofed" : "detected", head: idOk ? "Server shows Eve's fake reading" : "Receiver rejects the frame",
          steps: [d === "base" ? `Gets the key by brute force (${bfCache ? bfCache.ms.toFixed(0) : "a few"} ms).` : `No attack above yields the 128-bit key, so she has to guess one.`,
            `Encrypts a fake ${lab.fake.toFixed(2)} µA reading and its ID, and transmits it as the sensor.`,
            idOk ? `ID check <b>passes</b>. The server's control loop now acts on the fake value.` : `ID check <b>fails</b>${Sx.mac ? " and so does the MAC" : ""}: the frame is dropped and flagged, and its payload decrypts to noise.`],
          plot: { kind: "y", series: [[R.yTrue, "true"], [yFake, "fake"], [y, "server"]] } };
      };
      const Kb = new LFSR16(bfCache && bfCache.found > 0 ? bfCache.found : 1).bits(ID_BITS + LAB_N);
      const Kp = keystreamNL(Uint8Array.from({ length: 128 }, (_, i) => makeRng(state.seed + 33 + i).int(2)), null, ID_BITS + LAB_N).enc;
      return { base: o("base", R.base, Kb), prop: o("prop", R.prop, Kp) };
    } },

  { id: "clone", name: "Cloned / counterfeit sensor", src: "beyond", stop: "Unclonable PUF fingerprint",
    has: "A copy of the chip built from the same design, the public helper data, and the original's key if it can be extracted.",
    desc: "Eve drops her own chip into the bioreactor and claims to be the real sensor. With a stored key, a clone is only a firmware copy away. With a PUF, the clone's SRAM powers up in its own pattern, which no helper data can turn into the original's key.",
    knobs: [{ k: "clone", label: "Counterfeit chip number", min: 1, max: 30, step: 1, fmt: v => "#" + v }],
    run(R) {
      const Sp = R.prop, t = state.bch_t, puf = new SRAMPUF(state.chip_seed + 500 + lab.clone, PUF_BITS, state.puf_sigma);
      const wc = puf.read(state.temp, makeRng(state.seed + 41 + lab.clone));
      const dist = wc.reduce((a, b, i) => a + (b !== Sp.w_enroll[i]), 0);
      const rc = reconstruct(wc, bitsToSyn(Sp.h_bits, t), t), ok = rc.key.every((b, i) => b === Sp.key_enroll[i]);
      return {
        base: { v: "spoofed", head: "Clone accepted as the real sensor",
          steps: [`Extracts or brute-forces the key ${hex16(state.key16)} (see above).`, `Loads it into a counterfeit chip of the same design.`,
            `The receiver cannot tell them apart: ID check <b>passes</b>, and the clone can report whatever it likes.`],
          plot: { kind: "bar", val: 1, max: 1, lim: 0, ok: false, text: "clone's key = real key: identical identity" } },
        prop: { v: ok ? "spoofed" : "detected", head: `Clone's fingerprint differs in ${dist} of ${PUF_BITS} bits`,
          steps: [`Counterfeit chip #${lab.clone} powers up: its SRAM pattern differs from the real chip's in <b>${dist}</b> bits.`,
            `It uses the real chip's public helper data. The decoder can fix at most t = ${t} bits: ${rc.ok ? "it ‘succeeds’ on the wrong codeword" : "it fails"}.`,
            ok ? `Key matches - should never happen.` : `Key ≠ the enrolled key, so the ID check <b>fails</b>. The clone is rejected.`],
          plot: { kind: "bar", val: dist, lim: t, max: Math.max(dist, t) * 1.15, ok: dist > t, text: `fingerprint distance (line = t = ${t})` } },
      };
    } },

  { id: "htamper", name: "Helper-data tampering", src: "beyond", stop: "key = hash(w) + ID check",
    has: "Write access to the link that carries the public helper data h at power-up.",
    desc: "Helper data is public, but it steers the error correction. Flipping bits of h in transit makes the chip 'correct' the wrong bits, so it rebuilds a wrong key. That can't leak data, and the receiver sees the ID fail at once. It is a denial of service, which the paper leaves out of scope. Try it by hand in the workbench below.",
    knobs: [{ k: "hFlip", label: "Bits of h Eve flips", min: 0, max: 40, step: 1, fmt: v => v + " bits" }],
    run(R) {
      const Sp = R.prop, t = state.bch_t, hb = Sp.h_bits.slice(), r = makeRng(state.seed + 51), idx = new Set();
      while (idx.size < Math.min(lab.hFlip, hb.length)) idx.add(r.int(hb.length));
      idx.forEach(i => { hb[i] ^= 1; });
      const rc = reconstruct(Sp.w_noisy, bitsToSyn(hb, t), t), ok = rc.key.every((b, i) => b === Sp.key_enroll[i]);
      const kd = rc.key.reduce((a, b, i) => a + (b !== Sp.key_enroll[i]), 0);
      return {
        base: { v: "na", head: "No helper data in this design", steps: [`The original design has no helper data. Its only secret is the stored key, whose risks are shown above.`] },
        prop: { v: ok ? "safe" : "detected", head: ok ? "No change: link works" : `Wrong key (${kd}/128 bits differ)`,
          steps: [`Flips ${lab.hFlip} of the ${hb.length} helper bits on the way to the chip.`,
            `The decoder ${rc.ok ? "finds a 'valid' but wrong" : "cannot find a"} correction and hashes the result.`,
            ok ? `With nothing flipped the key is exact.` : `The key differs in ${kd} of 128 bits (a hash spreads any change). The ID check fails and the receiver raises an alarm; no data is exposed.`],
          plot: { kind: "bar", val: kd, lim: 0, max: 128, neutral: true, text: "chip key bits wrong, of 128" } },
      };
    } },

  { id: "hleak", name: "Helper-data leakage", src: "beyond", stop: "Choose t so n − 10t ≥ 128",
    has: "The public helper data h, which anyone can read.",
    desc: "h is 10t bits of information about the 600-bit fingerprint. What is left for Eve to guess is at least 600·H∞ − 10t bits, where H∞ = −log₂ max(p, 1−p) is each cell's min-entropy for a cell that powers up to 1 with probability p. Unbiased cells give 1 bit each; a biased PUF gives less, and the margin shrinks fast. Move the BCH t and the PUF bias (global) and watch it.",
    knobs: [{ g: "bch_t", label: "BCH correction t (global)", min: 10, max: 60, step: 1, fmt: v => v + "" }, { g: "puf_bias", label: "PUF bias P(cell = 1) (global)", min: 0.5, max: 0.75, step: 0.01, fmt: v => v.toFixed(2) }],
    run() {
      const res = pufResidual(state), h = minEntBit(state.puf_bias);
      return {
        base: { v: "na", head: "Nothing public to leak", steps: [`No helper data. The key is only 16 bits long, which is the real problem (see brute force).`] },
        prop: { v: res >= 128 ? "safe" : "weak", head: `${Math.max(0, res)} bits left for a 128-bit key`,
          steps: [`Reads h: ${10 * state.bch_t} bits.`, `The cells carry ${h.toFixed(3)} bits of min-entropy each (bias ${state.puf_bias.toFixed(2)}), so at least ${PUF_BITS} × ${h.toFixed(3)} − ${10 * state.bch_t} = <b>${Math.max(0, res)}</b> bits of the fingerprint remain unknown.`,
            res >= 128 ? `That is more than the 128-bit key needs, so hash(w) is still a full-strength key.` : `Fewer than 128: the key is now easier to guess than its length suggests. Use a longer PUF, a smaller t, or debias the cells.`],
          plot: { kind: "bar", val: Math.max(0, res), lim: 128, max: PUF_BITS, ok: res >= 128, text: "secret fingerprint bits left (line = 128)" } },
      };
    } },

  { id: "hmanip", name: "Helper-data manipulation oracle", src: "beyond", stop: "Syndrome construction + key = hash(w)",
    has: "Write access to h at power-up, as many power-ups as she likes, and the receiver's accept/reject (worst case also the decoder's own failure flag).",
    desc: "A known class of attacks on PUF key generators: change the helper data in a chosen way, power the chip up, and watch whether it still works. In constructions where the key comes from the decoded codeword, or where helper data points at specific cells, the pattern of failures can give key bits away. Here Eve adds the syndrome of an error pattern she picks. The decoder then sees syn(e_noise ⊕ e), which does not depend on the fingerprint w at all, and since key = hash(w) any change gives a wrong key. The test: ask a twin chip with a different fingerprint (same noise) the same questions. If every answer matches, Eve learns nothing about w.",
    knobs: [{ k: "manipQ", label: "Power-ups Eve tries", min: 20, max: 600, step: 20, fmt: v => v + "" }],
    run(R) {
      const Sm = simulate({ ...state, scheme: "proposed", attack: "hmanip", atk: lab }), M = Sm.manip;
      const ws = Object.keys(M.byW).map(Number).sort((a, b) => a - b);
      return {
        base: { v: "na", head: "No helper data in this design", steps: [`The original design has no helper data to manipulate.`] },
        prop: { v: M.same === M.Q ? "safe" : "leak", head: `${M.same}/${M.Q} answers identical for a different fingerprint`,
          steps: [`Makes ${M.Q} power-ups, each time adding the syndrome of a chosen error pattern (weight 1 to ${state.bch_t + 10}) to h.`,
            `The receiver accepts ${M.acc} of them; the decoder fails on ${M.fails} (more injected plus natural errors than t = ${state.bch_t}).`,
            `A chip with a completely different fingerprint, given the same queries and the same noise, answers <b>identically ${M.same} of ${M.Q} times</b>.`,
            M.same === M.Q ? `So the answers depend only on the noise and on Eve's own choices: 0 bits of w leak. (They do reveal how noisy the chip is, which says nothing about the key.)` : `Some answers differ, so they carry information about w.`],
          plot: { kind: "fail", ws, rate: ws.map(w => M.byW[w][1] / M.byW[w][0]), t: state.bch_t } },
      };
    } },

  { id: "replay", name: "Replay of a recorded frame", src: "beyond", stop: () => state.mac ? "Frame counter + MAC (proposal)" : "Neither - turn on counter + MAC",
    has: "A recording of any valid earlier frame.",
    desc: "Eve records a frame while the reactor is healthy and plays it back later, hiding a fault. She needs no key. The original design restarts the same keystream from the same key and nothing in the frame changes with time, so it accepts the old frame. The proposal's frame counter fixes this: the receiver only accepts counters higher than the last one, and the counter is protected by the MAC.",
    knobs: [{ g: "mac", t: "chk", label: "Frame counter + MAC in the proposal (global)" }],
    run(R) {
      const now = R.yTrue.map(v => v * 0.4), Sp = R.prop;
      const o = () => ({ v: "spoofed", head: "Old frame accepted as new",
        steps: [`Records a valid frame earlier.`, `Later the real reading has dropped to 40% (a fault).`,
          `Replays the old frame: same key, same keystream, so the ID check <b>passes</b> and the server shows the old, healthy reading.`],
        plot: { kind: "y", series: [[now, "true"], [R.yTrue, "server"]] } });
      if (!Sp.mac) { const p = o(); p.steps.push(`The proposal has its counter + MAC turned off, so it is no better here.`); return { base: o(), prop: p }; }
      const last = Math.max(state.rx_last_ctr, state.frame_ctr), bump = last + 1;
      const v = macVerify(Sp.key_enroll, Sp.nonce, bump, Sp.enc_id, Sp.C, Sp.tag);
      return { base: o(), prop: { v: v.ok ? "spoofed" : "detected", head: "Replayed frame rejected",
        steps: [`Records frame #${state.frame_ctr}; the receiver accepts it and remembers counter ${last}.`,
          `Replays it unchanged: counter ${state.frame_ctr} ≤ ${last}, so it is <b>stale</b> and dropped.`,
          `Rewrites the clear counter to ${bump}: the receiver rebuilds the keystream for counter ${bump} and gets tag 0x${v.tag.toString(16).toUpperCase().padStart(8, "0")} ≠ 0x${Sp.tag.toString(16).toUpperCase().padStart(8, "0")} in the frame. <b>Rejected.</b>`,
          `Replays it after a reboot: the receiver has sent a new session nonce, so the tag fails again.`],
        plot: { kind: "y", series: [[now, "true"]] } } };
    } },

  { id: "bitflip", name: "Bit-flipping in transit (malleability)", src: "beyond", stop: () => state.mac ? "MAC over the payload (proposal)" : "Neither - turn on counter + MAC",
    has: "A man-in-the-middle who can flip bits it forwards, without any key.",
    desc: "XOR encryption is malleable: flipping a ciphertext bit flips the same bit of D after decryption. Flipping a random fraction p of payload bits scales the recovered reading by about (1 − 2p). The ID check covers only the ID field, so the original design never notices. The proposal's MAC covers every payload bit, so any flip changes the tag the receiver computes.",
    knobs: [{ k: "flipP", label: "Payload bits Eve flips", min: 0, max: 0.3, step: 0.01, fmt: v => pct(v, 0) }, { g: "mac", t: "chk", label: "Frame counter + MAC in the proposal (global)" }],
    run(R) {
      const r = makeRng(state.seed + 61), D = R.base.D.subarray(0, LAB_N), Dm = D.map(b => (r.u() < lab.flipP ? b ^ 1 : b));
      const y = decodeY(Dm); let num = 0, den = 0;
      for (let i = 60; i < y.length; i++) { num += y[i] * R.yTrue[i]; den += R.yTrue[i] ** 2; }
      const g = den > 1e-9 ? num / den : 1 - 2 * lab.flipP;
      const o = () => ({ v: lab.flipP > 0 ? "spoofed" : "safe", head: lab.flipP > 0 ? `Reading scaled to ${pct(g, 0)}, undetected` : "Nothing flipped",
        steps: [`Flips ${pct(lab.flipP, 0)} of the payload bits, leaves the header and ID alone.`,
          `The receiver decrypts correctly, but D has ${pct(lab.flipP, 0)} of its bits inverted.`,
          lab.flipP > 0 ? `The recovered reading shrinks to ${pct(g, 0)} of its true value, and the ID check still <b>passes</b>.` : `No change.`],
        plot: { kind: "y", series: [[R.yTrue, "true"], [y, "server"]] } });
      const Sp = R.prop;
      if (!Sp.mac || lab.flipP === 0) return { base: o(), prop: o() };
      const r2 = makeRng(state.seed + 62), Cm = Sp.C.map(b => (r2.u() < lab.flipP ? b ^ 1 : b));
      const v = macVerify(Sp.key_enroll, Sp.nonce, state.frame_ctr, Sp.enc_id, Cm, Sp.tag);
      return { base: o(), prop: { v: v.ok ? "spoofed" : "detected", head: "Tampered frame rejected",
        steps: [`Flips ${pct(lab.flipP, 0)} of the payload bits, leaves the header and ID alone.`,
          `The receiver recomputes the MAC over what arrived: 0x${v.tag.toString(16).toUpperCase().padStart(8, "0")}, but the frame says 0x${Sp.tag.toString(16).toUpperCase().padStart(8, "0")}.`,
          `<b>Rejected</b> before the data is used. Eve cannot fix the tag: it depends on secret keystream bits, so a forgery succeeds with probability 2⁻³².`],
        plot: { kind: "y", series: [[R.yTrue, "true"], [y, "tamper"]] } } };
    } },
];

// ---------------------------------------------------------------- compute
// S0 (a result already computed for the current settings) is reused whenever it is the run we need
const labSim = (S0, scheme, attack) => (S0 && S0.P.scheme === scheme && (S0.P.attack || "none") === attack ? S0 : simulate({ ...state, scheme, attack, atk: lab }));
function labWave(R, S0) { R.wave = { base: labSim(S0, "baseline", lab.sel), prop: labSim(S0, "proposed", lab.sel), id: lab.sel }; }
function labCompute(S0) {
  const Sb = labSim(S0, "baseline", "none"), Sp = labSim(S0, "proposed", "none");      // the matrix judges attacks from the clean link
  const R = { base: Sb, prop: Sp };
  R.yTrue = decodeY(Sb.D.subarray(0, LAB_N));
  const wrongB = new LFSR16((state.key16 ^ 0x5A5A) || 1).bits(ID_BITS + LAB_N).subarray(ID_BITS);
  const wrongP = keystreamNL(Uint8Array.from({ length: 128 }, (_, i) => (i * 7 + 3) % 5 < 2 ? 1 : 0), null, ID_BITS + LAB_N).enc.subarray(ID_BITS);
  R.yFail = { base: decodeY(xorBits(Sb.C.subarray(0, LAB_N), wrongB)), prop: decodeY(xorBits(Sp.C.subarray(0, LAB_N), wrongP)) };
  R.res = {};
  for (const a of ATTACKS) R.res[a.id] = a.run(R);
  labWave(R, S0);
  return R;
}

// ---------------------------------------------------------------- requests (worker or main thread)
// Shared by worker.js and the page's main-thread fallback. Results leave the worker by structured
// clone, so the lab's extra runs are cut down to what the page draws (bit windows, readings, scalars).
const SLIM_WIN = 3000;
function slimVal(v, depth = 0) {
  if (ArrayBuffer.isView(v)) return v.length > 5000 ? v.slice(0, SLIM_WIN) : v.slice();
  if (Array.isArray(v)) return v.length > 5000 ? v.slice(0, SLIM_WIN) : v.slice();
  if (v && typeof v === "object") { if (depth > 3) return undefined; const o = {}; for (const k in v) o[k] = slimVal(v[k], depth + 1); return o; }
  return v;
}
const slimWave = w => ({ base: slimVal(w.base), prop: slimVal(w.prop), id: w.id });
function handleRequest(m, progress, assign) {
  if (assign) { Object.assign(state, m.state); Object.assign(lab, m.lab); }
  switch (m.type) {
    case "sim": return { type: "sim", S: simulate({ ...state, atk: lab }) };
    case "lab": { const R = labCompute(null); return { type: "lab", LR: { res: R.res, base: slimVal(R.base), prop: slimVal(R.prop), wave: slimWave(R.wave) } }; }
    case "wave": { const R = {}; labWave(R, null); return { type: "wave", wave: slimWave(R.wave) }; }
    case "task": return { type: "task", name: m.name, out: TASKS[m.name](m.args || {}, progress || (() => {})) };
  }
  throw new Error("unknown request " + m.type);
}
// ---------------------------------------------------------------- the paper's measured numbers and its energy model
const PAPER = {
  zero: 0.5005, same: 0.498, shannon: 0.9999978907, minent: 0.907679,
  power: { fe: 321, tia: 271, s2d: 250, dsm: 510, sdsm: 24, trivium: 220 },
  energy: [[50, 11.1, 4.5, 22.35, 15.5], [50, 10, 5, 24.82, 15.5], [30, 6.67, 4.5, 22.36, 9.3], [30, 6, 5, 24.84, 9.3]],
};
// Fig. 4(b) reproduced: energy for the same information = bits sent x radio energy per bit + security power x 100 µs.
// The radio is 3.1 mW at 200 kb/s [10] = 15.5 nJ/bit; 100 µs is 20 Nyquist samples at 200 kS/s.
const RADIO_J_PER_BIT = 3.1e-3 / 200e3, T_INFO = 100e-6, NYQ = 20;
const energySDSM = (osr, pSec_uW, extraBits = 0) => (osr * NYQ + extraBits) * RADIO_J_PER_BIT + pSec_uW * 1e-6 * T_INFO;
const energyWords = (srnr, pSec_uW, bits = 16) => bits * srnr * NYQ * RADIO_J_PER_BIT + pSec_uW * 1e-6 * T_INFO;

// ---------------------------------------------------------------- cost model
// Area: gate equivalents (GE) counted from each block's structure with editable per-cell costs, or a
// published figure where one exists (COST_PUB, filled from cited sources). Continuous power: GE x
// (µW per GE at 10 MHz), with µW/GE calibrated on the paper's measured Trivium (220 µW). Energy: the
// Fig. 4(b) model above. One-time power-up work (PUF read, BCH decode, hash) is reported separately.
// Cell costs: UMC 0.18 µm library (Virtual Silicon UMCL18G212T3) as tabulated by Poschmann (2009, Table 2.1).
const COST_DEF = { ge_dff: 5.33, ge_xor: 2.67, ge_and: 1.33, ge_mux: 2.33, trivium_ge: null, frame_bits: N_DSM, osr: 30, srnr: 5 };
// Published figures used as cross-checks and for the one-time power-up blocks ([derived] = arithmetic on them)
const COST_PUB = {
  trivium_syn: { ge: 2390, src: "Feldhofer 2007, Table 2: radix-1, synthesised, 0.35 µm" },
  trivium_pw: { src: "Mora-Gutiérrez et al. 2013, Table 2: radix-1 at 20 MHz, 1.2 V: 236 µW (130 nm), 219 µW (90 nm)" },
  grain_enc: { ge: 2145.5, src: "Ågren et al. 2011, Table 1: Grain-128a 1×, encryption only (designers' estimate, FF = 8 GE)" },
  grain_mac: { ge: 2867, src: "Ågren et al. 2011, Table 2: encryption + 32-bit MAC at 1 keystream bit per clock (2×)" },
  hash: { ge: 1060, cyclesPerByte: 2380, src: "SPONGENT-128, Bogdanov et al. 2011, Table 2: 1,060 GE, 2,380 cycles per 8-bit block (UMC 0.13 µm)" },
  bch: { src: "No ASIC BCH decoder in GE found for t ≈ 10–40. For scale: PUFKY's BCH(318,174,17) decoder (t = 17) uses 112 + 72 Spartan-6 slices and 50,320 cycles to decode (Maes et al. 2012, Table 2)" },
  sram: { f2: 373, fjPerBit: 128, src: "SRAM PUF cell of 373 F², 128 fJ per bit read (130 nm; Liu et al. 2020, abstract)" },
};
function costModel(A0 = {}) {
  const A = { ...COST_DEF, ...A0 }, c = (dff, xor, and, mux = 0) => dff * A.ge_dff + xor * A.ge_xor + and * A.ge_and + mux * A.ge_mux;
  const lfsr16 = c(16, 3, 0);                                    // x^16 + x^14 + x^13 + x^11: three XORs
  // Grain-128a from its equations: 256 state bits with load muxes; logic per pre-output bit:
  // LFSR feedback 5 XOR, NFSR feedback 15 XOR + 14 AND2 (AND3/AND4 as chains), h 4 XOR + 6 AND2, y 8 XOR, init feedback 2 XOR
  const grainLogic = c(0, 34, 20), grain1 = c(256, 0, 0, 256) + grainLogic, grain2 = grain1 + grainLogic;   // 2 bits/clock = logic twice
  const triviumCount = c(288, 11, 3, 288);                        // 288 state bits, 11 XOR + 3 AND per bit, load muxes
  const trivium = A.trivium_ge || triviumCount;                  // same cell table as everything else, by default
  const uwPerGE = 220 / trivium;                                  // calibrated on the paper's measured Trivium (assumed clocked at 10 MHz)
  // parts: [name, GE, switches every modulator clock?]. Static registers count for area, not for power.
  const designs = {
    orig: [["key LFSR-16", lfsr16, true], ["2 dither LFSR-16s", 2 * lfsr16, true], ["16-bit key register", c(16, 0, 0), false], ["XOR", c(0, 1, 0), true]],
    prop: [["Grain-128a, 2 bits per clock", grain2, true], ["MAC accumulator + register", c(64, 32, 32), true], ["2 dither LFSR-16s", 2 * lfsr16, true],
      ["128-bit key register", c(128, 0, 0), false], ["counter, nonce, tag out", c(64, 31, 31, 32), false]],
    propNoMac: [["Grain-128a, 1 bit per clock", grain1, true], ["2 dither LFSR-16s", 2 * lfsr16, true], ["128-bit key register", c(128, 0, 0), false], ["counter + nonce", c(64, 31, 31), false]],
  };
  const sum = (d, act) => designs[d].reduce((a, [, ge, on]) => a + (act && !on ? 0 : ge), 0);
  const base = PAPER.power.fe + PAPER.power.tia + PAPER.power.s2d + PAPER.power.dsm;
  const out = { A, uwPerGE, trivium, triviumCount, grain1, grain2, designs, base, rows: {} };
  for (const d of Object.keys(designs)) {
    const ge = sum(d, false), act = sum(d, true), p = act * uwPerGE;
    const extra = d === "orig" ? 0 : 64 * (A.osr * NYQ) / A.frame_bits;   // counter + tag bits per unit of information
    out.rows[d] = { ge, act, p, pct: p / base, e: energySDSM(A.osr, p, d === "propNoMac" ? extra / 2 : extra) };
  }
  out.rows.origMeasured = { p: PAPER.power.sdsm, pct: PAPER.power.sdsm / base, e: energySDSM(A.osr, PAPER.power.sdsm) };
  out.rows.trivium = { ge: trivium, act: trivium, p: PAPER.power.trivium, pct: PAPER.power.trivium / base, e: energyWords(A.srnr, PAPER.power.trivium) };
  // one-time power-up work: hash the 600-bit corrected fingerprint (75 bytes) plus a 128-bit squeeze, read the PUF
  const hashCycles = (75 + 16) * COST_PUB.hash.cyclesPerByte, ePerGECycle = uwPerGE * 1e-6 / 10e6;
  out.once = { hashCycles, hashMs: hashCycles / 10e6 * 1e3, hashJ: COST_PUB.hash.ge * hashCycles * ePerGECycle,
    pufUm2: PUF_BITS * COST_PUB.sram.f2 * 0.065 ** 2, pufJ: PUF_BITS * COST_PUB.sram.fjPerBit * 1e-15 };
  out.check = { trivium: [triviumCount, COST_PUB.trivium_syn.ge], grainEnc: [grain1, COST_PUB.grain_enc.ge], grainMac: [grain2 + c(64, 32, 32), COST_PUB.grain_mac.ge] };
  return out;
}

const TASKS = {};
const winFlips = (a, b, n, w) => Float32Array.from({ length: Math.floor(n / w) }, (_, j) => { let f = 0; for (let i = j * w; i < (j + 1) * w; i++) f += a[i] !== b[i]; return f / w; });

// Reproduce Fig. 4(c): two channels of one chip, same key, same input, different dither sequences.
// Decomposed by what makes the two channels differ: dither, thermal noise, analog mismatch.
TASKS.calib = () => {
  const n = LAB_N, P = { ...state }, mm = lab.chMismatch / 100, noise = P.int_noise > 0 ? P.int_noise : 1.8e-5;
  const uZero = new Float64Array(n).fill(s2d(tia(0, P.rtia), P.buffer));
  const uSame = Float64Array.from(sensorCurrent({ ...P, sig: "sine" }, n), x => s2d(tia(x, P.rtia), P.buffer));
  const pair = (Q, u, mmx) => {
    const D1 = dsm2(u, dsmOpts(Q), makeRng(Q.seed + 11)).D, D2 = dsm2(u.map(v => v + mmx), dsmOpts(Q, [0x3A17, 0x6E29]), makeRng(Q.seed + 12)).D;
    return { flip: flipFrac(D1, D2, n), first: flipFrac(D1, D2, 1000), trace: winFlips(D1, D2, n, 500), D1 };
  };
  const rows = [];
  for (const dither of [true, false]) for (const nz of [noise, 0]) for (const mmx of [mm, 0]) {
    const Q = { ...P, dither, int_noise: nz, dither_at: "comparator" };
    const z = pair(Q, uZero, mmx), sm = pair(Q, uSame, mmx);
    rows.push({ dither, noise: nz, mismatch: mmx * 100, at: "comparator", zero: z.flip, same: sm.flip, zeroFirst: z.first, sameFirst: sm.first, trace: sm.trace });
  }
  const Qf = { ...P, dither: true, int_noise: noise, dither_at: "feedback" };
  const zf = pair(Qf, uZero, mm), sf = pair(Qf, uSame, mm);
  rows.push({ dither: true, noise, mismatch: mm * 100, at: "feedback", zero: zf.flip, same: sf.flip, zeroFirst: zf.first, sameFirst: sf.first, trace: sf.trace });
  const sndrAt = at => { const Q = { ...P, int_noise: noise, dither_at: at, sig: "sine" }, u = Float64Array.from(sensorCurrent(Q, N_DSM), x => s2d(tia(x, Q.rtia), Q.buffer)); return sndr(fir(cic(dsm2(u, dsmOpts(Q), makeRng(Q.seed)).D), COMP_TAPS), Q.bin); };
  // entropy of the original design's ciphertext over the full frame, MCV estimator of SP 800-90B (one of its ten)
  const Sb = simulate({ ...P, scheme: "baseline", attack: "none", atk: lab }), bytes = new Uint8Array(Math.floor(Sb.n / 8));
  for (let i = 0; i < bytes.length; i++) { let v = 0; for (let j = 0; j < 8; j++) v = (v << 1) | Sb.C[i * 8 + j]; bytes[i] = v; }
  const cnt = new Float64Array(256); bytes.forEach(b => cnt[b]++);
  let H = 0; for (const c of cnt) if (c) { const q = c / bytes.length; H -= q * Math.log2(q); }
  const N = bytes.length, ph = Math.max(...cnt) / N, pu = Math.min(1, ph + 2.576 * Math.sqrt(ph * (1 - ph) / (N - 1)));
  return { rows, noise, mm: mm * 100, sndr: { comparator: sndrAt("comparator"), feedback: sndrAt("feedback") }, shannon: H / 8, mcv: -Math.log2(pu) / 8, nBytes: N };
};

// PUF reliability for this chip: exact key-failure probability vs temperature (several t), the spread
// over other chips, and a Monte Carlo check of the error-count distribution at the current temperature.
TASKS.pufRel = (args, progress) => {
  const P = { ...state }, age = pufAge(P), temps = [];
  for (let T = -20; T <= 125; T += 5) temps.push(T);
  const chip = seed => { const puf = new SRAMPUF(seed, PUF_BITS, P.puf_sigma, P.puf_bias); return { puf, w: enroll(puf, P.bch_t, makeRng(seed * 7919 + 1)).w }; };
  const me = chip(P.chip_seed), ts = [P.bch_t - 10, P.bch_t, P.bch_t + 10].filter(x => x >= 1);
  const curves = ts.map(t => ({ t, p: temps.map(T => failTail(me.puf.pErr(me.w, T, age), t)) }));
  const others = [];
  for (let c = 1; c <= 16; c++) { const o = chip(P.chip_seed + 100 * c); others.push(temps.map(T => failTail(o.puf.pErr(o.w, T, age), P.bch_t))); progress(c / 20); }
  const band = temps.map((_, i) => [Math.min(...others.map(o => o[i])), Math.max(...others.map(o => o[i]))]);
  const N = args.N || 4000, hist = new Float64Array(PUF_BITS + 1), rng = makeRng(P.seed + 909);
  let fails = 0;
  for (let k = 0; k < N; k++) { const r = me.puf.read(P.temp, rng, age); let e = 0; for (let i = 0; i < PUF_BITS; i++) e += r[i] !== me.w[i]; hist[e]++; fails += e > P.bch_t; }
  progress(1);
  return { temps, curves, band, N, hist, fails, dist: errDist(me.puf.pErr(me.w, P.temp, age)), pNow: failTail(me.puf.pErr(me.w, P.temp, age), P.bch_t), t: P.bch_t, temp: P.temp, age: P.puf_years };
};

// Sweeps: each cell runs the same experiment as the attack lab, so a cell at the current settings matches the lab.
TASKS.sweep = (args, progress) => {
  const P = { ...state }, kind = args.kind;
  if (kind === "puf") {
    const temps = [], ts = [], age = pufAge(P);
    for (let T = -20; T <= 120; T += 10) temps.push(T);
    for (let t = 10; t <= 58; t += 4) ts.push(t);
    const puf = new SRAMPUF(P.chip_seed, PUF_BITS, P.puf_sigma, P.puf_bias), w = enroll(puf, P.bch_t, makeRng(P.chip_seed * 7919 + 1)).w;
    const z = ts.map(() => new Float64Array(temps.length));
    temps.forEach((T, i) => { const d = errDist(puf.pErr(w, T, age)); ts.forEach((t, j) => { let tail = 0; for (let k = t + 1; k < d.length; k++) tail += d[k]; z[j][i] = tail; }); progress((i + 1) / temps.length); });
    return { kind, x: temps, y: ts, z, weak: ts.map(t => PUF_BITS * minEntBit(P.puf_bias) - 10 * t < 128), cur: [P.temp, P.bch_t] };
  }
  const Kb = new LFSR16(P.key16).bits(ID_BITS + LAB_N).subarray(ID_BITS);
  const Kp = simulate({ ...P, scheme: "proposed", attack: "none", atk: lab }).K.subarray(0, LAB_N);
  if (kind === "replica") {
    const amps = [0, 0.01, 0.022, 0.05, 0.1, 0.2, 0.4], mms = [0, 0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1];
    const flip = mms.map(() => new Float64Array(amps.length)), vb = mms.map(() => []), vp = mms.map(() => []);
    mms.forEach((m, j) => { amps.forEach((a, i) => { const X = replicaExperiment({ ...P, dither: a > 0, dither_amp: a || P.dither_amp }, m, lab.kiInput, Kb, Kp, P.mac); flip[j][i] = X.flip; vb[j][i] = X.base.v; vp[j][i] = X.prop.v; }); progress((j + 1) / mms.length); });
    return { kind, x: amps, y: mms, z: flip, vb, vp, cur: [P.dither ? P.dither_amp : 0, lab.mismatch] };
  }
  if (kind === "saturate") {
    const gains = [0.25, 0.35, 0.5, 0.65, 0.8, 0.9, 1.0, 1.1, 1.2], cur = [0.5, 1, 2, 3, 5, 8, 12, 16, 20];
    const run = cur.map(() => new Float64Array(gains.length)), vb = cur.map(() => []), vp = cur.map(() => []);
    cur.forEach((c, j) => { gains.forEach((g, i) => {
      const Q = { ...P, buffer: g }, D = dsm2(new Float64Array(LAB_N).fill(s2d(tia(c * 1e-6, Q.rtia), g)), dsmOpts(Q), makeRng(Q.seed)).D;
      const guess = D.reduce((a, b) => a + b, 0) >= LAB_N / 2 ? 1 : 0, lr = longestRun(D);
      const one = K => { const Kg = D.map((d, k) => d ^ K[k] ^ guess); return { w: windowAttack(Kg, K, Q.seed + 23), raw: 1 - flipFrac(Kg, K, LAB_N) }; };
      const b = one(Kb), p = one(Kp);
      run[j][i] = lr; vb[j][i] = b.w.broken > 0 ? "breached" : "safe"; vp[j][i] = p.raw > 0.97 && !P.mac ? "breached" : "safe";
    }); progress((j + 1) / cur.length); });
    return { kind, x: gains, y: cur, z: run, vb, vp, cur: [P.buffer, P.force_uA] };
  }
  throw new Error("unknown sweep " + kind);
};
