#!/usr/bin/env bash
# WSO2 API Manager 4.3.0 + the WSO2 Healthcare APIM Accelerator 2.0.0 in front of the patient app's API, so the
# patient app signs in with SMART on FHIR (standalone launch, public client, PKCE). APIM runs on the Mac with
# its default ports (9443 console/key manager, 8243 gateway); it needs port 5672 free for its message broker.
#
#   ./scripts/utils/apim-setup.sh            # install (once), start, configure — leaves the patient app in SMART mode
#   ./scripts/utils/apim-setup.sh install    # unzip APIM into .apim/, apply the accelerator, add CORS for the portal
#   ./scripts/utils/apim-setup.sh start      # start APIM in the background and wait for it (log: .apim/apim.log)
#   ./scripts/utils/apim-setup.sh configure  # API, patient users, application; writes config/patient-auth.json, mode smart
#   ./scripts/utils/apim-setup.sh stop
#   ./scripts/utils/apim-setup.sh status
#
# Switch the patient app between SMART and normal mode afterwards with ./scripts/utils/patient-app-mode.sh.
#
# What `configure` sets up (idempotent):
#   - API "HealthspanPatientApp" /patient-app/1.0.0 → the integration's http://localhost:9090/api, with the two GET
#     resources the patient app uses, each needing the SMART scope patient/*.r (the accelerator's shared scope
#     patient-*.r) and marked as a FHIR "Patient" API so the accelerator maps SMART scopes onto it
#   - one user per demo persona, with the persona's FHIR Patient id in the patientId claim (the accelerator returns
#     it as the token response's "patient") and the patient-read role; password $PATIENT_PASSWORD
#   - application "HealthspanPatientApp": authorization code + refresh token, public client, PKCE (S256) mandatory,
#     callback http://localhost:5173/patient/callback, subscribed to the API
#
# Environment: APIM_ZIP (default ~/wso2/products/wso2am-4.3.0.zip), INTEGRATION_URL (default http://localhost:9090/api),
# PORTAL_ORIGIN (default http://localhost:5173), PATIENT_PASSWORD (default Patient@123).
set -euo pipefail
cd "$(dirname "$0")/../.."

APIM_ZIP=${APIM_ZIP:-$HOME/wso2/products/wso2am-4.3.0.zip}
HCAM_VERSION=2.0.0
HCAM_URL=https://github.com/wso2/healthcare-accelerator/releases/download/v$HCAM_VERSION/wso2-hcam-accelerator-$HCAM_VERSION.zip
INTEGRATION_URL=${INTEGRATION_URL:-http://localhost:9090/api}
PORTAL_ORIGIN=${PORTAL_ORIGIN:-http://localhost:5173}
PATIENT_PASSWORD=${PATIENT_PASSWORD:-Patient@123}

WORK=.apim
APIM_HOME=$WORK/wso2am-4.3.0
TOML=$APIM_HOME/repository/conf/deployment.toml
KM=https://localhost:9443
GW=https://localhost:8243
ADMIN=admin:admin
API_NAME=HealthspanPatientApp
API_CONTEXT=/patient-app
API_VERSION=1.0.0
APP_NAME=HealthspanPatientApp
SCOPE=patient-*.r            # the accelerator's shared scope; clients ask for it as patient/*.r
AUTH_CONFIG=config/patient-auth.json

# username|given name|family name|FHIR Patient id — the demo personas (README → Demo script)
PATIENTS=(
  "sofia|Sofia|Alvarez|p-sofia-alvarez"
  "daniel|Daniel|Reyes|p-daniel-reyes"
  "priya|Priya|Nair|p-priya-nair"
  "marcus|Marcus|Bell|p-marcus-bell"
)

log() { printf '\033[1;34m[apim]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[apim]\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "$1 is required"; }
need curl; need python3; need unzip; need java

# ── install ──────────────────────────────────────────────────────────────────

install() {
  mkdir -p "$WORK"
  if [[ -d $APIM_HOME/hc-accelerator ]]; then
    log "already installed at $APIM_HOME (delete $WORK to reinstall)"
    return
  fi
  [[ -f $APIM_ZIP ]] || die "APIM_ZIP not found: $APIM_ZIP"
  rm -rf "$APIM_HOME"
  log "unzipping $(basename "$APIM_ZIP")"
  unzip -q "$APIM_ZIP" -d "$WORK"

  local acc=$WORK/wso2-hcam-accelerator-$HCAM_VERSION.zip
  if [[ ! -f $acc ]]; then
    log "downloading the Healthcare APIM Accelerator $HCAM_VERSION"
    curl -fsSL -o "$acc.part" "$HCAM_URL" && mv "$acc.part" "$acc"
  fi
  unzip -q -o "$acc" -d "$APIM_HOME"
  log "applying the accelerator (merge.sh)"
  "$APIM_HOME/wso2-hcam-accelerator-$HCAM_VERSION/bin/merge.sh" > "$WORK/merge.log" 2>&1 || { cat "$WORK/merge.log"; die "merge.sh failed"; }
  find "$APIM_HOME/repository/conf" -name '*-e' -delete   # BSD sed -i backups from merge.sh

  # merge.sh adds the accelerator's key validation handler only when deployment.toml has no [apim.key_manager]
  # section, but APIM 4.3 ships one, so the handler is skipped ("[WARN] apim.key_manager ... already exist").
  # Without it the gateway never maps the token's patient/*.r onto the API's patient-*.r scope (403).
  sed -i '' -e 's|^#key_validation_handler_type = "custom"|key_validation_handler_type = "custom"|' \
    -e 's|^#key_validation_handler_impl = .*|key_validation_handler_impl = "org.wso2.healthcare.apim.scopemgt.handlers.OpenHealthcareExtendedKeyValidationHandler"|' "$TOML"
  grep -q '^key_validation_handler_impl = "org.wso2.healthcare' "$TOML" || die "could not set the key validation handler in $TOML"

  # The browser calls the key manager's token and revoke endpoints directly (the SMART configuration lists
  # them), so they need CORS for the portal. APIM ships the identity CORS settings ([cors] → identity.xml) but not
  # the Tomcat valve that applies them, so add the valve too. The gateway's CORS ([apim.cors], and the API's own)
  # covers the well-known endpoint and the API.
  cat >> "$TOML" <<EOF

# Added by scripts/utils/apim-setup.sh: the patient app (a browser SPA) calls /oauth2/token and /oauth2/revoke.
[[catalina.valves]]
properties.className = "org.wso2.carbon.identity.cors.valve.CORSValve"

[cors]
allow_generic_http_requests = true
allow_any_origin = false
allowed_origins = ["$PORTAL_ORIGIN"]
allow_subdomains = false
supported_methods = ["GET", "POST", "HEAD", "OPTIONS"]
support_any_header = true
supported_headers = []
exposed_headers = []
supports_credentials = false
max_age = 3600
tag_requests = false
EOF
  log "installed at $APIM_HOME"
}

# ── start / stop ─────────────────────────────────────────────────────────────

running() { curl -sk -o /dev/null -m 3 "$KM/services/Version" && curl -sk -o /dev/null -m 3 "$GW/r4/.well-known/smart-configuration"; }

start() {
  [[ -d $APIM_HOME ]] || install
  if running; then log "already running"; return; fi
  if lsof -nP -iTCP:5672 -sTCP:LISTEN >/dev/null 2>&1; then
    die "port 5672 is in use (APIM's message broker needs it); stop that service first, e.g. brew services stop rabbitmq"
  fi
  log "starting APIM (log: $WORK/apim.log)"
  nohup "$APIM_HOME/bin/api-manager.sh" > "$WORK/apim.log" 2>&1 &
  for _ in $(seq 1 120); do
    if curl -sk -m 3 "$GW/r4/.well-known/smart-configuration" | grep -q authorization_endpoint; then
      log "APIM is up: console $KM/publisher, gateway $GW"
      return
    fi
    sleep 3
  done
  die "APIM did not come up in 6 minutes; see $WORK/apim.log"
}

stop() {
  if [[ -d $APIM_HOME ]]; then "$APIM_HOME/bin/api-manager.sh" stop >/dev/null 2>&1 || true; fi
  log "stopped"
}

# ── REST helpers ─────────────────────────────────────────────────────────────

TOKEN=""
# jq-free JSON access: json '<python expression over d>' < body
json() { python3 -c "import json,sys; d=json.load(sys.stdin); r=($1); print('' if r is None else (json.dumps(r) if isinstance(r,(dict,list)) else r))"; }

rest() { # method path [curl args...] — path is relative to $KM
  local method=$1 path=$2; shift 2
  local out code
  out=$(curl -sk -w '\n%{http_code}' -X "$method" -H "Authorization: Bearer $TOKEN" "$KM$path" "$@")
  code=${out##*$'\n'}; out=${out%$'\n'*}
  [[ $code == 2* ]] || die "$method $path → HTTP $code: $out"
  printf '%s' "$out"
}

admin_token() {
  local reg client
  reg=$(curl -sfk -u "$ADMIN" -H 'Content-Type: application/json' "$KM/client-registration/v0.17/register" \
    -d '{"callbackUrl":"https://localhost","clientName":"healthspan_apim_setup","owner":"admin","grantType":"password refresh_token","saasApp":true}') \
    || die "client registration failed"
  client="$(json 'd["clientId"]' <<<"$reg"):$(json 'd["clientSecret"]' <<<"$reg")"
  TOKEN=$(curl -sfk -u "$client" "$KM/oauth2/token" -d grant_type=password -d username=admin -d password=admin \
    --data-urlencode "scope=apim:api_view apim:api_create apim:api_manage apim:api_publish apim:shared_scope_manage apim:subscribe apim:app_manage apim:sub_manage" \
    | json 'd["access_token"]') || die "admin token request failed"
}

soap_user() { # action body — RemoteUserStoreManagerService
  curl -sk -u "$ADMIN" -H 'Content-Type: text/xml;charset=UTF-8' -H "SOAPAction: urn:$1" \
    "$KM/services/RemoteUserStoreManagerService.RemoteUserStoreManagerServiceHttpsSoap11Endpoint" \
    -d "<soapenv:Envelope xmlns:soapenv=\"http://schemas.xmlsoap.org/soap/envelope/\" xmlns:ser=\"http://service.ws.um.carbon.wso2.org\" xmlns:xsd=\"http://common.mgt.user.carbon.wso2.org/xsd\"><soapenv:Body>$2</soapenv:Body></soapenv:Envelope>"
}

# ── configure ────────────────────────────────────────────────────────────────

configure_api() {
  local pub=/api/am/publisher/v4 api_id scope_obj body
  api_id=$(rest GET "$pub/apis?query=name:$API_NAME" | json 'next((a["id"] for a in d["list"] if a["name"]=="'$API_NAME'"), None)')

  scope_obj=$(rest GET "$pub/scopes?limit=200" | json 'next((s for s in d["list"] if s["name"]=="'"$SCOPE"'"), None)')
  [[ -n $scope_obj ]] || die "shared scope $SCOPE not found — is the accelerator applied?"

  body=$(SCOPE_OBJ=$scope_obj python3 - <<EOF
import json, os
scope = json.loads(os.environ["SCOPE_OBJ"])
op = lambda target: {"target": target, "verb": "GET", "authType": "Application & Application User",
                     "throttlingPolicy": "Unlimited", "scopes": ["$SCOPE"]}
print(json.dumps({
  "name": "$API_NAME", "context": "$API_CONTEXT", "version": "$API_VERSION", "type": "HTTP",
  "description": "The patient app's API on the EHR + Lab integration. SMART on FHIR: needs patient/*.r.",
  "endpointConfig": {"endpoint_type": "http",
                     "production_endpoints": {"url": "$INTEGRATION_URL"},
                     "sandbox_endpoints": {"url": "$INTEGRATION_URL"}},
  "policies": ["Unlimited"], "securityScheme": ["oauth2"],
  "corsConfiguration": {"corsConfigurationEnabled": True, "accessControlAllowOrigins": ["$PORTAL_ORIGIN"],
                        "accessControlAllowCredentials": False,
                        "accessControlAllowHeaders": ["authorization", "content-type", "accept"],
                        "accessControlAllowMethods": ["GET", "OPTIONS"]},
  "scopes": [{"scope": scope, "shared": True}],
  "operations": [op("/patient-app/patients"), op("/ehrs/{ehr}/patients/{id}/journey")],
}))
EOF
)
  if [[ -z $api_id ]]; then
    api_id=$(rest POST "$pub/apis" -H 'Content-Type: application/json' -d "$body" | json 'd["id"]')
    log "created API $API_NAME ($api_id)"
  else
    rest PUT "$pub/apis/$api_id" -H 'Content-Type: application/json' -d "$body" >/dev/null
    log "updated API $API_NAME ($api_id)"
  fi

  # Mark it as a FHIR Patient API: the accelerator's key validation handler then maps the token's SMART scopes
  # (patient/*.r) onto the resource scope (patient-*.r).
  local def
  def=$(rest GET "$pub/apis/$api_id/swagger" | python3 -c 'import json,sys; d=json.load(sys.stdin); d["x-wso2-oh-fhir-resourceType"]="Patient"; print(json.dumps(d))')
  rest PUT "$pub/apis/$api_id/swagger" -F "apiDefinition=$def" >/dev/null

  local rev
  rev=$(rest POST "$pub/apis/$api_id/revisions" -H 'Content-Type: application/json' -d '{"description":"apim-setup.sh"}' | json 'd["id"]')
  rest POST "$pub/apis/$api_id/deploy-revision?revisionId=$rev" -H 'Content-Type: application/json' \
    -d '[{"name":"Default","vhost":"localhost","displayOnDevportal":true}]' >/dev/null
  # Keep only the latest few revisions (APIM allows five).
  rest GET "$pub/apis/$api_id/revisions?query=deployed:false" | json '[r["id"] for r in d["list"]][:-1]' \
    | python3 -c 'import json,sys; print("\n".join(json.load(sys.stdin)))' | while read -r old; do
      [[ -n $old ]] && rest DELETE "$pub/apis/$api_id/revisions/$old" >/dev/null || true
    done
  if [[ $(rest GET "$pub/apis/$api_id" | json 'd["lifeCycleStatus"]') != PUBLISHED ]]; then
    rest POST "$pub/apis/change-lifecycle?apiId=$api_id&action=Publish" >/dev/null
  fi
  log "deployed and published: $GW$API_CONTEXT/$API_VERSION"
  API_ID=$api_id
}

configure_users() {
  local roles role
  roles=$(soap_user getRoleNames '<ser:getRoleNames/>')
  role=$(grep -oE '<ns:return>[^<]*patient-read</ns:return>' <<<"$roles" | head -1 | sed -E 's#</?ns:return>##g')
  if [[ -z $role ]]; then
    role=Internal/patient-read
    soap_user addRole "<ser:addRole><ser:roleName>$role</ser:roleName></ser:addRole>" >/dev/null
  fi
  for entry in "${PATIENTS[@]}"; do
    IFS='|' read -r user given family patient <<<"$entry"
    if soap_user isExistingUser "<ser:isExistingUser><ser:userName>$user</ser:userName></ser:isExistingUser>" | grep -q '<ns:return>true'; then
      :
    else
      soap_user addUser "<ser:addUser><ser:userName>$user</ser:userName><ser:credential>$PATIENT_PASSWORD</ser:credential>
        <ser:roleList>$role</ser:roleList><ser:requirePasswordChange>false</ser:requirePasswordChange></ser:addUser>" >/dev/null
    fi
    local claims=""
    for kv in "givenname=$given" "lastname=$family" "emailaddress=$user@healthspan.example" "patientId=$patient"; do
      claims+="<ser:claims><xsd:claimURI>http://wso2.org/claims/${kv%%=*}</xsd:claimURI><xsd:value>${kv#*=}</xsd:value></ser:claims>"
    done
    soap_user setUserClaimValues "<ser:setUserClaimValues><ser:userName>$user</ser:userName>$claims<ser:profileName>default</ser:profileName></ser:setUserClaimValues>" >/dev/null
    # Make sure the role is assigned on re-runs too.
    soap_user updateRoleListOfUser "<ser:updateRoleListOfUser><ser:userName>$user</ser:userName><ser:newRoles>$role</ser:newRoles></ser:updateRoleListOfUser>" >/dev/null
    local got
    got=$(soap_user getUserClaimValue "<ser:getUserClaimValue><ser:userName>$user</ser:userName><ser:claim>http://wso2.org/claims/patientId</ser:claim><ser:profileName>default</ser:profileName></ser:getUserClaimValue>" | grep -oE '<ns:return>[^<]*' | sed 's/<ns:return>//')
    [[ $got == "$patient" ]] || die "could not set the patientId claim of $user"
    log "user $user → Patient/$patient ($role)"
  done
}

configure_app() {
  local dev=/api/am/devportal/v3 app_id client_id keys
  app_id=$(rest GET "$dev/applications?query=$APP_NAME" | json 'next((a["applicationId"] for a in d["list"] if a["name"]=="'$APP_NAME'"), None)')
  if [[ -z $app_id ]]; then
    app_id=$(rest POST "$dev/applications" -H 'Content-Type: application/json' \
      -d '{"name":"'$APP_NAME'","throttlingPolicy":"Unlimited","tokenType":"JWT","description":"Healthspan patient app (SMART on FHIR, public client)"}' | json 'd["applicationId"]')
    log "created application $APP_NAME ($app_id)"
  fi

  if ! rest GET "$dev/subscriptions?applicationId=$app_id" | json '[s["apiId"] for s in d["list"]]' | grep -q "$API_ID"; then
    rest POST "$dev/subscriptions" -H 'Content-Type: application/json' \
      -d '{"apiId":"'$API_ID'","applicationId":"'$app_id'","throttlingPolicy":"Unlimited"}' >/dev/null
    log "subscribed $APP_NAME to $API_NAME"
  fi

  local key_body
  key_body='{"keyType":"PRODUCTION","keyManager":"Resident Key Manager","grantTypesToBeSupported":["authorization_code","refresh_token"],
    "callbackUrl":"'$PORTAL_ORIGIN'/patient/callback",
    "additionalProperties":{"pkceMandatory":"true","pkceSupportPlain":"false","bypassClientCredentials":"true",
      "application_access_token_expiry_time":"3600","user_access_token_expiry_time":"3600","refresh_token_expiry_time":"86400","id_token_expiry_time":"3600"}}'
  keys=$(rest GET "$dev/applications/$app_id/oauth-keys" | json 'next((k for k in d["list"] if k["keyType"]=="PRODUCTION"), None)')
  if [[ -z $keys ]]; then
    client_id=$(rest POST "$dev/applications/$app_id/generate-keys" -H 'Content-Type: application/json' -d "$key_body" | json 'd["consumerKey"]')
    log "generated keys"
  else
    local mapping
    mapping=$(json 'd["keyMappingId"]' <<<"$keys")
    client_id=$(rest PUT "$dev/applications/$app_id/oauth-keys/$mapping" -H 'Content-Type: application/json' \
      -d "$(python3 -c '
import json, sys
key, want = json.loads(sys.argv[1]), json.loads(sys.argv[2])   # the existing key, and what generate-keys sent
key["supportedGrantTypes"] = want["grantTypesToBeSupported"]
key["callbackUrl"] = want["callbackUrl"]
key["additionalProperties"] = {**(key.get("additionalProperties") or {}), **want["additionalProperties"]}
print(json.dumps(key))' "$keys" "$key_body")" \
      | json 'd["consumerKey"]')
    log "updated keys"
  fi
  CLIENT_ID=$client_id
}

write_auth_config() {
  # Written in place (not replaced) so the portal container's bind mount sees the change. demoUsers lists the
  # patients registered above with their password, for the sign-in screen (a demo convenience).
  local users
  users=$(for e in "${PATIENTS[@]}"; do echo "$e"; done | PASSWORD=$PATIENT_PASSWORD python3 -c '
import json, os, sys
rows = [l.strip().split("|") for l in sys.stdin if l.strip()]
print(json.dumps([{"username": u, "password": os.environ["PASSWORD"], "name": f"{g} {f}", "patientId": p} for u, g, f, p in rows], indent=4))')
  cat > "$AUTH_CONFIG" <<EOF
{
  "mode": "smart",
  "iss": "$GW/r4",
  "apiBase": "$GW$API_CONTEXT/$API_VERSION",
  "clientId": "$CLIENT_ID",
  "scope": "openid fhirUser launch/patient patient/*.r",
  "redirectUri": "$PORTAL_ORIGIN/patient/callback",
  "demoUsers": ${users//$'\n'/$'\n'  }
}
EOF
  log "wrote $AUTH_CONFIG (client $CLIENT_ID)"
}

configure() {
  running || die "APIM is not running (./scripts/utils/apim-setup.sh start)"
  admin_token
  configure_api
  configure_users
  configure_app
  write_auth_config
  cat <<EOF

  The patient app is in SMART mode (./scripts/utils/patient-app-mode.sh normal switches back). Open $PORTAL_ORIGIN/patient and sign in as one of:
$(for e in "${PATIENTS[@]}"; do IFS='|' read -r u g f p <<<"$e"; printf '    %-7s %-16s Patient/%s\n' "$u" "$g $f" "$p"; done)
  password: $PATIENT_PASSWORD

  APIM uses a self-signed certificate: open $GW/r4/.well-known/smart-configuration once in the browser and
  accept it (the same for $KM), or the browser blocks the app's calls.
EOF
}

status() {
  if running; then log "APIM running: $KM/publisher, $GW/r4/.well-known/smart-configuration"; else log "APIM not running"; fi
  ./scripts/utils/patient-app-mode.sh status
}

case ${1:-all} in
  install) install ;;
  start) start ;;
  stop) stop ;;
  configure) configure ;;
  off) ./scripts/utils/patient-app-mode.sh normal ;;   # older spelling
  status) status ;;
  all) install; start; configure ;;
  -h|--help) sed -n '2,25p' "$0" ;;
  *) die "unknown command: $1 (see --help)" ;;
esac
