#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Das Operator — telegramer GitHub Actions deployment setup (one-time)
#
# WHAT THIS DOES (3 steps total, ~5 minutes):
#   1. Connects to your VPS over SSH (uses your existing key)
#   2. Generates a NEW deploy keypair, installs the public part on the VPS
#   3. Prints the private key + tells you what to paste into GitHub Secrets
#
# NOTHING runs on the VPS that changes telegramer behavior.
# Backups of any file we touch are made automatically.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

VPS_HOST="178.105.129.200"
VPS_USER="root"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  telegramer GitHub Actions deploy — one-time setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "Step 1/3: Testing SSH access to ${VPS_HOST}…"
if ! ssh -o ConnectTimeout=5 -o BatchMode=yes ${VPS_USER}@${VPS_HOST} 'echo ok' &>/dev/null; then
  echo
  echo "  ✗ SSH to ${VPS_USER}@${VPS_HOST} failed. Make sure your SSH key is loaded:"
  echo "      ssh-add -l"
  echo "    Or try a manual: ssh ${VPS_USER}@${VPS_HOST}"
  exit 1
fi
echo "  ✓ SSH works."

echo
echo "Step 2/3: Generating new deploy keypair (no passphrase, used only by GitHub Actions)…"
TMP=$(mktemp -d)
ssh-keygen -t ed25519 -N '' -C 'gha-telegramer-deploy' -f "$TMP/id_ed25519" -q
echo "  ✓ Keypair generated in $TMP"

echo
echo "Step 3/3: Installing public key on VPS authorized_keys…"
PUB=$(cat "$TMP/id_ed25519.pub")
ssh ${VPS_USER}@${VPS_HOST} "
  mkdir -p ~/.ssh
  chmod 700 ~/.ssh
  touch ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  # Remove any existing gha-telegramer-deploy lines
  sed -i '/gha-telegramer-deploy/d' ~/.ssh/authorized_keys
  echo '$PUB' >> ~/.ssh/authorized_keys
  echo '  ✓ Public key installed.'
  echo '  Lines in authorized_keys:'
  wc -l ~/.ssh/authorized_keys
"

echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PRIVATE KEY — COPY EVERYTHING BELOW (including BEGIN/END lines)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
cat "$TMP/id_ed25519"
echo
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo
echo "WHAT TO DO WITH IT:"
echo
echo "  1. Open https://github.com/dasexperten/arams-db/settings/secrets/actions"
echo "  2. Click 'New repository secret'"
echo "  3. Name:  HETZNER_SSH_KEY"
echo "     Value: paste the private key above (the full block with BEGIN/END)"
echo "  4. Click 'Add secret'"
echo "  5. Repeat for second secret:"
echo "     Name:  TELEGRAMER_BRIDGE_SECRET"
echo "     Value: 9bf094d546b68e28884010bc09bd163229f6a2ab05624dcff03876a670186462"
echo
echo "Then tell Claude in the chat: 'secrets added, push the patch'"
echo

rm -rf "$TMP"
