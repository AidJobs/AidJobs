"""Employer survey, step D: one ranked list of organisations (W-31).

Run on the user's machine, never by the backend or CI:

  python tools/survey/dedupe.py

Reads the committed survey files (step A's UNjobs lists and seed additions, step B's register
candidates) and the recorded decisions in source-survey/step-d-decisions.csv, and writes one row
per organisation, ranked by hiring evidence and then income, and the pairs that still need a
decision. No network access. The rules are in docs/architecture/source-survey.md, step D.

Records are joined when they are certainly the same organisation: the same registry number
(IATI identifiers embed a charity, company or tax number), the same website with compatible
names, or the same name in the same country. Weaker matches (an acronym, a similar name, the same
name in another country, a shared website with different names) are listed for a decision and
never joined until one is recorded.
"""
from __future__ import annotations

import csv
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
SURVEY = HERE.parents[1] / "docs" / "architecture" / "source-survey"

# Federal Reserve G.5A, 2024 annual averages (US dollars per unit), used only for ordering.
USD_PER = {"USD": 1.0, "GBP": 1.2781, "AUD": 0.6597, "CAD": 1 / 1.3699}

# Platforms and email providers: never an organisation's website.
PLATFORM_HOSTS = {
    "facebook.com", "linkedin.com", "twitter.com", "x.com", "instagram.com", "youtube.com",
    "sites.google.com", "google.com", "docs.google.com", "linktr.ee", "wordpress.com",
    "blogspot.com", "wixsite.com", "weebly.com", "squarespace.com", "github.io", "medium.com",
    "justgiving.com", "charitycommission.gov.uk", "oscr.org.uk", "acnc.gov.au", "gmail.com",
    "yahoo.com", "hotmail.com", "outlook.com", "shaw.ca", "telus.net", "rogers.com", "bell.net",
    "sympatico.ca", "bigpond.com",
}
# Hosts shared by unrelated organisations: never evidence of being the same one, though they
# can be an organisation's own website (who.int is WHO's).
SHARED_HOSTS = PLATFORM_HOSTS | {
    "gov.uk", "gov.au", "gc.ca", "canada.ca", "gouv.fr", "europa.eu", "ec.europa.eu",
    "admin.ch", "government.nl", "rijksoverheid.nl", "bund.de", "un.org", "who.int",
}

# IATI identifier prefixes that carry another register's number.
IATI_REGISTRY = {"GB-CHC": "uk", "GB-SC": "oscr", "US-EIN": "irs", "US-IRS": "irs",
                 "CA-CRA_ACR": "cra", "AU-ABN": "acnc"}

# The EU register names countries in words; the other sources use ISO codes.
EU_COUNTRIES = {
    "BELGIUM": "BE", "GERMANY": "DE", "FRANCE": "FR", "NETHERLANDS": "NL", "UNITED KINGDOM": "GB",
    "ITALY": "IT", "SPAIN": "ES", "UNITED STATES": "US", "SWITZERLAND": "CH", "ROMANIA": "RO",
    "AUSTRIA": "AT", "GREECE": "GR", "POLAND": "PL", "SWEDEN": "SE", "IRELAND": "IE",
    "DENMARK": "DK", "BULGARIA": "BG", "PORTUGAL": "PT", "FINLAND": "FI", "UKRAINE": "UA",
    "CZECH REPUBLIC": "CZ", "CROATIA": "HR", "SLOVENIA": "SI", "HUNGARY": "HU", "ESTONIA": "EE",
    "MOLDOVA, REPUBLIC OF": "MD", "LATVIA": "LV", "NORWAY": "NO", "MALTA": "MT", "TURKEY": "TR",
    "CYPRUS": "CY", "LUXEMBOURG": "LU", "LITHUANIA": "LT", "SLOVAKIA": "SK", "SERBIA": "RS",
    "LEBANON": "LB", "ISRAEL": "IL", "BRAZIL": "BR", "NORTH MACEDONIA": "MK", "CANADA": "CA",
    "KENYA": "KE", "PALESTINE (*)": "PS", "MEXICO": "MX", "AUSTRALIA": "AU", "SENEGAL": "SN",
    "INDIA": "IN", "ALBANIA": "AL", "COLOMBIA": "CO", "KOSOVO (*)": "XK", "ARMENIA": "AM",
    "JAPAN": "JP", "BOSNIA-HERZEGOVINA": "BA", "SOUTH AFRICA": "ZA", "INDONESIA": "ID",
    "ARGENTINA": "AR", "PHILIPPINES": "PH", "CONGO, DEMOCRATIC REPUBLIC OF": "CD", "GHANA": "GH",
    "THAILAND": "TH", "ECUADOR": "EC", "NIGERIA": "NG", "BANGLADESH": "BD", "UGANDA": "UG",
    "MONTENEGRO": "ME", "PAKISTAN": "PK", "DOMINICAN REPUBLIC": "DO", "LIBYA": "LY",
    "GEORGIA": "GE", "BOLIVIA": "BO", "RUSSIA, FEDERATION OF": "RU", "QATAR": "QA",
    "MALAYSIA": "MY", "NAMIBIA": "NA", "ZAMBIA": "ZM", "ICELAND": "IS", "LIECHTENSTEIN": "LI",
    "COSTA RICA": "CR", "CAMEROON": "CM", "KOREA, REPUBLIC OF": "KR", "TOGO": "TG",
    "SAINT LUCIA": "LC", "BENIN": "BJ", "URUGUAY": "UY", "CHILE": "CL", "SINGAPORE": "SG",
    "SEYCHELLES": "SC", "TRINIDAD AND TOBAGO": "TT", "CAMBODIA": "KH", "VIETNAM": "VN",
}

# A country in brackets is part of the name: "Médecins Sans Frontières (UK)" is the UK section.
COUNTRY_WORDS = re.compile(
    r"^(uk|u\.k\.?|usa|u\.s\.a?\.?|us|america|australia|canada|ireland|scotland|england|wales"
    r"|germany|deutschland|france|belgium|belgique|netherlands|nederland|sweden|sverige|norway"
    r"|denmark|finland|switzerland|suisse|schweiz|italy|italia|spain|espana|austria|japan"
    r"|korea|new zealand|nz|hong kong|india|kenya|uganda|south africa|europe"
    r"|nl|de|fr|be|ch|se|dk|no|fi|it|es|at|jp|au|ca|ie|gb|eu)$")

# Where a display name is taken from, best first. DG ECHO's list came last (step F), so it never
# changes an organisation's id.
NAME_ORDER = ["seed", "unjobs", "iati", "eu", "uk", "oscr", "acnc", "cra", "irs", "echo"]
ECHO_COUNTRIES = {**EU_COUNTRIES, "LUXEMBURG": "LU"}

LEGAL = re.compile(
    r"\b(the|inc|incorporated|ltd|limited|llc|l\.l\.c|corp|corporation|co|company|plc|cic"
    r"|gmbh|ggmbh|e\.?\s?v|asbl|aisbl|vzw|ivzw|stichting|ry|sa|srl|ong|aps|ab|as)\b")
BROAD = re.compile(
    r"\b(foundation|fund|trust|society|association|international|intl|global|worldwide"
    r"|usa|us|america|uk|charitable|charity|organisation|organization|org|of|for|and"
    r"|fondation|fundacion|fondazione|stiftung|fonds|federation)\b")


def fold(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = "".join(c for c in text if not unicodedata.combining(c)).lower()
    text = re.sub(r"\bu\.?n\.?(?=\s|$)", "united nations", text)  # "UN Office" is "United Nations Office"
    return text.replace("&", " and ")


def clean_domain(value: str) -> str:
    """A register's website field, as a host: the first word that looks like one."""
    host = next((w for w in (value or "").lower().split() if "." in w), "").strip(".,;/")
    return "" if host in PLATFORM_HOSTS or "." not in host else host


def _bracket(match: re.Match) -> str:
    inner = match.group(1).strip(" .")
    return f" {inner} " if COUNTRY_WORDS.match(inner) else " "


def strict_name(name: str) -> str:
    """Case, accents, punctuation, legal forms and 'the' removed: equal means the same name."""
    text = re.sub(r"\((.*?)\)", _bracket, fold(name))
    text = re.sub(r"[^a-z0-9 ]", " ", text)
    text = LEGAL.sub(" ", text)
    return " ".join(text.split())


def broad_name(name: str) -> str:
    """Also without generic words (foundation, international, usa...): only for suggestions."""
    return " ".join(BROAD.sub(" ", strict_name(name)).split())


def tokens(name: str) -> set[str]:
    return set(broad_name(name).split()) or set(strict_name(name).split())


def similar(a: str, b: str) -> float:
    left, right = tokens(a), tokens(b)
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def split_acronym(shown: str) -> tuple[str, str]:
    """'UNICEF - United Nations Children's Fund' and 'Mercy Corps (MC)' -> (name, acronym)."""
    shown = " ".join((shown or "").split())
    dash = re.match(r"^([A-Za-z0-9.&'\-]{2,15}) - (.+)$", shown)
    if dash and not re.search(r"\s", dash.group(1)):
        return dash.group(2).strip(), dash.group(1).strip()
    paren = re.match(r"^(.+?)\s*\(([^()]{2,15})\)$", shown)
    if paren and not re.search(r"\s", paren.group(2).strip()) \
            and not COUNTRY_WORDS.match(fold(paren.group(2)).strip(" .")):
        return paren.group(1).strip(), paren.group(2).strip()
    return shown, ""


ACRONYMS = {"USA", "US", "UK", "UN", "UNICEF", "UNHCR", "NGO", "AIDS", "HIV", "TB", "CARE", "PATH",
            "BRAC", "CIS", "ICRC", "ICC", "IRC", "MSF", "HALO", "WWF", "YMCA", "YWCA", "INC"}
SMALL_WORDS = {"of", "the", "and", "for", "in", "to", "on", "at", "by", "de", "la", "du", "des",
               "et", "y", "a"}


CAPITALISED_SOURCES = {"irs", "cra", "uk", "acnc", "oscr", "echo"}


def tidy_case(name: str) -> str:
    """Register names written in capitals made readable; acronyms and small words kept."""
    if not (name.isupper() and len(name) > 6):
        return name
    words = []
    for index, word in enumerate(name.split()):
        bare = word.strip("(),.-'\"")
        if bare in ACRONYMS - {"INC"}:
            words.append(word)
        elif index and bare.lower() in SMALL_WORDS:
            words.append(word.lower())
        else:
            part_case = "-".join(part.capitalize() for part in word.split("-"))
            words.append(re.sub(r"^([LDO]')([a-z])", lambda m: m.group(1) + m.group(2).upper(), part_case))
    return " ".join(words)


def shown_name(record) -> str:
    return tidy_case(record.name) if record.source in CAPITALISED_SOURCES else record.name


@dataclass
class Record:
    key: str
    source: str
    name: str
    acronym: str = ""
    country: str = ""
    kind: str = ""
    domain: str = ""
    income_usd: float | None = None
    income: str = ""
    currency: str = ""
    income_year: str = ""
    unjobs_jobs: int = 0
    note: str = ""
    family_hint: str = ""


@dataclass
class Decisions:
    merge: list[tuple[str, str, str]] = field(default_factory=list)
    separate: set[frozenset] = field(default_factory=set)
    exclude: dict[str, str] = field(default_factory=dict)
    family: dict[str, str] = field(default_factory=dict)
    name: dict[str, str] = field(default_factory=dict)
    link: list[tuple[str, str, str]] = field(default_factory=list)


# --- reading -----------------------------------------------------------------------------

def _rows(path: Path):
    with path.open(encoding="utf-8", newline="") as handle:
        yield from csv.DictReader(handle)


def read_registers(path: Path) -> list[Record]:
    records = []
    for row in _rows(path):
        name, acronym = split_acronym(row["name"])
        income = float(row["income"]) if row["income"] else None
        country = EU_COUNTRIES.get(row["country"], row["country"]) if row["source"] == "eu" \
            else row["country"].split("-")[0]
        records.append(Record(
            key=f"{row['source']}:{row['source_id']}", source=row["source"], name=name,
            acronym=acronym, country=country, kind=row["kind"],
            domain=clean_domain(row["website_domain"]),
            income_usd=None if income is None else income * USD_PER[row["currency"] or "USD"],
            income=row["income"], currency=row["currency"], income_year=row["income_year"],
            note=row["note"]))
    return records


def read_unjobs(path: Path, page: str) -> tuple[list[Record], list[tuple[str, str]]]:
    """Each entry, and (entry, entry it repeats) for the ones UNjobs lists twice."""
    records, repeats = [], []
    by_shown = {}
    rows = list(_rows(path))
    for row in rows:
        name, acronym = split_acronym(row["name_as_shown"])
        record = Record(key=f"unjobs-{page}:{row['position']}", source="unjobs", name=name,
                        acronym=acronym, kind=row["kind"],
                        unjobs_jobs=int(row["unjobs_jobs"] or 0), note=row["note"])
        records.append(record)
        by_shown[row["name_as_shown"]] = record.key
    for row in rows:
        if row["duplicate_of"] and row["duplicate_of"] in by_shown:
            repeats.append((f"unjobs-{page}:{row['position']}", by_shown[row["duplicate_of"]]))
    return records, repeats


def read_seeds(path: Path) -> list[Record]:
    return [Record(key=f"seed:{index}", source="seed", name=row["name"],
                   note=f"{row['list']}; recruitment system seen: {row['recruitment_system_seen']}"
                   if row["recruitment_system_seen"] else row["list"])
            for index, row in enumerate(_rows(path), start=1)]


def read_echo(path: Path) -> list[Record]:
    """DG ECHO's certified humanitarian NGOs (registers.py echo), when the file is there."""
    if not path.exists():
        return []
    return [Record(key=f"echo:{row['number']}", source="echo", name=row["name"],
                   country=ECHO_COUNTRIES.get(row["country"], row["country"]),
                   kind="EU humanitarian partner (DG ECHO)",
                   note=f"DG ECHO certificate: {row['certificate']} ({row['partner_code']})")
            for row in _rows(path)]


def read_decisions(path: Path) -> Decisions:
    decisions = Decisions()
    if not path.exists():
        return decisions
    for row in _rows(path):
        action, a, b, reason = row["action"], row["a"], row["b"], row["reason"]
        if action == "merge":
            decisions.merge.append((a, b, reason))
        elif action == "separate":
            decisions.separate.add(frozenset((a, b)))
        elif action == "exclude":
            decisions.exclude[a] = reason
        elif action == "family":
            decisions.family[a] = b
        elif action == "name":
            decisions.name[a] = b
        elif action == "family-link":
            decisions.link.append((a, b, reason))
        else:
            raise ValueError(f"unknown action in decisions: {action}")
    return decisions


# --- matching ----------------------------------------------------------------------------

class Groups:
    def __init__(self, keys):
        self.parent = {k: k for k in keys}
        self.why = defaultdict(list)

    def find(self, key):
        while self.parent[key] != key:
            self.parent[key] = self.parent[self.parent[key]]
            key = self.parent[key]
        return key

    def join(self, a, b, reason):
        """Join two records' groups; only a join that merges two groups is recorded."""
        ra, rb = self.find(a), self.find(b)
        if ra == rb:
            return
        self.parent[rb] = ra
        self.why[ra].extend(self.why.pop(rb, []))
        self.why[ra].append(f"{a} = {b}: {reason}")


def registry_links(records: list[Record]) -> list[tuple[str, str, str]]:
    """IATI identifiers that embed another register's number, matched to that register's row."""
    index = {}
    for r in records:
        if r.source in IATI_REGISTRY.values():
            number = r.key.split(":", 1)[1].lstrip("0")
            index[(r.source, number)] = r.key
            if r.source == "cra":
                index[(r.source, number[:9])] = r.key
    links = []
    for r in records:
        if r.source != "iati":
            continue
        ident = r.key.split(":", 1)[1]
        for prefix, source in IATI_REGISTRY.items():
            if ident.upper().startswith(prefix + "-"):
                number = ident[len(prefix) + 1:].replace(" ", "")
                if source == "irs":
                    number = number.replace("-", "")  # "13-5660870" is EIN 135660870
                number = number.lstrip("0")
                if source == "oscr" and not number.upper().startswith("SC"):
                    number = "SC" + number
                target = index.get((source, number)) or (
                    index.get((source, number[:9])) if source == "cra" else None)
                if target:
                    links.append((r.key, target, f"IATI identifier {ident} is {target}"))
    return links


def compatible(a: Record, b: Record) -> bool:
    """Names that can be the same organisation: similar words, or one is the other's acronym."""
    if similar(a.name, b.name) >= 0.5:
        return True
    for x, y in ((a, b), (b, a)):
        if x.acronym and fold(x.acronym) in {fold(y.acronym), strict_name(y.name).replace(" ", "")}:
            return True
        initials = "".join(w[0] for w in strict_name(y.name).split() if w not in {"of", "for", "and"})
        if len(initials) >= 3 and strict_name(x.name).replace(" ", "") == initials:
            return True
    return False


def distinctive(name: str) -> bool:
    """A name specific enough that the same name in two countries is one family."""
    words = broad_name(name).split()
    return len(words) >= 2 or (len(words) == 1 and len(words[0]) >= 6)


def match(records: list[Record], repeats, decisions: Decisions):
    """Join certain matches; return the groups, the uncertain pairs, and the family links
    (affiliates in different countries: kept apart, marked as one family)."""
    by_key = {r.key: r for r in records}
    groups = Groups(by_key)
    review: dict[frozenset, tuple[str, str, str]] = {}
    families: list[tuple[str, str]] = []

    def suggest(a, b, rule):
        pair = frozenset((a, b))
        if a != b and pair not in decisions.separate and groups.find(a) != groups.find(b):
            review.setdefault(pair, (a, b, rule))

    for a, b in repeats:
        groups.join(a, b, "UNjobs lists the same organisation twice")
    for a, b, reason in registry_links(records):
        groups.join(a, b, reason)

    by_domain = defaultdict(list)
    for r in records:
        if r.domain and r.domain not in SHARED_HOSTS:
            by_domain[r.domain].append(r)
    for members in by_domain.values():
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if frozenset((a.key, b.key)) in decisions.separate:
                    continue
                if a.country and b.country and a.country != b.country:
                    families.append((a.key, b.key))  # national offices of one network
                elif compatible(a, b):
                    groups.join(a.key, b.key, f"same website {a.domain}")
                else:
                    suggest(a.key, b.key, f"same website {a.domain}, different names")

    by_strict = defaultdict(list)
    for r in records:
        if strict_name(r.name):
            by_strict[strict_name(r.name)].append(r)
    for members in by_strict.values():
        located = [r for r in members if r.country]
        unlocated = [r for r in members if not r.country]
        for i, a in enumerate(located):
            for b in located[i + 1:]:
                if frozenset((a.key, b.key)) in decisions.separate:
                    continue
                if a.country == b.country:
                    groups.join(a.key, b.key, "same name, same country")
                elif distinctive(a.name):
                    families.append((a.key, b.key))
                else:
                    suggest(a.key, b.key, "same short name, different countries")
        countries = {r.country for r in located}
        for u in unlocated:
            if len(countries) == 1:
                for b in located:
                    if frozenset((u.key, b.key)) not in decisions.separate:
                        groups.join(u.key, b.key, "same name (one has no country)")
            elif distinctive(u.name):
                families.extend((u.key, b.key) for b in located)
            else:
                for b in located:
                    suggest(u.key, b.key, "same short name, several countries")
        for i, a in enumerate(unlocated):
            for b in unlocated[i + 1:]:
                if frozenset((a.key, b.key)) not in decisions.separate:
                    groups.join(a.key, b.key, "same name")

    # The same acronym and a similar name ("WFP - World Food Programme" and "United Nations
    # World Food Programme (WFP)"), where the countries do not differ.
    acronyms = defaultdict(list)
    for r in records:
        if len(r.acronym) >= 3:
            acronyms[fold(r.acronym)].append(r)
    for members in acronyms.values():
        if len(members) > 6:
            continue  # a common acronym ("IRC", "ICC"): left to the suggestions below
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                pair = frozenset((a.key, b.key))
                if pair in decisions.separate or similar(a.name, b.name) < 0.5:
                    continue
                if not a.country or not b.country or a.country == b.country:
                    groups.join(a.key, b.key, "same acronym, similar name")

    for a, b, reason in decisions.merge:
        if a in by_key and b in by_key:
            groups.join(a, b, f"decided: {reason}")
    # National members of one network that the rules above did not link (different names).
    families.extend((a, b) for a, b, _ in decisions.link if a in by_key and b in by_key)

    # A UNjobs entry or seed addition whose name is a register name without its country
    # ("Médecins du Monde" and "Medecins du Monde France"): usually the head office.
    country_names = {fold(n) for n in EU_COUNTRIES} | {"uk", "usa", "us"}
    without_country = defaultdict(list)
    for r in records:
        words = strict_name(r.name).split()
        if r.country and len(words) > 1 and (words[-1] in country_names
                                             or COUNTRY_WORDS.match(words[-1])):
            without_country[" ".join(words[:-1])].append(r)
    tied = {groups.find(r.key) for r in records if r.country}
    for r in records:
        if not r.country and groups.find(r.key) not in tied and strict_name(r.name) in without_country:
            for other in without_country[strict_name(r.name)]:
                suggest(r.key, other.key, "name plus a country")

    # Suggestions: the same broad name, or an acronym that matches.
    by_broad = defaultdict(list)
    for r in records:
        key = broad_name(r.name)
        if len(key) >= 4:
            by_broad[key].append(r)
    for members in by_broad.values():
        if len(members) > 12:
            continue  # a common word left alone ("relief", "hope"): not a useful suggestion
        for i, a in enumerate(members):
            for b in members[i + 1:]:
                if not a.country or not b.country or a.country == b.country:
                    suggest(a.key, b.key, "similar name")
    by_acronym = defaultdict(list)
    for r in records:
        if r.acronym and len(r.acronym) >= 3:
            by_acronym[fold(r.acronym)].append(r)
    for r in records:
        squashed = strict_name(r.name).replace(" ", "")
        if 3 <= len(squashed) <= 8 and squashed in by_acronym:
            for other in by_acronym[squashed]:
                suggest(r.key, other.key, "name is the other's acronym")
    for members in by_acronym.values():
        if len(members) <= 6:
            for i, a in enumerate(members):
                for b in members[i + 1:]:
                    if similar(a.name, b.name) >= 0.3:
                        suggest(a.key, b.key, "same acronym")

    pending = [v for k, v in review.items()
               if groups.find(v[0]) != groups.find(v[1]) and k not in decisions.separate]
    return groups, pending, families


# --- output ------------------------------------------------------------------------------

ORG_FIELDS = ["rank", "org_id", "name", "acronym", "family", "kind", "country", "website_domain",
              "unjobs_jobs", "income_usd", "income_from", "evidence", "sources", "note"]
REVIEW_FIELDS = ["rule", "a", "a_name", "a_country", "a_domain", "b", "b_name", "b_country",
                 "b_domain"]


def _display(members: list[Record]) -> Record:
    """The best source's plainest name: the shortest that is more than an acronym."""
    return min(members, key=lambda r: (NAME_ORDER.index(r.source), len(r.name) <= 6, len(r.name)))


def _display_name(group: list[Record], decisions: Decisions) -> str:
    chosen = next((decisions.name[r.key] for r in group if r.key in decisions.name), "")
    return chosen or shown_name(_display(group))


def _strength(group: list[Record]) -> tuple:
    jobs = sum(r.unjobs_jobs for r in group)
    income = max((r.income_usd for r in group if r.income_usd is not None), default=0)
    return (-jobs, -income, -len(group))


def family_label(names: list[str]) -> str:
    """The words the members' names start with ("Save the Children"), else the first name
    (the caller lists the strongest member first)."""
    split = [re.sub(r"^the\s+", "", n, flags=re.IGNORECASE).split() for n in names]
    common = []
    for words in zip(*split):
        if len({w.lower().strip(",.()-") for w in words}) != 1:
            break
        common.append(words[0].strip(",.()-"))
    label = " ".join(common).strip(" -,(")
    return label if distinctive(label) else names[0]


UN_SECRETARIAT = "UN Secretariat (careers.un.org)"


def families_of(members: dict[str, list[Record]], families, groups: Groups,
                decisions: Decisions) -> dict[str, str]:
    linked = Groups(members)
    for a, b in families:
        linked.join(groups.find(a), groups.find(b), "family")
    clusters = defaultdict(list)
    for root in members:
        clusters[linked.find(root)].append(root)
    labels = {}
    for roots in clusters.values():
        if len(roots) > 1:
            roots.sort(key=lambda r: _strength(members[r]))
            label = family_label([_display_name(members[r], decisions) for r in roots])
            labels.update({r: label for r in roots})
        for root in roots:
            if any("un-secretariat" in r.kind for r in members[root]):
                labels[root] = UN_SECRETARIAT  # departments and offices hiring through one site
        # A recorded family names the whole cluster; "none" means it is not a family.
        chosen = next((decisions.family[r.key] for root in roots for r in members[root]
                       if r.key in decisions.family), "")
        if chosen:
            for root in roots:
                if chosen == "none":
                    labels.pop(root, None)
                else:
                    labels[root] = chosen
    return labels


def organisations(records: list[Record], groups: Groups, decisions: Decisions,
                  families=()) -> list[dict]:
    members = defaultdict(list)
    for r in records:
        members[groups.find(r.key)].append(r)
    labels = families_of(members, families, groups, decisions)
    rows = []
    for root, group in members.items():
        if any(r.key in decisions.exclude for r in group):
            continue
        anchor = min(group, key=lambda r: (NAME_ORDER.index(r.source), r.key))
        domains = Counter(r.domain for r in group if r.domain and r.domain not in SHARED_HOSTS) \
            or Counter(r.domain for r in group if r.domain)  # who.int is WHO's own
        jobs = sum(r.unjobs_jobs for r in group)
        incomes = [r for r in group if r.income_usd is not None]
        richest = max(incomes, key=lambda r: r.income_usd) if incomes else None
        countries = Counter(r.country for r in group if r.country)
        family = labels.get(root, "")
        notes = sorted({r.note for r in group if r.note and r.source != "unjobs"}
                       | {r.note for r in group if r.source == "unjobs" and r.note})
        evidence = "hiring (UNjobs)" if jobs else ("income" if richest else "listed only")
        acronym = next((r.acronym for r in sorted(group, key=lambda r: NAME_ORDER.index(r.source))
                        if r.acronym), "")
        rows.append({
            "org_id": anchor.key, "name": _display_name(group, decisions), "acronym": acronym,
            "family": family,
            "kind": "; ".join(sorted({r.kind for r in group if r.kind})),
            "country": countries.most_common(1)[0][0] if countries else "",
            "website_domain": domains.most_common(1)[0][0] if domains else "",
            "unjobs_jobs": jobs or "",
            "income_usd": f"{richest.income_usd:.0f}" if richest else "",
            "income_from": f"{richest.key} ({richest.currency} {richest.income}, {richest.income_year})"
            if richest else "",
            "evidence": evidence,
            "sources": "; ".join(sorted(r.key for r in group)),
            "note": " | ".join(notes),
        })
    order = {"hiring (UNjobs)": 0, "income": 1, "listed only": 2}
    rows.sort(key=lambda o: (order[o["evidence"]], -(o["unjobs_jobs"] or 0),
                             -float(o["income_usd"] or 0), o["name"].lower()))
    for rank, row in enumerate(rows, start=1):
        row["rank"] = rank
    return rows


def review_rows(pending, by_key: dict[str, Record]) -> list[dict]:
    rows = []
    for a, b, rule in pending:
        ra, rb = by_key[a], by_key[b]
        rows.append({"rule": rule, "a": a, "a_name": ra.name, "a_country": ra.country,
                     "a_domain": ra.domain, "b": b, "b_name": rb.name, "b_country": rb.country,
                     "b_domain": rb.domain})
    rows.sort(key=lambda r: (r["rule"], r["a_name"].lower()))
    return rows


def _write(path: Path, fields, rows):
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)


def load(survey: Path = SURVEY):
    records = read_registers(survey / "register-candidates.csv")
    repeats = []
    for page, name in (("un", "unjobs-un-organisations-2026-10-26.csv"),
                       ("nonun", "unjobs-non-un-organisations-2026-10-26.csv")):
        found, again = read_unjobs(survey / name, page)
        records += found
        repeats += again
    records += read_seeds(survey / "seed-additions.csv")
    records += read_echo(survey / "echo-partners.csv")
    return records, repeats, read_decisions(survey / "step-d-decisions.csv")


def main() -> int:
    records, repeats, decisions = load()
    unknown = [k for k in [*decisions.exclude, *decisions.family, *decisions.name,
                           *(x for a, b, _ in decisions.merge for x in (a, b)),
                           *(x for a, b, _ in decisions.link for x in (a, b)),
                           *(x for pair in decisions.separate for x in pair)]
               if k not in {r.key for r in records}]
    if unknown:
        print(f"decisions name records that do not exist: {sorted(set(unknown))[:10]}")
        return 1
    groups, pending, families = match(records, repeats, decisions)
    rows = organisations(records, groups, decisions, families)
    _write(SURVEY / "organisations.csv", ORG_FIELDS, rows)
    _write(SURVEY / "step-d-review.csv", REVIEW_FIELDS,
           review_rows(pending, {r.key: r for r in records}))
    evidence = Counter(r["evidence"] for r in rows)
    print(f"records: {len(records):,}; organisations: {len(rows):,} "
          f"({', '.join(f'{k} {v:,}' for k, v in evidence.items())}); "
          f"excluded: {len(decisions.exclude)}; pairs awaiting a decision: {len(pending):,}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
