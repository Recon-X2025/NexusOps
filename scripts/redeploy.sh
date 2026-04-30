#!/usr/bin/env bash
# CoheronConnect — redeploy to Vultr (alias for push-to-vultr.sh).
# Requires SSH key access to the server. Never commit passwords.

set -euo pipefail
exec bash "$(dirname "$0")/push-to-vultr.sh" "$@"
