# mcp-fhir-deidentify

FHIR-aware de-identification of MCP tool results for the WSO2 API Platform gateway (Categories: MCP,
Guardrails · Flow: response, with a request-side search check · Applies to: `kind: Mcp`).

FHIR MCP servers return whole FHIR resources to the agent. This policy applies operator rules per resource
type to every FHIR resource in `tools/call` and `resources/read` results (`content[].text`, embedded
resources, `structuredContent`; JSON and event-stream responses; Bundle entries, `_include`d and contained
resources), on a path the agent cannot influence. Parameters and their meaning: `policy-definition.yaml`.

```yaml
policies:
  - name: mcp-fhir-deidentify
    version: v0
    params:
      resources:
        - type: Patient
          rules:
            - { fhirPaths: [Patient.name, Patient.address.line], operation: redact }
            - { fhirPaths: ["Patient.telecom.where(system='phone').value"], operation: mask }
            - { fhirPaths: [Patient.birthDate], operation: generalize }
            - { fhirPaths: [Patient.identifier.value], operation: hash }
          denySearchParams: [name, family, given, phone, address, birthdate, identifier]
        - type: Observation
          include: [Observation.code, Observation.value, Observation.effective, Observation.subject]
        - { type: DocumentReference, access: deny }
```

The `hash` key is a system parameter: `policy_configurations.mcpfhirdeidentify_v0.hash_key` in the gateway
config. Fails closed: anything it cannot process becomes an `isError` result.

| File | |
|---|---|
| `policy.go` | `GetPolicy`, processing mode, request (search refusal) and response hooks |
| `mcp.go` | JSON-RPC / event-stream envelopes, content items, refusals |
| `deidentify.go` | per-resource processing: access, allowlist, rules, narrative/display, security labels |
| `fhirpath.go` | the FHIRPath subset, evaluated to writable locations |
| `config.go` | parameter parsing and validation (at deploy time) |
| `policy_test.go`, `testdata/` | tests against real WSO2 FHIR MCP server responses (Synthea data) |

```bash
go test ./...                                                    # Go 1.26, sdk/core v0.3.3 (gateway 1.2.1)
MCP_FHIR_DEIDENTIFY_CONFIG=../../../amp/fhir-deidentify.json go test -run TestConfigFile ./...
```
