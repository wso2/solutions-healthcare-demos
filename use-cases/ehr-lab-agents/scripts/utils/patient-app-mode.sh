#!/usr/bin/env bash
# Switches the patient app between its two modes. The switch is "mode" in config/patient-auth.json, which the
# portal reads on every page load (nginx in the container, Vite with npm run dev): no rebuild or restart.
#
#   ./scripts/utils/patient-app-mode.sh smart    # SMART on FHIR sign-in; the API through the WSO2 API Manager gateway
#   ./scripts/utils/patient-app-mode.sh normal   # no sign-in; the app calls the integration directly (the default)
#   ./scripts/utils/patient-app-mode.sh status
#
# SMART mode needs the APIM settings that scripts/utils/apim-setup.sh writes into the same file (issuer, gateway,
# client ID, demo users); switching to normal keeps them, so switching back needs no APIM setup.
set -euo pipefail
cd "$(dirname "$0")/../.."

CONFIG=config/patient-auth.json
EXAMPLE=config/patient-auth.example.json

log() { printf '\033[1;34m[patient-app]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[patient-app]\033[0m %s\n' "$*" >&2; exit 1; }

[[ -f $CONFIG ]] || { cp "$EXAMPLE" "$CONFIG"; log "created $CONFIG from $EXAMPLE"; }

# Prints the mode, the client ID and the issuer, tab-separated.
read_config() {
  python3 - "$CONFIG" <<'EOF'
import json, sys
c = json.load(open(sys.argv[1]))
mode = c.get("mode") or ("smart" if c.get("enabled") is True else "normal")
print(mode, c.get("clientId") or "", c.get("iss") or "", sep="\t")
EOF
}

set_mode() {
  # Rewrites the file in place (same inode), so the portal container's bind mount sees the change.
  python3 - "$CONFIG" "$1" <<'EOF'
import json, sys
path, mode = sys.argv[1], sys.argv[2]
c = json.load(open(path))
c.pop("enabled", None)
c = {"mode": mode, **{k: v for k, v in c.items() if k != "mode"}}
with open(path, "r+") as f:
    f.seek(0)
    f.write(json.dumps(c, indent=2) + "\n")
    f.truncate()
EOF
}

IFS=$'\t' read -r mode client iss < <(read_config)

case ${1:-status} in
  smart)
    [[ -n $client && $client != \<* && -n $iss ]] || die "no APIM settings in $CONFIG yet: run ./scripts/utils/apim-setup.sh first"
    set_mode smart
    log "mode: smart — the patient app signs in with SMART on FHIR ($iss)"
    if ! curl -sk -m 3 -o /dev/null "$iss/.well-known/smart-configuration"; then
      log "warning: APIM does not answer at $iss — start it with ./scripts/utils/apim-setup.sh start"
    fi
    log "reload the patient app (http://localhost:5173/patient)"
    ;;
  normal)
    set_mode normal
    log "mode: normal — the patient app calls the integration directly, no sign-in"
    log "reload the patient app (http://localhost:5173/patient)"
    ;;
  status)
    log "mode: $mode${client:+ (APIM client $client)}"
    ;;
  -h|--help) sed -n '2,11p' "$0" ;;
  *) die "unknown command: $1 (smart | normal | status)" ;;
esac
