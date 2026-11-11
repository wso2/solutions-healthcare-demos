package mcpfhirdeidentify

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// HL7 v3 ObservationValue security labels for the alteration made to a resource.
const labelSystem = "http://terminology.hl7.org/CodeSystem/v3-ObservationValue"

var labelDisplay = map[string]string{
	"REDACTED": "redacted",
	"MASKED":   "masked",
	"PSEUDED":  "pseudonymized",
	"ABSTRED":  "abstracted",
}

// removed marks an element for deletion; sweep() takes it out together with containers it empties.
type tombstone struct{}

var removed = &tombstone{}

var fhirDate = regexp.MustCompile(`^\d{4}(-\d{2}(-\d{2}(T[0-9:.]+(Z|[+-]\d{2}:\d{2})?)?)?)?$`)

type stats struct {
	resources  int
	changed    int
	suppressed int
	denied     map[string]int // suppressed resources per type
	operations map[string]int
}

func newStats() *stats {
	return &stats{denied: map[string]int{}, operations: map[string]int{}}
}

// processDocument de-identifies every FHIR resource in a JSON value. It reports whether the value
// held any resource (if not, the caller keeps the original bytes) and whether the root itself was
// a suppressed resource.
func (c *config) processDocument(root any, st *stats) (out any, sawResources bool, rootDenied bool) {
	before := st.resources
	out = c.walk(root, st)
	if out == removed {
		return nil, true, true
	}
	if st.resources == before {
		return root, false, false
	}
	out, _ = sweep(out)
	return out, true, false
}

func (c *config) walk(v any, st *stats) any {
	switch x := v.(type) {
	case map[string]any:
		if rt, ok := x["resourceType"].(string); ok && rt != "" {
			return c.processResource(rt, x, st)
		}
		for k, child := range x {
			x[k] = c.walk(child, st)
		}
	case []any:
		for i := range x {
			x[i] = c.walk(x[i], st)
		}
	}
	return v
}

func (c *config) processResource(rt string, res map[string]any, st *stats) any {
	st.resources++
	rc := c.resources[rt]
	if (rc != nil && rc.deny) || (rc == nil && c.defaultDeny) {
		st.suppressed++
		st.denied[rt]++
		return removed
	}
	effects := map[string]bool{}

	if rc != nil && len(rc.include) > 0 {
		var pruned bool
		res, pruned = prune(res, rc.include)
		if pruned {
			effects["REDACTED"] = true
			st.operations["include"]++
		}
	}
	if rc != nil {
		for _, r := range rc.rules {
			c.applyRule(res, r, effects, st)
		}
	}
	if c.redactNarrative {
		if _, ok := res["text"].(map[string]any); ok {
			delete(res, "text")
			effects["REDACTED"] = true
			st.operations["narrative"]++
		}
	}
	// Nested resources (Bundle entries, contained, Parameters) are processed on their own rules.
	for k, child := range res {
		if k != "resourceType" && k != "meta" {
			res[k] = c.walk(child, st)
		}
	}
	if c.redactReferenceDisplay {
		if n := dropDisplays(res, true); n > 0 {
			effects["REDACTED"] = true
			st.operations["display"] += n
		}
	}
	if len(effects) > 0 {
		st.changed++
		if c.securityLabels {
			addLabels(res, effects)
		}
	}
	return res
}

func (c *config) applyRule(res map[string]any, r rule, effects map[string]bool, st *stats) {
	for _, p := range r.paths {
		for _, loc := range p.selectFrom(res) {
			cur := loc.value()
			if cur == removed {
				continue
			}
			op := r.op
			var replacement any
			switch op {
			case opMask:
				if s, ok := cur.(string); ok {
					replacement = mask(s, r.keepLast)
				}
			case opHash:
				if s, ok := cur.(string); ok {
					replacement = c.hash(s)
				}
			case opGeneralize:
				if g, ok := generalize(cur, r.precision); ok {
					replacement = g
				}
			}
			// Anything mask, hash or generalize cannot handle is removed, never passed through.
			if replacement == nil {
				op = opRedact
				replacement = removed
				if loc.index < 0 {
					delete(loc.parent.(map[string]any), "_"+loc.key)
				}
			}
			loc.set(replacement)
			effects[map[operation]string{opRedact: "REDACTED", opMask: "MASKED", opHash: "PSEUDED", opGeneralize: "ABSTRED"}[op]] = true
			st.operations[string(op)]++
		}
	}
}

func mask(s string, keepLast int) string {
	r := []rune(s)
	if len(r) <= keepLast {
		return strings.Repeat("*", len(r))
	}
	return strings.Repeat("*", len(r)-keepLast) + string(r[len(r)-keepLast:])
}

func (c *config) hash(s string) string {
	h := hmac.New(sha256.New, c.hashKey)
	h.Write([]byte(s))
	return "h_" + hex.EncodeToString(h.Sum(nil))[:16]
}

// generalize truncates a date or dateTime (or every date in an object such as a Period).
func generalize(v any, precision string) (any, bool) {
	switch x := v.(type) {
	case string:
		if !fhirDate.MatchString(x) {
			return nil, false
		}
		n := 4
		if precision == "month" {
			n = 7
		}
		if len(x) > n {
			x = x[:n]
		}
		return x, true
	case map[string]any:
		found := false
		for k, child := range x {
			if s, ok := child.(string); ok && fhirDate.MatchString(s) {
				g, _ := generalize(s, precision)
				x[k] = g
				found = true
			}
		}
		return x, found
	}
	return nil, false
}

// prune keeps only the elements the allowlist selects, plus resourceType, id and meta.
func prune(res map[string]any, include []*compiledPath) (map[string]any, bool) {
	root := &trie{children: map[string]*trie{}}
	for _, p := range include {
		for _, loc := range p.selectFrom(res) {
			root.add(loc.route)
		}
	}
	out := copyKept(res, root).(map[string]any)
	for _, k := range []string{"resourceType", "id", "meta"} {
		if v, ok := res[k]; ok {
			out[k] = v
		}
	}
	pruned := false
	for k := range res {
		child, kept := root.children["k:"+k]
		if k == "resourceType" || k == "id" || k == "meta" {
			continue
		}
		if !kept || !child.terminal {
			pruned = true
			break
		}
	}
	return out, pruned
}

type trie struct {
	terminal bool
	children map[string]*trie
}

func (t *trie) add(route []routeStep) {
	node := t
	for _, s := range route {
		key := "k:" + s.key
		if s.index >= 0 {
			key = "i:" + strconv.Itoa(s.index)
		}
		next, ok := node.children[key]
		if !ok {
			next = &trie{children: map[string]*trie{}}
			node.children[key] = next
		}
		node = next
	}
	node.terminal = true
}

func copyKept(src any, node *trie) any {
	if node.terminal {
		return src
	}
	switch s := src.(type) {
	case map[string]any:
		out := map[string]any{}
		for key, child := range node.children {
			if name, ok := strings.CutPrefix(key, "k:"); ok {
				if v, present := s[name]; present {
					out[name] = copyKept(v, child)
				}
			}
		}
		return out
	case []any:
		var idx []int
		for key := range node.children {
			if n, ok := strings.CutPrefix(key, "i:"); ok {
				i, _ := strconv.Atoi(n)
				idx = append(idx, i)
			}
		}
		sort.Ints(idx)
		out := make([]any, 0, len(idx))
		for _, i := range idx {
			if i < len(s) {
				out = append(out, copyKept(s[i], node.children["i:"+strconv.Itoa(i)]))
			}
		}
		return out
	}
	return src
}

// dropDisplays removes Reference.display in a resource (not in resources nested in it, which are
// processed on their own). A Reference is an object with display and reference, identifier or type
// but no code or system (that would be a Coding, whose display is the code's meaning, not a name).
func dropDisplays(v any, isRoot bool) int {
	n := 0
	switch x := v.(type) {
	case map[string]any:
		if !isRoot {
			if _, nested := x["resourceType"]; nested {
				return 0
			}
		}
		if _, ok := x["display"]; ok && isReference(x) {
			delete(x, "display")
			n++
		}
		for _, child := range x {
			n += dropDisplays(child, false)
		}
	case []any:
		for _, child := range x {
			n += dropDisplays(child, false)
		}
	}
	return n
}

func isReference(m map[string]any) bool {
	if _, ok := m["code"]; ok {
		return false
	}
	if _, ok := m["system"]; ok {
		return false
	}
	if _, ok := m["reference"].(string); ok {
		return true
	}
	if _, ok := m["identifier"].(map[string]any); ok {
		return true
	}
	if _, ok := m["type"].(string); ok {
		return true
	}
	// A bare {"display": "..."} (e.g. performer) is a Reference with only a display.
	for k := range m {
		if k != "display" && k != "extension" && k != "id" {
			return false
		}
	}
	return true
}

func addLabels(res map[string]any, effects map[string]bool) {
	meta, _ := res["meta"].(map[string]any)
	if meta == nil {
		meta = map[string]any{}
		res["meta"] = meta
	}
	security, _ := meta["security"].([]any)
	have := map[string]bool{}
	for _, s := range security {
		if m, ok := s.(map[string]any); ok && m["system"] == labelSystem {
			if code, ok := m["code"].(string); ok {
				have[code] = true
			}
		}
	}
	codes := make([]string, 0, len(effects))
	for code := range effects {
		codes = append(codes, code)
	}
	sort.Strings(codes)
	for _, code := range codes {
		if !have[code] {
			security = append(security, map[string]any{"system": labelSystem, "code": code, "display": labelDisplay[code]})
		}
	}
	meta["security"] = security
}

// sweep deletes removed elements, wrappers whose resource was suppressed (Bundle.entry,
// Parameters.parameter), and the empty objects and arrays left behind (FHIR JSON allows neither).
func sweep(v any) (any, bool) {
	switch x := v.(type) {
	case *tombstone:
		return nil, false
	case map[string]any:
		if r, ok := x["resource"]; ok && r == removed {
			return nil, false
		}
		for k, child := range x {
			nv, keep := sweep(child)
			if keep {
				x[k] = nv
			} else {
				delete(x, k)
			}
		}
		return x, len(x) > 0
	case []any:
		out := make([]any, 0, len(x))
		for _, child := range x {
			if nv, keep := sweep(child); keep {
				out = append(out, nv)
			}
		}
		return out, len(out) > 0
	}
	return v, true
}
