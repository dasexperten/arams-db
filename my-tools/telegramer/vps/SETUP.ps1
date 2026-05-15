# ─────────────────────────────────────────────────────────────────────────────
# Das Operator — telegramer GitHub Actions deployment setup (one-time, Windows)
#
# WHAT THIS DOES (3 steps, ~2 minutes):
#   1. Tests SSH access to your VPS (uses your existing key)
#   2. Generates a NEW deploy keypair, installs the public part on the VPS
#   3. Prints the private key to copy into GitHub Secrets
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = 'Stop'
$VPS = '178.105.129.200'
$USER = 'root'
$TMP = Join-Path $env:TEMP "gha-telegramer-$(Get-Random)"

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  telegramer GitHub Actions deploy — one-time setup" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""

# ─── Step 1: Verify SSH ───
Write-Host "Step 1/3: Testing SSH access to $VPS ..." -ForegroundColor Yellow
$test = ssh -o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new -o BatchMode=yes "$USER@$VPS" "echo OK_FROM_VPS" 2>&1
if ($LASTEXITCODE -ne 0 -or $test -notlike '*OK_FROM_VPS*') {
    Write-Host "  Cannot SSH to $USER@$VPS" -ForegroundColor Red
    Write-Host "  Error output:" -ForegroundColor Red
    Write-Host "  $test"
    Write-Host ""
    Write-Host "  Try opening one manual SSH session first to make sure key/password works:"
    Write-Host "      ssh $USER@$VPS"
    Write-Host ""
    Write-Host "  Then re-run this setup."
    exit 1
}
Write-Host "  SSH works." -ForegroundColor Green
Write-Host ""

# ─── Step 2: Generate deploy keypair ───
Write-Host "Step 2/3: Generating new deploy keypair..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $TMP | Out-Null
$keyPath = Join-Path $TMP "id_ed25519"
ssh-keygen -t ed25519 -N '""' -C "gha-telegramer-deploy" -f $keyPath -q
if (-not (Test-Path $keyPath)) {
    Write-Host "  ssh-keygen failed" -ForegroundColor Red
    exit 1
}
Write-Host "  Keypair generated" -ForegroundColor Green
Write-Host ""

# ─── Step 3: Install pubkey on VPS ───
Write-Host "Step 3/3: Installing public key on VPS authorized_keys..." -ForegroundColor Yellow
$pubKey = (Get-Content "$keyPath.pub" -Raw).Trim()

$installCmd = @"
mkdir -p ~/.ssh
chmod 700 ~/.ssh
touch ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
sed -i '/gha-telegramer-deploy/d' ~/.ssh/authorized_keys
echo '$pubKey' >> ~/.ssh/authorized_keys
echo INSTALLED
wc -l ~/.ssh/authorized_keys
"@

$result = ssh "$USER@$VPS" $installCmd 2>&1
if ($result -notlike '*INSTALLED*') {
    Write-Host "  Failed to install key on VPS" -ForegroundColor Red
    Write-Host "  $result"
    exit 1
}
Write-Host "  Installed on VPS:" -ForegroundColor Green
Write-Host "  $result"
Write-Host ""

# ─── Output: private key ───
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host "  PRIVATE KEY — copy everything between BEGIN/END lines" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Get-Content $keyPath
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
Write-Host ""
Write-Host "WHAT TO DO WITH IT:" -ForegroundColor Yellow
Write-Host ""
Write-Host "  1. Open https://github.com/dasexperten/arams-db/settings/secrets/actions"
Write-Host "  2. Click 'New repository secret'"
Write-Host "  3. Name:  HETZNER_SSH_KEY"
Write-Host "     Value: paste the private key above (full block with BEGIN/END lines)"
Write-Host "  4. Click 'Add secret'"
Write-Host "  5. Add second secret:"
Write-Host "     Name:  TELEGRAMER_BRIDGE_SECRET"
Write-Host "     Value: 9bf094d546b68e28884010bc09bd163229f6a2ab05624dcff03876a670186462"
Write-Host ""
Write-Host "Then tell Claude in the chat: 'secrets added, push the patch'"
Write-Host ""

# Save key to clipboard for convenience
try {
    Get-Content $keyPath -Raw | Set-Clipboard
    Write-Host "(Private key also copied to your clipboard.)" -ForegroundColor Green
} catch {
    # Set-Clipboard may not be available in older PowerShell
}

# Cleanup
Remove-Item -Recurse -Force $TMP
