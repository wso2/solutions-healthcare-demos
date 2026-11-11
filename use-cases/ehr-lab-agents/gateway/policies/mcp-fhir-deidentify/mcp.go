package mcpfhirdeidentify

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/url"
	"sort"
	"strings"
	"unicode"
)

const withheldPrefix = "Withheld by the FHIR de-identification policy (mcp-fhir-deidentify): "

type requestInfo struct {
	method string
	tool   string
}

func decodeJSON(b []byte) (any, error) {
	dec := json.NewDecoder(bytes.NewReader(b))
	dec.UseNumber() // keep FHIR decimals exactly as sent
	var v any
	if err := dec.Decode(&v); err != nil {
		return nil, err
	}
	if dec.More() {
		return nil, fmt.Errorf("trailing data after JSON value")
	}
	return v, nil
}

func encodeJSON(v any) ([]byte, error) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		return nil, err
	}
	return bytes.TrimRight(buf.Bytes(), "\n"), nil
}

func idKey(id any) string {
	b, _ := json.Marshal(id)
	return string(b)
}

// messages returns the JSON-RPC messages in a body (a single message or a batch).
func messages(v any) []map[string]any {
	switch x := v.(type) {
	case map[string]any:
		return []map[string]any{x}
	case []any:
		var out []map[string]any
		for _, item := range x {
			if m, ok := item.(map[string]any); ok {
				out = append(out, m)
			}
		}
		return out
	}
	return nil
}

// requestIndex maps JSON-RPC request ids to the method and tool they called.
func requestIndex(body []byte) map[string]requestInfo {
	idx := map[string]requestInfo{}
	v, err := decodeJSON(body)
	if err != nil {
		return idx
	}
	for _, m := range messages(v) {
		id, hasID := m["id"]
		method, _ := m["method"].(string)
		if !hasID || method == "" {
			continue
		}
		info := requestInfo{method: method}
		if params, ok := m["params"].(map[string]any); ok {
			info.tool, _ = params["name"].(string)
		}
		idx[idKey(id)] = info
	}
	return idx
}

// ── responses ───────────────────────────────────────────────────────────────────────────────────

// transformBody de-identifies a JSON or event-stream MCP response. It returns nil when nothing changed.
func (c *config) transformBody(body []byte, contentType string, reqs map[string]requestInfo, st *stats) ([]byte, error) {
	if strings.Contains(strings.ToLower(contentType), "text/event-stream") {
		return c.transformEventStream(body, reqs, st)
	}
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return nil, nil
	}
	v, err := decodeJSON(trimmed)
	if err != nil {
		return nil, fmt.Errorf("response is not JSON: %w", err)
	}
	changed := false
	for _, m := range messages(v) {
		if c.transformMessage(m, reqs, st) {
			changed = true
		}
	}
	if !changed {
		return nil, nil
	}
	return encodeJSON(v)
}

func (c *config) transformEventStream(body []byte, reqs map[string]requestInfo, st *stats) ([]byte, error) {
	text := strings.ReplaceAll(string(body), "\r\n", "\n")
	events := strings.Split(text, "\n\n")
	changed := false
	for i, ev := range events {
		if strings.TrimSpace(ev) == "" {
			continue
		}
		var other, data []string
		for _, line := range strings.Split(ev, "\n") {
			if rest, ok := strings.CutPrefix(line, "data:"); ok {
				data = append(data, strings.TrimPrefix(rest, " "))
			} else {
				other = append(other, line)
			}
		}
		if len(data) == 0 {
			continue
		}
		payload := strings.Join(data, "\n")
		v, err := decodeJSON([]byte(payload))
		if err != nil {
			return nil, fmt.Errorf("event %d is not JSON: %w", i, err)
		}
		evChanged := false
		for _, m := range messages(v) {
			if c.transformMessage(m, reqs, st) {
				evChanged = true
			}
		}
		if !evChanged {
			continue
		}
		out, err := encodeJSON(v)
		if err != nil {
			return nil, err
		}
		events[i] = strings.Join(append(other, "data: "+string(out)), "\n")
		changed = true
	}
	if !changed {
		return nil, nil
	}
	return []byte(strings.Join(events, "\n\n")), nil
}

// transformMessage de-identifies one JSON-RPC response; a result it cannot process is replaced by
// an error result (fail closed).
func (c *config) transformMessage(m map[string]any, reqs map[string]requestInfo, st *stats) bool {
	result, ok := m["result"].(map[string]any)
	if !ok {
		return false
	}
	if info, known := reqs[idKey(m["id"])]; known {
		switch info.method {
		case "tools/call":
			if !c.appliesTo(info.tool) {
				return false
			}
		case "resources/read":
		default:
			return false // initialize, tools/list, prompts/get, ...
		}
	}
	_, hasContent := result["content"]
	_, hasContents := result["contents"]
	_, hasStructured := result["structuredContent"]
	if !hasContent && !hasContents && !hasStructured {
		return false
	}
	changed, err := c.transformResult(result, st)
	if err != nil {
		m["result"] = withheldResult(err.Error())
		st.operations["withheld"]++
		return true
	}
	return changed
}

func withheldResult(reason string) map[string]any {
	return map[string]any{
		"content": []any{map[string]any{"type": "text", "text": withheldPrefix + reason}},
		"isError": true,
	}
}

func (c *config) transformResult(result map[string]any, st *stats) (changed bool, err error) {
	defer func() {
		if r := recover(); r != nil {
			err = fmt.Errorf("the result could not be processed")
		}
	}()
	deniedTypes := map[string]bool{}
	remaining := 0

	for _, field := range []string{"content", "contents"} {
		raw, ok := result[field]
		if !ok {
			continue
		}
		items, ok := raw.([]any)
		if !ok {
			return false, fmt.Errorf("%s is not an array", field)
		}
		kept := make([]any, 0, len(items))
		for _, item := range items {
			m, ok := item.(map[string]any)
			if !ok {
				return false, fmt.Errorf("unexpected %s item", field)
			}
			keep, itemChanged, denied, err := c.transformItem(m, field == "contents", st)
			if err != nil {
				return false, err
			}
			for t := range denied {
				deniedTypes[t] = true
			}
			if itemChanged || !keep {
				changed = true
			}
			if keep {
				kept = append(kept, m)
				remaining++
			}
		}
		result[field] = kept
	}

	if sc, ok := result["structuredContent"]; ok {
		snapshot := deniedSnapshot(st)
		out, saw, rootDenied := c.processDocument(sc, st)
		for t := range deniedSince(st, snapshot) {
			deniedTypes[t] = true
		}
		switch {
		case rootDenied:
			delete(result, "structuredContent")
			changed = true
		case saw:
			result["structuredContent"] = out
			changed = true
		}
	}
	if len(deniedTypes) > 0 {
		types := make([]string, 0, len(deniedTypes))
		for t := range deniedTypes {
			types = append(types, t)
		}
		sort.Strings(types)
		note := map[string]any{"type": "text", "text": withheldPrefix + strings.Join(types, ", ") + " resources are not available to agents."}
		if content, ok := result["content"].([]any); ok {
			result["content"] = append(content, note)
		}
		if remaining == 0 {
			result["isError"] = true
		}
		changed = true
	}
	return changed, nil
}

// transformItem handles one content item (tools/call) or contents item (resources/read).
func (c *config) transformItem(m map[string]any, isContents bool, st *stats) (keep, changed bool, denied map[string]bool, err error) {
	target := m // where text/blob live
	if !isContents {
		switch m["type"] {
		case "text":
		case "resource":
			r, ok := m["resource"].(map[string]any)
			if !ok {
				return false, false, nil, fmt.Errorf("embedded resource without a body")
			}
			target = r
		default: // image, audio, resource_link: nothing to inspect as FHIR
			if c.blockNonJSON {
				return false, true, nil, nil
			}
			return true, false, nil, nil
		}
	}

	if text, ok := target["text"].(string); ok {
		out, ch, rootDenied, deniedTypes, err := c.transformText(text, st)
		if err != nil {
			return false, false, nil, err
		}
		if rootDenied {
			return false, true, deniedTypes, nil
		}
		if ch {
			target["text"] = out
		}
		return true, ch, deniedTypes, nil
	}
	if blob, ok := target["blob"].(string); ok {
		mime, _ := target["mimeType"].(string)
		if !strings.Contains(mime, "json") {
			if c.blockNonJSON {
				return false, true, nil, nil
			}
			return true, false, nil, nil
		}
		raw, err := base64.StdEncoding.DecodeString(blob)
		if err != nil {
			return false, false, nil, fmt.Errorf("embedded blob is not base64")
		}
		out, ch, rootDenied, deniedTypes, err := c.transformText(string(raw), st)
		if err != nil {
			return false, false, nil, err
		}
		if rootDenied {
			return false, true, deniedTypes, nil
		}
		if ch {
			target["blob"] = base64.StdEncoding.EncodeToString([]byte(out))
		}
		return true, ch, deniedTypes, nil
	}
	return true, false, nil, nil
}

// transformText de-identifies the FHIR JSON in a text value. Text that is not JSON is passed through
// or withheld per nonJsonContent; JSON that does not parse fails closed.
func (c *config) transformText(text string, st *stats) (out string, changed, rootDenied bool, denied map[string]bool, err error) {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" || (trimmed[0] != '{' && trimmed[0] != '[') {
		if c.blockNonJSON && trimmed != "" {
			return withheldPrefix + "non-JSON content cannot be inspected for PHI.", true, false, nil, nil
		}
		return text, false, false, nil, nil
	}
	v, err := decodeJSON([]byte(trimmed))
	if err != nil {
		return "", false, false, nil, fmt.Errorf("a tool result looked like JSON but did not parse")
	}
	snapshot := deniedSnapshot(st)
	doc, saw, isDenied := c.processDocument(v, st)
	denied = deniedSince(st, snapshot)
	if isDenied {
		return "", true, true, denied, nil
	}
	if !saw {
		return text, false, false, denied, nil
	}
	b, err := encodeJSON(doc)
	if err != nil {
		return "", false, false, nil, err
	}
	return string(b), true, false, denied, nil
}

// deniedSnapshot and deniedSince attribute suppressed types to one document (stats span a whole body).
func deniedSnapshot(st *stats) map[string]int {
	snap := make(map[string]int, len(st.denied))
	for t, n := range st.denied {
		snap[t] = n
	}
	return snap
}

func deniedSince(st *stats, snapshot map[string]int) map[string]bool {
	out := map[string]bool{}
	for t, n := range st.denied {
		if n > snapshot[t] {
			out[t] = true
		}
	}
	return out
}

// ── requests ────────────────────────────────────────────────────────────────────────────────────

type denial struct {
	id     any
	reason string
}

// checkRequest returns the tool calls that search on guarded fields or ask for a denied type.
func (c *config) checkRequest(body []byte) []denial {
	v, err := decodeJSON(body)
	if err != nil {
		return nil
	}
	var out []denial
	msgs := messages(v)
	for _, m := range msgs {
		if m["method"] != "tools/call" {
			continue
		}
		params, _ := m["params"].(map[string]any)
		tool, _ := params["name"].(string)
		if !c.appliesTo(tool) {
			continue
		}
		args, _ := params["arguments"].(map[string]any)
		typ, _ := args[c.typeArgument].(string)
		if typ != "" {
			if rc := c.resources[typ]; (rc != nil && rc.deny) || (rc == nil && c.defaultDeny) {
				out = append(out, denial{m["id"], typ + " resources are not available to agents."})
				continue
			}
		}
		for _, name := range searchParamNames(args[c.searchArgument]) {
			if reason := c.deniedParam(typ, name); reason != "" {
				out = append(out, denial{m["id"], reason})
				break
			}
		}
	}
	// A batch is refused as a whole: every request in it gets a reply, none reaches the server.
	if len(out) > 0 && len(msgs) > 1 {
		refused := map[string]bool{}
		for _, d := range out {
			refused[idKey(d.id)] = true
		}
		for _, m := range msgs {
			if id, ok := m["id"]; ok && !refused[idKey(id)] {
				out = append(out, denial{id, "the batch was refused because another call in it was refused."})
			}
		}
	}
	return out
}

func searchParamNames(raw any) []string {
	switch x := raw.(type) {
	case map[string]any:
		names := make([]string, 0, len(x))
		for k := range x {
			names = append(names, k)
		}
		sort.Strings(names)
		return names
	case string:
		q := x
		if i := strings.IndexByte(q, '?'); i >= 0 {
			q = q[i+1:]
		}
		var names []string
		for _, pair := range strings.Split(q, "&") {
			if pair == "" {
				continue
			}
			name, _, _ := strings.Cut(pair, "=")
			if dec, err := url.QueryUnescape(name); err == nil {
				name = dec
			}
			names = append(names, name)
		}
		return names
	}
	return nil
}

func (c *config) denies(typ, param string) bool {
	param = strings.ToLower(param)
	if typ == "" {
		return c.guardedParams[param]
	}
	rc := c.resources[typ]
	return rc != nil && rc.denySearchParams[param]
}

func isTypeName(s string) bool { return s != "" && unicode.IsUpper(rune(s[0])) }

// deniedParam checks one search parameter, including modifiers (family:exact), chains
// (subject:Patient.name, patient.family) and reverse chains (_has:Observation:patient:code).
func (c *config) deniedParam(typ, raw string) string {
	refuse := func(t, p string) string {
		if t == "" {
			return fmt.Sprintf("searching by '%s' is not permitted (it identifies the patient).", p)
		}
		return fmt.Sprintf("searching %s by '%s' is not permitted (it identifies the patient).", t, p)
	}

	if strings.HasPrefix(raw, "_has:") {
		parts := strings.Split(raw, ":")
		for len(parts) >= 4 && parts[0] == "_has" {
			target, rest := parts[1], parts[3:]
			if rest[0] == "_has" {
				parts = rest
				continue
			}
			name, _, _ := strings.Cut(rest[0], ".")
			if c.denies(target, name) {
				return refuse(target, name)
			}
			break
		}
		return ""
	}

	segments := strings.Split(raw, ".")
	name, modifier, _ := strings.Cut(segments[0], ":")
	lname := strings.ToLower(name)
	if c.denies(typ, name) {
		return refuse(typ, name)
	}
	if rc := c.resources[typ]; rc != nil && len(rc.denySearchParams) > 0 && (lname == "_text" || lname == "_content") {
		return refuse(typ, name)
	}
	if lname == "_filter" && len(c.guardedParams) > 0 {
		return refuse(typ, name)
	}
	// Chained parameters: the target type is the modifier when it names one, otherwise unknown,
	// in which case every guarded parameter of every type counts.
	target := ""
	if isTypeName(modifier) {
		target = modifier
	}
	for _, seg := range segments[1:] {
		segName, segModifier, _ := strings.Cut(seg, ":")
		if c.denies(target, segName) {
			return refuse(target, segName)
		}
		target = ""
		if isTypeName(segModifier) {
			target = segModifier
		}
	}
	return ""
}

// refusal builds the tool result for refused calls: a JSON-RPC result with isError, so the agent
// sees why and can work without the guarded search.
func refusal(denials []denial, eventStream bool) ([]byte, string) {
	var replies []any
	for _, d := range denials {
		replies = append(replies, map[string]any{"jsonrpc": "2.0", "id": d.id, "result": withheldResult(d.reason)})
	}
	var payload any = replies[0]
	if len(replies) > 1 {
		payload = replies
	}
	b, _ := encodeJSON(payload)
	if eventStream {
		return []byte("event: message\ndata: " + string(b) + "\n\n"), "text/event-stream"
	}
	return b, "application/json"
}
