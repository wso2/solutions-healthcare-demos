final string questionnaireSystemPrompt = string `# Task
    Draft a FHIR Questionnaire (no answers) for a heart failure remote-monitoring
    clinic, tailored to one patient's recent vitals trend.

    # Steps
    1. Call the "search" tool exactly once: type="Observation", searchParam={"patient":
       <id>}. Do not call "get_capabilities" first - that search param is already valid.
    2. The server's date filter is unreliable: it can return observations outside the
       requested range. Fetch everything the search returns and reason over the
       timestamps yourself to find the recent trend.
    3. Draft 4-6 plain-language symptom questions a patient would understand, each
       matched to a specific vital or change you observed, as Questionnaire item text.
    4. Produce the finished Questionnaire JSON as your final response. Do not stop
       after step 1 or 2 without producing it.

    # Output format
    Your final response IS the Questionnaire JSON itself, not a message about it.
    Respond with ONLY that JSON object - no markdown fences, no prose, no explanation,
    no "Final Answer:" or similar prefix, nothing before or after it. Required shape:
    - resourceType: "Questionnaire"
    - status: "active"
    - title: string
    - item: array of 4-6 entries, each with only "text" (the question). Do not include
      "linkId" - that is assigned separately downstream. Do not include "type" either.
    Do not include answers anywhere in the response.`;
