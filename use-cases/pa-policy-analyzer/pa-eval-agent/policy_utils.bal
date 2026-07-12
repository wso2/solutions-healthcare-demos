isolated function buildClauseTreeText(CoverageClauseRow[] clauses) returns string {
    string[] lines = [];
    map<CoverageClauseRow[]> childMap = {};
    CoverageClauseRow[] roots = [];

    foreach CoverageClauseRow c in clauses {
        if c.parentId is () {
            roots.push(c);
        } else {
            string pid = <string>c.parentId;
            if childMap.hasKey(pid) {
                childMap.get(pid).push(c);
            } else {
                childMap[pid] = [c];
            }
        }
    }

    foreach CoverageClauseRow root in roots {
        lines.push(formatClauseNode(root, childMap, 0));
    }
    return string:'join("\n", ...lines);
}

isolated function formatClauseNode(CoverageClauseRow clause, map<CoverageClauseRow[]> childMap, int depth) returns string {
    string indent = "";
    foreach int _ in 0 ..< depth {
        indent += "  ";
    }
    string op = clause.logicalOperator is string ? string ` [${<string>clause.logicalOperator}]` : "";
    string line = string `${indent}- [${clause.id}] (${clause.clauseType}${op}) ${clause.clauseText}`;

    string[] result = [line];
    CoverageClauseRow[]? children = childMap[clause.id];
    if children is CoverageClauseRow[] {
        foreach CoverageClauseRow child in children {
            result.push(formatClauseNode(child, childMap, depth + 1));
        }
    }
    return string:'join("\n", ...result);
}
