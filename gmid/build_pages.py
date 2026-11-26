#!/usr/bin/env python3
"""Write the four gm/ID Explorer pages from gmid/page.html.

  /gmid/              all PDKs (opens the PDK used last, else IHP SG13G2)
  /gmid/ihp-sg13g2/   /gmid/sky130a/   /gmid/gf180mcu-d/

The pages are identical apart from title, description, canonical address and the
PDK they open on, so the three PDKs always look and behave the same. Asset URLs
carry a hash of their content (?v=...), so browsers never mix old and new files.
Run after editing gmid/page.html or public/gmid/{app.js,chart.js,app.css}:

  python3 gmid/build_pages.py            # write the pages
  python3 gmid/build_pages.py --check    # exit 1 if a page is out of date (CI)
"""
import hashlib
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PUB = os.path.join(os.path.dirname(HERE), "public", "gmid")

PAGES = {
    "": dict(
        title="gm/ID Explorer for open PDKs: IHP SG13G2, SKY130A and GF180MCU-D across PVT",
        desc="gm/ID curves, sizing and device reference for IHP SG13G2, SkyWater SKY130A and GlobalFoundries GF180MCU-D, "
             "simulated with one testbench at TT, SS and FF, three supplies and three temperatures.",
        h1="gm/ID Explorer for open PDKs"),
    "ihp-sg13g2": dict(
        title="IHP SG13G2 gm/ID Explorer: curves, sizing and PVT corners",
        desc="gm/ID, f_T, gm/gds, I_D/W and capacitance curves of the IHP SG13G2 130 nm BiCMOS MOSFETs (PSP 103) "
             "at TT, SS and FF, VDD +/-10 % and -40 to 125 C, with a sizing calculator and device reference.",
        h1="IHP SG13G2 gm/ID Explorer"),
    "sky130a": dict(
        title="SKY130A gm/ID Explorer: curves, sizing and PVT corners",
        desc="gm/ID, f_T, gm/gds, I_D/W and capacitance curves of the SkyWater SKY130A MOSFETs (continuous BSIM4 models) "
             "at TT, SS and FF, VDD +/-10 % and -40 to 125 C, with a sizing calculator and device reference.",
        h1="SKY130A gm/ID Explorer"),
    "gf180mcu-d": dict(
        title="GF180MCU-D gm/ID Explorer: curves, sizing and PVT corners",
        desc="gm/ID, f_T, gm/gds, I_D/W and capacitance curves of the GlobalFoundries GF180MCU-D 3.3 V, 5 V and 6 V MOSFETs "
             "at TT, SS and FF, VDD +/-10 % and -40 to 125 C, with a sizing calculator and device reference.",
        h1="GF180MCU-D gm/ID Explorer"),
}


def build():
    tpl = open(os.path.join(HERE, "page.html"), encoding="utf-8").read()
    h = hashlib.sha1()
    for f in ("app.js", "chart.js", "app.css"):
        h.update(open(os.path.join(PUB, f), "rb").read())
    asset_v = h.hexdigest()[:10]
    data_v = hashlib.sha1(open(os.path.join(PUB, "data", "manifest.json"), "rb").read()).hexdigest()[:10]
    out = {}
    for pdk, p in PAGES.items():
        path = "/gmid/" + (pdk + "/" if pdk else "")
        s = (tpl.replace("{{TITLE}}", p["title"]).replace("{{DESC}}", p["desc"]).replace("{{H1}}", p["h1"])
             .replace("{{PATH}}", path).replace("{{PDK}}", pdk).replace("{{ASSET_V}}", asset_v).replace("{{DATA_V}}", data_v))
        for other in PAGES:
            if other:
                s = s.replace("{{CUR_%s}}" % other, ' aria-current="page"' if other == pdk else "")
        assert "{{" not in s, "unfilled placeholder in page.html"
        out[os.path.join(PUB, pdk, "index.html") if pdk else os.path.join(PUB, "index.html")] = s
    return out


def main():
    pages = build()
    if "--check" in sys.argv:
        stale = [f for f, s in pages.items() if not os.path.isfile(f) or open(f, encoding="utf-8").read() != s]
        for f in stale:
            print("out of date: " + os.path.relpath(f))
        sys.exit(1 if stale else 0)
    for f, s in pages.items():
        os.makedirs(os.path.dirname(f), exist_ok=True)
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(s)
        print("wrote " + os.path.relpath(f))


if __name__ == "__main__":
    main()
