#!/usr/bin/env bash
# Drives one full assessment through the API, exactly as the portal does, and prints each step.
# Calls the model provider three times or more (Copilot, Results Analysis, Care Plan).
#
#   ./scripts/smoke-test.sh [ehr] [patientId]        # default: athena p-sofia-alvarez
#   ./scripts/smoke-test.sh cerner p-daniel-reyes
set -euo pipefail

API="${API:-http://localhost:9090/api}"
LAB="${LAB:-http://localhost:9093/lab}"
EHR="${1:-athena}"
PATIENT="${2:-p-sofia-alvarez}"
SINCE="${SINCE:-2023-01-01}"

json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

wait_for() {
  # wait_for <id> <python expression over the assessment d> <label>
  local id="$1" expr="$2" label="$3" result
  for _ in $(seq 1 300); do
    result=$(curl -s "$API/assessments/$id" | json "'FAILED: ' + str(d['error']) if d['stage'] == 'FAILED' else ('yes' if ($expr) else 'no')")
    if [[ "$result" == "yes" ]]; then echo "  ✓ $label"; return 0; fi
    if [[ "$result" == FAILED* ]]; then echo "  ✗ $result"; exit 1; fi
    sleep 2
  done
  echo "  ✗ timed out waiting for: $label"; exit 1
}

post() { curl -sf -X POST "$1" -H 'Content-Type: application/json' -d "$2"; }

echo "1. Start assessment for $PATIENT in $EHR"
ID=$(post "$API/assessments" "{\"ehr\":\"$EHR\",\"patientId\":\"$PATIENT\"}" | json 'd["id"]')
echo "  $ID"
wait_for "$ID" "'orderLabs' in d['openTasks']" "record pulled, visit opened — human task 'orderLabs' open for the physician"
curl -s "$API/assessments/$ID" | json '"  summary: %d biomarkers, %d flags, %d allergies" % (len(d["data"]["summary"]["biomarkers"]), len(d["data"]["summary"]["flags"]), len(d["data"]["summary"]["allergies"]))'

echo "2. Explorer → Copilot evaluation of the selected records"
curl -s "$API/ehrs/$EHR/patients/$PATIENT/records?kinds=lab,medication,medication-reported,note,allergy,problem&from=$SINCE" > /tmp/smoke-records.json
python3 -c "import json; r=json.load(open('/tmp/smoke-records.json')); print('  %d records from %d FHIR queries' % (len(r['rows']), len(r['queries'])))"
python3 -c "import json; r=json.load(open('/tmp/smoke-records.json')); print(json.dumps({'records': r['rows'], 'dateFrom': '$SINCE', 'question': 'What stands out in the last three years, and what should we measure?'}))" > /tmp/smoke-evaluation.json
post "$API/assessments/$ID/evaluations" "@/tmp/smoke-evaluation.json" >/dev/null
wait_for "$ID" "d['data'].get('copilot', {}).get('status') == 'idle' and 'evaluation' in d['data']" "Copilot evaluation ready"
curl -s "$API/assessments/$ID" | json '"  reply: " + d["data"]["evaluation"]["reply"][:300]'
TESTS=$(curl -s "$API/assessments/$ID" | json 'json.dumps([t["testCode"] for t in d["data"]["evaluation"]["recommendedTests"] if t["priority"] != "optional"])')
echo "  proposed: $TESTS"

echo "3. Physician orders → order of record in the EHR, order to the lab, patient notified"
post "$API/assessments/$ID/lab-order" "{\"approvedTests\":$TESTS,\"note\":\"Fasting draw.\",\"clinicalContext\":\"Evaluate the trends the Copilot found.\"}" >/dev/null
wait_for "$ID" "d['stage'] == 'AWAITING_PATIENT'" "waiting on the patient (human task 'labVisit')"
curl -s "$API/ehrs/$EHR/patients/$PATIENT/journey" | json '"  patient app: step=%s, tests=%s" % (d["assessment"]["step"], ", ".join(t["name"] for t in d["assessment"]["tests"]))'
ORDER=$(curl -s "$API/assessments/$ID" | json 'd["labServiceRequestId"]')

echo "4. Patient at the lab → specimen collected → task completed by the lab"
post "$LAB/orders/$ORDER/collect" "" | json '"  Specimen/%s (integration notified: %s)" % (d["specimenId"], d["integrationNotified"])'
wait_for "$ID" "d['stage'] == 'AWAITING_LAB'" "waiting on the lab (system event)"

echo "5. Lab releases results → webhook → results filed → both agents → draft note"
post "$LAB/orders/$ORDER/release" "" | json '"  DiagnosticReport/%s (%d results, integration notified: %s)" % (d["diagnosticReportId"], d["observations"], d["integrationNotified"])'
wait_for "$ID" "'reviewAndRelease' in d['openTasks']" "analysis and care plan ready — human task 'reviewAndRelease' open"
curl -s "$API/assessments/$ID" | json '"  " + d["data"]["analysis"]["headline"]'

echo "6. Physician releases → note signed, visit closed, Longevity Record published"
post "$API/assessments/$ID/release" '{"comment":"Discussed results with the patient by phone."}' >/dev/null
wait_for "$ID" "d['stage'] == 'COMPLETED'" "completed"
curl -s "$API/ehrs/$EHR/patients/$PATIENT/longevity-record" | json '"  record: %d biomarkers, %d goals — %s" % (len(d["biomarkers"]), len(d["carePlan"]["goals"]), d["patientReport"]["headline"])'

echo
echo "Workflow:"
curl -s "$API/assessments/$ID/workflow" | json '"\n".join("  %-9s %-10s %s" % (s["state"], s["actor"], s["label"]) for s in d["steps"])'
echo
echo "Timeline:"
curl -s "$API/assessments/$ID" | json '"\n".join("  %-10s %s" % (e["actor"], e["title"]) for e in d["timeline"])'
