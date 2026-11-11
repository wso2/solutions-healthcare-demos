package mcpfhirdeidentify

import (
	"fmt"
	"strings"
)

type operation string

const (
	opRedact     operation = "redact"
	opMask       operation = "mask"
	opHash       operation = "hash"
	opGeneralize operation = "generalize"
)

type rule struct {
	paths     []*compiledPath
	op        operation
	keepLast  int
	precision string // year | month
}

type resourceConfig struct {
	deny             bool
	include          []*compiledPath
	rules            []rule
	denySearchParams map[string]bool
}

type config struct {
	allTools               bool
	tools                  map[string]bool
	resources              map[string]*resourceConfig
	defaultDeny            bool
	redactNarrative        bool
	redactReferenceDisplay bool
	securityLabels         bool
	blockNonJSON           bool
	typeArgument           string
	searchArgument         string
	hashKey                []byte
	// guardedParams: every denied search parameter of every type, for chained parameters whose
	// target type is not named.
	guardedParams map[string]bool
}

func parseConfig(params map[string]interface{}) (*config, error) {
	c := &config{
		tools:                  map[string]bool{},
		resources:              map[string]*resourceConfig{},
		redactNarrative:        boolParam(params, "redactNarrative", true),
		redactReferenceDisplay: boolParam(params, "redactReferenceDisplay", true),
		securityLabels:         boolParam(params, "securityLabels", true),
		typeArgument:           "type",
		searchArgument:         "searchParam",
		guardedParams:          map[string]bool{},
	}

	tools, err := stringList(params["tools"], "tools")
	if err != nil {
		return nil, err
	}
	if len(tools) == 0 {
		tools = []string{"*"}
	}
	for _, t := range tools {
		if t == "*" {
			c.allTools = true
		}
		c.tools[t] = true
	}

	switch v, _ := params["defaultAccess"].(string); v {
	case "", "allow":
	case "deny":
		c.defaultDeny = true
	default:
		return nil, fmt.Errorf("defaultAccess must be allow or deny, not %q", v)
	}
	switch v, _ := params["nonJsonContent"].(string); v {
	case "", "allow":
	case "block":
		c.blockNonJSON = true
	default:
		return nil, fmt.Errorf("nonJsonContent must be allow or block, not %q", v)
	}

	if sa, ok := params["searchArguments"].(map[string]interface{}); ok {
		if v, ok := sa["resourceType"].(string); ok && v != "" {
			c.typeArgument = v
		}
		if v, ok := sa["searchParams"].(string); ok && v != "" {
			c.searchArgument = v
		}
	}

	if key, ok := params["hashKey"].(string); ok {
		c.hashKey = []byte(key)
	}

	usesHash := false
	if raw, ok := params["resources"]; ok && raw != nil {
		list, ok := raw.([]interface{})
		if !ok {
			return nil, fmt.Errorf("resources must be an array")
		}
		for i, item := range list {
			m, ok := item.(map[string]interface{})
			if !ok {
				return nil, fmt.Errorf("resources[%d] must be an object", i)
			}
			typeName, _ := m["type"].(string)
			if typeName == "" {
				return nil, fmt.Errorf("resources[%d].type is required", i)
			}
			if _, dup := c.resources[typeName]; dup {
				return nil, fmt.Errorf("resources: %s is configured twice", typeName)
			}
			rc, hashes, err := parseResource(typeName, m)
			if err != nil {
				return nil, fmt.Errorf("resources[%d] (%s): %w", i, typeName, err)
			}
			usesHash = usesHash || hashes
			c.resources[typeName] = rc
			for p := range rc.denySearchParams {
				c.guardedParams[p] = true
			}
		}
	}
	if usesHash && len(c.hashKey) < 16 {
		return nil, fmt.Errorf("a rule uses hash, but the hash key (policy_configurations.mcpfhirdeidentify_v0.hash_key) is missing or shorter than 16 characters")
	}
	return c, nil
}

func parseResource(typeName string, m map[string]interface{}) (*resourceConfig, bool, error) {
	rc := &resourceConfig{denySearchParams: map[string]bool{}}
	switch v, _ := m["access"].(string); v {
	case "", "allow":
	case "deny":
		rc.deny = true
	default:
		return nil, false, fmt.Errorf("access must be allow or deny, not %q", v)
	}

	includes, err := stringList(m["include"], "include")
	if err != nil {
		return nil, false, err
	}
	for _, src := range includes {
		p, err := compileFor(typeName, src)
		if err != nil {
			return nil, false, err
		}
		rc.include = append(rc.include, p)
	}

	usesHash := false
	if raw, ok := m["rules"]; ok && raw != nil {
		list, ok := raw.([]interface{})
		if !ok {
			return nil, false, fmt.Errorf("rules must be an array")
		}
		for i, item := range list {
			rm, ok := item.(map[string]interface{})
			if !ok {
				return nil, false, fmt.Errorf("rules[%d] must be an object", i)
			}
			r := rule{keepLast: 4, precision: "year"}
			switch op, _ := rm["operation"].(string); operation(op) {
			case opRedact, opMask, opHash, opGeneralize:
				r.op = operation(op)
			default:
				return nil, false, fmt.Errorf("rules[%d].operation must be redact, mask, hash or generalize, not %q", i, op)
			}
			usesHash = usesHash || r.op == opHash
			if v, ok := number(rm["keepLast"]); ok {
				if v < 0 || v > 8 {
					return nil, false, fmt.Errorf("rules[%d].keepLast must be 0..8", i)
				}
				r.keepLast = v
			}
			if v, ok := rm["precision"].(string); ok && v != "" {
				if v != "year" && v != "month" {
					return nil, false, fmt.Errorf("rules[%d].precision must be year or month", i)
				}
				r.precision = v
			}
			paths, err := stringList(rm["fhirPaths"], "fhirPaths")
			if err != nil {
				return nil, false, err
			}
			if len(paths) == 0 {
				return nil, false, fmt.Errorf("rules[%d].fhirPaths is empty", i)
			}
			for _, src := range paths {
				p, err := compileFor(typeName, src)
				if err != nil {
					return nil, false, err
				}
				r.paths = append(r.paths, p)
			}
			rc.rules = append(rc.rules, r)
		}
	}

	params, err := stringList(m["denySearchParams"], "denySearchParams")
	if err != nil {
		return nil, false, err
	}
	for _, p := range params {
		rc.denySearchParams[strings.ToLower(p)] = true
	}
	return rc, usesHash, nil
}

func compileFor(typeName, src string) (*compiledPath, error) {
	p, err := compilePath(src)
	if err != nil {
		return nil, err
	}
	if p.resourceType != typeName {
		return nil, fmt.Errorf("FHIRPath %q does not start with %s", src, typeName)
	}
	if len(p.steps) == 0 {
		return nil, fmt.Errorf("FHIRPath %q selects the whole resource — use access: deny", src)
	}
	return p, nil
}

func (c *config) appliesTo(tool string) bool {
	return c.allTools || c.tools[tool]
}

func boolParam(params map[string]interface{}, name string, def bool) bool {
	if v, ok := params[name].(bool); ok {
		return v
	}
	return def
}

func number(v interface{}) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int64:
		return int(n), true
	case float64:
		return int(n), true
	}
	return 0, false
}

func stringList(raw interface{}, name string) ([]string, error) {
	if raw == nil {
		return nil, nil
	}
	switch list := raw.(type) {
	case []string:
		return list, nil
	case []interface{}:
		out := make([]string, 0, len(list))
		for i, item := range list {
			s, ok := item.(string)
			if !ok || s == "" {
				return nil, fmt.Errorf("%s[%d] must be a non-empty string", name, i)
			}
			out = append(out, s)
		}
		return out, nil
	}
	return nil, fmt.Errorf("%s must be an array of strings", name)
}
