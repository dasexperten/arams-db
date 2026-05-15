#!/usr/bin/env bash
# Run THIS ON THE VPS itself (via Hetzner web console).
# Generates a fresh ed25519 keypair, adds public key to root's authorized_keys,
# prints the private key for pasting into GitHub Secrets as HETZNER_SSH_KEY.

set -euo pipefail

TMP=$(mktemp -d)
ssh-keygen -t ed25519 -N '' -C 'gha-telegramer-deploy' -f "$TMP/id_ed25519" -q

mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
sed -i '/gha-telegramer-deploy/d' ~/.ssh/authorized_keys
cat "$TMP/id_ed25519.pub" >> ~/.ssh/authorized_keys

echo
echo "=========================================================================="
echo "  PUBLIC KEY installed in ~/.ssh/authorized_keys (lines: $(wc -l < ~/.ssh/authorized_keys))"
echo "=========================================================================="
echo
echo "=========================================================================="
echo "  COPY THE PRIVATE KEY BELOW (everything from BEGIN to END line):"
echo "=========================================================================="
echo
cat "$TMP/id_ed25519"
echo
echo "=========================================================================="
echo
echo "WHAT TO DO NEXT:"
echo
echo "  1. Select the private key block above with mouse, Ctrl+C to copy"
echo "  2. Open https://github.com/dasexperten/arams-db/settings/secrets/actions"
echo "  3. Click 'New repository secret'"
echo "  4. Name:  HETZNER_SSH_KEY"
echo "     Value: paste the private key block (full, with BEGIN/END lines)"
echo "  5. Click 'Add secret'"
echo "  6. Add a second secret:"
echo "     Name:  TELEGRAMER_BRIDGE_SECRET"
echo "     Value: 9bf094d546b68e28884010bc09bd163229f6a2ab05624dcff03876a670186462"
echo "  7. Tell Claude in the chat: 'secrets added'"
echo

rm -rf "$TMP"
