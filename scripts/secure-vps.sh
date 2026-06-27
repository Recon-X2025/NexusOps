#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# secure-vps.sh — Hardens the Vultr VPS host security (firewall, fail2ban, SSH).
# Run this as root on the VPS.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

echo "========================================================="
echo "   Vultr VPS Host Security Hardening Script"
echo "========================================================="

# 1. Update system package index
echo "▶ Updating package index..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y

# 2. Install UFW and Fail2ban if not present
echo "▶ Installing UFW and Fail2ban..."
apt-get install -y ufw fail2ban curl

# 3. Configure UFW Firewall
echo "▶ Configuring UFW Firewall..."
ufw default deny incoming
ufw default allow outgoing

# Allow standard HTTP/HTTPS and SSH
ufw allow 80/tcp comment 'Caddy/Web HTTP'
ufw allow 443/tcp comment 'Caddy/Web HTTPS'
ufw allow 22/tcp comment 'Secure SSH'

# Enable UFW (force bypasses interactive prompt)
ufw --force enable
echo "✓ UFW firewall active:"
ufw status verbose

# 4. Configure SSH hardening
echo "▶ Hardening SSH Daemon configuration..."
SSHD_CONFIG="/etc/ssh/sshd_config"
if [[ -f "$SSHD_CONFIG" ]]; then
  cp "$SSHD_CONFIG" "${SSHD_CONFIG}.bak.$(date +%Y%m%d_%H%M%S)"
  
  # Ensure PasswordAuthentication is set to no
  if grep -q "^PasswordAuthentication" "$SSHD_CONFIG"; then
    sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/' "$SSHD_CONFIG"
  else
    echo "PasswordAuthentication no" >> "$SSHD_CONFIG"
  fi
  
  # Ensure PermitRootLogin is set to prohibit-password (allow only keys)
  if grep -q "^PermitRootLogin" "$SSHD_CONFIG"; then
    sed -i 's/^PermitRootLogin.*/PermitRootLogin prohibit-password/' "$SSHD_CONFIG"
  else
    echo "PermitRootLogin prohibit-password" >> "$SSHD_CONFIG"
  fi
  
  # Restart SSH to apply
  echo "▶ Restarting SSH daemon..."
  if systemctl is-active --quiet sshd; then
    systemctl restart sshd
  elif systemctl is-active --quiet ssh; then
    systemctl restart ssh
  fi
  echo "✓ SSH configuration hardened (SSH Keys only, Password login disabled)."
else
  echo "⚠️ Warning: sshd_config not found at $SSHD_CONFIG"
fi

# 5. Configure Fail2ban basic SSH jail
echo "▶ Configuring Fail2ban SSH jail..."
cat <<EOF > /etc/fail2ban/jail.local
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log
maxretry = 5
bantime = 1h
findtime = 10m
EOF

systemctl restart fail2ban
echo "✓ Fail2ban configured and restarted."

echo "========================================================="
echo "   Host Security Hardening COMPLETE!"
echo "========================================================="
