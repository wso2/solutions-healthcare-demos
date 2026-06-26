#!/usr/bin/env sh
# Mint an OpenEMR OAuth2 token for the FHIR MCP bridge (register -> enable ->
# mint) by driving the pinned containers via `docker compose exec`, and write it
# to .fhir.env. Host needs only docker + a POSIX shell. Re-run when it expires.
set -eu

COMPOSE="docker compose"
OE_USER="${OE_USER:-admin}"
OE_PASS="${OE_PASS:-pass}"
CLIENT_NAME="care-loop-fhir-mcp"
SCOPES="openid offline_access api:fhir user/Patient.read user/Observation.read user/Encounter.read user/Condition.read"
ENV_FILE=".fhir.env"
# OpenEMR hardcodes the access-token lifetime (default PT1H). Demo-only: widen
# it so the minted token does not expire mid-use. Any ISO-8601 duration works.
ACCESS_TOKEN_TTL="${ACCESS_TOKEN_TTL:-P1Y}"
AUTH_CONTROLLER="/var/www/localhost/htdocs/openemr/src/RestControllers/AuthorizationController.php"

# Pull a JSON string value by key (tokens/ids have no embedded quotes).
json_value() { sed -n 's/.*"'"$1"'":"\([^"]*\)".*/\1/p'; }

echo "[bootstrap] waiting for OpenEMR FHIR API to answer..."
i=0
while [ "$($COMPOSE exec -T openemr curl -s -o /dev/null -w '%{http_code}' \
    http://localhost/apis/default/fhir/metadata)" != "200" ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then
    echo "[bootstrap] OpenEMR FHIR API not ready after ~10m; aborting." >&2
    exit 1
  fi
  sleep 10
done

# Widen the access-token TTL (opcache revalidates within ~2s, no restart).
echo "[bootstrap] setting access-token TTL to $ACCESS_TOKEN_TTL..."
$COMPOSE exec -T openemr sed -i \
  "s/GRANT_TYPE_ACCESS_TOKEN_TTL = '[^']*'/GRANT_TYPE_ACCESS_TOKEN_TTL = '$ACCESS_TOKEN_TTL'/" \
  "$AUTH_CONTROLLER"

echo "[bootstrap] registering OAuth2 client..."
REG_BODY='{"application_type":"private","client_name":"'"$CLIENT_NAME"'","token_endpoint_auth_method":"client_secret_post","redirect_uris":["http://localhost/"],"post_logout_redirect_uris":["http://localhost/"],"scope":"'"$SCOPES"'"}'
REG=$(printf '%s' "$REG_BODY" | $COMPOSE exec -T openemr \
  curl -s -X POST http://localhost/oauth2/default/registration \
  -H 'Content-Type: application/json' -d @-)
CLIENT_ID=$(printf '%s' "$REG" | json_value client_id)
CLIENT_SECRET=$(printf '%s' "$REG" | json_value client_secret)
if [ -z "$CLIENT_ID" ] || [ -z "$CLIENT_SECRET" ]; then
  echo "[bootstrap] client registration failed; response was:" >&2
  echo "$REG" >&2
  exit 1
fi
echo "[bootstrap] registered client $CLIENT_ID"

# New clients are created disabled; enable in the DB via the openemr-db client.
echo "[bootstrap] enabling client..."
$COMPOSE exec -T openemr-db mysql -uroot -proot openemr \
  -e "UPDATE oauth_clients SET is_enabled = 1 WHERE client_id = '$CLIENT_ID';"

echo "[bootstrap] minting access token (password grant)..."
TOK=$($COMPOSE exec -T openemr \
  curl -s -X POST http://localhost/oauth2/default/token \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode "grant_type=password" \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET" \
  --data-urlencode "scope=$SCOPES" \
  --data-urlencode "user_role=users" \
  --data-urlencode "username=$OE_USER" \
  --data-urlencode "password=$OE_PASS")
ACCESS_TOKEN=$(printf '%s' "$TOK" | json_value access_token)
if [ -z "$ACCESS_TOKEN" ]; then
  echo "[bootstrap] token request failed; response was:" >&2
  echo "$TOK" >&2
  exit 1
fi

# Verify the token works against the FHIR API before handing it to the bridge.
echo "[bootstrap] verifying token against /Patient..."
CODE=$($COMPOSE exec -T openemr curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Accept: application/fhir+json" \
  http://localhost/apis/default/fhir/Patient)
if [ "$CODE" != "200" ]; then
  echo "[bootstrap] token did not authorize against FHIR API (HTTP $CODE)." >&2
  exit 1
fi

printf 'FHIR_SERVER_ACCESS_TOKEN=%s\n' "$ACCESS_TOKEN" > "$ENV_FILE"
echo "[bootstrap] token verified (HTTP 200) and written to $ENV_FILE"
