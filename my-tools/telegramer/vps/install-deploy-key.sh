#!/usr/bin/env bash
# Run on the VPS via Hetzner console.
# Generates ed25519 deploy key, installs public on the VPS, uploads PRIVATE
# directly to GitHub repository secrets via API (no manual paste).

set -euo pipefail

GH_PAT="${1:-}"
GH_REPO="dasexperten/arams-db"
SECRET_NAME="HETZNER_SSH_KEY"
BRIDGE_SECRET="9bf094d546b68e28884010bc09bd163229f6a2ab05624dcff03876a670186462"

if [ -z "$GH_PAT" ]; then
  echo "usage: bash $0 <GITHUB_PAT>"
  exit 1
fi

# 1. Generate keypair locally
TMP=$(mktemp -d)
ssh-keygen -t ed25519 -N '' -C 'gha-telegramer-deploy' -f "$TMP/id_ed25519" -q
PRIV=$(cat "$TMP/id_ed25519")
PUB=$(cat "$TMP/id_ed25519.pub")

# 2. Install public on VPS
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
sed -i '/gha-telegramer-deploy/d' ~/.ssh/authorized_keys
echo "$PUB" >> ~/.ssh/authorized_keys
echo "✓ Public key installed in authorized_keys (lines: $(wc -l < ~/.ssh/authorized_keys))"

# 3. Install python deps for libsodium sealing
echo "→ Installing libsodium for GitHub secret encryption..."
apt-get install -y python3-nacl >/dev/null 2>&1 || pip3 install pynacl --break-system-packages --quiet >/dev/null 2>&1 || pip3 install pynacl --quiet

# 4. Fetch repo public key
echo "→ Fetching repo public key from GitHub..."
PUBKEY_JSON=$(curl -sf -H "Authorization: Bearer $GH_PAT" \
  "https://api.github.com/repos/$GH_REPO/actions/secrets/public-key")
if [ -z "$PUBKEY_JSON" ]; then
  echo "✗ Failed to fetch GitHub public key. Check GH_PAT."
  exit 1
fi
PUBKEY_VALUE=$(echo "$PUBKEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])")
PUBKEY_ID=$(echo "$PUBKEY_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['key_id'])")

# 5. Encrypt + upload each secret via libsodium sealed box
push_secret() {
  local name="$1" value="$2"
  local encrypted=$(python3 - "$PUBKEY_VALUE" "$value" << 'PY'
from base64 import b64encode, b64decode
from nacl import encoding, public
import sys
pub_b64, secret = sys.argv[1], sys.argv[2]
pub = public.PublicKey(pub_b64.encode(), encoding.Base64Encoder())
sealed = public.SealedBox(pub).encrypt(secret.encode())
print(b64encode(sealed).decode())
PY
)
  local code=$(curl -s -o /tmp/secret_resp.json -w "%{http_code}" \
    -X PUT -H "Authorization: Bearer $GH_PAT" -H "Content-Type: application/json" \
    "https://api.github.com/repos/$GH_REPO/actions/secrets/$name" \
    -d "{\"encrypted_value\":\"$encrypted\",\"key_id\":\"$PUBKEY_ID\"}")
  if [ "$code" = "201" ] || [ "$code" = "204" ]; then
    echo "✓ Secret $name uploaded (HTTP $code)"
  else
    echo "✗ Secret $name failed (HTTP $code): $(cat /tmp/secret_resp.json)"
    exit 1
  fi
}

push_secret "HETZNER_SSH_KEY" "$PRIV"
push_secret "TELEGRAMER_BRIDGE_SECRET" "$BRIDGE_SECRET"

echo
echo "✓ All done. GitHub Actions workflow can now SSH to this VPS."
rm -rf "$TMP"
