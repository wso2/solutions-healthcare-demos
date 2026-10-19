# One PubMed article, as summarised for an agent.
#
# + pmid - PubMed id
# + title - article title
# + journal - journal (abbreviated, as PubMed lists it)
# + year - publication year
# + authors - first three authors, then "et al." when there are more
# + publicationTypes - e.g. "Review", "Meta-Analysis", "Randomized Controlled Trial"
# + doi - DOI, when PubMed has one
# + url - the article's PubMed page
type Article record {|
    string pmid;
    string title;
    string journal;
    string year;
    string authors;
    string[] publicationTypes;
    string? doi;
    string url;
|};

# The answer to a PubMed search.
#
# + query - the PubMed query that ran
# + total - how many articles match in all
# + articles - the most relevant ones
# + note - set when the search was broadened because nothing matched the query as written
type SearchResult record {|
    string query;
    int total;
    Article[] articles;
    string? note = ();
|};

# An article's abstract.
#
# + pmid - PubMed id
# + url - the article's PubMed page
# + text - title, authors, journal and abstract, as PubMed formats them (truncated if long)
type Abstract record {|
    string pmid;
    string url;
    string text;
|};
