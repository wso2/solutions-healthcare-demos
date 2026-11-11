# Patient app: SMART on FHIR through WSO2 API Manager

Back to the [README](../README.md).

The patient app runs in one of two modes, set by `"mode"` in `config/patient-auth.json`:

| Mode | Sign-in | API calls |
|---|---|---|
| `normal` (default) | none: the app lists every patient with an assessment | straight to the integration (`/api`) |
| `smart` | SMART on FHIR standalone launch: the patient signs in on the WSO2 API Manager login page and approves the scopes | through the APIM gateway with the patient's bearer token. The app shows only the token's patient. |

```bash
./scripts/utils/patient-app-mode.sh smart     # needs the APIM setup below, once
./scripts/utils/patient-app-mode.sh normal
./scripts/utils/patient-app-mode.sh status
```

The portal reads the file on every page load. Nginx serves it in the container (`docker-compose.yml` mounts
it), and Vite serves it with `npm run dev`. A mode switch takes effect when you reload the patient app; you
don't need to rebuild or restart anything. `up.sh` creates the file from `config/patient-auth.example.json` if
it is missing. The app also falls back to `normal` if the file is missing or has no client ID.

## Set up WSO2 API Manager (once)

APIM runs on the Mac, beside the stack, and calls the integration at `http://localhost:9090/api`.

**You need:**
- the WSO2 API Manager 4.3.0 zip
- Java 11, 17 or 21 (tested with Temurin 21)
- these ports free: 9443, 9763, 8243, 8280, 9611, 9711 and **5672**. APIM's internal message broker uses
  5672, so stop a local RabbitMQ first: `brew services stop rabbitmq`.

The script downloads the [WSO2 Healthcare APIM Accelerator 2.0.0](https://github.com/wso2/healthcare-accelerator/releases/tag/v2.0.0)
itself.

```bash
APIM_ZIP=~/wso2/products/wso2am-4.3.0.zip ./scripts/utils/apim-setup.sh   # install, start, configure (~5 min)
```

The script leaves the patient app in `smart` mode. Then:

1. **Trust APIM's self-signed certificate.** Open https://localhost:8243/r4/.well-known/smart-configuration
   and https://localhost:9443/devportal in the browser and accept the warning on each. Until you do, the
   browser blocks the app's calls to APIM, and the SMART traffic panel shows them as network errors.
2. **Sign in.** Open http://localhost:5173/patient and click **Sign in**. The app lists the patients
   registered in APIM with their usernames and passwords. Pick one, then type its credentials on the APIM
   login page and click **Allow** on the consent page.

| User | Patient | Password |
|---|---|---|
| `sofia` | Sofia Alvarez · `p-sofia-alvarez` | `Patient@123` |
| `daniel` | Daniel Reyes · `p-daniel-reyes` | `Patient@123` |
| `priya` | Priya Nair · `p-priya-nair` | `Patient@123` |
| `marcus` | Marcus Bell · `p-marcus-bell` | `Patient@123` |

A patient sees their own assessment once the physician has started one for them.

**Afterwards:**
- `./scripts/utils/apim-setup.sh start`, `stop` and `status` start, stop and check APIM (log: `.apim/apim.log`).
- `configure` is idempotent, so run it again after changing a user or the integration URL. It keeps the
  application and its client ID.
- `rm -rf .apim` and re-running the script reinstalls APIM from scratch.

Environment overrides:
- `APIM_ZIP`
- `INTEGRATION_URL` (default `http://localhost:9090/api`)
- `PORTAL_ORIGIN` (default `http://localhost:5173`)
- `PATIENT_PASSWORD`

**What `apim-setup.sh` sets up**

| Step | What |
|---|---|
| install | Unzips APIM into `.apim/wso2am-4.3.0` (gitignored) and runs the accelerator's `merge.sh`. This adds the SMART well-known endpoint `/r4/.well-known/smart-configuration`, the FHIR metadata endpoint, the SMART scopes (`patient/*.r` → shared scope `patient-*.r` with role `patient-read`), the `patientId` claim and the Open Healthcare login theme. The script then fixes two things the merge leaves out on APIM 4.3 (below). |
| API | `HealthspanPatientApp`, at `https://localhost:8243/patient-app/1.0.0`, forwarding to the integration's `/api`. It has two OAuth2-secured GET resources, `/patient-app/patients` and `/ehrs/{ehr}/patients/{id}/journey`, each requiring `patient-*.r`. The definition carries `x-wso2-oh-fhir-resourceType: Patient`, so the accelerator maps SMART scopes onto it. |
| Users | One per demo persona, with the `patient-read` role. Each user's `patientId` claim holds the FHIR Patient id, which the accelerator returns as the token response's `patient`. |
| Application | `HealthspanPatientApp`: authorization code and refresh token grants, public client, PKCE S256 required, callback `http://localhost:5173/patient/callback`, subscribed to the API |
| Config | Writes `config/patient-auth.json` with the issuer, gateway, client ID, scopes, the users above, and `"mode": "smart"` |

**Fixes on top of the accelerator.** Without these, sign-in or the API calls fail:
- **Key validation handler.** `merge.sh` adds the accelerator's key validation handler only when
  `deployment.toml` has no `[apim.key_manager]` section, and APIM 4.3 ships one. Without the handler, the
  gateway can't match the token's `patient/*.r` to the resource scope `patient-*.r` and returns 403. The script
  sets `key_validation_handler_impl` itself.
- **CORS on the token endpoints.** The browser calls the key manager's `/oauth2/token` and `/oauth2/revoke`
  directly. APIM writes the `[cors]` settings but doesn't install the Tomcat CORS valve that applies them, so
  the script adds it through `[[catalina.valves]]`.

## The sign-in flow

The client is in `demo-portal/src/lib/smartAuth.ts`, and the sign-in screens are in `src/pages/PatientAuth.tsx`.

1. **Discover.** `GET {iss}/.well-known/smart-configuration` returns `authorization_endpoint`,
   `token_endpoint` and `revocation_endpoint`, all on the key manager at `:9443`.
2. **Authorize.** The browser goes to the authorization endpoint with:
   - `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`
   - `aud={iss}`
   - an S256 `code_challenge`
   - `prompt=login`, so APIM always shows its login page. APIM lists no `end_session_endpoint`, so its login
     session outlives **Sign out**.

   The default scopes are `openid fhirUser launch/patient patient/*.r`.
3. **Token.** `/patient/callback` checks `state`, then posts `grant_type=authorization_code`, the `code` and
   the `code_verifier` to the token endpoint. The response includes `patient`, and the ID token carries
   `fhirUser`. The session is kept for the browser tab only, and the refresh token renews the access token
   before it expires.
4. **Call the API.** The app sends `GET {apiBase}/patient-app/patients` and
   `GET {apiBase}/ehrs/{ehr}/patients/{id}/journey` with `Authorization: Bearer <token>`. A 401 ends the
   session. **Sign out** revokes the token.

**SMART traffic panel.** In SMART mode, the patient app's landing page has a collapsible panel on the right
(`src/components/SmartTracePanel.tsx`). It lists every request and response of these steps in order, each
as a collapsible item. Repeated identical API calls stay as one entry. The panel shows tokens in full, which
is meant for the demo. The APIM login and consent pages are not in it, because they happen outside the app.

## Configuration keys

`config/patient-auth.json` (gitignored; `apim-setup.sh` writes it):

| Key | Meaning |
|---|---|
| `mode` | `smart` or `normal` |
| `iss` | FHIR base URL on the gateway. The app discovers the endpoints from it and sends it as `aud`. |
| `apiBase` | The patient-app API on the gateway; it stands in for the integration's `/api` |
| `clientId` | Consumer key of the APIM application |
| `scope` | Scopes requested at the authorization endpoint |
| `redirectUri` | Must match the application's callback URL. Default `{portal origin}/patient/callback` |
| `demoUsers` | The users listed on the sign-in screen, with their passwords. For the demo only. |

## Known limitations

- **The integration doesn't enforce which patient a caller sees.** The app shows only the token's patient,
  but the integration would return another patient's journey to any valid token.
- **The backend never receives the patient ID.** The accelerator's backend JWT generator looks the user up by
  username. APIM 4.3 tokens identify the user by UUID, so the lookup fails and logs an error on every call.
- **The header shows the user's UUID instead of their name.** The ID token carries no name claim.
- **APIM's WebSub listener fails at startup.** `SecureWebhookServer` needs port 8443, which the Agent Manager
  cluster already uses. The error in the log is harmless.
- **Everything is local.** The certificates are self-signed and the passwords are demo passwords.

