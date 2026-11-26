#!/usr/bin/env python3
"""gm/ID characterisation of three open PDKs for the gm/ID Explorer (/gmid/).

One testbench and one method for every PDK, so the three PDKs can be compared
point for point:

  * one transistor, W = 5 um, one finger, bulk tied to source (V_SB = 0)
  * V_DS = VDD / 2, V_GS swept from 0 to VDD in steps of VDD_nom / 150
  * PVT grid: process corner TT / SS / FF, supply 0.9 / 1.0 / 1.1 x VDD_nom,
    temperature -40 / 27 / 125 C (27 conditions per device)
  * PMOS are simulated with negative voltages and stored as magnitudes
  * per point: I_D/W, gm/I_D, gm/gds, Cgg/W, Cgd/Cgg, Cgs/Cgg, V_DSsat, gmb/gm;
    per length: V_th (model value at the bias point)
  * drain-silicide-blocked GF180 devices (*_dss) include their drain/source
    SAB resistors: gm, gds and gmb are referred to the external terminals

Outputs (all under public/gmid/data/):
  manifest.json                                PDKs, devices, lengths, PVT grid, quantisation
  <pdk>/sheet.json                             datasheet figures per device and corner
  <pdk>/<device>/<corner>-<supply>-<temp>.bin  curves of one PVT condition (format below)

Binary format: little-endian uint16 laid out [length][quantity][point], then one
float32 V_th per length. Quantity order and ranges are in manifest["quant"]:
value = lo + q / 65534 * (hi - lo); q = 65535 marks a point without valid data.
Point k is V_GS = k * step; a condition at supply factor f has 150 f + 1 points.

Usage (PDK model files from gmid/setup_pdks.sh):
  python3 gmid/characterise.py --pdk-root ~/gmid-pdks [--jobs 4] [--only sky130a] [--device nfet_01v8]
"""
import argparse
import datetime
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.path.join(REPO, "public", "gmid", "data")

W_UM = 5.0                       # characterisation width (um), every device
STEPS_NOM = 150                  # V_GS steps from 0 to VDD_nom
CORNERS = ("tt", "ss", "ff")
SUPPLIES = (("lo", 0.9), ("nom", 1.0), ("hi", 1.1))
TEMPS = (-40, 27, 125)
# Length grid: L_min, then this series (um) from 1.15 x L_min upwards.
L_SERIES = (0.18, 0.25, 0.35, 0.5, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0)

# Stored quantities: name, lo, hi (linear in the stored domain).
QUANT = (
    ("lidw", -16.0, 4.0),    # log10(I_D / W  [A/m] = [uA/um])
    ("gmid", 0.0, 50.0),     # gm / I_D  [1/V]
    ("lgain", -1.0, 5.0),    # log10(gm / gds)
    ("lcgg", -2.0, 3.0),     # log10(Cgg / W  [fF/um])
    ("cgdr", 0.0, 1.5),      # Cgd / Cgg
    ("cgsr", 0.0, 1.5),      # Cgs / Cgg
    ("vdsat", 0.0, 8.0),     # V_DSsat  [V]
    ("gmbr", 0.0, 2.0),      # gmb / gm
)

PDKS = {
    "ihp-sg13g2": dict(
        name="IHP SG13G2", node="130 nm SiGe:C BiCMOS", vendor="IHP Microelectronics",
        model="PSP 103.8 (Verilog-A, OSDI)", simulator="ngspice 42 + OpenVAF 23.5.0",
        source="IHP-GmbH/IHP-Open-PDK", commit="e73adb4045731ddec21634146d536380057f6a26",
        repo_dir="IHP-Open-PDK", tnom=27,
        corner_names={"tt": "mos_tt", "ss": "mos_ss", "ff": "mos_ff"},
        devices=[
            dict(id="sg13_lv_nmos", pol="n", vdd=1.2, lmin=0.13, lib="cornerMOSlv.lib",
                 group="LV core, 1.2 V", label="LV NMOS", kind="Thin oxide"),
            dict(id="sg13_lv_pmos", pol="p", vdd=1.2, lmin=0.13, lib="cornerMOSlv.lib",
                 group="LV core, 1.2 V", label="LV PMOS", kind="Thin oxide"),
            dict(id="sg13_hv_nmos", pol="n", vdd=3.3, lmin=0.45, lib="cornerMOShv.lib",
                 group="HV I/O, 3.3 V", label="HV NMOS", kind="Thick oxide"),
            dict(id="sg13_hv_pmos", pol="p", vdd=3.3, lmin=0.40, lib="cornerMOShv.lib",
                 group="HV I/O, 3.3 V", label="HV PMOS", kind="Thick oxide"),
        ]),
    "sky130a": dict(
        name="SKY130A", node="130 nm CMOS", vendor="SkyWater Technology",
        model="BSIM4 4.5, continuous (non-binned) models", simulator="ngspice 42",
        source="fossi-foundation/skywater-pdk-libs-sky130_fd_pr",
        commit="29b55153fd9f4badef05a02667184b81789d1f61",
        repo_dir="skywater-pdk-libs-sky130_fd_pr", tnom=27,
        corner_names={"tt": "tt", "ss": "ss", "ff": "ff"},
        devices=[
            dict(id="nfet_01v8", pol="n", vdd=1.8, lmin=0.15, group="1.8 V core", label="NMOS SVT", kind="Standard V_{th}"),
            dict(id="nfet_01v8_lvt", pol="n", vdd=1.8, lmin=0.15, group="1.8 V core", label="NMOS LVT", kind="Low V_{th}"),
            dict(id="pfet_01v8", pol="p", vdd=1.8, lmin=0.15, group="1.8 V core", label="PMOS SVT", kind="Standard V_{th}"),
            dict(id="pfet_01v8_lvt", pol="p", vdd=1.8, lmin=0.35, group="1.8 V core", label="PMOS LVT", kind="Low V_{th}"),
            dict(id="pfet_01v8_hvt", pol="p", vdd=1.8, lmin=0.15, group="1.8 V core", label="PMOS HVT", kind="High V_{th}"),
            dict(id="nfet_g5v0d10v5", pol="n", vdd=5.0, lmin=0.5, group="5 V gate, 10.5 V drain", label="HV NMOS", kind="Thick oxide"),
            dict(id="pfet_g5v0d10v5", pol="p", vdd=5.0, lmin=0.5, group="5 V gate, 10.5 V drain", label="HV PMOS", kind="Thick oxide"),
        ]),
    "gf180mcu-d": dict(
        name="GF180MCU-D", node="180 nm CMOS", vendor="GlobalFoundries",
        model="BSIM4 4.5 (binned)", simulator="ngspice 42",
        source="fossi-foundation/globalfoundries-pdk-libs-gf180mcu_fd_pr",
        commit="ad8d90a375cc3d2d55e3d7b78f42e96964654e75",
        repo_dir="globalfoundries-pdk-libs-gf180mcu_fd_pr", tnom=25,
        corner_names={"tt": "typical", "ss": "ss", "ff": "ff"},
        devices=[
            dict(id="nfet_03v3", pol="n", vdd=3.3, lmin=0.28, group="3.3 V", label="NMOS", kind="Standard"),
            dict(id="pfet_03v3", pol="p", vdd=3.3, lmin=0.28, group="3.3 V", label="PMOS", kind="Standard"),
            dict(id="nfet_03v3_dss", pol="n", vdd=3.3, lmin=0.28, group="3.3 V", label="NMOS DSS", kind="Drain silicide block", dss=True),
            dict(id="pfet_03v3_dss", pol="p", vdd=3.3, lmin=0.28, group="3.3 V", label="PMOS DSS", kind="Drain silicide block", dss=True),
            dict(id="nfet_05v0", pol="n", vdd=5.0, lmin=0.6, group="5 V", label="NMOS", kind="Thick oxide"),
            dict(id="pfet_05v0", pol="p", vdd=5.0, lmin=0.5, group="5 V", label="PMOS", kind="Thick oxide"),
            dict(id="nfet_06v0", pol="n", vdd=6.0, lmin=0.7, group="6 V", label="NMOS", kind="Thick oxide"),
            dict(id="pfet_06v0", pol="p", vdd=6.0, lmin=0.55, group="6 V", label="PMOS", kind="Thick oxide"),
            dict(id="nfet_06v0_dss", pol="n", vdd=6.0, lmin=0.7, group="6 V", label="NMOS DSS", kind="Drain silicide block", dss=True),
            dict(id="pfet_06v0_dss", pol="p", vdd=6.0, lmin=0.55, group="6 V", label="PMOS DSS", kind="Drain silicide block", dss=True),
        ]),
}

BSIM = dict(id="id", gm="gm", gds="gds", gmb="gmbs", vth="vth", vdsat="vdsat", cgg="cgg", cgs="cgs", cgd="cgd")
PSP = dict(id="ids", gm="gm", gds="gds", gmb="gmb", vth="vth", vdsat="vdss", cgg="cgg", cgs="cgs", cgd="cgd")


def lengths(lmin):
    return [lmin] + [x for x in L_SERIES if x >= 1.15 * lmin]


def temp_tag(t):
    return ("m%d" % -t) if t < 0 else str(t)


# ── netlists ──────────────────────────────────────────────────────────────────
def model_lines(pdk_id, dev, corner, root):
    p = PDKS[pdk_id]
    base = os.path.join(root, p["repo_dir"])
    c = p["corner_names"][corner]
    if pdk_id == "ihp-sg13g2":
        lib = os.path.join(base, "ihp-sg13g2", "libs.tech", "ngspice", "models", dev["lib"])
        return ['.lib "%s" %s' % (lib, c)]
    if pdk_id == "sky130a":
        d = os.path.join(base, "combined_models", "continuous")
        return [
            ".param MC_MM_SWITCH=0 MC_PR_SWITCH=0 corner_factor=1 process_mc_factor=1 mismatch_factor=1",
            '.include "%s"' % os.path.join(d, "parameters_fet_%s.spice" % c),
            '.include "%s"' % os.path.join(d, "parameters_res_nom.spice"),
            '.include "%s"' % os.path.join(d, "parameters_cap_nom.spice"),
            '.include "%s"' % os.path.join(d, "models_global.spice"),
            '.include "%s"' % os.path.join(d, "models_fet", "sky130_fd_pr__%s.spice" % dev["id"]),
        ]
    d = os.path.join(base, "models", "ngspice")
    return ['.include "%s"' % os.path.join(d, "design.spice"),
            '.lib "%s" %s' % (os.path.join(d, "sm141064.spice"), c)]


def instance(pdk_id, dev, i, L):
    # each transistor has its own drain, gate and source nodes (driven by unity
    # VCVS copies of the common sources) so the AC analysis can read its own
    # gate current; the bulk is ground, the source is at 0 V DC: V_SB = 0
    nodes = "d%d g%d s%d 0" % (i, i, i)
    if pdk_id == "ihp-sg13g2":
        return "XM%d %s %s w=%gu l=%gu ng=1 m=1" % (i, nodes, dev["id"], W_UM, L)
    if pdk_id == "sky130a":     # .option scale=1u is set by the model files
        return "XM%d %s sky130_fd_pr__%s L=%g W=%g nf=1" % (i, nodes, dev["id"], L, W_UM)
    return "XM%d %s %s W=%gu L=%gu nf=1" % (i, nodes, dev["id"], W_UM, L)


def op_name(pdk_id, dev, i, key):
    if pdk_id == "ihp-sg13g2":
        return "@n.xm%d.n%s[%s]" % (i, dev["id"], PSP[key])
    if pdk_id == "sky130a":
        return "@m.xm%d.msky130_fd_pr__%s[%s]" % (i, dev["id"], BSIM[key])
    return "@m.xm%d.m0[%s]" % (i, BSIM[key])


KEYS = ("id", "gm", "gds", "gmb", "vth", "vdsat")
F_AC = 1e6    # Hz; quasi-static for every device here


def netlist(pdk_id, dev, corner, vscale, temp, root):
    """DC sweep for the operating point, then three single-frequency AC solves per
    bias point (gate, drain, source excited) for the total terminal capacitances
    Cgg, Cgd and Cgs: the models' operating-point capacitances leave out the gate
    overlap and fringe parts, which f_T and Miller estimates need."""
    vdd_nom = dev["vdd"]
    step = vdd_nom / STEPS_NOM
    n = int(round(STEPS_NOM * vscale))
    vdd = n * step
    s = -1.0 if dev["pol"] == "p" else 1.0
    ls = lengths(dev["lmin"])
    lines = ["* gm/ID characterisation %s %s %s VDD=%.4g T=%d" % (pdk_id, dev["id"], corner, vdd, temp)]
    lines += model_lines(pdk_id, dev, corner, root)
    lines += [".temp %d" % temp, ".option reltol=1e-5 abstol=1e-15 vntol=1e-8",
              "VD d 0 dc %.6g ac 0" % (s * vdd / 2), "VG g 0 dc 0 ac 0", "VS s 0 dc 0 ac 0"]
    vecs = []
    for i, L in enumerate(ls):
        lines += ["ED%d d%d 0 d 0 1" % (i, i), "EG%d g%d 0 g 0 1" % (i, i), "ES%d s%d 0 s 0 1" % (i, i),
                  instance(pdk_id, dev, i, L)]
        vecs += [op_name(pdk_id, dev, i, k) for k in KEYS]
        if dev.get("dss"):
            vecs += ["v(xm%d.d1)" % i, "v(xm%d.s1)" % i]
    ig = " ".join("imag(i(eg%d))" % i for i in range(len(ls)))
    lines += [".control", "set wr_singlescale", "set wr_vecnames",
              "save " + " ".join(vecs),
              # stop a quarter step past VDD so float round-off can neither drop nor add a point
              "dc VG 0 %.9g %.9g" % (s * (vdd + step / 4), s * step),
              "wrdata out.txt " + " ".join(vecs), "destroy all", "delete all",
              "save " + " ".join("i(eg%d)" % i for i in range(len(ls))),
              "unset wr_vecnames", "set appendwrite"]
    for k in range(n + 1):
        lines.append("alter VG dc = %.9g" % (s * k * step))
        for src in ("VG", "VD", "VS"):
            lines += ["alter %s ac = 1" % src, "ac lin 1 %g %g" % (F_AC, F_AC),
                      "wrdata cap.txt " + ig, "alter %s ac = 0" % src, "destroy all"]
    lines += [".endc", ".end"]
    return "\n".join(lines) + "\n", ls, n, step, vecs


# ── simulation ───────────────────────────────────────────────────────────────
def spiceinit(pdk_id, root):
    if pdk_id == "ihp-sg13g2":
        osdi = os.path.join(root, PDKS[pdk_id]["repo_dir"], "ihp-sg13g2", "libs.tech", "ngspice", "osdi")
        return "osdi '%s'\nosdi '%s'\nset ng_nomodcheck\nset num_threads=1\n" % (
            os.path.join(osdi, "psp103.osdi"), os.path.join(osdi, "psp103_nqs.osdi"))
    return "set ngbehavior=hsa\nset ng_nomodcheck\nset num_threads=1\n"


def simulate(job):
    pdk_id, dev, corner, sup, vscale, temp, root, keep = job
    text, ls, n, step, vecs = netlist(pdk_id, dev, corner, vscale, temp, root)
    wd = tempfile.mkdtemp(prefix="gmid_")
    try:
        with open(os.path.join(wd, ".spiceinit"), "w") as f:
            f.write(spiceinit(pdk_id, root))
        with open(os.path.join(wd, "tb.sp"), "w") as f:
            f.write(text)
        r = subprocess.run(["ngspice", "-b", "tb.sp"], cwd=wd, capture_output=True, text=True, timeout=1800)
        out, cap = os.path.join(wd, "out.txt"), os.path.join(wd, "cap.txt")
        if r.returncode != 0 or not os.path.isfile(out) or not os.path.isfile(cap):
            raise RuntimeError("ngspice failed for %s %s %s %s %s:\n%s" % (
                pdk_id, dev["id"], corner, sup, temp, (r.stdout + r.stderr)[-3000:]))
        with open(out) as f:
            head = f.readline().split()
        data = np.loadtxt(out, skiprows=1, ndmin=2)
        caps = np.loadtxt(cap, ndmin=2)
        if keep:
            shutil.copy(os.path.join(wd, "tb.sp"), os.path.join(keep, "%s_%s_%s_%s_%s.sp" % (
                pdk_id, dev["id"], corner, sup, temp_tag(temp))))
    finally:
        shutil.rmtree(wd, ignore_errors=True)
    if data.shape[0] != n + 1:
        raise RuntimeError("%s %s: expected %d sweep points, got %d" % (pdk_id, dev["id"], n + 1, data.shape[0]))
    if caps.shape != (3 * (n + 1), len(ls) + 1):
        raise RuntimeError("%s %s: unexpected AC table %s" % (pdk_id, dev["id"], caps.shape))
    w = 2 * math.pi * F_AC
    caps = np.abs(caps[:, 1:].reshape(n + 1, 3, len(ls))) / w      # [point, excitation g/d/s, length]
    col = {name: j for j, name in enumerate(head)}
    return dict(job=job, ls=ls, n=n, step=step, head=col, data=data, caps=caps)


# ── post-processing ──────────────────────────────────────────────────────────
def curves(res):
    """Per length: dict of float arrays (len n+1) in physical units, plus V_th."""
    pdk_id, dev = res["job"][0], res["job"][1]
    data, col = res["data"], res["head"]
    vg = np.abs(data[:, 0])
    out = []
    for i, L in enumerate(res["ls"]):
        g = {k: np.abs(data[:, col[op_name(pdk_id, dev, i, k).lower()]]) for k in KEYS}
        cgg, cgd, cgs = res["caps"][:, 0, i], res["caps"][:, 1, i], res["caps"][:, 2, i]
        idd, gm, gds, gmb = g["id"], g["gm"], g["gds"], g["gmb"]
        vdsat = g["vdsat"].copy()
        if dev.get("dss"):
            # External small-signal parameters with the SAB series resistors
            # (linear resistors: R = voltage drop / current at the highest current).
            vd = np.abs(data[:, col["v(xm%d.d1)" % i]])
            vs = np.abs(data[:, col["v(xm%d.s1)" % i]])
            k = int(np.argmax(idd))
            vdrain = res["n"] * res["step"] / 2  # external |V_DS|
            rd = (vdrain - vd[k]) / idd[k]
            rs = vs[k] / idd[k]
            den = 1.0 + (gm + gmb) * rs + gds * (rs + rd)
            gm, gds, gmb = gm / den, gds / den, gmb / den
            vdsat = vdsat + idd * (rs + rd)
        idw = idd / (W_UM * 1e-6)
        with np.errstate(divide="ignore", invalid="ignore"):
            # I_D is the channel current. At low currents a model's reported gm can
            # include other drain-current components (PSP: gate-drain tunnelling of
            # the thin-oxide IHP devices, visible at -40 C), so below 10 nA/um,
            # where gm/I_D differs from d ln(I_D) / dV_GS by more than 2 %, the
            # derivative of the channel current is used (exact in weak inversion).
            gnum = np.gradient(np.log(np.maximum(idd, 1e-300)), res["step"])
            gop = gm / idd
            fix = (idw < 1e-2) & (~np.isfinite(gop) | (np.abs(gop - gnum) > 0.02 * np.abs(gnum)))
            gm = np.where(fix, gnum * idd, gm)
            q = dict(
                lidw=np.log10(idw),
                gmid=gm / idd,
                lgain=np.log10(gm / gds),
                lcgg=np.log10(cgg * 1e15 / W_UM),
                cgdr=cgd / cgg,
                cgsr=cgs / cgg,
                vdsat=vdsat,
                gmbr=gmb / gm,
            )
        # below 1 fA/um the solution is at the simulator's numerical floor; gm/I_D
        # can never exceed q/kT (ideality factor 1)
        gmax = 1.02 / (8.617333e-5 * (res["job"][5] + 273.15))
        bad = ~np.isfinite(q["gmid"]) | (q["gmid"] <= 0) | (q["gmid"] > gmax) | (idw < 1e-9)
        for k in q:
            v = q[k]
            v[bad | ~np.isfinite(v)] = np.nan
        vth = float(np.median(g["vth"]))
        out.append(dict(L=L, vg=vg, q=q, vth=vth, raw=dict(idd=idd, gm=gm, gds=gds, cgg=cgg)))
    return out


def pack(cv):
    buf = bytearray()
    for c in cv:
        for name, lo, hi in QUANT:
            v = c["q"][name]
            qv = np.where(np.isfinite(v), np.clip(np.round((v - lo) / (hi - lo) * 65534), 0, 65534), 65535)
            buf += qv.astype("<u2").tobytes()
    buf += np.array([c["vth"] for c in cv], dtype="<f4").tobytes()   # V_th per length
    return bytes(buf)


def at_gmid(c, target):
    """Interpolate the strong-inversion branch (from the gm/ID peak to VDD) at gm/ID = target."""
    g = c["q"]["gmid"]
    ok = np.isfinite(g)
    if not ok.any():
        return None
    k0 = int(np.nanargmax(np.where(ok, g, -1)))
    gg, idx = g[k0:], np.arange(k0, len(g))
    m = np.isfinite(gg)
    gg, idx = gg[m], idx[m]
    if len(gg) < 2 or not (gg.min() <= target <= gg.max()):
        return None
    j = np.where(gg <= target)[0][0]
    if j == 0:
        return float(idx[0])
    a, b = gg[j - 1], gg[j]
    return float(idx[j - 1] + (a - target) / (a - b) * (idx[j] - idx[j - 1]))


def interp(arr, x):
    i = int(math.floor(x))
    if i >= len(arr) - 1:
        return float(arr[-1])
    f = x - i
    return float(arr[i] * (1 - f) + arr[i + 1] * f)


def sheet(cv, step, vdd):
    """Datasheet figures of one PVT condition, for L_min and the length nearest 1 um."""
    def one(c):
        ft = c["raw"]["gm"] / (2 * math.pi * c["raw"]["cgg"])
        r = dict(L=c["L"], vth=round(c["vth"], 4),
                 ioff=float("%.4g" % (c["raw"]["idd"][0] / (W_UM * 1e-6))),
                 ion=float("%.4g" % (c["raw"]["idd"][-1] / (W_UM * 1e-6))),
                 gmidmax=round(float(np.nanmax(c["q"]["gmid"])), 2),
                 ftpk=float("%.4g" % float(np.nanmax(ft))))
        x = at_gmid(c, 10.0)
        if x is not None:
            r["gain10"] = float("%.4g" % (10 ** interp(c["q"]["lgain"], x)))
            r["ft10"] = float("%.4g" % interp(ft, x))
            r["vgs10"] = round(x * step, 4)
        return r
    near1 = min(cv, key=lambda c: abs(math.log(c["L"] / 1.0)))
    return dict(lmin=one(cv[0]), l1=one(near1))


# ── driver ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdk-root", default=os.environ.get("GMID_PDK_ROOT", os.path.expanduser("~/gmid-pdks")))
    ap.add_argument("--jobs", type=int, default=os.cpu_count() or 2)
    ap.add_argument("--only", help="one PDK id (ihp-sg13g2, sky130a, gf180mcu-d)")
    ap.add_argument("--device", help="one device id")
    ap.add_argument("--keep-netlists", help="copy every netlist into this directory")
    a = ap.parse_args()
    if not shutil.which("ngspice"):
        sys.exit("ngspice not found")
    if a.keep_netlists:
        os.makedirs(a.keep_netlists, exist_ok=True)

    man_path = os.path.join(OUT, "manifest.json")
    manifest = json.load(open(man_path)) if os.path.isfile(man_path) else {}
    jobs = []
    for pid, p in PDKS.items():
        if a.only and pid != a.only:
            continue
        for dev in p["devices"]:
            if a.device and dev["id"] != a.device:
                continue
            for corner in CORNERS:
                for sup, vs in SUPPLIES:
                    for t in TEMPS:
                        jobs.append((pid, dev, corner, sup, vs, t, a.pdk_root, a.keep_netlists))
    print("%d simulations on %d workers" % (len(jobs), a.jobs), flush=True)

    results = {}
    with ThreadPoolExecutor(max_workers=a.jobs) as ex:
        futs = [ex.submit(simulate, j) for j in jobs]
        for k, f in enumerate(as_completed(futs), 1):
            r = f.result()
            pid, dev, corner, sup, vs, t = r["job"][:6]
            cv = curves(r)
            d = os.path.join(OUT, pid, dev["id"])
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, "%s-%s-%s.bin" % (corner, sup, temp_tag(t))), "wb") as fh:
                fh.write(pack(cv))
            results[(pid, dev["id"], corner, sup, t)] = (r, cv)
            if k % 25 == 0 or k == len(jobs):
                print("  %d / %d" % (k, len(jobs)), flush=True)

    # manifest: keep entries of PDKs / devices not re-run
    manifest.update({
        "version": 1,
        "generated": datetime.date.today().isoformat(),
        "method": dict(W_um=W_UM, nf=1, vsb=0, vds="VDD/2", vgs="0 to VDD", steps_nom=STEPS_NOM,
                       simulator="ngspice %s" % ngspice_version()),
        "quant": [[n, lo, hi] for n, lo, hi in QUANT],
        "corners": list(CORNERS), "supplies": [[s, v] for s, v in SUPPLIES], "temps": list(TEMPS),
    })
    pdks = manifest.setdefault("pdks", {})
    sheets = {}
    for pid, p in PDKS.items():
        if a.only and pid != a.only:
            continue
        ent = pdks.setdefault(pid, {})
        ent.update({k: p[k] for k in ("name", "node", "vendor", "model", "simulator", "source", "commit", "tnom")})
        devs = {d["id"]: d for d in ent.get("devices", [])}
        for dev in p["devices"]:
            if a.device and dev["id"] != a.device:
                continue
            ls = lengths(dev["lmin"])
            step = dev["vdd"] / STEPS_NOM
            e = dict(id=dev["id"], pol=dev["pol"], vdd=dev["vdd"], lmin=dev["lmin"], L=ls,
                     step=round(step, 9), group=dev["group"], label=dev["label"], kind=dev["kind"],
                     dss=bool(dev.get("dss")))
            sh = {}
            for corner in CORNERS:
                for t in (27, 125):
                    r, cv = results[(pid, dev["id"], corner, "nom", t)]
                    sh["%s-%s" % (corner, temp_tag(t))] = sheet(cv, step, dev["vdd"])
            sheets.setdefault(pid, {})[dev["id"]] = sh
            devs[dev["id"]] = e
        ent["devices"] = [devs[d["id"]] for d in p["devices"] if d["id"] in devs]
        sp = os.path.join(OUT, pid, "sheet.json")
        old = json.load(open(sp)) if os.path.isfile(sp) else {}
        old.update(sheets.get(pid, {}))
        with open(sp, "w") as f:
            json.dump(old, f, separators=(",", ":"))
    # content version of all tables: cache tag for the pages (?v=...)
    h = hashlib.sha1()
    for dirpath, _, files in sorted(os.walk(OUT)):
        for fn in sorted(files):
            if fn.endswith(".bin") or fn == "sheet.json":
                with open(os.path.join(dirpath, fn), "rb") as fh:
                    h.update(fn.encode() + fh.read())
    manifest["data_v"] = h.hexdigest()[:10]
    with open(man_path, "w") as f:
        json.dump(manifest, f, separators=(",", ":"))
    print("wrote %s (data version %s)" % (man_path, manifest["data_v"]))


def ngspice_version():
    try:
        r = subprocess.run(["ngspice", "-v"], capture_output=True, text=True, timeout=30)
        m = re.search(r"ngspice-(\d+)", r.stdout + r.stderr)
        return m.group(1) if m else "?"
    except Exception:
        return "?"


if __name__ == "__main__":
    main()
