package mcpfhirdeidentify

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"unicode"
)

// A FHIRPath subset that selects locations, not just values, so the policy can change them in place.
//
//	path  := Type ('.' step)*
//	step  := name | name '[' n ']' | where(cond) | extension('url') | ofType(Type) | first()
//	cond  := term (('and' | 'or') term)*          — 'and' binds tighter than 'or'
//	term  := rel ('=' | '!=') literal | rel '.exists()' | '(' cond ')'
//	rel   := name ('.' name)*
//
// Navigation follows FHIRPath: arrays flatten into the collection, and a name matches its choice
// variants (value matches valueQuantity, valueString, ...). Comparisons are true when any value of
// the left side equals the literal ('!=': there are values and none equals it).

type compiledPath struct {
	source       string
	resourceType string
	steps        []step
}

type stepKind int

const (
	stepChild stepKind = iota
	stepWhere
	stepOfType
	stepFirst
	stepIndex
)

type step struct {
	kind  stepKind
	name  string // child name, or ofType type
	index int
	cond  cond
}

type cond interface {
	eval(v any) bool
}

type orCond []cond
type andCond []cond

type cmpCond struct {
	rel     []string
	negate  bool
	literal any // string, json.Number (numeric literal) or bool
}

type existsCond struct{ rel []string }

func (c orCond) eval(v any) bool {
	for _, t := range c {
		if t.eval(v) {
			return true
		}
	}
	return false
}

func (c andCond) eval(v any) bool {
	for _, t := range c {
		if !t.eval(v) {
			return false
		}
	}
	return true
}

func (c existsCond) eval(v any) bool {
	return len(values(v, c.rel)) > 0
}

func (c cmpCond) eval(v any) bool {
	vals := values(v, c.rel)
	equal := false
	for _, x := range vals {
		if literalEquals(x, c.literal) {
			equal = true
			break
		}
	}
	if c.negate {
		return len(vals) > 0 && !equal
	}
	return equal
}

func literalEquals(v, literal any) bool {
	switch l := literal.(type) {
	case string:
		s, ok := v.(string)
		return ok && s == l
	case bool:
		b, ok := v.(bool)
		return ok && b == l
	case json.Number:
		n, ok := v.(json.Number)
		if !ok {
			return false
		}
		a, errA := strconv.ParseFloat(string(n), 64)
		b, errB := strconv.ParseFloat(string(l), 64)
		return errA == nil && errB == nil && a == b
	}
	return false
}

// values navigates a relative path from v and returns the values reached.
func values(v any, rel []string) []any {
	cur := []any{v}
	for _, name := range rel {
		var next []any
		for _, c := range cur {
			m, ok := c.(map[string]any)
			if !ok {
				continue
			}
			for _, key := range matchingKeys(m, name) {
				switch x := m[key].(type) {
				case []any:
					next = append(next, x...)
				default:
					next = append(next, x)
				}
			}
		}
		cur = next
	}
	return cur
}

// matchingKeys returns name if present, otherwise its choice-type variants (name + Uppercase...).
func matchingKeys(m map[string]any, name string) []string {
	if _, ok := m[name]; ok {
		return []string{name}
	}
	var keys []string
	for k := range m {
		if len(k) > len(name) && strings.HasPrefix(k, name) && unicode.IsUpper(rune(k[len(name)])) {
			keys = append(keys, k)
		}
	}
	return keys
}

// location is one selected element: where it lives (so it can be replaced or removed) and the route
// from the resource root (so an allowlist can rebuild the resource from the routes it keeps).
type location struct {
	parent any // map[string]any or []any
	key    string
	index  int // -1 when parent is a map
	route  []routeStep
}

type routeStep struct {
	key   string
	index int // -1 for a map key
}

func (l location) value() any {
	if l.index >= 0 {
		return l.parent.([]any)[l.index]
	}
	return l.parent.(map[string]any)[l.key]
}

func (l location) set(v any) {
	if l.index >= 0 {
		l.parent.([]any)[l.index] = v
		return
	}
	l.parent.(map[string]any)[l.key] = v
}

// lastKey is the element name this location was reached by (for an array item, the array's name).
func (l location) lastKey() string {
	for i := len(l.route) - 1; i >= 0; i-- {
		if l.route[i].index < 0 {
			return l.route[i].key
		}
	}
	return ""
}

func (p *compiledPath) selectFrom(resource map[string]any) []location {
	cur := []location{{parent: map[string]any{"": resource}, key: "", index: -1}}
	for _, s := range p.steps {
		var next []location
		switch s.kind {
		case stepChild:
			for _, l := range cur {
				m, ok := l.value().(map[string]any)
				if !ok {
					continue
				}
				for _, key := range matchingKeys(m, s.name) {
					base := append(append([]routeStep{}, l.route...), routeStep{key: key, index: -1})
					if arr, isArr := m[key].([]any); isArr {
						for i := range arr {
							route := append(append([]routeStep{}, base...), routeStep{key: key, index: i})
							next = append(next, location{parent: arr, index: i, route: route})
						}
					} else {
						next = append(next, location{parent: m, key: key, index: -1, route: base})
					}
				}
			}
		case stepWhere:
			for _, l := range cur {
				if s.cond.eval(l.value()) {
					next = append(next, l)
				}
			}
		case stepOfType:
			// A resource of that type, or the choice variant named after it (ofType(dateTime) → deceasedDateTime).
			suffix := strings.ToUpper(s.name[:1]) + s.name[1:]
			for _, l := range cur {
				if m, ok := l.value().(map[string]any); ok && m["resourceType"] == s.name {
					next = append(next, l)
				} else if strings.HasSuffix(l.lastKey(), suffix) && l.lastKey() != suffix {
					next = append(next, l)
				}
			}
		case stepFirst:
			if len(cur) > 0 {
				next = cur[:1]
			}
		case stepIndex:
			if s.index < len(cur) {
				next = cur[s.index : s.index+1]
			}
		}
		cur = next
	}
	// Drop the synthetic root; a path that is just the type selects nothing to change.
	if len(p.steps) == 0 {
		return nil
	}
	return cur
}

// ── parser ──────────────────────────────────────────────────────────────────────────────────────

type token struct {
	kind string // ident, string, number, op
	text string
}

func tokenize(src string) ([]token, error) {
	var toks []token
	for i := 0; i < len(src); {
		c := src[i]
		switch {
		case c == ' ' || c == '\t':
			i++
		case c == '\'':
			var b strings.Builder
			j := i + 1
			for ; j < len(src) && src[j] != '\''; j++ {
				if src[j] == '\\' && j+1 < len(src) {
					j++
				}
				b.WriteByte(src[j])
			}
			if j >= len(src) {
				return nil, fmt.Errorf("unterminated string")
			}
			toks = append(toks, token{"string", b.String()})
			i = j + 1
		case c == '!' && i+1 < len(src) && src[i+1] == '=':
			toks = append(toks, token{"op", "!="})
			i += 2
		case strings.IndexByte(".()[]=", c) >= 0:
			toks = append(toks, token{"op", string(c)})
			i++
		case c >= '0' && c <= '9' || c == '-':
			j := i + 1
			for j < len(src) && (src[j] >= '0' && src[j] <= '9' || src[j] == '.') {
				j++
			}
			toks = append(toks, token{"number", src[i:j]})
			i = j
		case c == '_' || unicode.IsLetter(rune(c)):
			j := i + 1
			for j < len(src) && (src[j] == '_' || unicode.IsLetter(rune(src[j])) || unicode.IsDigit(rune(src[j]))) {
				j++
			}
			toks = append(toks, token{"ident", src[i:j]})
			i = j
		default:
			return nil, fmt.Errorf("unexpected %q at %d", c, i)
		}
	}
	return toks, nil
}

type parser struct {
	toks []token
	pos  int
}

func (p *parser) peek() token {
	if p.pos < len(p.toks) {
		return p.toks[p.pos]
	}
	return token{}
}

func (p *parser) next() token { t := p.peek(); p.pos++; return t }

func (p *parser) expect(kind, text string) error {
	t := p.next()
	if t.kind != kind || (text != "" && t.text != text) {
		want := text
		if want == "" {
			want = kind
		}
		return fmt.Errorf("expected %s, found %q", want, t.text)
	}
	return nil
}

func compilePath(src string) (*compiledPath, error) {
	toks, err := tokenize(src)
	if err != nil {
		return nil, fmt.Errorf("FHIRPath %q: %w", src, err)
	}
	p := &parser{toks: toks}
	first := p.next()
	if first.kind != "ident" || !unicode.IsUpper(rune(first.text[0])) {
		return nil, fmt.Errorf("FHIRPath %q: must start with a resource type", src)
	}
	cp := &compiledPath{source: src, resourceType: first.text}
	for p.pos < len(p.toks) {
		t := p.next()
		switch {
		case t.kind == "op" && t.text == ".":
			name := p.next()
			if name.kind != "ident" {
				return nil, fmt.Errorf("FHIRPath %q: expected a name after '.'", src)
			}
			if p.peek().text == "(" {
				s, err := p.function(name.text)
				if err != nil {
					return nil, fmt.Errorf("FHIRPath %q: %w", src, err)
				}
				cp.steps = append(cp.steps, s...)
				continue
			}
			cp.steps = append(cp.steps, step{kind: stepChild, name: name.text})
		case t.kind == "op" && t.text == "[":
			n := p.next()
			idx, convErr := strconv.Atoi(n.text)
			if n.kind != "number" || convErr != nil || idx < 0 {
				return nil, fmt.Errorf("FHIRPath %q: bad index", src)
			}
			if err := p.expect("op", "]"); err != nil {
				return nil, fmt.Errorf("FHIRPath %q: %w", src, err)
			}
			cp.steps = append(cp.steps, step{kind: stepIndex, index: idx})
		default:
			return nil, fmt.Errorf("FHIRPath %q: unexpected %q", src, t.text)
		}
	}
	return cp, nil
}

func (p *parser) function(name string) ([]step, error) {
	if err := p.expect("op", "("); err != nil {
		return nil, err
	}
	var steps []step
	switch name {
	case "where":
		c, err := p.orExpr()
		if err != nil {
			return nil, err
		}
		steps = []step{{kind: stepWhere, cond: c}}
	case "extension":
		url := p.next()
		if url.kind != "string" {
			return nil, fmt.Errorf("extension() takes a url string")
		}
		steps = []step{
			{kind: stepChild, name: "extension"},
			{kind: stepWhere, cond: cmpCond{rel: []string{"url"}, literal: url.text}},
		}
	case "ofType":
		t := p.next()
		if t.kind != "ident" {
			return nil, fmt.Errorf("ofType() takes a type name")
		}
		steps = []step{{kind: stepOfType, name: t.text}}
	case "first":
		steps = []step{{kind: stepFirst}}
	default:
		return nil, fmt.Errorf("unsupported function %s()", name)
	}
	if err := p.expect("op", ")"); err != nil {
		return nil, err
	}
	return steps, nil
}

func (p *parser) orExpr() (cond, error) {
	var terms orCond
	for {
		a, err := p.andExpr()
		if err != nil {
			return nil, err
		}
		terms = append(terms, a)
		if t := p.peek(); t.kind == "ident" && t.text == "or" {
			p.next()
			continue
		}
		return terms, nil
	}
}

func (p *parser) andExpr() (cond, error) {
	var terms andCond
	for {
		t, err := p.term()
		if err != nil {
			return nil, err
		}
		terms = append(terms, t)
		if n := p.peek(); n.kind == "ident" && n.text == "and" {
			p.next()
			continue
		}
		return terms, nil
	}
}

func (p *parser) term() (cond, error) {
	if p.peek().text == "(" {
		p.next()
		c, err := p.orExpr()
		if err != nil {
			return nil, err
		}
		return c, p.expect("op", ")")
	}
	var rel []string
	for {
		name := p.next()
		if name.kind != "ident" {
			return nil, fmt.Errorf("expected an element name in where(), found %q", name.text)
		}
		if name.text == "exists" && p.peek().text == "(" {
			p.next()
			if err := p.expect("op", ")"); err != nil {
				return nil, err
			}
			if len(rel) == 0 {
				return nil, fmt.Errorf("exists() needs a path")
			}
			return existsCond{rel: rel}, nil
		}
		rel = append(rel, name.text)
		if p.peek().text != "." {
			break
		}
		p.next()
	}
	op := p.next()
	if op.kind != "op" || (op.text != "=" && op.text != "!=") {
		return nil, fmt.Errorf("expected = or != in where(), found %q", op.text)
	}
	lit := p.next()
	var literal any
	switch {
	case lit.kind == "string":
		literal = lit.text
	case lit.kind == "number":
		literal = json.Number(lit.text)
	case lit.kind == "ident" && (lit.text == "true" || lit.text == "false"):
		literal = lit.text == "true"
	default:
		return nil, fmt.Errorf("expected a literal, found %q", lit.text)
	}
	return cmpCond{rel: rel, negate: op.text == "!=", literal: literal}, nil
}
