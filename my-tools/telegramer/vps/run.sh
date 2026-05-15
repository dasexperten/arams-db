#!/usr/bin/env bash
# Bootstrap: install deploy key and upload to GitHub Secrets.
# Reads GH_PAT from environment.
set -euo pipefail
if [ -z "${GH_PAT:-}" ]; then
  echo "Set GH_PAT first:  export GH_PAT=<your_github_pat>"
  exit 1
fi
curl -fsSL https://raw.githubusercontent.com/dasexperten/arams-db/main/my-tools/telegramer/vps/install-deploy-key.sh -o /tmp/k.sh
bash /tmp/k.sh "$GH_PAT"
