// Package mcpfhirdeidentify is the mcp-fhir-deidentify gateway policy: FHIR-aware de-identification of
// MCP tool results, enforced on a path the agent cannot influence. See policy-definition.yaml.
package mcpfhirdeidentify

import (
	"context"
	"log/slog"
	"strings"

	policy "github.com/wso2/api-platform/sdk/core/policy/v1alpha2"
)

type Policy struct {
	cfg *config
}

func GetPolicy(metadata policy.PolicyMetadata, params map[string]interface{}) (policy.Policy, error) {
	cfg, err := parseConfig(params)
	if err != nil {
		slog.Error("mcp-fhir-deidentify: invalid configuration", "api", metadata.APIName, "error", err)
		return nil, err
	}
	return &Policy{cfg: cfg}, nil
}

func (p *Policy) Mode() policy.ProcessingMode {
	return policy.ProcessingMode{
		RequestHeaderMode:  policy.HeaderModeSkip,
		RequestBodyMode:    policy.BodyModeBuffer, // refuse guarded searches; know which tool a result belongs to
		ResponseHeaderMode: policy.HeaderModeSkip,
		ResponseBodyMode:   policy.BodyModeBuffer, // FHIR has to be parsed whole
	}
}

func (p *Policy) OnRequestBody(_ context.Context, reqCtx *policy.RequestContext, _ map[string]interface{}) policy.RequestAction {
	if reqCtx.Body == nil || len(reqCtx.Body.Content) == 0 {
		return policy.UpstreamRequestModifications{}
	}
	denials := p.cfg.checkRequest(reqCtx.Body.Content)
	if len(denials) == 0 {
		return policy.UpstreamRequestModifications{}
	}
	accept := strings.ToLower(strings.Join(reqCtx.Headers.Get("accept"), ","))
	eventStream := !strings.Contains(accept, "application/json") && strings.Contains(accept, "text/event-stream")
	body, contentType := refusal(denials, eventStream)
	slog.Info("mcp-fhir-deidentify: refused a tool call", "api", reqCtx.APIName, "reason", denials[0].reason)
	return policy.ImmediateResponse{
		StatusCode:        200,
		Headers:           map[string]string{"Content-Type": contentType},
		Body:              body,
		AnalyticsMetadata: map[string]any{"fhir_deidentify_refused_calls": len(denials)},
	}
}

func (p *Policy) OnResponseBody(_ context.Context, respCtx *policy.ResponseContext, _ map[string]interface{}) policy.ResponseAction {
	if respCtx.ResponseStatus < 200 || respCtx.ResponseStatus > 299 ||
		respCtx.ResponseBody == nil || len(respCtx.ResponseBody.Content) == 0 {
		return policy.DownstreamResponseModifications{}
	}
	var reqs map[string]requestInfo
	if respCtx.RequestBody != nil {
		reqs = requestIndex(respCtx.RequestBody.Content)
	}
	contentType := strings.Join(respCtx.ResponseHeaders.Get("content-type"), ",")

	st := newStats()
	out, err := p.cfg.transformBody(respCtx.ResponseBody.Content, contentType, reqs, st)
	if err != nil {
		// Fail closed: the agent gets an error result, never the unprocessed data.
		slog.Warn("mcp-fhir-deidentify: withholding a response it could not process", "api", respCtx.APIName, "error", err)
		return withholdAll(reqs, contentType, err.Error())
	}
	if out == nil {
		return policy.DownstreamResponseModifications{}
	}
	return policy.DownstreamResponseModifications{
		Body:              out,
		HeadersToRemove:   []string{"content-length"},
		AnalyticsMetadata: analytics(st),
	}
}

// withholdAll replaces an unparseable response with an error result for each request in the call.
func withholdAll(reqs map[string]requestInfo, contentType, reason string) policy.ResponseAction {
	var denials []denial
	for id := range reqs {
		v, err := decodeJSON([]byte(id))
		if err == nil {
			denials = append(denials, denial{v, "the response could not be processed (" + reason + ")."})
		}
	}
	if len(denials) == 0 {
		denials = []denial{{nil, "the response could not be processed (" + reason + ")."}}
	}
	body, ct := refusal(denials, strings.Contains(strings.ToLower(contentType), "text/event-stream"))
	return policy.DownstreamResponseModifications{
		Body:              body,
		HeadersToSet:      map[string]string{"Content-Type": ct},
		HeadersToRemove:   []string{"content-length"},
		AnalyticsMetadata: map[string]any{"fhir_deidentify_withheld": 1},
	}
}

func analytics(st *stats) map[string]any {
	m := map[string]any{
		"fhir_deidentify_resources":  st.resources,
		"fhir_deidentify_changed":    st.changed,
		"fhir_deidentify_suppressed": st.suppressed,
	}
	for op, n := range st.operations {
		m["fhir_deidentify_"+op] = n
	}
	return m
}
