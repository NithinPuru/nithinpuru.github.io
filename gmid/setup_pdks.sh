#!/usr/bin/env bash
# Fetch the pinned PDK model files that gmid/characterise.py simulates, and
# compile IHP's PSP 103 Verilog-A model into an ngspice OSDI plugin.
#
#   GMID_PDK_ROOT=~/gmid-pdks gmid/setup_pdks.sh
#   python3 gmid/characterise.py --pdk-root ~/gmid-pdks
#
# Needs git, curl, ngspice >= 42 with OSDI (Ubuntu 24.04: apt install ngspice)
# and python3 with numpy. Only the model directories are checked out (sparse).
set -euo pipefail
ROOT="${GMID_PDK_ROOT:-$HOME/gmid-pdks}"
mkdir -p "$ROOT"

fetch() {   # url dir commit sparse-pattern...
  local url=$1 dir=$2 commit=$3; shift 3
  if [ ! -d "$ROOT/$dir/.git" ]; then
    git init -q "$ROOT/$dir"
    git -C "$ROOT/$dir" remote add origin "$url"
  fi
  git -C "$ROOT/$dir" sparse-checkout set --no-cone "$@"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$ROOT/$dir" fetch -q --depth 1 --filter=blob:none origin "$commit"
  GIT_LFS_SKIP_SMUDGE=1 git -C "$ROOT/$dir" checkout -q "$commit"
  echo "$dir at $(git -C "$ROOT/$dir" rev-parse --short HEAD)"
}

# Pins: keep in step with PDKS[...]["commit"] in gmid/characterise.py.
fetch https://github.com/IHP-GmbH/IHP-Open-PDK IHP-Open-PDK \
  e73adb4045731ddec21634146d536380057f6a26 \
  '/ihp-sg13g2/libs.tech/ngspice/' '/ihp-sg13g2/libs.tech/verilog-a/'
fetch https://github.com/fossi-foundation/skywater-pdk-libs-sky130_fd_pr skywater-pdk-libs-sky130_fd_pr \
  29b55153fd9f4badef05a02667184b81789d1f61 '/combined_models/'
fetch https://github.com/fossi-foundation/globalfoundries-pdk-libs-gf180mcu_fd_pr globalfoundries-pdk-libs-gf180mcu_fd_pr \
  ad8d90a375cc3d2d55e3d7b78f42e96964654e75 '/models/ngspice/'

# OpenVAF 23.5.0 (openvaf.semimod.de release) compiles PSP 103 for ngspice.
OV="$ROOT/openvaf"
if [ ! -x "$OV/openvaf" ]; then
  mkdir -p "$OV"
  curl -fsSL -o "$OV/openvaf.tar.gz" https://openva.fra1.cdn.digitaloceanspaces.com/openvaf_23_5_0_linux_amd64.tar.gz
  echo "79c0e08ad948a7a9f460dc87be88b261bbd99b63a4038db3c64680189f44e4f0  $OV/openvaf.tar.gz" | sha256sum -c -
  tar -xzf "$OV/openvaf.tar.gz" -C "$OV"
fi
VA="$ROOT/IHP-Open-PDK/ihp-sg13g2/libs.tech/verilog-a"
OSDI="$ROOT/IHP-Open-PDK/ihp-sg13g2/libs.tech/ngspice/osdi"
mkdir -p "$OSDI"
(cd "$VA" && "$OV/openvaf" -D__NGSPICE__ -o "$OSDI/psp103.osdi" psp103/psp103.va \
          && "$OV/openvaf" -D__NGSPICE__ -o "$OSDI/psp103_nqs.osdi" psp103/psp103_nqs.va)
ls -1 "$OSDI"
