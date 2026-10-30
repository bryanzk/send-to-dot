#!/bin/sh
# The user runs this on their own machine; installs only this pinned project environment.
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
command -v node >/dev/null || { echo 'Install a supported Node.js runtime first.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'Python3 is required.' >&2; exit 1; }
node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync(':memory:'); d.close();"
npm ci --ignore-scripts
if [ -L .venv ]; then echo 'Refusing a symlinked .venv.' >&2; exit 1; fi
if [ ! -d .venv ]; then python3 -m venv .venv; fi
.venv/bin/python -m pip install --require-virtualenv --only-binary=:all: --disable-pip-version-check -r requirements.txt
node scripts/preflight.mjs
