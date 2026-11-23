"""
Title facts worked out when read (W-42; growth plan decision 14; UX-08 item 11).

Fixed lists in code with tests. Nothing is stored on job rows. Sectors and
functions are title-only. A capped description prefix may fill only high-precision
gaps (grade, contract, duration, remote, open-to). French, Spanish and Portuguese
function rules are deferred; English function rules only in W-42.
"""
from __future__ import annotations

import re
from typing import Any, Optional

# Cap applied in SQL as left(description, N) when the cache is rebuilt (PR2).
DESCRIPTION_PREFIX_LIMIT = 500

# Curly apostrophe, matching apps/frontend/lib/site/facts.ts.
_APOS = "\u2019"

CONTRACTS = (
    "Consultancy",
    "Fixed term",
    "Temporary",
    "Internship",
    "Fellowship",
)
OPEN_TO = ("International", "Nationals")
LANGUAGES = ("English", "French", "Spanish", "Portuguese")
LEVELS = (
    "Entry",
    "Mid-career",
    "Senior",
    "Leadership",
    "Support staff",
)

SDG: dict[int, dict[str, Any]] = {
    1: {"goal": 1, "name": "No poverty", "colour": "#E5243B"},
    2: {"goal": 2, "name": "Zero hunger", "colour": "#DDA63A"},
    3: {"goal": 3, "name": "Good health and well-being", "colour": "#4C9F38"},
    4: {"goal": 4, "name": "Quality education", "colour": "#C5192D"},
    5: {"goal": 5, "name": "Gender equality", "colour": "#FF3A21"},
    6: {"goal": 6, "name": "Clean water and sanitation", "colour": "#26BDE2"},
    10: {"goal": 10, "name": "Reduced inequalities", "colour": "#DD1367"},
    13: {"goal": 13, "name": "Climate action", "colour": "#3F7E44"},
    16: {
        "goal": 16,
        "name": "Peace, justice and strong institutions",
        "colour": "#00689D",
    },
}

_SECTOR_RULES: list[tuple[str, Optional[int], re.Pattern[str]]] = [
    (
        "Education",
        4,
        re.compile(
            r"\beducat|\bschool|\blearning\b|[ée]ducation|educaci[oó]n|\bteach|"
            r"early childhood|\bECD\b|pre-service|curricul",
            re.I,
        ),
    ),
    (
        "Health",
        3,
        re.compile(
            r"\bhealth\b|sant[ée]|\bsalud\b|immuni[sz]|vaccin|\bpolio\b|malaria|"
            r"\bHIV\b|epidemi|\bnurs(e|ing)\b|first aid|pre-hospital|\bmedical\b|"
            r"maternal|newborn|\bMHPSS\b",
            re.I,
        ),
    ),
    (
        "Child protection",
        16,
        re.compile(
            r"child protection|protecci[oó]n (de la )?ni[ñn]ez|"
            r"protection de l.enfant|justice (pour|for) (les )?enfants|"
            r"juvenile justice|violence against children|children on the move",
            re.I,
        ),
    ),
    (
        "Nutrition",
        2,
        re.compile(
            r"nutrition|breastfeeding|\bBFHI\b|food security|\bIYCF\b|"
            r"stunting|malnutrition",
            re.I,
        ),
    ),
    (
        "WASH",
        6,
        re.compile(r"\bWASH\b|\bwater\b|sanitation|hygiene|\beau\b", re.I),
    ),
    (
        "Gender",
        5,
        re.compile(
            r"\bgender\b|\bGBV\b|gender-based|women.s empowerment|\bPSEA\b",
            re.I,
        ),
    ),
    (
        "Social protection",
        1,
        re.compile(
            r"social protection|social policy|cash transfer|\(cash\)|poverty|"
            r"child wellbeing|social inclusion",
            re.I,
        ),
    ),
    (
        "Climate & environment",
        13,
        re.compile(r"climate|environment|environnement|resilien", re.I),
    ),
    (
        "Disability inclusion",
        10,
        re.compile(r"disabilit|inclusive education", re.I),
    ),
    (
        "Emergencies",
        None,
        re.compile(
            r"emergenc|humanitarian|\bcrisis\b|disaster|\bDRR\b|\bDRM\b|"
            r"preparedness|\brefugee|displac|\bsurge\b",
            re.I,
        ),
    ),
    (
        "Behaviour change",
        None,
        re.compile(
            r"\bSBC\b|behaviou?r change|\bC4D\b|community engagement|"
            r"social mobili[sz]ation",
            re.I,
        ),
    ),
    (
        "Adolescents & youth",
        None,
        re.compile(r"adolescen|\byouth\b|young people|\bUPSHIFT\b", re.I),
    ),
]

SECTORS: tuple[str, ...] = tuple(name for name, _, _ in _SECTOR_RULES)
SECTOR_SDG: dict[str, Optional[dict[str, Any]]] = {
    name: (SDG[sdg] if sdg is not None else None) for name, sdg, _ in _SECTOR_RULES
}

# English-only in W-42. FR/ES/PT function rules come later.
# "Programme management" is narrow: manager/management/head of, not "Programme Officer".
_FUNCTION_RULES: list[tuple[str, re.Pattern[str]]] = [
    (
        "M&E",
        re.compile(
            r"\bM&E\b|\bMEL\b|monitoring.{0,20}evaluation|evaluation.{0,20}learning|"
            r"monitoring, evaluation|\bMEAL\b",
            re.I,
        ),
    ),
    (
        "Finance",
        re.compile(
            r"\bfinance\b|\bbudget\b|\baccountant\b|\btreasury\b|financial management",
            re.I,
        ),
    ),
    (
        "HR",
        re.compile(
            r"human resources|\bHR\b|people operations|talent acquisition|"
            r"\brecruitment\b",
            re.I,
        ),
    ),
    (
        "Logistics/Supply",
        re.compile(
            r"\blogistics\b|supply chain|\bprocurement\b|\bwarehouse\b|"
            r"supply management",
            re.I,
        ),
    ),
    (
        "Communications",
        re.compile(
            r"\bcommunications?\b|media relations|public information|\bcomms\b",
            re.I,
        ),
    ),
    (
        "Partnerships",
        re.compile(r"\bpartnerships?\b|external relations|donor relations", re.I),
    ),
    (
        "Legal",
        re.compile(r"\blegal\b|\bcounsel\b|\battorney\b|\blawyer\b", re.I),
    ),
    (
        "IT",
        re.compile(
            r"\binformation technology\b|\bICT\b|software engineer|"
            r"systems administrator|\bDevOps\b",
            re.I,
        ),
    ),
    (
        "Fundraising",
        re.compile(r"fundrais|resource mobili[sz]ation|\bphilanthropy\b", re.I),
    ),
    (
        "Programme management",
        re.compile(
            r"programme management|program management|"
            r"\bprogramme manager\b|\bprogram manager\b|"
            r"head of programme|head of program|"
            r"chief of party|\bproject manager\b",
            re.I,
        ),
    ),
]

FUNCTIONS: tuple[str, ...] = tuple(name for name, _ in _FUNCTION_RULES)

_NO_STEP = {
    "A": 1,
    "B": 2,
    "C": 3,
    "D": 4,
    "E": 5,
    "1": 1,
    "2": 2,
    "3": 3,
    "4": 4,
    "5": 5,
}

_MIN_YEARS: dict[str, dict[str, int]] = {
    "P": {"1": 0, "2": 2, "3": 5, "4": 7, "5": 10},
    "D": {"1": 15, "2": 15},
    "NO": {"1": 1, "2": 2, "3": 5, "4": 8, "5": 10},
    "G": {"1": 0, "2": 1, "3": 2, "4": 3, "5": 5, "6": 7, "7": 10},
}

_GRADE_RE = re.compile(r"\b(P|NO|G|GS|D)[- ]?([1-7]|[A-E])\b")
_DURATION_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(months?|mois|meses|weeks?|semaines|days?|jours)\b",
    re.I,
)
_REMOTE_RE = re.compile(
    r"\bremote(ly)?\b|home[- ]based|work from home|télétravail|remoto",
    re.I,
)
_MEL_LEARNING_RE = re.compile(
    r"(monitoring|evaluation|accountability|reporting)[^,#()]{0,25}\blearning\b|"
    r"\blearning and reporting\b",
    re.I,
)

# Stored employer text → demo contract union. Unmapped values leave the title result.
_CONTRACT_TYPE_MAP: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"intern", re.I), "Internship"),
    (re.compile(r"fellow", re.I), "Fellowship"),
    (re.compile(r"consult", re.I), "Consultancy"),
    (
        re.compile(
            r"\bTA\b|temporary|temporaire|364\s*days|temp(?:orary)?\s+appointment",
            re.I,
        ),
        "Temporary",
    ),
    (
        re.compile(
            r"\bFT\b|\bFTA\b|fixed[\s-]?term|continuing|permanent|"
            r"fixed\s+term\s+appointment",
            re.I,
        ),
        "Fixed term",
    ),
]

_LANG_CODE_MAP = {
    "en": "English",
    "eng": "English",
    "english": "English",
    "fr": "French",
    "fra": "French",
    "fre": "French",
    "french": "French",
    "es": "Spanish",
    "spa": "Spanish",
    "spanish": "Spanish",
    "pt": "Portuguese",
    "por": "Portuguese",
    "portuguese": "Portuguese",
}


def _without_mel_learning(text: str) -> str:
    return _MEL_LEARNING_RE.sub(" ", text)


def _sectors_of(title: str) -> list[str]:
    clean = _without_mel_learning(title)
    return [name for name, _, pattern in _SECTOR_RULES if pattern.search(clean)]


def _functions_of(title: str) -> list[str]:
    return [name for name, pattern in _FUNCTION_RULES if pattern.search(title)]


def _sdgs_of(sectors: list[str]) -> list[dict[str, Any]]:
    seen: set[int] = set()
    out: list[dict[str, Any]] = []
    for sector in sectors:
        sdg = SECTOR_SDG.get(sector)
        if sdg and sdg["goal"] not in seen:
            seen.add(sdg["goal"])
            out.append(dict(sdg))
    return out


def _contract_of(text: str) -> Optional[str]:
    if re.search(
        r"\bintern(ship)?\b|\bstagiaire\b|\bpasant[ií]a\b|\bestagi[aá]rio",
        text,
        re.I,
    ):
        return "Internship"
    if re.search(r"\bfellow(ship)?\b", text, re.I):
        return "Fellowship"
    if re.search(
        r"consult(ant|ancy|ante|ance|oría|oria|or)\b|\bconsultor",
        text,
        re.I,
    ):
        return "Consultancy"
    if re.search(r"\bTA\b|temporary|temporaire|\b364 days\b", text, re.I):
        return "Temporary"
    if re.search(r"\bFT\b|fixed[- ]term|\bFTA\b|continuing|permanent", text, re.I):
        return "Fixed term"
    return None


def _grade_of(text: str) -> Optional[str]:
    match = _GRADE_RE.search(text)
    if not match:
        return None
    kind = "G" if match.group(1) == "GS" else match.group(1)
    return f"{kind}-{match.group(2)}"


def _level_of(
    title: str, grade: Optional[str], contract: Optional[str]
) -> Optional[str]:
    if contract in ("Internship", "Fellowship"):
        return "Entry"
    if grade:
        kind, step = grade.split("-", 1)
        if kind == "P":
            try:
                n = int(step)
            except ValueError:
                n = -1
            if n <= 2:
                return "Entry"
            if n == 3:
                return "Mid-career"
            return "Senior"
        if kind == "D":
            return "Leadership"
        if kind == "G":
            return "Support staff"
        if kind == "NO":
            mapped = _NO_STEP.get(step)
            if mapped == 1:
                return "Entry"
            if mapped is not None and mapped <= 3:
                return "Mid-career"
            if mapped is not None:
                return "Senior"
    if re.search(r"\b(chief|head of|director|representative)\b", title, re.I):
        return "Leadership"
    if re.search(r"\bsenior\b", title, re.I):
        return "Senior"
    return None


def typical_experience(grade: str) -> Optional[str]:
    kind, step = grade.split("-", 1)
    key = str(_NO_STEP.get(step, "")) if kind == "NO" else step
    years = _MIN_YEARS.get(kind, {}).get(key)
    if years is None:
        return None
    if years == 0:
        return "usually no minimum experience"
    if kind == "D" and step == "2":
        return f"usually more than 15 years{_APOS} experience"
    return f"usually {years}+ years{_APOS} experience"


def _duration_of(text: str) -> Optional[str]:
    match = _DURATION_RE.search(text)
    if not match:
        return None
    number = match.group(1).replace(",", ".")
    unit = match.group(2).lower()
    if unit.startswith("mo") or unit.startswith("mes"):
        en = "month"
    elif unit.startswith("w") or unit.startswith("sem"):
        en = "week"
    else:
        en = "day"
    plural = "" if number == "1" else "s"
    return f"{number} {en}{plural}"


def _open_to_of(text: str, grade: Optional[str]) -> Optional[str]:
    if re.search(r"international candidates only|open (for|to) international", text, re.I):
        return "International"
    if re.search(
        r"nationals? only|open to nationals|ressortissants|"
        r"\bnational consultant|\(national\)|national\)",
        text,
        re.I,
    ):
        return "Nationals"
    if grade and re.match(r"^(NO|G)-", grade):
        return "Nationals"
    if grade and re.match(r"^(P|D)-", grade):
        return "International"
    return None


def _language_of(title: str) -> str:
    if re.search(r"\b(estagi[aá]rio|comunica[cç][aã]o|apoio)\b", title, re.I):
        return "Portuguese"
    if re.search(
        r"\b(para|del|niñez|metodológica|consultoría|estrategia|fortalecimiento)\b",
        title,
        re.I,
    ):
        return "Spanish"
    if re.search(
        r"\b(chargé|chargée|officier|santé|appui|suivi|formateurs?|"
        r"consultance|enfants|mise en oeuvre|postes|et)\b",
        title,
        re.I,
    ) and re.search(r"[éèàçê]|\b(des|du|pour)\b", title, re.I):
        return "French"
    return "English"


def _remote_of(text: str) -> bool:
    return bool(_REMOTE_RE.search(text))


def map_contract_type(stored: Optional[str]) -> Optional[str]:
    """Map a stored employer contract_type into the demo union, or None if unmapped."""
    if not stored or not str(stored).strip():
        return None
    text = str(stored).strip()
    for pattern, label in _CONTRACT_TYPE_MAP:
        if pattern.search(text):
            return label
    return None


def map_advert_language(stored: Optional[str]) -> Optional[str]:
    """Map stored advert_language (name or code) to a demo language, or None."""
    if not stored or not str(stored).strip():
        return None
    key = str(stored).strip().lower().replace("_", "-")
    if "-" in key:
        key = key.split("-", 1)[0]
    return _LANG_CODE_MAP.get(key)


def _fill_precision_gaps(
    title_facts: dict[str, Any], description_prefix: str
) -> None:
    """Fill only high-precision empty fields from a capped description prefix."""
    if not description_prefix:
        return
    if title_facts["grade"] is None:
        title_facts["grade"] = _grade_of(description_prefix)
    if title_facts["contract"] is None:
        title_facts["contract"] = _contract_of(description_prefix)
    if title_facts["duration"] is None:
        title_facts["duration"] = _duration_of(description_prefix)
    if not title_facts["remote"] and _remote_of(description_prefix):
        title_facts["remote"] = True
    if title_facts["openTo"] is None:
        # Grade-derived open-to uses the (possibly just filled) grade; explicit
        # nationals/international phrases also apply from the description.
        title_facts["openTo"] = _open_to_of(description_prefix, title_facts["grade"])


def facts_of(
    title: str,
    description: Optional[str] = None,
    *,
    contract_type: Optional[str] = None,
    is_remote: Optional[bool] = None,
    advert_language: Optional[str] = None,
) -> dict[str, Any]:
    """
    Work out title facts for one job.

    Sectors and functions are title-only. Description (capped) may fill grade,
    contract, duration, remote, and open-to when still empty. Stored capture
    fields override only when they map into the fixed lists; unmapped values
    leave the title/description result. is_remote overrides only when True.
    """
    title = title or ""
    grade = _grade_of(title)
    contract = _contract_of(title)
    sectors = _sectors_of(title)
    functions = _functions_of(title)
    facts: dict[str, Any] = {
        "contract": contract,
        "grade": grade,
        "duration": _duration_of(title),
        "openTo": _open_to_of(title, grade),
        "remote": _remote_of(title),
        "language": _language_of(title),
        "sectors": sectors,
        "sdgs": _sdgs_of(sectors),
        "level": None,  # set after overrides
        "functions": functions,
    }

    if description:
        prefix = description[:DESCRIPTION_PREFIX_LIMIT]
        _fill_precision_gaps(facts, prefix)

    mapped_contract = map_contract_type(contract_type)
    if mapped_contract is not None:
        facts["contract"] = mapped_contract

    if is_remote is True:
        facts["remote"] = True

    mapped_lang = map_advert_language(advert_language)
    if mapped_lang is not None:
        facts["language"] = mapped_lang

    # Open-to from grade when still empty after description/overrides.
    if facts["openTo"] is None and facts["grade"] is not None:
        facts["openTo"] = _open_to_of("", facts["grade"])

    facts["level"] = _level_of(title, facts["grade"], facts["contract"])
    facts["sdgs"] = _sdgs_of(facts["sectors"])
    return facts


def grade_hint(grade: str) -> str:
    kind, step = grade.split("-", 1)
    exp = typical_experience(grade)
    masters = f"master{_APOS}s"
    tail = (
        f"; {exp} (UN standard with a {masters} degree; agencies vary)"
        if exp
        else ""
    )
    if kind == "P":
        return f"UN Professional grade {grade}: internationally recruited{tail}"
    if kind == "D":
        return f"UN Director grade {grade}{tail}"
    if kind == "NO":
        return f"UN National Officer grade {grade}: for nationals of the country{tail}"
    if kind == "G":
        return f"UN General Service grade {grade}: locally recruited{tail}"
    return f"Grade {step}"
