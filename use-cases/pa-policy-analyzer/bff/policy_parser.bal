import ballerina/log;
import ballerina/uuid;
import ballerina/lang.runtime;


isolated function parseAndStorePolicy(string jobId, string pdfId, string filename, string markdown) returns error? {
    string policyId = uuid:createType4AsString();
    string baseName = filename.endsWith(".pdf")
        ? filename.substring(0, filename.length() - 4)
        : filename;
    string mdPath = string `${STORE_PATH}/mds/${baseName}.md`;

    _ = check dbClient->execute(`
        INSERT INTO policy_documents (id, job_id, pdf_id, policy_name, markdown_path)
        VALUES (${policyId}, ${jobId}, ${pdfId}, ${baseName}, ${mdPath})
    `);

    // Split markdown into major sections
    map<string> sections = check splitBySections(markdown);

    int sortOrder = 0;
    boolean hasMedicalRecords = false;

    foreach [string, string] [title, content] in sections.entries() {
        string sectionType = classifySection(title);
        string sectionId = uuid:createType4AsString();

        _ = check dbClient->execute(`
            INSERT INTO policy_sections (id, policy_id, title, content, section_type, sort_order)
            VALUES (${sectionId}, ${policyId}, ${title}, ${content}, ${sectionType}, ${sortOrder})
        `);
        sortOrder += 1;

        if sectionType == "coverage_rationale" {
            check parseCoverageRationale(policyId, content);
        } else if sectionType == "applicable_codes" {
            check parseApplicableCodes(policyId, content);
        } else if sectionType == "medical_records" {
            hasMedicalRecords = true;
        }
    }

    // If policy references medical records, link to the separate document
    if hasMedicalRecords {
        _ = check dbClient->execute(`
            UPDATE policy_documents
            SET    medical_records_ref = 'Medical-Record-Requirements.md'
            WHERE  id = ${policyId}
        `);
    }

    log:printInfo("[" + jobId + "] Policy parsed and stored: " + baseName +
        " (" + sortOrder.toString() + " sections)");
}

isolated function splitBySections(string content) returns map<string>|error {
    map<string> sections = {};
    
    // Determine which titles are present in the document
    string[] sectionTitles = [];
    foreach string title in MAJOR_SECTION_TITLES {
        int? idx = content.indexOf(title);
        if idx is int {
            sectionTitles.push(title);
        }
    }

    // If no known titles found, use LLM to extract table of contents
    if sectionTitles.length() == 0 {
        log:printInfo("No predefined section titles matched. Extracting table of contents using LLM.");
        string tocContent = content.length() > 3000 ? content.substring(0, 3000) : content;
        string[] tocTitles = check readTableOfContent(tocContent);
        sectionTitles = tocTitles;
    }

    if sectionTitles.length() == 0 {
        return error("No section titles found in document.");
    }

    // Locate each title with validation (must be at line start, not mid-paragraph)
    map<int> titleIndices = {};
    int searchStartIndex = 0;

    foreach string title in sectionTitles {
        int? index = content.indexOf(title, searchStartIndex);
        if index is () {
            log:printWarn("Title not found in document: " + title + " after index: " + searchStartIndex.toString());
            continue;
        }
        int curIndex = index;
        while !isValidTitle(content, title, curIndex) {
            int? newIndex = content.indexOf(title, curIndex + 1);
            if newIndex is () {
                log:printWarn("No valid heading occurrence for: " + title + ". Using last match at " + curIndex.toString());
                break;
            }
            curIndex = newIndex;
        }
        log:printDebug("Title located at index " + curIndex.toString() + ": " + title);
        titleIndices[title] = curIndex;
        searchStartIndex = curIndex + title.length();
    }

    // Collect only the titles that were actually located
    string[] foundTitles = [];
    foreach string title in sectionTitles {
        if titleIndices.hasKey(title) {
            foundTitles.push(title);
        }
    }

    // Extract section content (includes title text for context)
    int titleCount = foundTitles.length();
    foreach int i in 0 ..< titleCount {
        string title = foundTitles[i];
        int startIndex = <int>titleIndices[title];
        int endIndex = content.length();
        if i < titleCount - 1 {
            string nextTitle = foundTitles[i + 1];
            endIndex = <int>titleIndices[nextTitle];
        }
        string sectionContent = content.substring(startIndex, endIndex).trim();
        sections[title] = sectionContent;
        log:printDebug("Section extracted: " + title + " (length: " + sectionContent.length().toString() + ")");
    }

    log:printInfo("Document split into " + titleCount.toString() + " sections.");
    return sections;
}

isolated function isValidTitle(string content, string title, int index) returns boolean {
    if index == 0 {
        return true;
    }
    // Walk backwards from the match – the title is valid if preceded only by
    // newline, optional '#' / space / tab characters (i.e. a markdown heading prefix).
    int checkIdx = index - 1;
    while checkIdx >= 0 {
        string ch = content.substring(checkIdx, checkIdx + 1);
        if ch == "\n" {
            return true;
        }
        if ch == "#" || ch == " " || ch == "\t" || ch == "*" {
            checkIdx -= 1;
        } else {
            return false;
        }
    }
    // Reached the very beginning of the document
    return true;
}

isolated function readTableOfContent(string fileContent) returns string[]|error {
    runtime:sleep(1);
    string llmResponse = check anthropicModelprovider->generate(
        `Extract the table of contents from the following segment of the document:
        ${fileContent}
        Provide the response in this json format:
        {
            "response": ["Section Title 1", "Section Title 2", ...]
        }
        Make sure to only include the section titles and nothing else. Do not include any page numbers or trailing punctuation in the titles.`
    );
    runtime:sleep(2);
    log:printInfo("LLM ToC extraction response received.");
    log:printDebug("LLM ToC Response: " + llmResponse);
    string cleaned = stripJsonFences(llmResponse);
    json resp = check cleaned.fromJsonString();
    ToCResponse titles = check resp.cloneWithType();
    return titles.response;
}

isolated function stripJsonFences(string response) returns string {
    string trimmed = response.trim();
    if trimmed.startsWith("```json") {
        trimmed = trimmed.substring(7);
    } else if trimmed.startsWith("```") {
        trimmed = trimmed.substring(3);
    }
    if trimmed.endsWith("```") {
        trimmed = trimmed.substring(0, trimmed.length() - 3);
    }
    return trimmed.trim();
}

isolated function classifySection(string title) returns string {
    string lower = title.toLowerAscii();
    if lower.includes("coverage rationale") {
        return "coverage_rationale";
    }
    if lower.includes("medical record") {
        return "medical_records";
    }
    if lower.includes("applicable codes") {
        return "applicable_codes";
    }
    return "other";
}

// ─────────────────────────────────────────
// Coverage Rationale → clause tree 
// ─────────────────────────────────────────

isolated function parseCoverageRationale(string policyId, string content) returns error? {
    error? llmResult = parseCoverageRationaleWithLLM(policyId, content);
    if llmResult is error {
        log:printWarn("LLM clause extraction failed, using manual parser fallback: " + llmResult.message());
        check parseCoverageRationaleManual(policyId, content);
    }
}

isolated function parseCoverageRationaleWithLLM(string policyId, string content) returns error? {
    string[] chunks = splitCoverageIntoChunks(content);
    int sortOrder = 0;

    foreach string chunk in chunks {
        if chunk.trim().length() < 5 {
            continue;
        }

        string llmResponse = check anthropicModelprovider->generate(
            `You are extracting structured coverage policy clauses from a health insurance payer policy document.

The following is a chunk of the "Coverage Rationale" section. This text was generated from a PDF-to-markdown conversion and contains noise artifacts that you must ignore. It contains nested conditions that determine when a treatment is covered or excluded.

IMPORTANT — Ignore all conversion artifacts and non-clause content, including but not limited to:
- Image/table placeholders (e.g. "==> picture [5 x 6] intentionally omitted <==", "==> table ... <==")
- Page headers, footers, page numbers
- Watermarks or repeated document titles
- Empty formatting lines, horizontal rules, or decorative separators
- Reference citation markers like [1], [2], etc. (strip from clause text but do not treat them as clauses)

Only extract actual policy clauses — statements that express coverage criteria, conditions, requirements, or exclusions.

Extract all clauses as a flat ordered list. Assign a "depth" level:
- depth 0: root/top-level clause (bold text, states the overall coverage determination)
- depth 1: first-level bullet or sub-clause directly under the root
- depth 2: second-level bullet (sub-condition of a depth-1 clause)
- depth 3+: deeper nesting levels

For each clause provide:
- "depth": integer nesting level (0, 1, 2, 3, ...)
- "text": clause text cleaned of all markdown and artifacts (remove **, *, bullet dash prefixes, [N] reference markers, trailing semicolons, placeholder tags)
- "type": exactly one of:
  - "group" — clause introduces a list ("all of the following", "one of the following", "both of the following")
  - "requirement" — states something is "proven and medically necessary"
  - "exclusion" — states something is "unproven and not medically necessary"
  - "condition" — all other clauses
- "logical_operator": "AND" for "all/both of the following", "OR" for "one of the following", null otherwise

Preserve the exact document order. Do not skip any real clauses. If the chunk contains only artifacts and no actual clauses, return an empty list.

Return ONLY valid JSON, no explanation or markdown fences:
{"clauses":[{"depth":0,"text":"...","type":"...","logical_operator":null}]}

Coverage Rationale chunk:
${chunk}`
        );
        runtime:sleep(2);

        string cleanedClauseResp = stripJsonFences(llmResponse);
        json parsed = check cleanedClauseResp.fromJsonString();
        LLMClausesResponse response = check parsed.cloneWithType(LLMClausesResponse);

        // Insert clauses maintaining parent-child relationships via a depth stack
        string[] stackIds = [];
        int[] stackDepths = [];

        foreach LLMClause clause in response.clauses {
            if clause.text.trim().length() < 3 {
                continue;
            }

            // Pop stack until we find a parent with depth < current
            while stackDepths.length() > 0 && stackDepths[stackDepths.length() - 1] >= clause.depth {
                _ = stackIds.pop();
                _ = stackDepths.pop();
            }

            string? parentId = stackIds.length() > 0 ? stackIds[stackIds.length() - 1] : ();
            string clauseId = uuid:createType4AsString();

            _ = check dbClient->execute(`
                INSERT INTO coverage_clauses
                    (id, policy_id, parent_id, clause_text, clause_type, logical_operator, sort_order)
                VALUES (${clauseId}, ${policyId}, ${parentId}, ${clause.text}, ${clause.'type}, ${clause.logical_operator}, ${sortOrder})
            `);
            sortOrder += 1;

            stackIds.push(clauseId);
            stackDepths.push(clause.depth);
        }

        log:printInfo("LLM extracted " + response.clauses.length().toString() + " clauses from chunk");
    }

    log:printInfo("LLM parsed " + sortOrder.toString() + " total coverage clauses for policy " + policyId);
}

isolated function splitCoverageIntoChunks(string content) returns string[] {
    string[] lines = re `\n`.split(content);
    string[] chunks = [];
    string currentChunk = "";

    foreach string rawLine in lines {
        string trimmed = rawLine.trim();

        // Identify root-level bold clause lines (not standalone "or"/"and" headings)
        boolean isRootBold = trimmed.startsWith("**") &&
                             trimmed != "**or**" && trimmed != "**and**" &&
                             trimmed != "## **or**" && trimmed != "## **and**";

        if isRootBold && currentChunk.trim().length() > 0 {
            chunks.push(currentChunk.trim());
            currentChunk = rawLine + "\n";
        } else {
            currentChunk += rawLine + "\n";
        }
    }
    if currentChunk.trim().length() > 0 {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

// ────────────────────────────────────────
// ── Applicable Codes → code records 
// ────────────────────────────────────────

isolated function parseApplicableCodes(string policyId, string content) returns error? {
    error? llmResult = parseApplicableCodesWithLLM(policyId, content);
    if llmResult is error {
        log:printWarn("LLM code extraction failed, using manual parser fallback: " + llmResult.message());
        check parseApplicableCodesManual(policyId, content);
    }
}

isolated function parseApplicableCodesWithLLM(string policyId, string content) returns error? {
    map<string> codeSections = splitCodeSections(content);
    int totalCount = 0;

    foreach [string, string] [codeType, sectionContent] in codeSections.entries() {
        if sectionContent.trim().length() < 5 {
            continue;
        }

        string llmResponse = check anthropicModelprovider->generate(
            `You are extracting medical billing codes from a health insurance payer policy document.

The following is the "${codeType}" codes section from the "Applicable Codes" table of a policy document. It is in markdown table format.

Extract ALL code entries. For each row provide:
- "code_type": "${codeType}"
- "code": the exact code value (e.g. "90837", "J0172", "M54.50"). Do not modify or truncate.
- "description": the full description text. Replace any <br> tags with a space. Remove extra whitespace.

Rules:
- Skip header rows (rows with bold column names like "CPT Code" or "Description")
- Skip separator rows (rows with only dashes like |---|---|)
- Skip rows where the code column is empty, contains only asterisks, or contains dashes
- If a description spans multiple lines merged with <br>, join them with a space

Return ONLY valid JSON, no explanation or markdown fences:
{"codes":[{"code_type":"${codeType}","code":"...","description":"..."}]}

Table content:
${sectionContent}`
        );
        runtime:sleep(2);

        string cleanedCodeResp = stripJsonFences(llmResponse);
        json parsed = check cleanedCodeResp.fromJsonString();
        LLMCodesResponse response = check parsed.cloneWithType(LLMCodesResponse);

        foreach LLMCode codeEntry in response.codes {
            if codeEntry.code.trim().length() == 0 {
                continue;
            }
            string codeId = uuid:createType4AsString();
            _ = check dbClient->execute(`
                INSERT INTO policy_codes (id, policy_id, code_type, code, description)
                VALUES (${codeId}, ${policyId}, ${codeEntry.code_type}, ${codeEntry.code}, ${codeEntry.description})
            `);
            totalCount += 1;
        }
        log:printInfo("LLM extracted " + response.codes.length().toString() + " " + codeType + " codes");
    }

    log:printInfo("LLM parsed " + totalCount.toString() + " total codes for policy " + policyId);
}

isolated function splitCodeSections(string content) returns map<string> {
    map<string> sections = {};
    string[] lines = re `\n`.split(content);
    string currentType = "";
    string currentSection = "";

    foreach string line in lines {
        string trimmed = line.trim();
        string newType = "";

        if trimmed.includes("CPT Code") || trimmed.includes("CPT Codes") {
            newType = "CPT";
        } else if trimmed.includes("HCPCS Code") || trimmed.includes("HCPCS Codes") {
            newType = "HCPCS";
        } else if trimmed.includes("Diagnosis Code") || trimmed.includes("ICD-10") || trimmed.includes("ICD10") {
            newType = "ICD10";
        }

        if newType != "" {
            if currentType != "" && currentSection.trim().length() > 0 {
                sections[currentType] = currentSection.trim();
            }
            currentType = newType;
            currentSection = line + "\n";
        } else {
            currentSection += line + "\n";
        }
    }
    if currentType != "" && currentSection.trim().length() > 0 {
        sections[currentType] = currentSection.trim();
    }
    return sections;
}

// ───────────────────────────────────────────
// ── Manual fallback parsers 
// ───────────────────────────────────────────

isolated function parseCoverageRationaleManual(string policyId, string content) returns error? {
    string[] lines = re `\n`.split(content);

    string[] stackIds = [];
    int[] stackDepths = [];
    int sortOrder = 0;

    foreach string rawLine in lines {
        string line = rawLine;
        string trimmed = line.trim();

        if trimmed == "" ||
           trimmed.includes("intentionally omitted") ||
           trimmed.includes("Proprietary Information") ||
           (trimmed.startsWith("Page ") && trimmed.includes(" of ")) {
            continue;
        }

        if trimmed == "## **or**" || trimmed == "## **and**" ||
           trimmed == "**or**" || trimmed == "**and**" {
            continue;
        }

        int? dashPos = findBulletDash(line);
        if dashPos is () {
            if trimmed.startsWith("**") || trimmed.startsWith("*") {
                string clauseText = cleanClauseText(trimmed);
                if clauseText.length() < 5 {
                    continue;
                }
                string clauseType = detectClauseType(clauseText);
                string? logicalOp = detectLogicalOperator(clauseText);
                string clauseId = uuid:createType4AsString();

                stackIds = [];
                stackDepths = [];

                _ = check dbClient->execute(`
                    INSERT INTO coverage_clauses
                        (id, policy_id, parent_id, clause_text, clause_type, logical_operator, sort_order)
                    VALUES (${clauseId}, ${policyId}, ${()}, ${clauseText}, ${clauseType}, ${logicalOp}, ${sortOrder})
                `);
                sortOrder += 1;
                stackIds.push(clauseId);
                stackDepths.push(-1);
            }
            continue;
        }

        int depth = dashPos;
        string bulletText = line.substring(dashPos + 2).trim();

        if bulletText.startsWith("`o` ") {
            bulletText = bulletText.substring(4);
        }

        string clauseText = cleanClauseText(bulletText);
        if clauseText.length() < 3 {
            continue;
        }

        string clauseType = detectClauseType(clauseText);
        string? logicalOp = detectLogicalOperator(clauseText);

        while stackDepths.length() > 0 && stackDepths[stackDepths.length() - 1] >= depth {
            _ = stackIds.pop();
            _ = stackDepths.pop();
        }

        string? parentId = stackIds.length() > 0 ? stackIds[stackIds.length() - 1] : ();
        string clauseId = uuid:createType4AsString();

        _ = check dbClient->execute(`
            INSERT INTO coverage_clauses
                (id, policy_id, parent_id, clause_text, clause_type, logical_operator, sort_order)
            VALUES (${clauseId}, ${policyId}, ${parentId}, ${clauseText}, ${clauseType}, ${logicalOp}, ${sortOrder})
        `);
        sortOrder += 1;

        stackIds.push(clauseId);
        stackDepths.push(depth);
    }

    log:printInfo("Manual parser: " + sortOrder.toString() + " coverage clauses for policy " + policyId);
}

isolated function parseApplicableCodesManual(string policyId, string content) returns error? {
    string[] lines = re `\n`.split(content);
    string currentCodeType = "";
    int count = 0;

    foreach string line in lines {
        string trimmed = line.trim();

        if trimmed.includes("CPT Code") {
            currentCodeType = "CPT";
            continue;
        } else if trimmed.includes("HCPCS Code") {
            currentCodeType = "HCPCS";
            continue;
        } else if trimmed.includes("Diagnosis Code") {
            currentCodeType = "ICD10";
            continue;
        }

        if trimmed.startsWith("|---") || trimmed == "" || trimmed == "|||" || trimmed == "|" {
            continue;
        }

        if trimmed.startsWith("|") && currentCodeType != "" {
            string[] cells = splitTableRow(trimmed);
            if cells.length() >= 2 {
                string code = cells[0].trim();
                string description = cells.length() >= 2 ? cells[1].trim() : "";
                description = re `<br>`.replaceAll(description, " ");

                if code == "" || code.includes("**") || code.includes("---") {
                    continue;
                }

                string codeId = uuid:createType4AsString();
                _ = check dbClient->execute(`
                    INSERT INTO policy_codes (id, policy_id, code_type, code, description)
                    VALUES (${codeId}, ${policyId}, ${currentCodeType}, ${code}, ${description})
                `);
                count += 1;
            }
        }
    }

    log:printInfo("Manual parser: " + count.toString() + " codes for policy " + policyId);
}

isolated function findBulletDash(string line) returns int? {
    int i = 0;
    int len = line.length();
    while i < len {
        string ch = line.substring(i, i + 1);
        if ch == " " || ch == "\t" {
            i += 1;
        } else if ch == "-" && i + 1 < len && line.substring(i + 1, i + 2) == " " {
            return i;
        } else {
            return ();
        }
    }
    return ();
}

isolated function detectClauseType(string text) returns string {
    string lower = text.toLowerAscii();
    if lower.includes("all of the following") || lower.includes("one of the following") ||
       lower.includes("both of the following") {
        return "group";
    }
    if lower.includes("unproven and not medically necessary") {
        return "exclusion";
    }
    if lower.includes("proven and medically necessary") {
        return "requirement";
    }
    return "condition";
}

isolated function detectLogicalOperator(string text) returns string? {
    string lower = text.toLowerAscii();
    if lower.includes("all of the following") || lower.includes("both of the following") {
        return "AND";
    }
    if lower.includes("one of the following") {
        return "OR";
    }
    return ();
}

isolated function cleanClauseText(string text) returns string {
    string cleaned = text;
    cleaned = re `\*\*`.replaceAll(cleaned, "");
    cleaned = re `\[\d+\]`.replaceAll(cleaned, "");
    cleaned = re `\[rd\]`.replaceAll(cleaned, "");
    cleaned = re `\[®\]`.replaceAll(cleaned, "");
    cleaned = cleaned.trim();
    if cleaned.endsWith(";") {
        cleaned = cleaned.substring(0, cleaned.length() - 1).trim();
    }
    return cleaned;
}

isolated function splitTableRow(string row) returns string[] {
    string[] cells = [];
    string trimmed = row.trim();
    if trimmed.startsWith("|") {
        trimmed = trimmed.substring(1);
    }
    if trimmed.endsWith("|") {
        trimmed = trimmed.substring(0, trimmed.length() - 1);
    }
    int startIdx = 0;
    int i = 0;
    while i < trimmed.length() {
        if trimmed.substring(i, i + 1) == "|" {
            cells.push(trimmed.substring(startIdx, i));
            startIdx = i + 1;
        }
        i += 1;
    }
    if startIdx <= trimmed.length() {
        cells.push(trimmed.substring(startIdx));
    }
    return cells;
}
