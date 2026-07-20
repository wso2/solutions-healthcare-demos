"""Registry of the open, redistributable sources that make up the HFrEF corpus.

The corpus is built from open-access equivalents that carry the same clinical thresholds:

- StatPearls (NCBI Bookshelf, CC BY-NC-ND 4.0): the open-access textbook chapters.
- MedlinePlus and NHLBI (US-gov public domain): the plain-language patient-education wording.
- Open-access PMC guideline-summary articles: legally restate the AHA/ACC/HFSA recommendations.

Licensed guideline PDFs, if a team has the rights, can be dropped into the gitignored corpus/raw/
directory and added here as ``kind="pdf"`` entries.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Source:
    """One corpus source: where to get it, who it is written for, and how to cite it."""

    id: str
    kind: str  # "html" | "pdf" | "markdown"
    locator: str  # URL for html, path under the service root for pdf/markdown
    audience: str  # "clinician" | "patient"
    license: str
    citation: str


SOURCES: list[Source] = [
    Source(
        "statpearls-heart-failure",
        "html",
        "https://www.ncbi.nlm.nih.gov/books/NBK430873/",
        "clinician",
        "CC BY-NC-ND 4.0",
        "StatPearls: Heart Failure (NBK430873)",
    ),
    Source(
        "statpearls-hf-ejection-fraction",
        "html",
        "https://www.ncbi.nlm.nih.gov/books/NBK553115/",
        "clinician",
        "CC BY-NC-ND 4.0",
        "StatPearls: Heart Failure and Ejection Fraction (NBK553115)",
    ),
    Source(
        "statpearls-lv-failure",
        "html",
        "https://www.ncbi.nlm.nih.gov/books/NBK537098/",
        "clinician",
        "CC BY-NC-ND 4.0",
        "StatPearls: Left Ventricular Failure (NBK537098)",
    ),
    Source(
        "nhlbi-heart-failure",
        "html",
        "https://www.nhlbi.nih.gov/health/heart-failure",
        "clinician",
        "US-gov public domain",
        "NHLBI: Heart Failure",
    ),
    Source(
        "medlineplus-heart-failure",
        "html",
        "https://medlineplus.gov/heartfailure.html",
        "patient",
        "US-gov public domain",
        "MedlinePlus: Heart Failure",
    ),
    Source(
        "medlineplus-hf-home-care",
        "html",
        "https://medlineplus.gov/ency/patientinstructions/000112.htm",
        "patient",
        "US-gov public domain",
        "MedlinePlus: Heart failure - home care",
    ),
    Source(
        "pmc-hf-guideline-summary",
        "html",
        "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10457686/",
        "clinician",
        "open access (CC BY)",
        "2022 AHA/ACC/HFSA HF Guideline summary (PMC10457686)",
    ),
    Source(
        "careloop-feature-glossary",
        "markdown",
        "corpus/feature_glossary.md",
        "clinician",
        "project documentation",
        "Care Loop heart-dataset feature glossary",
    ),
]
