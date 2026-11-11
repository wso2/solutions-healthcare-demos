# Demo script (about 15 minutes)

For presenters, once the stack is running (see the [README](../README.md)). The steps follow [the journey](../README.md#the-journey).

1. **Physician → Sofia Alvarez.** The patient summary is built live from the EHR over FHIR (12 searches in parallel, the EHR has no `$summary`); *View IPS bundle* shows the FHIR document. Point at the red allergy banner (aspirin, angioedema) and the first flag: *NSAID in use despite aspirin allergy* — a deterministic rule, because her ibuprofen is a patient-reported medication.
2. **EHR explorer.** Lab results + medications + notes, last 3 years → the FHIR queries are listed. Read a note ("taking ibuprofen 400 mg two to three times daily").
3. **Start the assessment and order labs.** The assessment starts (Temporal workflow); review the record beside the order form and pick the tests from the lab catalog (e.g. kidney function, metabolic panel, advanced lipids, liver panel).
4. **Temporal UI.** The workflow is suspended on a *human task* for the physician.
5. **Order labs.** Order of record in the EHR, order to Quest, patient notified. The workflow now waits on the **patient** — open the **patient app** (home page → Patient app, in its own tab): "Action needed: visit Quest Diagnostics", fasting instructions, order number. In [SMART mode](smart-on-fhir.md), sign in as `sofia` / `Patient@123` on the APIM login page first, and open the SMART traffic panel to walk through discovery, authorize, token and the API calls.
6. **Simulate a crash** (lab console → Simulate failures → Crash). The integration restarts in seconds; the workflow is still waiting on the patient.
7. **Lab console → Collect specimen** → waiting on the **lab**. Optionally turn on *Lab webhook down* (lab console) first: the fallback poller completes the task ~20 s later.
8. **Release results.** The lab sends its report and observations as a FHIR message; they are filed in the EHR, then both agents run unattended. The analysis — headline, risk counts, then tabs for overview, risk flags, lab results, care plan, chart note and patient report — confirms early CKD with cystatin C, insulin resistance (HOMA-IR) and a metabolic liver pattern.
9. **Review & release.** The draft note becomes final in the EHR, the visit closes, the patient app shows the report.
10. **EHR outage** (any assessment, before an EHR write): turn on the *EHR outage* in the lab console, act (e.g. order labs). The step retries; leave it cut and the assessment pauses with **Retry / Stop** — turn the outage off and click **Retry**: it completes. Turn it off within ~45 s instead and the retry succeeds on its own.

11. **Agent Manager** (console only; the portal no longer shows governance). The console: the Copilot's traces (LLM calls, FHIR and PubMed tool calls, tokens), its monitor's scores, the `anthropic` provider with the PHI guardrail. Full script: [agent-manager.md](agent-manager.md#6-a-ten-minute-demo).

Other personas: **Daniel Reyes** — silent cardiometabolic drift, father's MI at 54, ApoB/Lp(a)/HOMA-IR story; **Priya Nair** — ferritin and hemoglobin falling under treated hypothyroidism, iron deficiency treated in 2019; **Marcus Bell** — healthy control.
