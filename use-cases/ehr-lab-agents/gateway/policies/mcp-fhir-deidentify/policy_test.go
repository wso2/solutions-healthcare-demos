package mcpfhirdeidentify

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"testing"

	policy "github.com/wso2/api-platform/sdk/core/policy/v1alpha2"
)

// The configuration from the proposal, extended the way the demo uses it.
func demoParams() map[string]interface{} {
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(`{
	  "tools": ["*"],
	  "hashKey": "test-key-0123456789abcdef",
	  "resources": [
	    {"type": "Patient",
	     "rules": [
	       {"fhirPaths": ["Patient.name", "Patient.address.line", "Patient.address.city", "Patient.address.postalCode",
	                      "Patient.address.extension('http://hl7.org/fhir/StructureDefinition/geolocation')",
	                      "Patient.extension('http://hl7.org/fhir/StructureDefinition/patient-birthPlace')"],
	        "operation": "redact"},
	       {"fhirPaths": ["Patient.telecom.where(system='phone').value"], "operation": "mask"},
	       {"fhirPaths": ["Patient.birthDate"], "operation": "generalize"},
	       {"fhirPaths": ["Patient.identifier.value"], "operation": "hash"}
	     ],
	     "denySearchParams": ["name", "family", "given", "phone", "address", "birthdate", "identifier"]},
	    {"type": "Observation",
	     "include": ["Observation.status", "Observation.category", "Observation.code", "Observation.value",
	                 "Observation.effective", "Observation.subject", "Observation.interpretation", "Observation.referenceRange"]},
	    {"type": "DocumentReference", "access": "deny"}
	  ]
	}`), &m); err != nil {
		panic(err)
	}
	return m
}

func newPolicy(t *testing.T, params map[string]interface{}) *Policy {
	t.Helper()
	p, err := GetPolicy(policy.PolicyMetadata{APIName: "fhir"}, params)
	if err != nil {
		t.Fatalf("GetPolicy: %v", err)
	}
	return p.(*Policy)
}

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	b, err := os.ReadFile("testdata/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func toolCall(id int, tool string, args string) []byte {
	return []byte(`{"jsonrpc":"2.0","id":` + itoa(id) + `,"method":"tools/call","params":{"name":"` + tool + `","arguments":` + args + `}}`)
}

func itoa(n int) string { b, _ := json.Marshal(n); return string(b) }

// respond runs a response through the policy as the gateway would.
func respond(t *testing.T, p *Policy, request, response []byte, contentType string) ([]byte, policy.DownstreamResponseModifications) {
	t.Helper()
	ctx := &policy.ResponseContext{
		SharedContext:   &policy.SharedContext{APIName: "fhir"},
		RequestBody:     &policy.Body{Content: request, Present: true},
		ResponseHeaders: policy.NewHeaders(map[string][]string{"content-type": {contentType}}),
		ResponseBody:    &policy.Body{Content: response, Present: true},
		ResponseStatus:  200,
	}
	action := p.OnResponseBody(context.Background(), ctx, nil)
	mods, ok := action.(policy.DownstreamResponseModifications)
	if !ok {
		t.Fatalf("unexpected action %T", action)
	}
	if mods.Body == nil {
		return response, mods
	}
	return mods.Body, mods
}

// firstResource returns the FHIR document in the first text content item of a JSON-RPC response.
func resultOf(t *testing.T, body []byte) map[string]any {
	t.Helper()
	var msg map[string]any
	if err := json.Unmarshal(body, &msg); err != nil {
		t.Fatalf("response is not JSON: %v\n%s", err, body)
	}
	return msg["result"].(map[string]any)
}

func textItems(result map[string]any) []string {
	var out []string
	for _, item := range result["content"].([]any) {
		if m := item.(map[string]any); m["type"] == "text" {
			out = append(out, m["text"].(string))
		}
	}
	return out
}

func doc(t *testing.T, text string) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal([]byte(text), &m); err != nil {
		t.Fatalf("text is not JSON: %v\n%s", err, text)
	}
	return m
}

func entries(bundle map[string]any, resourceType string) []map[string]any {
	var out []map[string]any
	for _, e := range bundle["entry"].([]any) {
		r := e.(map[string]any)["resource"].(map[string]any)
		if r["resourceType"] == resourceType {
			out = append(out, r)
		}
	}
	return out
}

func labels(r map[string]any) map[string]bool {
	out := map[string]bool{}
	meta, _ := r["meta"].(map[string]any)
	sec, _ := meta["security"].([]any)
	for _, s := range sec {
		out[s.(map[string]any)["code"].(string)] = true
	}
	return out
}

func TestPatientFromTheFhirMcpServer(t *testing.T) {
	p := newPolicy(t, demoParams())
	raw := fixture(t, "patient-search.mcp.json")
	original := doc(t, textItems(resultOf(t, raw))[0])
	origPatient := entries(original, "Patient")[0]

	body, mods := respond(t, p, toolCall(3, "search", `{"type":"Patient","searchParam":{"_count":"1"}}`), raw, "application/json")
	patient := entries(doc(t, textItems(resultOf(t, body))[0]), "Patient")[0]

	if _, ok := patient["name"]; ok {
		t.Error("Patient.name was not removed")
	}
	addr := patient["address"].([]any)[0].(map[string]any)
	for _, k := range []string{"line", "city", "postalCode", "extension"} {
		if _, ok := addr[k]; ok {
			t.Errorf("Patient.address.%s was not removed", k)
		}
	}
	if addr["state"] != "MA" {
		t.Errorf("Patient.address.state should be kept, got %v", addr["state"])
	}
	for _, e := range patient["extension"].([]any) {
		if strings.Contains(e.(map[string]any)["url"].(string), "birthPlace") {
			t.Error("birthPlace extension was not removed")
		}
	}
	if len(patient["extension"].([]any)) != 3 {
		t.Errorf("race, ethnicity and birth sex extensions should be kept, got %d", len(patient["extension"].([]any)))
	}
	phone := patient["telecom"].([]any)[0].(map[string]any)["value"].(string)
	if phone != "********4926" {
		t.Errorf("phone masked as %q", phone)
	}
	if patient["birthDate"] != "1971" {
		t.Errorf("birthDate generalized to %v", patient["birthDate"])
	}
	mrn := patient["identifier"].([]any)[0].(map[string]any)["value"].(string)
	if !strings.HasPrefix(mrn, "h_") || len(mrn) != 18 || mrn != p.cfg.hash("MRN-201485") {
		t.Errorf("MRN hashed as %q", mrn)
	}
	if patient["gender"] != origPatient["gender"] || patient["id"] != origPatient["id"] {
		t.Error("gender and id must be kept")
	}
	want := map[string]bool{"REDACTED": true, "MASKED": true, "PSEUDED": true, "ABSTRED": true}
	if got := labels(patient); len(got) != 4 || !got["REDACTED"] || !got["MASKED"] || !got["PSEUDED"] || !got["ABSTRED"] {
		t.Errorf("security labels %v, want %v", got, want)
	}
	if strings.Contains(string(body), "Schmeler") || strings.Contains(string(body), "Ankunding") || strings.Contains(string(body), "555-291") {
		t.Error("PHI survived somewhere in the response")
	}
	if mods.AnalyticsMetadata["fhir_deidentify_resources"] != 2 { // the Bundle and its Patient
		t.Errorf("analytics %v", mods.AnalyticsMetadata)
	}
}

func TestHashIsStable(t *testing.T) {
	p := newPolicy(t, demoParams())
	if p.cfg.hash("MRN-1") != p.cfg.hash("MRN-1") || p.cfg.hash("MRN-1") == p.cfg.hash("MRN-2") {
		t.Fatal("hash must be stable per value and differ between values")
	}
	other := demoParams()
	other["hashKey"] = "another-key-0123456789"
	if newPolicy(t, other).cfg.hash("MRN-1") == p.cfg.hash("MRN-1") {
		t.Fatal("hash must depend on the key")
	}
}

func TestIncludedPatientAndAllowlist(t *testing.T) {
	p := newPolicy(t, demoParams())
	raw := fixture(t, "observation-include.mcp.json")
	body, _ := respond(t, p, toolCall(7, "search", `{"type":"Observation","searchParam":{"_include":"Observation:patient"}}`), raw, "application/json")
	bundle := doc(t, textItems(resultOf(t, body))[0])

	// The _include'd Patient gets the Patient rules.
	patient := entries(bundle, "Patient")[0]
	if _, ok := patient["name"]; ok {
		t.Error("included Patient kept its name")
	}
	// Observations keep only the allowlist (+ resourceType, id, meta).
	for _, obs := range entries(bundle, "Observation") {
		for k := range obs {
			switch k {
			case "resourceType", "id", "meta", "status", "category", "code", "valueQuantity", "valueCodeableConcept",
				"effectiveDateTime", "subject", "interpretation", "referenceRange":
			default:
				t.Errorf("Observation.%s survived the allowlist", k)
			}
		}
		if _, ok := obs["effectiveDateTime"]; !ok {
			t.Error("choice element effective[x] should be kept by Observation.effective")
		}
		if !labels(obs)["REDACTED"] {
			t.Error("pruned Observation not labelled REDACTED")
		}
	}
	// Unlisted types pass with the default scrubbing only.
	if len(entries(bundle, "Encounter")) != 2 {
		t.Error("Encounters should pass (defaultAccess allow)")
	}
}

func TestDeniedTypeInBundleAndDirectRead(t *testing.T) {
	p := newPolicy(t, demoParams())
	raw := fixture(t, "docref-search.mcp.json")
	body, mods := respond(t, p, toolCall(8, "search", `{"type":"DocumentReference"}`), raw, "application/json")
	result := resultOf(t, body)
	texts := textItems(result)
	bundle := doc(t, texts[0])
	if _, ok := bundle["entry"]; ok {
		t.Error("DocumentReference entries should be suppressed")
	}
	if !strings.Contains(texts[len(texts)-1], "DocumentReference resources are not available") {
		t.Errorf("missing withheld note: %v", texts)
	}
	if mods.AnalyticsMetadata["fhir_deidentify_suppressed"] != 1 {
		t.Errorf("analytics %v", mods.AnalyticsMetadata)
	}

	// A direct read of a denied type becomes an error result.
	read := `{"jsonrpc":"2.0","id":9,"result":{"content":[{"type":"text","text":"{\"resourceType\":\"DocumentReference\",\"id\":\"d1\",\"content\":[{\"attachment\":{\"data\":\"SGVsbG8=\"}}]}"}],"isError":false}}`
	body, _ = respond(t, p, toolCall(9, "read", `{"type":"DocumentReference","id":"d1"}`), []byte(read), "application/json")
	result = resultOf(t, body)
	if result["isError"] != true || strings.Contains(string(body), "SGVsbG8=") {
		t.Errorf("direct read of a denied type should be an error result: %s", body)
	}
}

func TestNarrativeDisplayContainedAndPrimitiveExtensions(t *testing.T) {
	p := newPolicy(t, demoParams())
	resource := `{"resourceType":"Condition","id":"c1",
	  "text":{"status":"generated","div":"<div>John Doe has diabetes</div>"},
	  "code":{"coding":[{"system":"http://snomed.info/sct","code":"44054006","display":"Diabetes mellitus type 2"}]},
	  "subject":{"reference":"Patient/p1","display":"John Doe"},
	  "asserter":{"display":"Dr. Jane Smith"},
	  "contained":[{"resourceType":"Patient","id":"p1","name":[{"family":"Doe"}],"birthDate":"1980-04-12","_birthDate":{"extension":[{"url":"x","valueString":"y"}]}}]}`
	msg := `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":` + quote(resource) + `}]}}`
	body, _ := respond(t, p, toolCall(1, "read", `{"type":"Condition","id":"c1"}`), []byte(msg), "application/json")
	cond := doc(t, textItems(resultOf(t, body))[0])

	if _, ok := cond["text"]; ok {
		t.Error("narrative survived")
	}
	if _, ok := cond["subject"].(map[string]any)["display"]; ok {
		t.Error("Reference.display survived")
	}
	if _, ok := cond["asserter"]; ok {
		t.Error("a display-only Reference should be removed entirely (it is left empty)")
	}
	if cond["code"].(map[string]any)["coding"].([]any)[0].(map[string]any)["display"] != "Diabetes mellitus type 2" {
		t.Error("Coding.display must be kept")
	}
	contained := cond["contained"].([]any)[0].(map[string]any)
	if _, ok := contained["name"]; ok {
		t.Error("contained Patient kept its name")
	}
	if contained["birthDate"] != "1980" {
		t.Errorf("contained birthDate %v", contained["birthDate"])
	}
	if strings.Contains(string(body), "John Doe") || strings.Contains(string(body), "Jane Smith") {
		t.Error("a name survived")
	}
}

func TestFailClosed(t *testing.T) {
	p := newPolicy(t, demoParams())
	msg := `{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"{\"resourceType\":\"Patient\",\"name\":[{\"family\":\"Doe\""}]}}`
	body, _ := respond(t, p, toolCall(1, "read", `{"type":"Patient","id":"p"}`), []byte(msg), "application/json")
	result := resultOf(t, body)
	if result["isError"] != true || strings.Contains(string(body), "Doe") {
		t.Errorf("malformed FHIR JSON must be withheld: %s", body)
	}

	// A body that is not JSON at all: every request gets an error result.
	body, mods := respond(t, p, toolCall(5, "read", `{"type":"Patient","id":"p"}`), []byte("<html>oops Doe</html>"), "application/json")
	if strings.Contains(string(body), "Doe") || mods.AnalyticsMetadata["fhir_deidentify_withheld"] != 1 {
		t.Errorf("unparseable body must be withheld: %s", body)
	}
	if resultOf(t, body)["isError"] != true {
		t.Error("withheld body should be an error result")
	}
}

func TestEventStream(t *testing.T) {
	p := newPolicy(t, demoParams())
	raw := fixture(t, "patient-search.mcp.json")
	var compact map[string]any
	_ = json.Unmarshal(raw, &compact)
	line, _ := json.Marshal(compact)
	sse := "event: message\r\nid: 42\r\ndata: " + string(line) + "\r\n\r\n"
	body, _ := respond(t, p, toolCall(3, "search", `{"type":"Patient"}`), []byte(sse), "text/event-stream")
	s := string(body)
	if !strings.HasPrefix(s, "event: message\nid: 42\ndata: ") {
		t.Errorf("event fields not preserved: %.80s", s)
	}
	if strings.Contains(s, "Schmeler") || !strings.Contains(s, "********4926") {
		t.Error("event-stream result not de-identified")
	}
}

func TestOnlyToolResultsAreTouched(t *testing.T) {
	params := demoParams()
	params["tools"] = []interface{}{"search", "read"}
	p := newPolicy(t, params)
	raw := fixture(t, "patient-search.mcp.json")

	// A tool outside the list passes untouched.
	_, mods := respond(t, p, toolCall(3, "get_capabilities", `{"type":"Patient"}`), raw, "application/json")
	if mods.Body != nil {
		t.Error("results of tools outside the list must pass untouched")
	}
	// tools/list passes untouched.
	list := []byte(`{"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"search"}]}}`)
	_, mods = respond(t, p, []byte(`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`), list, "application/json")
	if mods.Body != nil {
		t.Error("tools/list must pass untouched")
	}
	// JSON that holds no FHIR (e.g. PubMed results) keeps its exact bytes.
	pubmed := []byte(`{"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"{\"count\": 2, \"articles\": []}"}]}}`)
	_, mods = respond(t, p, toolCall(4, "search", `{"query":"x"}`), pubmed, "application/json")
	if mods.Body != nil {
		t.Error("non-FHIR JSON must pass untouched")
	}
}

func TestNonJsonContent(t *testing.T) {
	msg := []byte(`{"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Patient John Doe, born 1980-04-12"}]}}`)
	p := newPolicy(t, demoParams())
	if _, mods := respond(t, p, toolCall(1, "read", `{}`), msg, "application/json"); mods.Body != nil {
		t.Error("non-JSON text passes by default")
	}
	params := demoParams()
	params["nonJsonContent"] = "block"
	body, _ := respond(t, newPolicy(t, params), toolCall(1, "read", `{}`), msg, "application/json")
	if strings.Contains(string(body), "John Doe") {
		t.Error("nonJsonContent: block must withhold plain text")
	}
}

func request(t *testing.T, p *Policy, body []byte) policy.RequestAction {
	t.Helper()
	ctx := &policy.RequestContext{
		SharedContext: &policy.SharedContext{APIName: "fhir"},
		Headers:       policy.NewHeaders(map[string][]string{"accept": {"application/json, text/event-stream"}}),
		Body:          &policy.Body{Content: body, Present: true},
	}
	return p.OnRequestBody(context.Background(), ctx, nil)
}

func TestGuardedSearches(t *testing.T) {
	p := newPolicy(t, demoParams())
	refused := []string{
		`{"type":"Patient","searchParam":{"family":"Doe"}}`,
		`{"type":"Patient","searchParam":{"family:exact":"Doe"}}`,
		`{"type":"Patient","searchParam":{"NAME":"Doe"}}`,
		`{"type":"Patient","searchParam":{"_text":"Doe"}}`,
		`{"type":"Patient","searchParam":"family=Doe&_count=1"}`,
		`{"type":"Patient","searchParam":"Patient?birthdate=1980-04-12"}`,
		`{"type":"Observation","searchParam":{"subject:Patient.name":"Doe"}}`,
		`{"type":"Observation","searchParam":{"patient.family":"Doe"}}`,
		`{"type":"Observation","searchParam":{"_filter":"subject.name eq Doe"}}`,
		`{"type":"DocumentReference","searchParam":{"patient":"p1"}}`,
	}
	for _, args := range refused {
		action := request(t, p, toolCall(1, "search", args))
		resp, ok := action.(policy.ImmediateResponse)
		if !ok {
			t.Errorf("should be refused: %s", args)
			continue
		}
		if resultOf(t, resp.Body)["isError"] != true || resp.StatusCode != 200 {
			t.Errorf("refusal should be a JSON-RPC error result: %s", resp.Body)
		}
	}
	allowed := []string{
		`{"type":"Patient","searchParam":{"_id":"p1"}}`,
		`{"type":"Observation","searchParam":{"patient":"p1","code":"4548-4","_sort":"-date"}}`,
		`{"type":"Observation","searchParam":{"_has:Group:member:_id":"g1"}}`,
		`{"type":"Patient"}`,
	}
	for _, args := range allowed {
		if _, ok := request(t, p, toolCall(1, "search", args)).(policy.ImmediateResponse); ok {
			t.Errorf("should be allowed: %s", args)
		}
	}
	// A batch with one refused call is refused as a whole.
	batch := []byte("[" + string(toolCall(1, "search", `{"type":"Patient","searchParam":{"family":"Doe"}}`)) + "," +
		string(toolCall(2, "search", `{"type":"Observation","searchParam":{"patient":"p1"}}`)) + "]")
	resp, ok := request(t, p, batch).(policy.ImmediateResponse)
	if !ok {
		t.Fatal("batch should be refused")
	}
	var replies []map[string]any
	if err := json.Unmarshal(resp.Body, &replies); err != nil || len(replies) != 2 {
		t.Fatalf("every request in the batch needs a reply: %s", resp.Body)
	}
}

func TestConfigValidation(t *testing.T) {
	bad := []string{
		`{"resources":[{"type":"Patient","rules":[{"fhirPaths":["Observation.code"],"operation":"redact"}]}]}`,
		`{"resources":[{"type":"Patient","rules":[{"fhirPaths":["Patient.name"],"operation":"shred"}]}]}`,
		`{"resources":[{"type":"Patient","rules":[{"fhirPaths":["Patient.identifier.value"],"operation":"hash"}]}]}`,
		`{"resources":[{"type":"Patient","rules":[{"fhirPaths":["Patient.name.where(use = official)"],"operation":"redact"}]}]}`,
		`{"resources":[{"type":"Patient","rules":[{"fhirPaths":["Patient"],"operation":"redact"}]}]}`,
		`{"resources":[{"type":"Patient"},{"type":"Patient"}]}`,
		`{"defaultAccess":"maybe"}`,
	}
	for _, src := range bad {
		var m map[string]interface{}
		_ = json.Unmarshal([]byte(src), &m)
		if _, err := GetPolicy(policy.PolicyMetadata{}, m); err == nil {
			t.Errorf("should be rejected: %s", src)
		}
	}
}

func TestFhirPathSubset(t *testing.T) {
	var res map[string]any
	_ = json.Unmarshal([]byte(`{"resourceType":"Observation",
	  "valueQuantity":{"value":5.4,"unit":"%"},
	  "component":[{"code":{"text":"a"},"valueString":"x"},{"code":{"text":"b"},"valueQuantity":{"value":1}}],
	  "identifier":[{"system":"s1","value":"v1","use":"official"},{"system":"s2","value":"v2"}]}`), &res)
	cases := map[string]int{
		"Observation.value":                                            1,
		"Observation.value.ofType(Quantity)":                           1,
		"Observation.value.ofType(String)":                             0,
		"Observation.value.ofType(string)":                             0,
		"Observation.component.value.ofType(string)":                   1,
		"Observation.component.value":                                  2,
		"Observation.component.where(code.text = 'b').value":           1,
		"Observation.identifier.where(system = 's1' and use.exists())": 1,
		"Observation.identifier.where(system = 's1' or system = 's2')": 2,
		"Observation.identifier.where(system != 's1').value":           1,
		"Observation.identifier[1].value":                              1,
		"Observation.identifier.first().value":                         1,
		"Observation.valueQuantity.value":                              1,
		"Observation.missing.value":                                    0,
	}
	for src, want := range cases {
		p, err := compilePath(src)
		if err != nil {
			t.Errorf("%s: %v", src, err)
			continue
		}
		if got := len(p.selectFrom(res)); got != want {
			t.Errorf("%s selected %d, want %d", src, got, want)
		}
	}
}

// TestConfigFile validates a deployment's configuration (scripts/amp-gateway.sh points it at
// amp/fhir-deidentify.json), so a bad FHIRPath fails the build instead of the gateway deployment.
func TestConfigFile(t *testing.T) {
	path := os.Getenv("MCP_FHIR_DEIDENTIFY_CONFIG")
	if path == "" {
		t.Skip("MCP_FHIR_DEIDENTIFY_CONFIG not set")
	}
	var params map[string]interface{}
	if err := json.Unmarshal(fixtureAt(t, path), &params); err != nil {
		t.Fatalf("%s: %v", path, err)
	}
	params["hashKey"] = "validation-only-key-0123456789"
	p := newPolicy(t, params)
	// The configuration must still de-identify the Patient from the FHIR MCP server.
	body, _ := respond(t, p, toolCall(3, "search", `{"type":"Patient"}`), fixture(t, "patient-search.mcp.json"), "application/json")
	if strings.Contains(string(body), "Schmeler") || strings.Contains(string(body), "1971-10-12") {
		t.Errorf("%s leaves the patient's name or birth date in place", path)
	}
}

func fixtureAt(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func quote(s string) string { b, _ := json.Marshal(s); return string(b) }
