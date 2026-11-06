"""Employer survey, step B: candidate organisations from public registers (W-31).

Run on the user's machine, never by the backend or CI:

  python tools/survey/registers.py download   # public files into tools/survey/raw/ (git-ignored)
  python tools/survey/registers.py build      # filter them; write the candidate list and counts
  python tools/survey/registers.py echo       # DG ECHO's certified NGOs (PDF) -> a small CSV

Only public bulk files and IATI's open API are fetched, one at a time, with an honest identity.
No employer's site is contacted. Each source is read through a fixed list of fields: emails,
phone numbers and people's names are never kept, and trustee and director files are never
downloaded. The rules (who is in, the income cut-offs) are in docs/architecture/source-survey.md.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import sys
import time
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from xml.etree import ElementTree

HERE = Path(__file__).resolve().parent
RAW = HERE / "raw"
OUT = HERE.parents[1] / "docs" / "architecture" / "source-survey"
USER_AGENT = "AidJobsSurvey/0.1 (+mailto:aidjobz@gmail.com)"

UK = "https://ccewuksprdoneregsadata1.blob.core.windows.net/data/txt/"
CRA = "https://open.canada.ca/data/dataset/80c00cdb-1358-415c-bb8b-0de7f12675b8/resource/"
ACNC = "https://data.gov.au/data/dataset/"
FILES = {
    "irs_eo1.csv": "https://www.irs.gov/pub/irs-soi/eo1.csv",
    "irs_eo2.csv": "https://www.irs.gov/pub/irs-soi/eo2.csv",
    "irs_eo3.csv": "https://www.irs.gov/pub/irs-soi/eo3.csv",
    "irs_eo4.csv": "https://www.irs.gov/pub/irs-soi/eo4.csv",
    "uk_charity.zip": UK + "publicextract.charity.zip",
    "uk_classification.zip": UK + "publicextract.charity_classification.zip",
    "oscr_register.zip": "https://www.oscr.org.uk/download/charity-register",
    "acnc_register.csv": ACNC + "b050b242-4487-4306-abf5-07ca073e5594/resource/"
                         "8fb32972-24e9-4c95-885e-7140be51be8a/download/datadotgov_main.csv",
    "acnc_ais23.csv": ACNC + "ff6905d6-9d5d-4ef1-8478-72b833864fb7/resource/"
                      "2b0fb746-57c5-4523-bb4c-74b7b78279d9/download/datadotgov_ais23.csv",
    "cra_ident.csv": CRA + "694fdc72-eae4-4ee0-83eb-832ab7b230e3/download/ident_2024_updated.csv",
    "cra_financial.csv": CRA + "e545170c-3689-4833-b2a8-e9e83100ab59/download/"
                         "financial_d_and_schedule_6_2024_updated.csv",
    "cra_countries.csv": CRA + "9a0a7b94-634b-4092-9a3b-e6001cf74f5b/download/"
                         "schedule_2_countries_2024.csv",
    "cra_general.csv": CRA + "fd7c8679-8032-4613-b2b7-44fb8bc9c7c9/download/"
                       "financial_section_a_b_and_c_2024_updated.csv",
    "cra_web.csv": CRA + "e3567bb5-5d98-44d0-b0e8-9cdd3732c9e4/download/weburl_2024_updated.csv",
    "eu_register.xml": "https://data.europa.eu/data-management/store/api/data/sg/"
                       "01M323JV693WY8VP2989DA0ZR2",
    # DG ECHO's NGOs certified as EU humanitarian partners, 2021 to 2027 (the list of 9 April
    # 2026); added for step F's first wave (the user's decision, 6 November 2026).
    "echo_certified_ngos.pdf": "https://civil-protection-humanitarian-aid.ec.europa.eu/document/"
                               "download/d57eb909-dca7-4c76-908a-b40d012aa022_en"
                               "?filename=List+of+certified+NGOs+9.4.2026.pdf",
}
ECHO_OUT = "echo-partners.csv"
ECHO_FIELDS = ["number", "partner_code", "name", "country", "certificate"]
ECHO_CERTIFICATES = ("Potential Programmatic Partner", "Niche Partner", "Partner")
IATI_API = "https://dashboard.iatistandard.org/api/reporting-orgs/"

# Income cut-offs per register, in its own currency: the recommended level and the two
# levels either side that the first run counts, for the user's choice.
CUTOFFS = {
    "irs": ("USD", [2_500_000, 5_000_000, 10_000_000]),
    "uk": ("GBP", [1_000_000, 2_500_000, 5_000_000]),
    "oscr": ("GBP", [1_000_000, 2_500_000, 5_000_000]),
    "acnc": ("AUD", [2_500_000, 5_000_000, 10_000_000]),
    "cra": ("CAD", [2_500_000, 5_000_000, 10_000_000]),
}
RECOMMENDED = 1  # index into each list above

# IATI organisation types (codelist OrganisationType). Kept: governments and public bodies,
# NGOs, partnerships, multilaterals, foundations; private sector kept for review (development
# contractors and investors publish to IATI). Dropped: academic and other.
IATI_TYPES = {
    "10": "Government", "11": "Local government", "15": "Other public sector",
    "21": "International NGO", "22": "National NGO", "23": "Regional NGO",
    "24": "Partner-country NGO", "30": "Public-private partnership", "40": "Multilateral",
    "60": "Foundation", "70": "Private sector", "71": "Private sector in provider country",
    "72": "Private sector in aid recipient country", "73": "Private sector in third country",
    "80": "Academic, training and research", "90": "Other",
}
IATI_KEEP = {"10", "15", "21", "22", "23", "24", "30", "40", "60"}
IATI_REVIEW = {"70", "71", "72", "73"}

# NTEE major group Q: international, foreign affairs and national security; without domestic
# national security (Q43) and exchange programmes (Q21 cultural, Q22 student, Q23 country).
IRS_NTEE = re.compile(r"^Q(?!43|21|22|23)")
UK_OVERSEAS_CODE = "106"  # "What" classification: Overseas Aid/famine Relief
# OSCR's geographical spread "UK and overseas" covers many charities working mainly at home;
# those are kept only when what they say they do reads as aid work abroad.
OSCR_AID_TEXT = re.compile(
    r"overseas|abroad|international (aid|development|relief)|developing (countr|world|nation)"
    r"|humanitarian|famine|refugee|disaster relief|africa|asia|latin america|caribbean"
    r"|third world|global south|throughout the world|world-?wide|any part of the world"
    r"|other countries|low[- ]income countries|global poverty", re.IGNORECASE)
EU_CATEGORY = re.compile(r"non-governmental organisations", re.IGNORECASE)
EU_INTERESTS = re.compile(r"development|humanitarian aid", re.IGNORECASE)
EXCLUDED_NAME = re.compile(
    r"\b(hospitals?|hospitales?|h[oô]pita(?:l|ux)|krankenh[aä]us(?:er)?|ospedal[ei]"
    r"|ziekenhuis(?:en)?|universit(?:y|ies|[ée]s?|à|ät(?:en)?|eit(?:en)?|at)|universidad(?:es)?"
    r"|coll[eè]ges?|colegios?|hochschulen?|[ée]coles?|polytechnique|schools?"
    r"|health sciences|health system)\b",
    re.IGNORECASE)
# Aid organisations whose names contain one of those words; each checked by hand.
KEPT_DESPITE_NAME = re.compile(
    r"world university service|united world schools|haiti hospital appeal"
    r"|promoting equality in african schools|baylor college of medicine children",
    re.IGNORECASE)

FIELDS = ["source", "source_id", "name", "country", "kind", "website_domain", "income",
          "currency", "income_year", "in_recommended_cutoff", "note"]


# --- download ----------------------------------------------------------------------------

def _session():
    import requests

    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def _fetch(session, url: str, target: Path) -> dict:
    partial = target.with_suffix(target.suffix + ".part")
    with session.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()
        if not response.url.startswith("https://"):
            raise ValueError("the download did not end on an HTTPS address")
        with partial.open("wb") as handle:
            for block in response.iter_content(1 << 20):
                handle.write(block)
        headers = {"last_modified": response.headers.get("last-modified"),
                   "content_type": response.headers.get("content-type")}
    partial.replace(target)
    return {"url": url, "bytes": target.stat().st_size, "sha256": _sha256(target), **headers,
            "fetched_at": datetime.now(UTC).isoformat(timespec="seconds")}


def download(_args) -> None:
    """Fetch each missing file once; a source that fails is recorded and the others go on."""
    RAW.mkdir(parents=True, exist_ok=True)
    session = _session()
    manifest_path = RAW / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) \
        if manifest_path.exists() else {}
    failed = {}
    for name, url in FILES.items():
        target = RAW / name
        if target.exists() and name in manifest:
            print(f"{name}: already downloaded")
            continue
        try:
            manifest[name] = _fetch(session, url, target)
            print(f"{name}: {manifest[name]['bytes']:,} bytes")
        except Exception as error:  # noqa: BLE001  recorded, the other sources go on
            failed[name] = f"{type(error).__name__}"
            print(f"{name}: FAILED ({type(error).__name__})")
        manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
        time.sleep(1)
    manifest["failed"] = failed
    organisations, url = [], IATI_API + "?page_size=500"
    if (RAW / "iati_reporting_orgs.json").exists() and "iati_reporting_orgs.json" in manifest:
        url = None
        print("iati_reporting_orgs.json: already downloaded")
    try:
        while url:
            page = session.get(url, timeout=120)
            page.raise_for_status()
            data = page.json()
            organisations.extend(data["results"])
            url = data.get("next")
            if url and not url.startswith(IATI_API):
                raise ValueError("IATI's next page is not on its API")
            time.sleep(1)
    except Exception as error:  # noqa: BLE001  recorded; the files above are kept
        failed["iati_reporting_orgs.json"] = type(error).__name__
        organisations = []
        print(f"iati_reporting_orgs.json: FAILED ({type(error).__name__})")
    if organisations:
        (RAW / "iati_reporting_orgs.json").write_text(json.dumps(organisations), encoding="utf-8")
        manifest["iati_reporting_orgs.json"] = {
            "url": IATI_API, "records": len(organisations),
            "sha256": _sha256(RAW / "iati_reporting_orgs.json")}
        print(f"iati_reporting_orgs.json: {len(organisations):,} organisations")
        # The date of the first download (step B); later files carry their own date.
        manifest["fetched_at"] = datetime.now(UTC).isoformat(timespec="seconds")
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")


# --- helpers -----------------------------------------------------------------------------

def domain(url: str | None) -> str:
    if not url:
        return ""
    url = url.strip()
    if not url:
        return ""
    if "://" not in url:
        url = "http://" + url
    try:
        host = urlsplit(url).hostname or ""
    except ValueError:
        return ""
    host = host.lower().strip(".")
    return host.removeprefix("www.")


def money(value) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError:
        return None


def _csv_rows(path: Path, encoding="utf-8-sig", delimiter=","):
    with path.open(encoding=encoding, errors="replace", newline="") as handle:
        yield from csv.DictReader(handle, delimiter=delimiter)


def _zip_rows(path: Path, member_pattern: str, delimiter="\t"):
    """Rows of the first matching file in a zip. Tab files are read without quote handling."""
    quoting = csv.QUOTE_NONE if delimiter == "\t" else csv.QUOTE_MINIMAL
    with zipfile.ZipFile(path) as archive:
        member = next(n for n in archive.namelist() if re.search(member_pattern, n))
        with archive.open(member) as raw:
            text = io.TextIOWrapper(raw, encoding="utf-8-sig", errors="replace", newline="")
            yield from csv.DictReader(text, delimiter=delimiter, quoting=quoting)


def _row(source, source_id, name, country, kind, website, income, year, note=""):
    currency, levels = CUTOFFS.get(source, ("", []))
    recommended = levels[RECOMMENDED] if levels else None
    within = "" if income is None or recommended is None else (
        "yes" if income >= recommended else "no")
    return {"source": source, "source_id": source_id, "name": " ".join(name.split()),
            "country": country, "kind": kind, "website_domain": domain(website),
            "income": "" if income is None else f"{income:.0f}", "currency": currency,
            "income_year": year, "in_recommended_cutoff": within, "note": note}


# --- sources -----------------------------------------------------------------------------

def iati(stats):
    rows = []
    for org in json.loads((RAW / "iati_reporting_orgs.json").read_text(encoding="utf-8")):
        code = str(org.get("organisation_type") or "")
        stats["iati"]["all"] += 1
        if code not in IATI_KEEP | IATI_REVIEW:
            continue
        stats["iati"]["in sector"] += 1
        note = "private sector: development contractor or investor, for review" \
            if code in IATI_REVIEW else ""
        rows.append(_row("iati", org.get("organisation_identifier") or org.get("short_name"),
                         org.get("human_readable_name") or "", org.get("hq_country") or "",
                         IATI_TYPES.get(code, code), org.get("website")
                         or org.get("data_portal_url"), None, "", note))
    return rows


def irs(stats):
    rows = []
    for part in range(1, 5):
        for record in _csv_rows(RAW / f"irs_eo{part}.csv", encoding="latin-1"):
            stats["irs"]["all"] += 1
            ntee = (record.get("NTEE_CD") or "").strip()
            if not IRS_NTEE.match(ntee):
                continue
            stats["irs"]["in sector"] += 1
            income = money(record.get("REVENUE_AMT"))
            rows.append(_row("irs", record.get("EIN"), record.get("NAME") or "", "US",
                             f"NTEE {ntee}", None, income,
                             (record.get("TAX_PERIOD") or "")[:4]))
    return rows


def uk(stats):
    overseas = {r["registered_charity_number"]
                for r in _zip_rows(RAW / "uk_classification.zip", r"classification")
                if r.get("classification_code") == UK_OVERSEAS_CODE}
    rows = []
    for record in _zip_rows(RAW / "uk_charity.zip", r"charity\.txt$"):
        if (record.get("linked_charity_number") or "0") != "0":
            continue
        if (record.get("charity_registration_status") or "").lower() != "registered":
            continue
        stats["uk"]["all"] += 1
        number = record.get("registered_charity_number")
        if number not in overseas:
            continue
        stats["uk"]["in sector"] += 1
        rows.append(_row("uk", number, record.get("charity_name") or "", "GB",
                         "Overseas aid/famine relief", record.get("charity_contact_web"),
                         money(record.get("latest_income")),
                         (record.get("latest_acc_fin_period_end_date") or "")[:4]))
    return rows


def oscr(stats):
    rows = []
    for record in _zip_rows(RAW / "oscr_register.zip", r"\.csv$", delimiter=","):
        if (record.get("Charity Status") or "").lower() not in ("", "active"):
            continue
        stats["oscr"]["all"] += 1
        spread = (record.get("Geographical Spread") or "").strip().lower()
        if spread == "overseas only":
            kind = "Operates overseas only"
        elif spread == "uk and overseas" and OSCR_AID_TEXT.search(
                " ".join([record.get("Objectives") or "",
                          record.get("What the charity is set up to do and how it does this")
                          or ""])):
            kind = "UK and overseas, with aid work abroad"
        else:
            continue
        stats["oscr"]["in sector"] += 1
        rows.append(_row("oscr", record.get("Charity Number"), record.get("Charity Name") or "",
                         "GB-SCT", kind, record.get("Website"),
                         money(record.get("Most recent year income")),
                         (record.get("Year End") or "")[-4:]))
    return rows


def acnc(stats):
    revenue, operates_overseas = {}, set()
    for record in _csv_rows(RAW / "acnc_ais23.csv"):
        abn = (record.get("abn") or "").strip()
        value = money(record.get("total revenue"))
        if abn and value is not None:
            revenue[abn] = value
        flag = (record.get("international activities undertaken - operating overseas "
                           "including programs") or "").strip().lower()
        if abn and flag in ("y", "yes", "true", "1"):
            operates_overseas.add(abn)
    rows = []
    for record in _csv_rows(RAW / "acnc_register.csv"):
        abn = (record.get("ABN") or "").strip()
        name = (record.get("Charity_Legal_Name") or "").strip()
        if not abn or not name:
            continue  # continuation lines of a quoted field, not charities
        stats["acnc"]["all"] += 1
        countries = {c.strip().upper() for c in (record.get("Operating_Countries") or "").split(",")}
        if not (countries - {"", "AUS"} or abn in operates_overseas):
            continue
        stats["acnc"]["in sector"] += 1
        other = (record.get("Other_Organisation_Names") or "").split(",")[0].strip()
        if re.match(r"(?i)^ACN\s*\d", name) and other:
            name = other  # registered under its company number, known by another name
        row = _row("acnc", abn, name, "AU",
                   "Operates overseas", record.get("Charity_Website"), revenue.get(abn), "2023")
        if abn not in revenue and (record.get("Charity_Size") or "").lower() == "large":
            row["income_year"] = ""
            row["in_recommended_cutoff"] = "unknown"
            row["note"] = "income not reported for 2023; register size Large (A$3m or more)"
        rows.append(row)
    return rows


def _latest_return(path: Path) -> dict:
    """One row per charity: some filed two returns in the year; keep the later period end."""
    latest = {}
    for record in _csv_rows(path):
        bn = record.get("BN")
        if bn and (bn not in latest or (record.get("FPE") or "") > (latest[bn].get("FPE") or "")):
            latest[bn] = record
    return latest


def cra(stats):
    # Countries where programmes were carried out (schedule 2), or T3010 line 2100: activities
    # outside Canada, which also covers agencies that work through partners (World Vision,
    # Plan International, CARE).
    abroad = {r["BN"] for r in _csv_rows(RAW / "cra_countries.csv") if r.get("BN")}
    abroad |= {bn for bn, r in _latest_return(RAW / "cra_general.csv").items()
               if (r.get("2100") or "").strip().upper() == "Y"}
    revenue = {bn: money(r.get("4700"))
               for bn, r in _latest_return(RAW / "cra_financial.csv").items()}
    web = {}
    for record in _csv_rows(RAW / "cra_web.csv"):
        web.setdefault(record.get("BN/NE"), record.get("Contact URL"))
    rows = []
    for record in _csv_rows(RAW / "cra_ident.csv"):
        stats["cra"]["all"] += 1
        bn = record.get("BN")
        if bn not in abroad:
            continue
        stats["cra"]["in sector"] += 1
        rows.append(_row("cra", bn, record.get("Account Name") or record.get("Legal Name") or "",
                         "CA", f"Programmes outside Canada (category {record.get('Category')})",
                         web.get(bn), revenue.get(bn), "2024"))
    return rows


def _text(element, path):
    found = element.find(path)
    return (found.text or "").strip() if found is not None and found.text else ""


_CHAR_REF = re.compile(r"&#(x[0-9a-fA-F]+|[0-9]+);")


def _drop_control_refs(match: re.Match) -> str:
    """XML 1.1 allows references to control characters; Python's XML 1.0 parser does not."""
    value = match.group(1)
    code = int(value[1:], 16) if value[0] in "xX" else int(value)
    return "" if code < 0x20 and code not in (0x9, 0xA, 0xD) else match.group(0)


def eu(stats):
    rows = []
    text = (RAW / "eu_register.xml").read_text(encoding="utf-8", errors="replace")
    data = io.BytesIO(_CHAR_REF.sub(_drop_control_refs, text).encode("utf-8"))
    for _event, element in ElementTree.iterparse(data):
        if element.tag != "interestRepresentative":
            continue
        stats["eu"]["all"] += 1
        category = _text(element, "registrationCategory")
        interests = [i.text or "" for i in element.findall("interests/interest/name")]
        if EU_CATEGORY.search(category) and any(EU_INTERESTS.search(i) for i in interests):
            stats["eu"]["in sector"] += 1
            name = _text(element, "name/originalName")
            acronym = _text(element, "acronym")
            rows.append(_row("eu", _text(element, "identificationCode"),
                             f"{name} ({acronym})" if acronym else name,
                             _text(element, "headOffice/country"),
                             "NGO: development or humanitarian aid",
                             _text(element, "webSiteURL"), None, "",
                             "no income in this register"))
        element.clear()
    return rows


# --- build -------------------------------------------------------------------------------

def build(_args) -> None:
    csv.field_size_limit(1 << 28)  # registers carry long free-text fields
    sources = {"iati": iati, "irs": irs, "uk": uk, "oscr": oscr, "acnc": acnc, "cra": cra,
               "eu": eu}
    stats = {name: {"all": 0, "in sector": 0, "excluded by name": 0} for name in sources}
    rows = []
    for name, reader in sources.items():
        for row in reader(stats):
            if EXCLUDED_NAME.search(row["name"]) and not KEPT_DESPITE_NAME.search(row["name"]):
                stats[name]["excluded by name"] += 1
                continue
            rows.append(row)
    counts = []
    for name in sources:
        currency, levels = CUTOFFS.get(name, ("", []))
        own = [r for r in rows if r["source"] == name]
        entry = {"source": name, "records": stats[name]["all"],
                 "in_sector": stats[name]["in sector"],
                 "excluded_by_name": stats[name]["excluded by name"],
                 "kept": len(own), "no_income": sum(1 for r in own if not r["income"]),
                 "currency": currency}
        for index, level in enumerate(levels):
            entry[f"cutoff_{index + 1}"] = level
            entry[f"at_or_above_{index + 1}"] = sum(
                1 for r in own if r["income"] and float(r["income"]) >= level)
        counts.append(entry)
    candidates = [r for r in rows if r["source"] not in CUTOFFS
                  or r["in_recommended_cutoff"] in ("yes", "unknown")]
    candidates.sort(key=lambda r: (r["source"], r["name"].lower()))
    OUT.mkdir(parents=True, exist_ok=True)
    with (OUT / "register-candidates.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(candidates)
    keys = sorted({k for c in counts for k in c}, key=lambda k: (
        ["source", "records", "in_sector", "excluded_by_name", "kept", "no_income",
         "currency"] + [f"{p}_{i}" for i in (1, 2, 3) for p in ("cutoff", "at_or_above")]
    ).index(k))
    with (OUT / "register-counts.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=keys, lineterminator="\n")
        writer.writeheader()
        writer.writerows(counts)
    for entry in counts:
        print(entry)
    print(f"candidates at the recommended cut-offs: {len(candidates):,}")


# --- DG ECHO's certified humanitarian partners (step F's first wave) ----------------------

_SEGMENT = re.compile(r"\S+(?: \S+)*")  # text separated by two spaces or more is another cell
_ECHO_COLUMNS = ("Partner full name", "Country", "Type of Certificate")


def echo_rows(pages: list[str]) -> list[dict]:
    """The table's rows from each page's text laid out by column (pypdf's layout mode).

    A cell that wraps continues on the next line, in the same column; a row whose cells wrap
    can also start a line above its number, after a complete row. The columns are placed from
    each page's header line."""
    rows: list[dict] = []
    for page in pages:
        starts, pending = None, []
        for line in page.splitlines():
            if all(c in line for c in _ECHO_COLUMNS):
                name, country, certificate = (line.index(c) for c in _ECHO_COLUMNS)
                starts = (name - 30, country - 15, certificate - 15)
                continue
            if starts is None or not line.strip():
                continue
            cells = [(m.start(), m.group(0)) for m in _SEGMENT.finditer(line)]
            number = re.fullmatch(r"\d{1,3}", cells[0][1]) if cells else None
            if number and cells[0][0] < 6:
                rows.append({"number": number.group(0), "partner_code": "", "name": "",
                             "country": "", "certificate": ""})
                cells, pending = pending + cells[1:], []
            elif not rows:
                continue  # the title above the first table
            elif rows[-1]["certificate"]:
                pending += cells  # the first line of the next row, above its number
                continue
            for start, text in cells:
                column = ("partner_code" if start < starts[0] else "name" if start < starts[1]
                          else "country" if start < starts[2] else "certificate")
                rows[-1][column] = f"{rows[-1][column]} {text}".strip()
    for row in rows:
        row["name"] = re.sub(r"\s*\((?:[A-Z]{1,3})\)\s*$", "", row["name"]).strip(" ,")
        row["country"] = row["country"].upper()
    return rows


def echo(_args) -> int:
    """Turn the downloaded PDF into source-survey/echo-partners.csv (no network).

    Needs pypdf, which is not a dependency of the backend or CI: run this command from a
    separate virtual environment with pypdf 6.1.3."""
    from pypdf import PdfReader

    reader = PdfReader(RAW / "echo_certified_ngos.pdf")
    rows = echo_rows([p.extract_text(extraction_mode="layout") for p in reader.pages])
    numbers = [int(r["number"]) for r in rows]
    problems = [r for r in rows if not (r["name"] and r["country"]
                                        and r["certificate"] in ECHO_CERTIFICATES)]
    if numbers != list(range(1, len(rows) + 1)) or problems:
        print(f"the table did not read cleanly: {problems[:5]}")
        return 1
    with (OUT / ECHO_OUT).open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=ECHO_FIELDS, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)
    print(f"{ECHO_OUT}: {len(rows)} certified NGOs")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("download")
    sub.add_parser("build")
    sub.add_parser("echo")
    args = parser.parse_args()
    return {"download": download, "build": build, "echo": echo}[args.command](args) or 0


if __name__ == "__main__":
    sys.exit(main())
