"""Role-content survey (W-54), Phase 1: job titles grouped into roles.

Run on the user's machine; CI runs only `build` and the tests:

  python tools/survey/roles.py titles   # every title seen -> the local work folder (never committed)
  python tools/survey/roles.py counts   # local titles -> role-counts.csv, title-variants.csv, review list
  python tools/survey/roles.py build    # committed counts and decisions -> role-map.csv

`titles` reads what is already on disk, with no request: step F's saved feeds and listing pages
(tools/survey/raw/confirm/), the job addresses in Common Crawl's index rows kept in
survey-raw-archive/ (steps E and M1 to M5), and the titles of the adverts the reading batches
saved (adverts.py). Titles stay local: the committed files hold counts per organisation by role,
and title variants pooled across organisations, each seen at two or more of them, with no
organisation named (role-survey.md, sections 6 and 19.5).

The grouping is by fixed rules (`classify`): a function, a sector or theme, a level and four
contexts, read from the title's words, with a published grade kept as published. Titles the rules
cannot place go to a local review list; a decision is committed (role-decisions.csv) only for a
normalised title seen at two or more organisations.
"""
from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import unquote, urlsplit

from careers import read_csv, site_host, tenant_of

HERE = Path(__file__).resolve().parent
DOCS = HERE.parents[1] / "docs" / "architecture"
SURVEY = DOCS / "source-survey"
ROLES = DOCS / "role-survey"
RAW_CONFIRM = HERE / "raw" / "confirm"
ARCHIVE = Path(os.environ.get("SURVEY_ARCHIVE", HERE.parents[2] / "survey-raw-archive"))
WORK = ARCHIVE / "role-survey-reading" / "work"

ORG_CAP = 30   # titles counted per parent organisation across the crawls (19.5)
UN_WEIGHT = 0.5  # value to paying employers: the UN system at half weight (decision 9)

COUNT_FIELDS = ["source", "snapshot", "org_id", "org_type", "function", "sector", "level",
                "national_international", "humanitarian_development", "field_hq",
                "staff_consultant", "count"]
VARIANT_FIELDS = ["normalised_title", "function", "sector", "level", "language",
                  "organisations", "count"]
DECISION_FIELDS = ["action", "key", "value", "reason", "label"]
MAP_FIELDS = ["family_id", "function", "sector", "level", "org_type", "titles", "organisations",
              "share_within_type", "weighted_share", "consultant_share", "national_share",
              "humanitarian_share"]
LOCAL_TITLE_FIELDS = ["source", "snapshot", "org_id", "title", "page", "org_type"]

# --- organisation types (role-survey.md, section 4) -----------------------------------------

ORG_TYPES = ["un_secretariat", "un_agency", "ingo", "national_ngo_south", "red_cross",
             "donor_government", "contractor", "foundation", "research", "domestic_charity",
             "other"]
UN_SYSTEM = {"un_secretariat", "un_agency"}
NORTH = {"AL", "AD", "AM", "AT", "AZ", "BA", "BE", "BG", "BY", "CH", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR", "GB", "GE", "GR", "HR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MC", "MD", "ME", "MK", "MT", "NL", "NO", "PL", "PT", "RO", "RS", "RU", "SE", "SI", "SK", "SM", "TR", "UA", "VA", "XK", "US", "CA", "AU", "NZ", "JP", "KR", "IL", "SG"}
UN_NAMES = re.compile(
    r"\b(?:United Nations|UNICEF|UNDP|UNFPA|UNHCR|UNOPS|UNESCO|UNIDO|UNEP|UNAIDS|UNRWA|UNITAR|UNU"
    r"|UN Women|World Food Programme|World Health Organization|International Labour Organization"
    r"|Food and Agriculture Organization|International Organization for Migration"
    r"|World Intellectual Property Organization|International Telecommunication Union"
    r"|International Atomic Energy Agency|International Fund for Agricultural Development"
    r"|International Maritime Organization|World Meteorological Organization|Universal Postal Union"
    r"|International Trade Centre|UN-Habitat|IFAD|WFP|WHO|ILO|FAO|IOM|WIPO|ITU|IAEA)\b")
UN_HOSTS = re.compile(r"(?:^|\.)(?:un\.org|undp\.org|unicef\.org|ilo\.org|itu\.int|wfp\.org|who\.int|unfpa\.org|"
                      r"unhcr\.org|iaea\.org|fao\.org|ifad\.org|wipo\.int|unesco\.org|unops\.org|unwomen\.org|"
                      r"unido\.org|iom\.int|unrwa\.org|unu\.edu|unep\.org|ohchr\.org|unocha\.org|unaids\.org|"
                      r"unitar\.org|intracen\.org|wmo\.int|imo\.org|upu\.int|icao\.int|unv\.org|unssc\.org)$")


def un_system(org_type: str, host: str = "") -> bool:
    """Whether a page belongs to the UN system, whose terms of use are held for the user's decision
    (role-survey.md, 19.11): by the organisation's type, or by a UN host."""
    return org_type in UN_SYSTEM or bool(UN_HOSTS.search((host or "").lower()))


RED_CROSS = re.compile(r"red cross|red crescent|croix-rouge|rode kruis|rotes kreuz|\bicrc\b|\bifrc\b",
                       re.IGNORECASE)
RESEARCH = re.compile(r"\b(?:institut[eo]?|institution|research|university|universit[ée]|centre for"
                      r"|center for|cgiar)\b", re.IGNORECASE)


# Charities that support the UN are not UN agencies: UN associations, national committees, "friends of".
NOT_UN = re.compile(r"United Nations Association|\bUNA-|\b(?:UNICEF|UN Women|UNHCR|UNFPA) (?:UK|USA|Canada|Australia|Ireland|Nederland|"
                    r"Deutschland|France|Japan|Sverige|Norge|Danmark|Suomi|Schweiz|Belgique|Espa[ñn]a|Italia)\b|"
                    r"national committee|friends of|\b(?:USA|UK) for UN|for UNICEF|for UNHCR|"
                    r"(?:UN|United Nations) Foundation|Foundation for (?:the )?(?:UN|United Nations)", re.IGNORECASE)
# Names that begin "UN ..." (UN Office for Project Services, UN Relief and Works Agency), not the UN
# Global Compact's local networks or the Italian NGO "Un Ponte Per".
UN_PREFIX = re.compile(r"^UN (?!Global Compact|Ponte)")


def org_type_of(org: dict, group: str = "", pool: str = "") -> str:
    """The section 4 type of a row of organisations.csv, by fixed rules; decisions override."""
    kind, name, country = org.get("kind", ""), org.get("name", ""), org.get("country", "")
    if RED_CROSS.search(name):
        return "red_cross"
    if "un-secretariat" in kind:
        return "un_secretariat"
    if (UN_NAMES.search(name) or UN_PREFIX.search(name)) and not NOT_UN.search(name):
        return "un_agency"
    if any(k in kind for k in ("un-or-intergovernmental", "Multilateral", "intergovernmental",
                               "Government", "government agency", "Other public sector")):
        return "donor_government"
    if pool == "domestic":
        return "domestic_charity"
    if "Foundation" in kind or (re.search(r"\bfoundation\b|\bfondation\b", name, re.IGNORECASE)
                                and "NGO" not in kind):
        return "foundation"
    if "Private sector" in kind:
        return "contractor"
    if RESEARCH.search(name):
        return "research"
    if country and country not in NORTH and any(
            k in kind for k in ("National NGO", "Regional NGO", "Partner-country NGO")):
        return "national_ngo_south"
    if "NGO" in kind or "Overseas aid" in kind or "Operates overseas" in kind or \
            group.startswith(("NGO", "INGO", "EU humanitarian", "national member")):
        return "ingo" if country in NORTH or not country else "national_ngo_south"
    return "other"


@dataclass
class Organisations:
    """The survey's organisations, their types, and the hosts and recruitment-system accounts
    that point to them. A country office counts with its organisation (parent decisions)."""
    rows: dict = field(default_factory=dict)
    types: dict = field(default_factory=dict)
    parents: dict = field(default_factory=dict)
    domains: dict = field(default_factory=dict)
    accounts: dict = field(default_factory=dict)

    @classmethod
    def load(cls, survey: Path = SURVEY, decisions: list[dict] | None = None,
             pools: dict[str, str] | None = None) -> Organisations:
        self = cls()
        first = {r["org_id"]: r for r in read_csv(survey / "first-wave.csv")}
        for r in read_csv(survey / "organisations.csv"):
            oid = r["org_id"]
            self.rows[oid] = r
            host = site_host(r.get("website_domain", ""))
            if host:
                self.domains.setdefault(host, oid)
            self.types[oid] = org_type_of(r, first.get(oid, {}).get("group", ""),
                                          (pools or {}).get(host, ""))
        for r in first.values():
            host = site_host(r.get("website", ""))
            if host:
                self.domains.setdefault(host, r["org_id"])
        urls = defaultdict(set)
        for r in read_csv(survey / "step-f-confirmed.csv"):
            if r["careers_page"]:
                urls[r["org_id"]].add(r["careers_page"])
        for r in read_csv(survey / "careers-candidates.csv"):
            urls[r["org_id"]].add(r["candidate_url"])
        for r in first.values():
            if r.get("step_e_guess"):
                urls[r["org_id"]].add(r["step_e_guess"])
        for oid, found in urls.items():
            for u in found:
                system, account, _ = tenant_of(u)
                if system and account:
                    self.accounts.setdefault((system, account), oid)
        for d in decisions or []:
            if d["action"] == "org-type" and d["value"] in ORG_TYPES:
                self.types[d["key"]] = d["value"]
            elif d["action"] == "org-host":
                self.domains[d["key"]] = d["value"]
            elif d["action"] == "org-parent":
                self.parents[d["key"]] = d["value"]
            elif d["action"] == "org-exclude":
                self.parents[d["key"]] = ""
        return self

    def parent(self, oid: str) -> str:
        seen = set()
        while oid in self.parents and oid not in seen:
            seen.add(oid)
            oid = self.parents[oid]
        return oid

    def of_url(self, url: str) -> str:
        """The organisation a page belongs to: its recruitment-system account, else its host or
        the nearest parent domain; 'site:<host>' when unknown; '' when excluded."""
        system, account, _ = tenant_of(url)
        if system:
            oid = self.accounts.get((system, account), f"account:{system.lower()}:{account}"
                                    if account else "")
            return self.parent(oid) if oid else ""
        host = site_host(url)
        labels = host.split(".")
        for i in range(len(labels) - 1):
            oid = self.domains.get(".".join(labels[i:]))
            if oid is not None:
                return self.parent(oid)
        return self.parent(f"site:{host}") if host else ""

    def type_of(self, oid: str) -> str:
        return self.types.get(oid, "other")


# --- normalising a title --------------------------------------------------------------------

ABBREVIATIONS = [
    (r"\bm\s*&\s*e\b", "monitoring and evaluation"), (r"\bm\s*and\s*e\b", "monitoring and evaluation"),
    (r"\bmgr\b", "manager"), (r"\bcoord\b", "coordinator"), (r"\basst\b", "assistant"),
    (r"\bsnr\b|\bsr\b", "senior"), (r"\bjr\b", "junior"), (r"\badmin\b", "administration"),
    (r"\bhr\b", "human resources"), (r"\brh\b", "ressources humaines"), (r"\blog\b", "logistics"),
    (r"\bfin\b", "finance"), (r"\bprog\b", "programme"), (r"\bproj\b", "project"),
    (r"\bdev\b", "development"), (r"\bcomms\b", "communications"), (r"\bmgmt\b", "management"),
    (r"\bdir\b", "director"), (r"\bdpty\b|\bdep\b", "deputy"), (r"\bofficier\b", "officer"),
    (r"\bprogram\b", "programme"), (r"\bprograms\b", "programmes"), (r"\badvisor\b", "adviser"),
    (r"\badvisors\b", "advisers"), (r"\bco-ordinator\b", "coordinator"),
]
GENDER_MARK = re.compile(r"\(\s*(?:h\s*/\s*f|f\s*/\s*h|m\s*/\s*f|f\s*/\s*m|m\s*/\s*w\s*/\s*d|"
                         r"w\s*/\s*m\s*/\s*d|m\s*/\s*f\s*/\s*x|all genders?)\s*\)|\b(?:h/f|f/h)\b",
                         re.IGNORECASE)
GRADE = re.compile(
    r"\b(?:(?P<un>P|D|G|GS)\s?-?\s?(?P<un_n>[1-7])|NO\s?-?\s?(?P<no>[A-E])|(?P<other>SB|SC|LICA|IICA|ICS"
    r"|NPSA|IPSA|NPP|SSA)\s?-?\s?(?P<other_n>\d{1,2}))\b", re.IGNORECASE)
REFERENCE = re.compile(r"(?:\b(?:ref(?:erence)?|req(?:uisition)?|vacancy|va|vn|job)\s*(?:no\.?|number|id|#)?"
                       r"\s*[:#]?\s*[A-Z0-9][A-Z0-9/_.-]{2,}\b)|#\s*\d+|\b[A-Z]{1,5}[-/]?\d{3,}[-/\dA-Z]*\b"
                       r"|\b\d{4,}\b", re.IGNORECASE)
SEPARATORS = re.compile(r"\s+[-–—|:]\s+|\s*[|]\s*|\s*[(\[]\s*|\s*[)\]]\s*|,\s+")
FRENCH = re.compile(r"\b(?:charg[ée]e?|responsable|coordinat(?:eur|rice)|chef|r[ée]f[ée]rent|"
                    r"stagiaire|logisticien(?:ne)?|administrat(?:eur|rice)|d[ée]veloppement|"
                    r"conseill(?:er|[èe]re)|directeur|directrice|gestionnaire|comptable|"
                    r"infirmi(?:er|[èe]re)|m[ée]decin|sage-femme|ressources humaines|suivi|"
                    r"[ée]valuation|s[ée]curit[ée]|sant[ée]|eau|assainissement|charg[ée]s?|"
                    r"juriste|agent|animat(?:eur|rice)|ing[ée]nieur|technicien(?:ne)?|de la|des|du)\b",
                    re.IGNORECASE)
SPANISH = re.compile(r"\b(?:coordinador(?:a)?|oficial|t[ée]cnic[oa]|asistente|responsable de|"
                     r"especialista|gerente|director(?:a)? de|y|de proyectos?)\b", re.IGNORECASE)
GERMAN = re.compile(r"\b(?:referent(?:in)?|mitarbeiter(?:in)?|leitung|leiter(?:in)?|sachbearbeiter"
                    r"|fachkraft|pflege|stelle|und)\b", re.IGNORECASE)
DUTCH = re.compile(r"\b(?:medewerker|adviseur|co[öo]rdinator|vrijwilliger|beleids|projectleider|"
                   r"en|van|voor)\b", re.IGNORECASE)


def title_language(title: str) -> str:
    """'fr', 'es', 'de', 'nl' or 'en', from a title's words (a title is short, so a guess)."""
    scores = {"fr": len(FRENCH.findall(title)), "es": len(SPANISH.findall(title)),
              "de": len(GERMAN.findall(title)), "nl": len(DUTCH.findall(title))}
    best = max(scores, key=lambda k: scores[k])
    if scores[best] == 0:
        return "en"
    if best == "fr" and re.search(r"\b(?:officer|manager|assistant|of|and)\b", title, re.IGNORECASE) \
            and scores["fr"] < 2:
        return "en"
    return best


@dataclass
class Norm:
    text: str        # the normalised title: lower case, role words only
    grade: str       # a published grade, as published ('P-3', 'NO-B'), else ''
    detail: str      # the parts left out: places, programmes, codes
    language: str


def from_slug(slug: str) -> str:
    """A title from an address: 'senior-programme-officer-health-12345' -> words."""
    words = [w for w in re.split(r"[-_+\s]+", unquote(slug)) if w and not re.fullmatch(r"\d+|[0-9a-f]{8,}", w)]
    return " ".join(words)


def normalise(title: str) -> Norm:
    raw = re.sub(r"\s+", " ", (title or "").replace("\u00a0", " ")).strip()
    grade = ""
    m = GRADE.search(raw)
    if m:
        if m.group("un"):
            grade = f"{m.group('un').upper()}-{m.group('un_n')}"
        elif m.group("no"):
            grade = f"NO-{m.group('no').upper()}"
        else:
            grade = f"{m.group('other').upper()}-{m.group('other_n')}"
    language = title_language(raw)
    text = GENDER_MARK.sub(" ", raw)
    text = GRADE.sub(" ", text)
    it_upper = bool(re.search(r"\b(?:IT|ICT)\b", text))
    text = text.lower()
    for pattern, repl in ABBREVIATIONS:
        text = re.sub(pattern, repl, text)
    if it_upper:
        text = re.sub(r"\bit\b", "information technology", text)
    parts = [p.strip(" .;/") for p in SEPARATORS.split(text) if p and p.strip(" .;/")]
    kept, left = [], []
    for p in parts:
        p2 = REFERENCE.sub(" ", p).strip()
        if p2 and (role_words(p2) or not kept and not left):
            kept.append(p2)
        else:
            left.append(p)
    norm = re.sub(r"\s+", " ", " ".join(kept)).strip(" -.,")
    norm = re.sub(r"[^\w&' -]", " ", norm)
    return Norm(re.sub(r"\s+", " ", norm).strip(), grade, "; ".join(left)[:120], language)


# --- the rule tables --------------------------------------------------------------------------
# Each rule is (id, pattern) over the normalised title (lower case, abbreviations expanded).
# Functions are tried in order; the first that matches wins (a head of finance is finance).

def _r(pattern: str) -> re.Pattern:
    return re.compile(pattern, re.IGNORECASE)


NOT_SECURITY = (r"(?<!food )(?<!social )(?<!income )(?<!job )(?<!water )(?<!human )(?<!health )(?<!nutrition )"
                r"(?<!energy )(?<!climate )(?<!economic )(?<!tenure )(?<!land )")
FUNCTIONS: list[tuple[str, re.Pattern]] = [
    ("leadership", _r(r"\bcountry (?:director|representative|manager)\b|\bexecutive director\b|"
                      r"\bmanaging director\b|\bhead of (?:mission|office|delegation|sub-?office|base|"
                      r"country office)\b|\bchief of party\b|\bdeputy chief of party\b|\bceo\b|"
                      r"\bchief executive\b|\bdirector[- ]general\b|\bregional director\b|"
                      r"\bresident representative\b|\brepr[ée]sentant(?:e)?\b|\bdirect(?:eur|rice) "
                      r"(?:pays|ex[ée]cuti[fv]e?|g[ée]n[ée]ral)|\bchef de (?:mission|base|bureau|"
                      r"d[ée]l[ée]gation)\b|\bcountry lead\b|\bpresident\b|\bfield coordinator\b|"
                      r"\bhead of country\b|\bcountry coordinator\b|\boffice director\b|"
                      r"\barea (?:coordinator|manager|director)\b")),
    ("meal", _r(r"\bmonitoring\b|\bevaluation\b|\bmeal\b|\bmel\b|\bmerl?\b|\binformation management\b|"
                r"\bim (?:officer|assistant|specialist|manager)\b|\bdata (?:analyst|officer|manager|"
                r"specialist|scientist|management|assistant|collector)\b|\baccountability\b|"
                r"\bsuivi\b|[ée]valuation|\bredevabilit[ée]\b|gestion de l'information|\bstatistic|"
                r"\bimpact (?:measurement|assessment)\b|\bassessments?\b|\benumerator|"
                r"\bdata (?:analysis|analytics|quality)\b|\bsurveys?\b")),
    ("finance", _r(r"\bfinanc|\baccountant|\baccounting\b|\baccounts\b|\btreasur|\bpayroll\b|"
                   r"\baudit|\bcontroller\b|\bbookkeep|\bcomptab|\bbudget\b|\bfiscal\b|\bcashier\b|"
                   r"\bcaissi|\bap (?:coordinator|manager|officer|specialist|clerk)\b|\baccounts "
                   r"(?:payable|receivable)\b")),
    ("grants_partnerships", _r(r"\bgrants?\b|\bpartnerships?\b|\bfundrais|\bdonor\b|\bbusiness "
                               r"development\b|\bproposal|\bresource mobili[sz]ation\b|\bphilanthrop|"
                               r"\bmajor (?:gifts?|donors?)\b|\blegac(?:y|ies)\b|\bsupporter\b|"
                               r"\bsubvention|\bcollecte de fonds\b|\bpartenariat|\bmobilisation de "
                               r"(?:ressources|fonds)\b|\bgiving\b|\btrusts? and foundations\b|"
                               r"\bnew business\b|\bcorporate (?:relations|engagement)\b|"
                               r"^(?:senior )?development (?:officer|coordinator|manager|director|"
                               r"associate|assistant|executive)\b|\badvancement\b|\bdonations?\b|"
                               r"\bgifts?\b|\bsponsorship\b|\bawards?\b")),
    ("commercial", _r(r"\bsales\b|\bretail\b|\bcustomer\b|\baccount (?:manager|executive)\b|"
                      r"\bclient (?:relations|services|success)\b|\bshop (?:manager|assistant)\b|"
                      r"\bacquisition\b|\bchannel\b|\bdistributor\b|\bmerchandis|\bcommercial\b|"
                      r"\bproduct\b")),
    ("supply_chain", _r(r"\blogisti|\breceiving\b|\border process|\baviation\b|\bair operations\b|\bprocurement\b|(?<!water )\bsupply\b|\bfleet\b|\bwarehouse|\bpurchas|"
                        r"\btransport\b|\blogisticien|\bachats?\b|\bapprovisionnement\b|\bmagasin|"
                        r"\bstock\b|\bstorekeeper\b|\bsourcing\b|\bimport\b|\bcustoms\b")),
    ("hr", _r(r"\bhuman resources?\b|\bpeople (?:and culture|partner|operations|officer|manager|"
              r"lead|business partner|director|services)\b|\btalent\b|\brecruit|\blearning and "
              r"development\b|\bressources humaines\b|\bstaff (?:welfare|care|development)\b|"
              r"\bcompensation and benefits\b|\bhr\b|\bpersonnel\b|\b(?:staff|employee) wellbeing\b|\bdiversity\b|"
              r"\bpeople (?:division|team|function)\b")),
    ("ict", _r(r"\binformation technology\b|\bict\b|\bsoftware\b|\bdeveloper\b|\bdata engineer|"
               r"\bsystems? (?:administrator|analyst|engineer)\b|\bnetwork (?:engineer|administrator|technician|security|infrastructure|"
               r"specialist)\b|\binformatique\b|"
               r"\bdevops\b|\bcyber|\bdatabase\b|\bweb\b|\bdigital (?:product|platform|"
               r"transformation|solutions)\b|\bcloud\b|\btechnolog|\bit support\b|\bservice desk\b|"
               r"\bhelp ?desk\b|\bprogrammer\b|\bsalesforce\b|\berp\b|\bgis\b|\btech\b|\bai\b|"
               r"\bartificial intelligence\b|\bmachine learning\b|\binformation systems\b|"
               r"\bsystems officer\b|\bediscovery\b")),
    ("safety_security", _r(NOT_SECURITY + r"\bsecurity\b(?! council)|\bsafety\b|\bs[ûu]ret[ée]\b|"
                           r"(?<!alimentaire )\bs[ée]curit[ée]\b(?! alimentaire)")),
    ("communications_advocacy", _r(r"\bcommunicat|\bmedia\b|\badvocacy\b|\bcampaign|\bcontent\b|"
                                   r"\bmarketing\b|\bpublic (?:relations|affairs|engagement)\b|"
                                   r"\bpress\b|\bsocial media\b|\bplaidoyer\b|\bjournalis|\beditor"
                                   r"|\bphotograph|\bbrand\b|\bstorytell|\bvideo|\bwriter\b|"
                                   r"\bdigital (?:marketing|engagement|content|communications)\b|"
                                   r"\bexternal (?:relations|affairs)\b|\boutreach and comm|"
                                   r"\bevents?\b|\bdesigner\b|\b(?:graphic|visual|web|ux|ui|publication)s? "
                                   r"design\b|\bgraphic|\bcreative\b|"
                                   r"\bgovernment (?:relations|liaison|affairs)\b|\bliaison\b")),
    ("medical_clinical", _r(r"\bdoctor\b|\bphysician\b|\bnurs(?:e|es|ing)\b|\bmidwi|\bmedical\b|"
                            r"\bclinic(?:al|ian)?\b|\bpharmac|\bsurgeon\b|\bsurgery\b|\ban(?:a)?esthe|"
                            r"\blaborator|\blab (?:technician|scientist|manager)\b|\bm[ée]decin\b|"
                            r"\binfirmi|\bsage-femme\b|\bchirurg|\bpsychiatr|\bgyn[ae]?ecolog|"
                            r"\bpaediatric|\bpediatric|\bobstetric|\bradiograph|\bphysiotherap|"
                            r"\bdentist|(?<!community )\bhealth (?:care|worker)\b|\bhospital\b|\bbiomedical\b|"
                            r"\bcardiolog|\bepidemiolog|\bpsychologist\b|\bpsychologue\b|"
                            r"\boptometr|\bsonograph|\bmedic\b|\bparamedic\b|\btherapist\b")),
    ("engineering", _r(r"\bengineer(?:ing)?\b(?!.*\bsoftware\b)|\barchitect\b|\bconstruction\b|"
                       r"\bcivil works?\b|\bsite (?:engineer|supervisor|manager)\b|\bing[ée]nieur|"
                       r"\bquantity surveyor\b|\binfrastructure\b|\bhydrogeolog|\bhydraulic|"
                       r"\belectrical\b|\bmechanical\b|\bsurveyor\b")),
    ("legal", _r(r"\blegal\b|\blawyer\b|\bcounsel\b|\bparalegal\b|\battorney\b|\bjuriste\b|"
                 r"\bavocat|\bcompliance\b|\bjuridique\b|\blitigation\b|\bcontracts? (?:officer|"
                 r"manager|specialist)\b|\binvestigat")),
    ("teaching", _r(r"\bteacher\b|\btrainer\b|\btutor\b|\blecturer\b|\bprofessor\b|\binstructor\b|"
                    r"\benseignant|\bformat(?:eur|rice)\b|\beducator\b|\bteaching\b|\bcoach\b|"
                    r"\btraining (?:officer|coordinator|manager|specialist|facilitator)\b|\besl\b|\benglish (?:conversation|language|class)")),
    ("drivers_support", _r(r"\bdriver\b|\bchauffeur\b|\bcleaner\b|\bguard\b|\bwatchm[ae]n\b|\bcook\b|"
                           r"\bmaintenance\b|\bhandy(?:man|person)\b|\bgardien\b|\bcuisini|"
                           r"\bmessenger\b|\bporter\b|\bmechanic\b|\bgardener\b|\bhousekeep|"
                           r"\btechnicien de surface\b|\bkitchen\b|\bcatering\b|\bjanitor")),
    ("care_support", _r(r"\bcare (?:worker|assistant|coordinator|manager|giver|home)\b|\bcaregiver\b|"
                        r"\bsupport worker\b|\byouth worker\b|\bfamily support\b|\bcounsell?or\b|"
                        r"\bkey worker\b|\bresidential\b|\bsocial worker\b|\bchild ?care\b|"
                        r"\bhealthcare assistant\b|\bhousing (?:officer|support|worker)\b|"
                        r"\bvolunteer (?:coordinator|manager|lead)\b|\bfoster|\bpastor|\bchaplain|"
                        r"\bministry\b|\byouth\b|\bchildren(?:'s)? (?:services|and youth)\b|"
                        r"\bintegration support\b|\bresettlement (?:officer|caseworker|specialist)\b")),
    ("community_field", _r(r"\bcommunity\b|"
                           r"\bfield (?:officers?|workers?|monitors?|assistants?|agents?|staff|"
                           r"facilitators?|supervisors?|technicians?)\b|\bcase (?:manager|specialist|"
                           r"management|work)|\boutreach\b|\banimat(?:eur|rice)\b|"
                           r"\bagent (?:de terrain|communautaire|de sant[ée])\b|\bpromoter\b|"
                           r"\bcase ?workers?\b|\bextension (?:officer|worker|agent)\b|"
                           r"\bmobili[sz]er\b|\bvolunteer\b|\binterpreter\b|\btranslator\b|"
                           r"\bdistribution\b|\bregistration\b")),
    ("humanitarian_coordination", _r(r"\bcluster\b|\bhumanitarian (?:affairs|coordinat|access)\b|"
                                     r"\binter-?agency\b|\baccess (?:officer|coordinator|adviser|and)\b|"
                                     r"\bcivil-military\b|\bcoordination (?:officer|specialist|"
                                     r"associate|analyst)\b|\bemergency (?:coordinator|response "
                                     r"coordinator|team leader|manager)\b")),
    ("policy_research", _r(r"\bpolicy\b|\bresearch|\brecherche\b|\bstrateg|\beconomist\b|"
                           r"\bscientist\b|\bchercheu|"
                           r"\b[ée]tudes?\b|\bpolitique\b|\banalyst\b|\bknowledge\b|\blearning\b|"
                           r"\bfellow\b|\bpostdoc|\bpost-doc|\bstatistician\b|\bmodell")),
    ("administration", _r(r"\badministrat|\boffice (?:manager|assistant|administrator|coordinator)\b|"
                          r"\breceptionist\b|\bsecretar|\bexecutive assistant\b|\bpersonal "
                          r"assistant\b|\bassistant(?:e)? de direction\b|\bclerk\b|\bdata entry\b|"
                          r"\bfront desk\b|\bfacilities\b|\btravel (?:officer|assistant|"
                          r"coordinator)\b|\bprotocol\b|\bexecutive coordinator\b|\boperations\b|"
                          r"\bop[ée]rations\b|\bsupport services\b|\bgestionnaire administrati|\bbuilding\b|"
                          r"\bbusiness support\b")),
    ("programme_management", _r(r"\bprogramm?es?\b|\bprojects?\b|\bportfolio\b|\bchef de projet\b|"
                                r"\bcharg[ée]e? de (?:programme|projet)s?\b|\bresponsable (?:de )?"
                                r"(?:programme|projet)s?\b|\bcoordinat(?:eur|rice) (?:de )?"
                                r"(?:programme|projet)s?\b|\bchef de programme\b|\bprojets?\b|"
                                r"\bproyecto|\bprograma\b|\binitiative\b|\bdelivery\b|"
                                r"\bimplementation\b")),
]
TECHNICAL = ("technical", _r(r"\bofficer\b|\bspecialist\b|\badviser\b|\bexpert\b|\bcoordinator\b|"
                             r"\bmanager\b|\blead\b|\bassistant\b|\btechnician\b|\bconsultant\b|"
                             r"\bassociate\b|\bhead\b|\bdirector\b|\bcharg[ée]e?\b|\br[ée]f[ée]rent|"
                             r"\bconseill|\bsp[ée]cialiste\b|\bresponsable\b|\bcoordinat(?:eur|rice)\b|"
                             r"\bnutritionist\b|\bagronomist\b|\bhydrologist\b|\bsupervisor\b|"
                             r"\bteam leader\b|\bchief\b|\bworker\b|\bagent\b|\bintern\b|\bstagiaire\b"))
FUNCTION_IDS = [f for f, _ in FUNCTIONS] + ["technical"]

SECTORS: list[tuple[str, re.Pattern]] = [
    ("wash", _r(r"\bwash\b|\bwater\b|\bsanitation\b|\bhygiene\b|\beha\b|\beau\b|\bassainissement\b|"
                r"\bhygi[èe]ne\b|\bwatsan\b")),
    ("nutrition", _r(r"\bnutrition|\bcmam\b|\biycf\b|\bmalnutrition\b")),
    ("food_security_livelihoods", _r(r"\bfood (?:security|assistance|systems?)\b|\blivelihoods?\b|"
                                     r"\bfsl\b|\bs[ée]curit[ée] alimentaire\b|\bmoyens d'existence\b|"
                                     r"\beconomic (?:recovery|empowerment|inclusion)\b|\bemployment\b|"
                                     r"\bmicrofinance\b|\bvocational\b|\bincome\b|\bentrepreneur")),
    ("cash_markets", _r(r"\bcash\b|\bcva\b|\bvoucher|\bmarkets?\b(?! research)|\bmon[ée]taire\b|"
                        r"\bfinancial inclusion\b|\bsocial protection\b")),
    ("protection", _r(r"\bprotection\b|\bgbv\b|\bgender[- ]based violence\b|\bsafeguarding\b|\bpsea\b|"
                      r"\bcase management\b|\bvbg\b|\bviolences? bas[ée]es? sur le genre\b|"
                      r"\bmhpss\b|\bpsychosocial\b|\btrafficking\b|\bchild (?:rights|labou?r)\b|"
                      r"\bsexual (?:exploitation|violence)\b|\bdocumentation\b|\brsd\b|"
                      r"\brefugee status\b")),
    ("education", _r(r"\beducation|\bschool|\blearning centre|\b[ée]ducation\b|\bliteracy\b|"
                     r"\bearly childhood\b|\bteacher\b|\bcurriculum\b|\bscholarship")),
    ("shelter_camp", _r(r"\bshelter\b|\bcccm\b|\bcamp (?:management|coordination)\b|\bnfi\b|"
                        r"\babris\b|\bsettlement|\bhousing\b|\bhabitat\b")),
    ("mine_action", _r(r"\bmine action\b|\bdemining\b|\beod\b|\bexplosive|\bd[ée]minage\b|\buxo\b|"
                       r"\bhuman(?:itarian)? mine\b|\bweapons?\b")),
    ("drr", _r(r"\bdisaster\b|\bdrr\b|\bpreparedness\b|\banticipatory\b|\bearly warning\b|"
               r"\bresilience\b|\bemergency preparedness\b")),
    ("migration", _r(r"\bmigra|\bdisplace|\brefugee|\basylum\b|\bidp\b|\bresettlement\b|"
                     r"\breturn(?:ees)?\b|\bdurable solutions\b")),
    ("climate_environment", _r(r"\bclimat|\benvironment|\bbiodiversity\b|\bconservation\b|"
                               r"\benergy\b|\bforest|\bwildlife\b|\bmarine\b|\bocean|\bcarbon\b|"
                               r"\bnature\b|\bsustainab|\brenewable|\bemission|\bwaste\b|"
                               r"\bnatural resource|\becolog|\bland(?:scape)?\b|\bfisher")),
    ("agriculture", _r(r"\bagricultur|\bagronom|\bfarm|\blivestock\b|\bagricole\b|\bseed|\bcrop|"
                       r"\bhorticult|\bagri|\bagro|\bveterinar|\birrigation\b|\bvalue chain|\bbreed")),
    ("gender", _r(r"\bgender\b(?![- ]based)|\bwomen'?s?\b|\bgenre\b|\bgirls?\b|\bfeminis")),
    ("disability_inclusion", _r(r"\bdisabilit|\binclusion\b|\bhandicap\b|\baccessib")),
    ("governance_peace_rights", _r(r"\bgovernance\b|\bpeace|\bhuman rights\b|\brule of law\b|"
                                   r"\bdemocra|\bjustice\b|\bgouvernance\b|\bdroits\b|\belection|"
                                   r"\bconflict\b|\bsocial cohesion\b|\bcivic\b|\bcivil society\b|"
                                   r"\banti-corruption\b|\bparliament|\btorture\b|\bcrime\b|"
                                   r"\bfreedom of\b")),
    ("esg_safeguards", _r(r"\besg\b|\benvironmental (?:and|&) social\b|\be&s\b|\bsafeguards\b|"
                          r"\bsocial (?:and environmental )?standards\b")),
    ("health", _r(r"\bhealth\b|\bsant[ée]\b|\bhiv\b|\baids\b|\bmalaria\b|\btuberculosis\b|\btb\b|"
                  r"\bimmuni[sz]ation|\bvaccin|\bepidemiolog|\bsrh|\breproductive\b|\bmaternal\b|"
                  r"\bpharmac|\bmedical\b|\bclinic|\bnurs|\bdisease|\bpolio\b|\bneglected tropical\b|"
                  r"\bntd\b|\bmental health\b|\bonehealth\b|\bone health\b|\bsurveillance\b|"
                  r"\bpoisoning\b")),
]
SECTOR_IDS = [s for s, _ in SECTORS] + ["none"]
SECTOR_RULE = dict(SECTORS)   # environmental and social safeguards are ESG, not climate and environment

LEVELS: list[tuple[str, re.Pattern]] = [
    ("intern_fellow", _r(r"\bintern(?:ship)?s?\b|\bstagiaire\b|\bstage\b|\btrainee\b|\bfellow(?:ship)?\b|"
                         r"\bapprentice|\bgraduate (?:programme|scheme|trainee)\b|\bvolontaire\b|"
                         r"\bjunior professional officer\b|\bjpo\b|\bpracticum\b")),
    ("head_adviser", _r(r"\bhead\b|\bdirector\b|\bdirect(?:eur|rice)\b|\bchief\b|\badvisers?\b|"
                        r"\bprincipal\b|\brepresentative\b|\brepr[ée]sentant|\bconseill(?:er|[èe]re)\b|"
                        r"\bchef de (?:mission|base|bureau|d[ée]l[ée]gation|service|d[ée]partement)\b|"
                        r"\bvice[- ]president\b|\bpresident\b|\bceo\b|\bcfo\b|\bcoo\b|\bdirecci[óo]n\b")),
    ("coordinator_manager", _r(r"\bmanager\b|\bcoordinator\b|\blead\b|\bleader\b|\bsupervisor\b|"
                               r"\bresponsable\b|\bcoordinat(?:eur|rice)\b|\bchef de (?:projet|programme|"
                               r"[ée]quipe)\b|\bgestionnaire\b|\bcoordinador|\bgerente\b|"
                               r"\bprojectleider\b|\bleiter|\bleitung\b")),
    ("officer", _r(r"\bofficer\b|\bspecialist\b|\banalyst\b|\bassociate\b|\bexpert\b|\bcharg[ée]e?s?\b|"
                   r"\br[ée]f[ée]rent|\bsp[ée]cialiste\b|\baccountant\b|\bengineer\b|\bnurse\b|"
                   r"\bdoctor\b|\bphysician\b|\bm[ée]decin\b|\blogisticien|\bnutritionist\b|\bteacher\b|"
                   r"\beconomist\b|\bresearcher\b|\blawyer\b|\bjuriste\b|\bpharmacist\b|\bmidwife\b|"
                   r"\bscientist\b|\bpsychologist\b|\bsurgeon\b|\bepidemiologist\b|\barchitect\b|"
                   r"\bagronomist\b|\bcounsell?or\b|\bsocial worker\b|\bcase ?worker\b|\btrainer\b|"
                   r"\bstatistician\b|\bdeveloper\b|\bconsultant\b|\badministrator\b|\bofficial\b|"
                   r"\boficial\b|\bt[ée]cnic[oa]\b|\bespecialista\b|\breferent|\bmedewerker\b|"
                   r"\badviseur\b|\binfirmi|\bsage-femme\b|\bingenieur|\bing[ée]nieur|\bwriter\b|"
                   r"\beditor\b|\bfacilitator\b|\bcomptable\b|\bagent\b|\binstructor\b|\btutor\b|"
                   r"\bcoach\b|\bphysiotherapist\b|\bdentist\b|\bmedic\b|\bparamedic\b|\btherapist\b|"
                   r"\bmobili[sz]er\b|\bpromoter\b|\benumerator\b|\binterpreter\b|\btranslator\b")),
    ("assistant", _r(r"\bassistant(?:e)?\b|\bclerk\b|\bdriver\b|\bchauffeur\b|\bguard\b|\bcleaner\b|"
                     r"\bcook\b|\breceptionist\b|\bsecretar|\baide\b|\btechnician\b|\btechnicien|"
                     r"\bstorekeeper\b|\bcashier\b|\bmessenger\b|\bwatchm[ae]n\b|\bporter\b|"
                     r"\bmechanic\b|\bgardener\b|\bhousekeep|\boperator\b|\bworker\b|\basistente\b|"
                     r"\bmitarbeiter|\bsachbearbeiter|\bfachkraft\b|\bhelper\b|\battendant\b")),
]
LEVEL_IDS = [lv for lv, _ in LEVELS]
GRADE_LEVEL = {"P-1": "officer", "P-2": "officer", "NO-A": "officer",
               "P-3": "coordinator_manager", "P-4": "coordinator_manager", "NO-B": "coordinator_manager",
               "NO-C": "coordinator_manager", "P-5": "head_adviser", "P-6": "head_adviser",
               "P-7": "head_adviser", "D-1": "head_adviser", "D-2": "head_adviser",
               "NO-D": "head_adviser", "NO-E": "head_adviser"}
GRADE_LEVEL.update({f"G-{n}": "assistant" for n in range(1, 8)})
GRADE_LEVEL.update({f"GS-{n}": "assistant" for n in range(1, 8)})

CONTEXTS = {
    "staff_consultant": [("consultant", _r(r"\bconsult(?:ant|ancy|ance|ants)\b|\bindividual contractor\b|"
                                           r"\bfreelance\b|\bprestataire\b|\bterms of reference\b|"
                                           r"\btermes de r[ée]f[ée]rence\b|\btor\b|\bexpertise\b|"
                                           r"\bshort[- ]term expert\b|\bconsultor"))],
    "national_international": [("international", _r(r"\binternational (?:staff|position|post|"
                                                    r"consultant|officer|expert|volunteer|"
                                                    r"recruitment)\b|\bexpat|\bexpatri[ée]")),
                               ("national", _r(r"\bnational (?:staff|position|post|consultant|officer|"
                                               r"expert|volunteer|recruitment|professional)\b|"
                                               r"\bnational\b$|\blocal (?:staff|position|hire|"
                                               r"recruitment)\b|\bnationals? only\b"))],
    "humanitarian_development": [("humanitarian", _r(r"\bemergenc|\bhumanitarian\b|\burgence\b|"
                                                     r"\bhumanitaire\b|\bcrisis\b|\brelief\b|\bsurge\b|"
                                                     r"\bresponse\b|\brapid response\b|\bearthquake\b|"
                                                     r"\bflood\b|\bcholera\b|\bebola\b")),
                                 ("development", _r(r"\bdevelopment (?:programme|project|cooperation|"
                                                    r"specialist|adviser|economist|effectiveness)\b|"
                                                    r"\bd[ée]veloppement\b|\bcoop[ée]ration\b"))],
    "field_hq": [("field", _r(r"\bfield\b|\bsub-?office\b|\bterrain\b|\bbase\b|\barea (?:office|"
                              r"manager|coordinator)\b|\bprovincial\b|\bdistrict\b|\bcounty\b")),
                 ("hq", _r(r"\bhq\b|\bheadquarters\b|\bsi[èe]ge\b|\bglobal\b|\bhead office\b"))],
}
CONTEXT_FIELDS = list(CONTEXTS)


@dataclass
class Role:
    function: str
    sector: str
    level: str
    grade: str
    contexts: dict
    language: str
    normalised: str

    @property
    def family_id(self) -> str:
        if not self.function:
            return ""
        return self.function if self.sector == "none" else f"{self.function}.{self.sector}"


def role_words(text: str) -> bool:
    """Whether a part of a title holds a word the rules read (else it is a place or a code)."""
    return any(p.search(text) for _, p in FUNCTIONS) or any(p.search(text) for _, p in SECTORS) \
        or any(p.search(text) for _, p in LEVELS) or bool(TECHNICAL[1].search(text))


NON_TITLE_WORDS = re.compile(r"\b(?:apply|application|saved jobs|how to|benefits|life at|why work|our "
                             r"(?:team|values|people|culture)|roster|expressions? of interest|"
                             r"spontaneous|trustees|board members?|faq|cookie|privacy|login|sign in|"
                             r"call for|call tender|tenders?|appel (?:a|à|d)|avis d|bolsa de talento|"
                             r"pr[ée]qualification|request for (?:proposals?|quotations?))\b",
                             re.IGNORECASE)


def looks_like_title(text: str) -> bool:
    """A link text or an address that names a job: it holds a word the rules read, and none of the
    words of a careers page's other links."""
    n = normalise(text).text
    return bool(n) and role_words(n) and not NON_TITLE_WORDS.search(text)


def _earliest(rules, text: str) -> str:
    best, pos = "", 10 ** 6
    for rid, pattern in rules:
        m = pattern.search(text)
        if m and m.start() < pos:
            best, pos = rid, m.start()
    return best


def classify(title: str, decisions: dict[str, dict] | None = None) -> Role:
    """The function, sector, level and contexts of one title, by the fixed rules; a recorded
    decision for its normalised title wins."""
    n = normalise(title)
    text = n.text
    full = re.sub(r"\s+", " ", GENDER_MARK.sub(" ", title or "").lower())
    function = next((fid for fid, p in FUNCTIONS if p.search(text)), "")
    sector = "esg_safeguards" if SECTOR_RULE["esg_safeguards"].search(text) else (_earliest(SECTORS, text) or "none")
    if not function and sector != "none" and TECHNICAL[1].search(text):
        function = "technical"
    if not function and sector != "none" and len(text.split()) <= 5:
        function = "technical"
    level = next((lid for lid, p in LEVELS if p.search(text)), "")
    if not level and n.grade:
        level = GRADE_LEVEL.get(n.grade, "")
    if function == "drivers_support" and not level:
        level = "assistant"
    contexts = {}
    for name, rules in CONTEXTS.items():
        contexts[name] = next((v for v, p in rules if p.search(full)), "unknown")
    if n.grade.startswith("NO-") and contexts["national_international"] == "unknown":
        contexts["national_international"] = "national"
    d = (decisions or {}).get(text)
    if d:
        parts = (d["value"].split("|") + ["", "", ""])[:3]
        function = parts[0] if parts[0] in FUNCTION_IDS or parts[0] == "" else function
        sector = parts[1] if parts[1] in SECTOR_IDS else sector
        level = parts[2] if parts[2] in LEVEL_IDS else level
    return Role(function, sector, level, n.grade, contexts, n.language, text)


# --- titles from what is on disk (local) -------------------------------------------------------

ANCHOR = re.compile(r"<a\b[^>]*href\s*=\s*[\"']([^\"']+)[\"'][^>]*>(.*?)</a>", re.IGNORECASE | re.DOTALL)
NOT_TITLE = re.compile(r"^(?:apply|apply now|read more|more|view|view job|view details|details|see more|"
                       r"learn more|postuler|en savoir plus|voir|voir l'offre|next|previous|share|"
                       r"\d+|jobs?|careers?|vacancies|home|back|search)$", re.IGNORECASE)


def clean_text(text: str) -> str:
    import html
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text or ""))).strip()


def page_hash(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def feed_titles(system: str, body: bytes) -> list[str]:
    from xml.etree import ElementTree
    out = []
    try:
        if system in ("Personio", "Teamtailor"):
            root = ElementTree.fromstring(body)
            tag, parent = ("name", "position") if system == "Personio" else ("title", "item")
            for e in root.iter():
                if e.tag.split("}")[-1] == parent:
                    for c in e:
                        if c.tag.split("}")[-1] == tag and c.text:
                            out.append(clean_text(c.text))
        else:
            d = json.loads(body)
            items = d if isinstance(d, list) else d.get("jobs") or d.get("offers") or d.get("content") or []
            for it in items:
                t = it.get("title") or it.get("text") or it.get("name")
                if t:
                    out.append(clean_text(t))
    except (ValueError, ElementTree.ParseError, AttributeError):
        pass
    return out


def step_f_titles(raw: Path = RAW_CONFIRM):
    """(org_id, title, page) from step F's saved feeds and listing pages."""
    from confirm import JOB_LINK
    for path in sorted((raw / "orgs").glob("*.json")):
        rec = json.loads(path.read_text(encoding="utf-8"))
        body_path = raw / "bodies" / (path.stem + ".bin")
        if not body_path.exists():
            continue
        body, req = body_path.read_bytes(), rec.get("request", "")
        if req.startswith("feed"):
            for t in feed_titles(req[len("feed ("):-1], body):
                yield rec["org_id"], t, ""
        else:
            seen = set()
            for href, inner in ANCHOR.findall(body.decode("utf-8", "replace")):
                if JOB_LINK.search(href):
                    t = clean_text(inner)
                    if 4 <= len(t) <= 140 and not NOT_TITLE.match(t) and t not in seen \
                            and looks_like_title(t):
                        seen.add(t)
                        yield rec["org_id"], t, page_hash(href)


def index_rows(paths):
    for path in paths:
        with gzip.open(path, "rt", encoding="utf-8", errors="replace") as handle:
            for line in handle:
                i = line.find("{")
                if i < 0:
                    continue
                try:
                    yield json.loads(line[i:])
                except ValueError:
                    continue


def index_files(archive: Path = ARCHIVE) -> list[Path]:
    """Every saved Common Crawl index file of steps E and M1 to M5."""
    pats = ["role-survey-m1-2026-11-11/CC-MAIN-*/accounts.cdx.gz",
            "role-survey-m1-2026-11-11/CC-MAIN-*/sites/*.cdx.gz",
            "step-e-2026-11-05/commoncrawl/CC-MAIN-*/sites/*.cdx.gz",
            "step-e-2026-11-05/commoncrawl/CC-MAIN-*/systems/*.cdx.gz",
            "role-survey-screen-2026-11-11/CC-MAIN-*/*/*.cdx.gz"]
    out = []
    for p in pats:
        out += sorted(archive.glob(p))
    return [p for p in out if "domestic-rest" not in p.parts]


SLUG_SYSTEMS = {"Workday": r"/job/[^/]+/([^/]+)_[A-Za-z0-9-]+$", "iCIMS": r"/jobs/\d+/([^/]+)/job",
                "SmartRecruiters": r"^/[^/]+/\d{6,}-([^/]+)", "Teamtailor": r"/jobs/\d+-([^/]+)",
                "Avature": r"/JobDetail/([^/]+)/\d+", "Zoho Recruit": r"/Careers/\d+/([^/?]+)",
                "Recruitee": r"/o/([^/]+)"}
SITE_SLUG = re.compile(r"/([a-z0-9%]+(?:-[a-z0-9%]+){2,})(?:\.html?|\.aspx|\.php)?/?$", re.IGNORECASE)


def address_title(url: str) -> str:
    """A title read from a job address, when the address carries one ('' otherwise)."""
    from careers import system_of
    path = unquote(urlsplit(url).path)
    system = system_of(url)
    if system:
        m = re.search(SLUG_SYSTEMS.get(system, r"$^"), path)
        return from_slug(m.group(1)) if m else ""
    m = SITE_SLUG.search(path)
    return from_slug(m.group(1)) if m else ""


TOKEN = re.compile(r"(?:^|/)(?:jobs?|vacanc(?:y|ies)|careers?|positions?|openings?|offres?(?:-d-emploi)?|"
                   r"emplois?|recrutement|stellen(?:angebote)?|vacatures?|job-?postings?|job-?listings?|"
                   r"job-?details?|jobdescription|lumesse_jobdescription\.html|vacancy-?announcements?)"
                   r"(?:/|$|\.html|\.aspx|\.php)", re.IGNORECASE)
INDEX = {"careers", "career", "jobs", "job", "vacancies", "vacancy", "job-postings", "job-listing",
         "job-listings", "offres", "emplois", "emploi", "recrutement", "stellenangebote", "vacatures",
         "openings", "positions", "current-vacancies", "work-with-us", "join-us", "faq", "faqs",
         "apply", "search", "results", "alerts"}
NOT_JOB = re.compile(r"/(?:tag|tags|category|categories|page|author|feed|search|login|apply|job-alert|"
                     r"alerts?|faqs?|our-values|culture|benefits|how-to-apply|terms|privacy)(?:/|$|[-_.])",
                     re.IGNORECASE)
QUERY_ID = re.compile(r"(?:^|&)(?:job_?id|jobid|reqid|requisitionid|vacancyid|id)=\d{3,}", re.IGNORECASE)


def job_key(url: str) -> str | None:
    """The job identity of an address on an employer's own site, or None for a page that is not one
    job (the screens' corrected test of 11 November 2026)."""
    p = urlsplit(url)
    path = unquote(p.path).rstrip("/")
    if NOT_JOB.search(path + "/"):
        return None
    if QUERY_ID.search(p.query) and TOKEN.search(path + "/"):
        return p.netloc.lower() + path.lower() + "?" + QUERY_ID.search(p.query).group(0).lower()
    m = TOKEN.search(path + "/")
    if not m:
        return None
    rest = path[m.end():].strip("/")
    if not rest:
        return None
    last = re.sub(r"\.(html?|aspx|php)$", "", rest.split("/")[-1], flags=re.IGNORECASE)
    if last.lower() in INDEX:
        return None
    words = [w for w in re.split(r"[-_+%\s]+", last) if w]
    if re.search(r"\d{4,}", rest) or len(words) >= 3:
        return p.netloc.lower() + "/" + rest.lower()
    return None


def archive_job_key(url: str) -> str:
    """The job identity of an archived address (as the screens' corrected test, 11 November 2026)."""
    from careers import system_of
    system = system_of(url)
    path = unquote(urlsplit(url).path)
    if system:
        m = re.search(r"/(?:jobs?|j|o|JobDetail/[^/]+|Careers|careers|job/[^/]+/[^/]+_)/?"
                      r"([A-Za-z0-9-]{4,})", path)
        if m:
            return f"{(urlsplit(url).hostname or '').lower()}|{m.group(1).lower()}"
        m = re.search(r"/(\d{5,})", path)
        return f"{(urlsplit(url).hostname or '').lower()}|{m.group(1)}" if m else ""
    return job_key(url) or ""


def archive_titles(archive: Path = ARCHIVE):
    """(snapshot, url, title) for every distinct archived job address that carries a title."""
    seen = set()
    for m in index_rows(index_files(archive)):
        if m.get("status") != "200" or "html" not in (m.get("mime") or ""):
            continue
        url = m.get("url", "")
        key = archive_job_key(url)
        if not key or key in seen:
            continue
        t = address_title(url)
        if t and len(t.split()) >= 2 and looks_like_title(t):
            seen.add(key)
            yield "cc-2026", url, t


def titles(args) -> int:
    from adverts import read_saved_titles
    decisions = read_csv(ROLES / "role-decisions.csv") if (ROLES / "role-decisions.csv").exists() else []
    orgs = Organisations.load(decisions=decisions, pools=pools_of())
    WORK.mkdir(parents=True, exist_ok=True)
    rows = []
    for oid, t, page in step_f_titles():
        rows.append(["step-f", "2026-11-05", orgs.parent(oid), t, page])
    for snap, url, t in archive_titles():
        oid = orgs.of_url(url)
        # step E's saved rows hold every account on each recruitment system; only the survey's count
        if oid and not oid.startswith("account:"):
            rows.append(["archive", snap, oid, t, page_hash(url)])
    for source, snap, url, t, hint in read_saved_titles(orgs):
        oid = hint or orgs.of_url(url)
        if oid and not oid.startswith("account:"):
            rows.append([source, snap, oid, t, page_hash(url), orgs.type_of(oid)])
    with (WORK / "titles.csv").open("w", newline="", encoding="utf-8") as handle:
        w = csv.writer(handle)
        w.writerow(LOCAL_TITLE_FIELDS)
        w.writerows(rows)
    print(f"titles: {len(rows)} at {len({r[2] for r in rows})} organisations; "
          f"by source {dict(Counter(r[0] for r in rows))}")
    return 0


def pools_of(archive: Path = ARCHIVE) -> dict[str, str]:
    """Hosts screened as domestic charities (batch M4), so their type is known."""
    out = {}
    screen = archive / "role-survey-screen-2026-11-11"
    for pool in ("domestic",):
        p = screen / f"screen-{pool}-v2.csv"
        if p.exists():
            for r in read_csv(p):
                out[r["site"]] = pool
    live = archive / "role-survey-live-2026-11-11" / "live-results-2.csv"
    if live.exists():
        for r in read_csv(live):
            if r["pool"] == "domestic":
                out[r["site"]] = "domestic"
    return out


# --- counts (local -> committed) ---------------------------------------------------------------

def decision_map(rows: list[dict]) -> dict[str, dict]:
    return {r["key"]: r for r in rows if r["action"] == "title"}


def counts(args) -> int:
    decisions = read_csv(ROLES / "role-decisions.csv") if (ROLES / "role-decisions.csv").exists() else []
    local = WORK / "title-decisions-local.csv"
    by_title = decision_map(decisions + (read_csv(local) if local.exists() else []))
    orgs = Organisations.load(decisions=decisions, pools=pools_of())
    rows = read_csv(WORK / "titles.csv")
    agg = Counter()
    variants = defaultdict(lambda: {"orgs": set(), "count": 0, "role": None})
    unplaced = defaultdict(set)
    seen = set()
    for r in rows:
        oid = orgs.parent(r["org_id"])
        if not oid:
            continue
        role = classify(r["title"], by_title)
        # German titles come from the German Red Cross's hospital and care jobs, left out of R0 as
        # outside wave 1's languages (19.10); they are left out here too.
        if not role.normalised or role.language == "de":
            continue
        key = (oid, role.normalised, r["page"] or r["title"])
        if key in seen:
            continue
        seen.add(key)
        if not role.function:
            unplaced[role.normalised].add(oid)
        agg[(r["source"], r["snapshot"], oid, r.get("org_type") or orgs.type_of(oid), role.function or "unplaced",
             role.sector, role.level or "unknown", *[role.contexts[c] for c in CONTEXT_FIELDS])] += 1
        v = variants[role.normalised]
        v["orgs"].add(oid)
        v["count"] += 1
        v["role"] = role
    out = [list(k) + [n] for k, n in sorted(agg.items())]
    write_csv(ROLES / "role-counts.csv", COUNT_FIELDS, out)
    vrows = []
    for t, v in sorted(variants.items()):
        if len(v["orgs"]) >= 2 and v["role"].function:
            ro = v["role"]
            vrows.append([t, ro.function, ro.sector, ro.level or "unknown", ro.language,
                          len(v["orgs"]), v["count"]])
    write_csv(ROLES / "title-variants.csv", VARIANT_FIELDS, vrows)
    review = sorted(unplaced.items(), key=lambda kv: (-len(kv[1]), kv[0]))
    with (WORK / "review-unplaced.csv").open("w", newline="", encoding="utf-8") as handle:
        w = csv.writer(handle)
        w.writerow(["normalised_title", "organisations"])
        w.writerows([(t, len(o)) for t, o in review])
    total = sum(agg.values())
    placed = sum(n for k, n in agg.items() if k[4] != "unplaced")
    print(f"titles counted: {total}; placed by rule or decision: {placed} ({100 * placed / max(total, 1):.0f}%); "
          f"unplaced distinct: {len(unplaced)} ({sum(1 for o in unplaced.values() if len(o) >= 2)} at 2+ organisations); "
          f"variants committed: {len(vrows)}")
    return 0


# --- build (committed -> committed; CI) --------------------------------------------------------

def write_csv(path: Path, fields, rows) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        w = csv.writer(handle, lineterminator="\n")
        w.writerow(fields)
        w.writerows(rows)


def role_map(count_rows: list[dict]) -> list[list]:
    """Per family (function, or function and sector), level and organisation type: titles with each
    organisation capped at ORG_CAP, organisations, the share within the type, and the weighted share
    (the UN system at UN_WEIGHT); 'all' rows pool the levels and the types."""
    per_org = Counter()
    for r in count_rows:
        per_org[r["org_id"]] += int(r["count"])
    cells = defaultdict(lambda: {"n": 0.0, "orgs": set(), "cons": 0.0, "nat": 0.0, "hum": 0.0})
    type_totals = Counter()
    for r in count_rows:
        if r["function"] == "unplaced":
            continue
        scale = min(1.0, ORG_CAP / per_org[r["org_id"]])
        n = int(r["count"]) * scale
        fam = r["function"] if r["sector"] == "none" else f"{r['function']}.{r['sector']}"
        for level in (r["level"], "all"):
            for otype in (r["org_type"], "all"):
                c = cells[(fam, r["function"], r["sector"], level, otype)]
                c["n"] += n
                c["orgs"].add(r["org_id"])
                c["cons"] += n * (r["staff_consultant"] == "consultant")
                c["nat"] += n * (r["national_international"] == "national")
                c["hum"] += n * (r["humanitarian_development"] == "humanitarian")
        type_totals[r["org_type"]] += n
        type_totals["all"] += n
    weighted_total = sum(v * (UN_WEIGHT if t in UN_SYSTEM else 1.0)
                         for t, v in type_totals.items() if t != "all")
    weighted_fam = Counter()
    for (fam, _f, _s, level, otype), c in cells.items():
        if level == "all" and otype != "all":
            weighted_fam[(fam, "all")] += c["n"] * (UN_WEIGHT if otype in UN_SYSTEM else 1.0)
    out = []
    for key in sorted(cells):
        fam, function, sector, level, otype = key
        c = cells[key]
        if otype == "all":
            w = weighted_fam.get((fam, "all"), 0.0) if level == "all" else 0.0
            weighted = f"{w / weighted_total:.4f}" if weighted_total and level == "all" else ""
        else:
            weighted = ""
        share = c["n"] / type_totals[otype] if type_totals[otype] else 0.0
        out.append([fam, function, sector, level, otype, f"{c['n']:.1f}", len(c["orgs"]),
                    f"{share:.4f}", weighted, f"{c['cons'] / c['n']:.3f}" if c["n"] else "",
                    f"{c['nat'] / c['n']:.3f}" if c["n"] else "",
                    f"{c['hum'] / c['n']:.3f}" if c["n"] else ""])
    return out


def build(_args=None, roles_dir: Path = ROLES) -> int:
    if not (roles_dir / "role-counts.csv").exists():
        print("role-counts.csv not committed yet; nothing to build")
        return 0
    rows = read_csv(roles_dir / "role-counts.csv")
    write_csv(roles_dir / "role-map.csv", MAP_FIELDS, role_map(rows))
    print(f"role-map.csv: built from {len(rows)} count rows")
    return 0


def main() -> int:
    sys.path.insert(0, str(HERE))
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="cmd", required=True)
    sub.add_parser("titles").set_defaults(func=titles)
    sub.add_parser("counts").set_defaults(func=counts)
    sub.add_parser("build").set_defaults(func=build)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
