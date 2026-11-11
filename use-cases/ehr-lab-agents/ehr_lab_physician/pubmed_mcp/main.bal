import ballerina/http;
import ballerina/lang.regexp;
import ballerina/log;
import ballerina/mcp;
import ballerina/url;

final http:Client eutils = check new (eutilsBaseUrl, timeout = 20, retryConfig = {count: 2, interval: 1});

listener mcp:StreamableHttpListener mcpListener = check new (port);

// Stateless: each call stands alone, so the server works the same behind Agent Manager's MCP proxy.
@mcp:StreamableHttpServiceConfig {
    info: {name: "PubMed", version: "0.1.0"},
    sessionMode: mcp:STATELESS,
    options: {
        instructions: "Searches the biomedical literature (PubMed). Send clinical concepts and terms only — "
            + "never patient names, identifiers or dates of birth."
    }
}
isolated service mcp:StreamableHttpService /mcp on mcpListener {
    // Both tools return JSON text they encode themselves: ballerina/mcp turns a record result into text with
    // toString(), which does not escape quotes inside strings (article titles often have them).

    # Searches PubMed for articles relevant to a clinical question, most relevant first. Use clinical terms
    # (conditions, biomarkers, drugs), e.g. "lipoprotein(a) cardiovascular risk primary prevention".
    #
    # + query - PubMed query: clinical terms, optionally with PubMed field tags such as [tiab] or [mh]
    # + maxResults - how many articles to return (1-10, default 5)
    # + sinceYear - only articles published in or after this year
    # + reviewsOnly - only systematic reviews, meta-analyses and guidelines
    # + return - the matching articles, or an error if PubMed cannot be reached
    remote function search_pubmed(string query, int maxResults = 5, int? sinceYear = (), boolean reviewsOnly = false)
            returns string|error => (check searchPubmed(query, maxResults, sinceYear, reviewsOnly)).toJsonString();

    # Returns an article's abstract, to check what a study found before citing it.
    #
    # + pmid - PubMed id, as returned by search_pubmed
    # + return - the abstract as JSON text, or an error if PubMed cannot be reached
    remote function get_abstract(string pmid) returns string|error => (check getAbstract(pmid)).toJsonString();
}

# Searches PubMed (see `search_pubmed`).
#
# + query - PubMed query
# + maxResults - how many articles to return
# + sinceYear - only articles published in or after this year
# + reviewsOnly - only reviews, meta-analyses and guidelines
# + return - the matching articles, or an error if PubMed cannot be reached
isolated function searchPubmed(string query, int maxResults, int? sinceYear, boolean reviewsOnly)
    returns SearchResult|error {
    string term = query.trim();
    if term.length() == 0 {
        return error("query is empty");
    }
    // Parentheses inside terms ("lipoprotein(a)") break PubMed's boolean parsing; a plain keyword query
    // (no AND/OR/NOT) loses nothing without them.
    boolean keywords = re ` (AND|OR|NOT) `.find(term) is ();
    if keywords {
        term = re `[()]`.replaceAll(term, " ").trim();
    }
    int retmax = int:max(1, int:min(maxResults, maxResultsCap));
    [string, int, json[]] [ran, total, ids] = check esearch(term, retmax, sinceYear, reviewsOnly);
    string? note = ();
    // Agents tend to write long, specific keyword queries; PubMed requires every word, so they often
    // match nothing. Broaden by keeping the leading terms (where the concept usually is): 4, 3, then 2.
    string[] words = re `\s+`.split(term);
    int keep = int:min(4, words.length() - 1);
    while ids.length() == 0 && keywords && keep >= 2 {
        string shorter = string:'join(" ", ...words.slice(0, keep));
        [ran, total, ids] = check esearch(shorter, retmax, sinceYear, reviewsOnly);
        note = string `Nothing matched every word; broadened to "${shorter}".`;
        keep -= 1;
    }
    log:printInfo("PubMed search", query = ran, total = total);
    if ids.length() == 0 {
        return {query: ran, total, articles: [], note};
    }
    string idList = string:'join(",", ...from json id in ids select id.toString());
    json summary = check eutils->get(path("esummary.fcgi", {db: "pubmed", id: idList, retmode: "json"}));
    map<json> result = check (check summary.result).ensureType();
    Article[] articles = from json id in ids
        let json entry = result[id.toString()] ?: {}
        where entry is map<json>
        select toArticle(id.toString(), entry);
    return {query: ran, total, articles, note};
}

# Fetches an article's abstract (see `get_abstract`).
#
# + pmid - PubMed id
# + return - the abstract, or an error if PubMed cannot be reached
isolated function getAbstract(string pmid) returns Abstract|error {
    if !re `^[0-9]{1,9}$`.isFullMatch(pmid.trim()) {
        return error("pmid must be a PubMed id (digits only)");
    }
    string text = check eutils->get(path("efetch.fcgi",
            {db: "pubmed", id: pmid.trim(), rettype: "abstract", retmode: "text"}));
    string trimmed = text.trim();
    if trimmed.length() > maxAbstractChars {
        trimmed = trimmed.substring(0, maxAbstractChars) + " …";
    }
    return {pmid: pmid.trim(), url: pubmedUrl(pmid.trim()), text: trimmed};
}

# Runs a PubMed search.
#
# + term - the PubMed query
# + retmax - how many ids to return
# + sinceYear - earliest publication year
# + reviewsOnly - restrict to reviews, meta-analyses and guidelines
# + return - the query that ran, the total number of matches and the ids, or an error
isolated function esearch(string term, int retmax, int? sinceYear, boolean reviewsOnly)
        returns [string, int, json[]]|error {
    string ran = reviewsOnly
        ? string `(${term}) AND (systematic review[pt] OR meta-analysis[pt] OR guideline[pt] OR review[pt])` : term;
    map<string> params = {db: "pubmed", term: ran, retmax: retmax.toString(), sort: "relevance", retmode: "json"};
    if sinceYear is int {
        params["datetype"] = "pdat";
        params["mindate"] = sinceYear.toString();
        params["maxdate"] = "3000";
    }
    json search = check eutils->get(path("esearch.fcgi", params));
    json[] ids = check (check search.esearchresult.idlist).ensureType();
    int total = check int:fromString(check (check search.esearchresult.count).ensureType(string));
    return [ran, total, ids];
}

# Builds an E-utilities path with NCBI's identification parameters.
#
# + utility - e.g. `esearch.fcgi`
# + params - the utility's parameters
# + return - path and query string
isolated function path(string utility, map<string> params) returns string {
    map<string> all = params.clone();
    all["tool"] = ncbiTool;
    if ncbiEmail != "" {
        all["email"] = ncbiEmail;
    }
    if ncbiApiKey != "" {
        all["api_key"] = ncbiApiKey;
    }
    string[] pairs = from [string, string] [name, value] in all.entries()
        select string `${name}=${checkpanic url:encode(value, "UTF-8")}`;
    return string `/${utility}?${string:'join("&", ...pairs)}`;
}

isolated function toArticle(string pmid, map<json> entry) returns Article {
    string[] authorNames = [];
    json authors = entry["authors"];
    if authors is json[] {
        foreach json author in authors {
            if author is map<json> && author["name"] is string {
                authorNames.push(<string>author["name"]);
            }
        }
    }
    string authorLine = authorNames.length() > 3
        ? string:'join(", ", ...authorNames.slice(0, 3)) + " et al."
        : string:'join(", ", ...authorNames);
    string[] types = [];
    json pubtype = entry["pubtype"];
    if pubtype is json[] {
        foreach json t in pubtype {
            if t is string {
                types.push(t);
            }
        }
    }
    string pubdate = entry["pubdate"] is string ? <string>entry["pubdate"] : "";
    string? doi = ();
    json elocation = entry["elocationid"];
    if elocation is string {
        regexp:Groups? groups = re `doi: *(\S+)`.findGroups(elocation);
        if groups is regexp:Groups && groups.length() > 1 {
            regexp:Span? span = groups[1];
            doi = span is regexp:Span ? span.substring() : ();
        }
    }
    return {
        pmid,
        title: entry["title"] is string ? <string>entry["title"] : "",
        journal: entry["source"] is string ? <string>entry["source"] : "",
        year: pubdate.length() >= 4 ? pubdate.substring(0, 4) : pubdate,
        authors: authorLine,
        publicationTypes: types,
        doi,
        url: pubmedUrl(pmid)
    };
}

isolated function pubmedUrl(string pmid) returns string => string `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
