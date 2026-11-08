"""The offline country lookup: countries read from a job's location text, with no network call.

The table is the public site's (`apps/frontend/lib/site/countries.ts`), so a stored code has the
name the site shows; tests/test_countries.py fails when the two tables differ. A change to the
table is made there first, then here. The rule differs from the site's fallback for a location
with no stored code: the site takes the last part that names a country, this stores none when
several are named.
"""
from __future__ import annotations

import re
import unicodedata

# English country names by ISO code (CLDR, frozen in the frontend).
COUNTRY_NAMES = {
    'AC': 'Ascension Island',
    'AD': 'Andorra',
    'AE': 'United Arab Emirates',
    'AF': 'Afghanistan',
    'AG': 'Antigua & Barbuda',
    'AI': 'Anguilla',
    'AL': 'Albania',
    'AM': 'Armenia',
    'AO': 'Angola',
    'AQ': 'Antarctica',
    'AR': 'Argentina',
    'AS': 'American Samoa',
    'AT': 'Austria',
    'AU': 'Australia',
    'AW': 'Aruba',
    'AX': 'Åland Islands',
    'AZ': 'Azerbaijan',
    'BA': 'Bosnia & Herzegovina',
    'BB': 'Barbados',
    'BD': 'Bangladesh',
    'BE': 'Belgium',
    'BF': 'Burkina Faso',
    'BG': 'Bulgaria',
    'BH': 'Bahrain',
    'BI': 'Burundi',
    'BJ': 'Benin',
    'BL': 'St. Barthélemy',
    'BM': 'Bermuda',
    'BN': 'Brunei',
    'BO': 'Bolivia',
    'BQ': 'Caribbean Netherlands',
    'BR': 'Brazil',
    'BS': 'Bahamas',
    'BT': 'Bhutan',
    'BV': 'Bouvet Island',
    'BW': 'Botswana',
    'BY': 'Belarus',
    'BZ': 'Belize',
    'CA': 'Canada',
    'CC': 'Cocos (Keeling) Islands',
    'CD': 'Congo - Kinshasa',
    'CF': 'Central African Republic',
    'CG': 'Congo - Brazzaville',
    'CH': 'Switzerland',
    'CI': 'Côte d’Ivoire',
    'CK': 'Cook Islands',
    'CL': 'Chile',
    'CM': 'Cameroon',
    'CN': 'China',
    'CO': 'Colombia',
    'CR': 'Costa Rica',
    'CU': 'Cuba',
    'CV': 'Cape Verde',
    'CW': 'Curaçao',
    'CX': 'Christmas Island',
    'CY': 'Cyprus',
    'CZ': 'Czechia',
    'DE': 'Germany',
    'DJ': 'Djibouti',
    'DK': 'Denmark',
    'DM': 'Dominica',
    'DO': 'Dominican Republic',
    'DZ': 'Algeria',
    'EC': 'Ecuador',
    'EE': 'Estonia',
    'EG': 'Egypt',
    'EH': 'Western Sahara',
    'ER': 'Eritrea',
    'ES': 'Spain',
    'ET': 'Ethiopia',
    'EU': 'European Union',
    'FI': 'Finland',
    'FJ': 'Fiji',
    'FK': 'Falkland Islands',
    'FM': 'Micronesia',
    'FO': 'Faroe Islands',
    'FR': 'France',
    'GA': 'Gabon',
    'GB': 'United Kingdom',
    'GD': 'Grenada',
    'GE': 'Georgia',
    'GF': 'French Guiana',
    'GG': 'Guernsey',
    'GH': 'Ghana',
    'GI': 'Gibraltar',
    'GL': 'Greenland',
    'GM': 'Gambia',
    'GN': 'Guinea',
    'GP': 'Guadeloupe',
    'GQ': 'Equatorial Guinea',
    'GR': 'Greece',
    'GS': 'South Georgia & South Sandwich Islands',
    'GT': 'Guatemala',
    'GU': 'Guam',
    'GW': 'Guinea-Bissau',
    'GY': 'Guyana',
    'HK': 'Hong Kong SAR China',
    'HM': 'Heard & McDonald Islands',
    'HN': 'Honduras',
    'HR': 'Croatia',
    'HT': 'Haiti',
    'HU': 'Hungary',
    'IC': 'Canary Islands',
    'ID': 'Indonesia',
    'IE': 'Ireland',
    'IL': 'Israel',
    'IM': 'Isle of Man',
    'IN': 'India',
    'IO': 'British Indian Ocean Territory',
    'IQ': 'Iraq',
    'IR': 'Iran',
    'IS': 'Iceland',
    'IT': 'Italy',
    'JE': 'Jersey',
    'JM': 'Jamaica',
    'JO': 'Jordan',
    'JP': 'Japan',
    'KE': 'Kenya',
    'KG': 'Kyrgyzstan',
    'KH': 'Cambodia',
    'KI': 'Kiribati',
    'KM': 'Comoros',
    'KN': 'St. Kitts & Nevis',
    'KP': 'North Korea',
    'KR': 'South Korea',
    'KW': 'Kuwait',
    'KY': 'Cayman Islands',
    'KZ': 'Kazakhstan',
    'LA': 'Laos',
    'LB': 'Lebanon',
    'LC': 'St. Lucia',
    'LI': 'Liechtenstein',
    'LK': 'Sri Lanka',
    'LR': 'Liberia',
    'LS': 'Lesotho',
    'LT': 'Lithuania',
    'LU': 'Luxembourg',
    'LV': 'Latvia',
    'LY': 'Libya',
    'MA': 'Morocco',
    'MC': 'Monaco',
    'MD': 'Moldova',
    'ME': 'Montenegro',
    'MF': 'St. Martin',
    'MG': 'Madagascar',
    'MH': 'Marshall Islands',
    'MK': 'North Macedonia',
    'ML': 'Mali',
    'MM': 'Myanmar (Burma)',
    'MN': 'Mongolia',
    'MO': 'Macao SAR China',
    'MP': 'Northern Mariana Islands',
    'MQ': 'Martinique',
    'MR': 'Mauritania',
    'MS': 'Montserrat',
    'MT': 'Malta',
    'MU': 'Mauritius',
    'MV': 'Maldives',
    'MW': 'Malawi',
    'MX': 'Mexico',
    'MY': 'Malaysia',
    'MZ': 'Mozambique',
    'NA': 'Namibia',
    'NC': 'New Caledonia',
    'NE': 'Niger',
    'NF': 'Norfolk Island',
    'NG': 'Nigeria',
    'NI': 'Nicaragua',
    'NL': 'Netherlands',
    'NO': 'Norway',
    'NP': 'Nepal',
    'NR': 'Nauru',
    'NU': 'Niue',
    'NZ': 'New Zealand',
    'OM': 'Oman',
    'PA': 'Panama',
    'PE': 'Peru',
    'PF': 'French Polynesia',
    'PG': 'Papua New Guinea',
    'PH': 'Philippines',
    'PK': 'Pakistan',
    'PL': 'Poland',
    'PM': 'St. Pierre & Miquelon',
    'PN': 'Pitcairn Islands',
    'PR': 'Puerto Rico',
    'PS': 'Palestinian Territories',
    'PT': 'Portugal',
    'PW': 'Palau',
    'PY': 'Paraguay',
    'QA': 'Qatar',
    'RE': 'Réunion',
    'RO': 'Romania',
    'RS': 'Serbia',
    'RU': 'Russia',
    'RW': 'Rwanda',
    'SA': 'Saudi Arabia',
    'SB': 'Solomon Islands',
    'SC': 'Seychelles',
    'SD': 'Sudan',
    'SE': 'Sweden',
    'SG': 'Singapore',
    'SH': 'St. Helena',
    'SI': 'Slovenia',
    'SJ': 'Svalbard & Jan Mayen',
    'SK': 'Slovakia',
    'SL': 'Sierra Leone',
    'SM': 'San Marino',
    'SN': 'Senegal',
    'SO': 'Somalia',
    'SR': 'Suriname',
    'SS': 'South Sudan',
    'ST': 'São Tomé & Príncipe',
    'SV': 'El Salvador',
    'SX': 'Sint Maarten',
    'SY': 'Syria',
    'SZ': 'Eswatini',
    'TA': 'Tristan da Cunha',
    'TC': 'Turks & Caicos Islands',
    'TD': 'Chad',
    'TF': 'French Southern Territories',
    'TG': 'Togo',
    'TH': 'Thailand',
    'TJ': 'Tajikistan',
    'TK': 'Tokelau',
    'TL': 'Timor-Leste',
    'TM': 'Turkmenistan',
    'TN': 'Tunisia',
    'TO': 'Tonga',
    'TR': 'Türkiye',
    'TT': 'Trinidad & Tobago',
    'TV': 'Tuvalu',
    'TW': 'Taiwan',
    'TZ': 'Tanzania',
    'UA': 'Ukraine',
    'UG': 'Uganda',
    'UM': 'U.S. Outlying Islands',
    'US': 'United States',
    'UY': 'Uruguay',
    'UZ': 'Uzbekistan',
    'VA': 'Vatican City',
    'VC': 'St. Vincent & Grenadines',
    'VE': 'Venezuela',
    'VG': 'British Virgin Islands',
    'VI': 'U.S. Virgin Islands',
    'VN': 'Vietnam',
    'VU': 'Vanuatu',
    'WF': 'Wallis & Futuna',
    'WS': 'Samoa',
    'XK': 'Kosovo',
    'YE': 'Yemen',
    'YT': 'Mayotte',
    'ZA': 'South Africa',
    'ZM': 'Zambia',
    'ZW': 'Zimbabwe',
}

# Plainer names where the CLDR name reads oddly in a job list.
DISPLAY = {
    'CD': 'DR Congo',
    'CG': 'Congo',
    'HK': 'Hong Kong',
    'MM': 'Myanmar',
    'MO': 'Macao',
    'PS': 'State of Palestine',
}

# Other spellings employers use, mostly the official UN names, matched after name_key.
ALIASES = {
    'uk': 'GB',
    'great britain': 'GB',
    'united kingdom of great britain and northern ireland': 'GB',
    'england': 'GB',
    'scotland': 'GB',
    'wales': 'GB',
    'northern ireland': 'GB',
    'usa': 'US',
    'us': 'US',
    'united states of america': 'US',
    'uae': 'AE',
    'ivory coast': 'CI',
    'palestine': 'PS',
    'state of palestine (sop)': 'PS',
    'occupied palestinian territory': 'PS',
    'palestinian territory': 'PS',
    'gaza': 'PS',
    'west bank': 'PS',
    'burma': 'MM',
    'syrian arab republic': 'SY',
    'united republic of tanzania': 'TZ',
    "lao people's democratic republic": 'LA',
    'lao pdr': 'LA',
    'democratic republic of the congo': 'CD',
    'democratic republic of congo': 'CD',
    'drc': 'CD',
    'republic of the congo': 'CG',
    'republic of congo': 'CG',
    'congo-brazzaville': 'CG',
    'iran (islamic republic of)': 'IR',
    'islamic republic of iran': 'IR',
    'venezuela (bolivarian republic of)': 'VE',
    'bolivia (plurinational state of)': 'BO',
    'republic of moldova': 'MD',
    'republic of korea': 'KR',
    "democratic people's republic of korea": 'KP',
    'viet nam': 'VN',
    'turkey': 'TR',
    'czech republic': 'CZ',
    'russian federation': 'RU',
    'cabo verde': 'CV',
    'swaziland': 'SZ',
    'macedonia': 'MK',
    'east timor': 'TL',
    'micronesia (federated states of)': 'FM',
    'saint lucia': 'LC',
    'saint kitts and nevis': 'KN',
    'saint vincent and the grenadines': 'VC',
    'hong kong sar': 'HK',
    'macau': 'MO',
    'brunei darussalam': 'BN',
    'kyrgyz republic': 'KG',
    'slovak republic': 'SK',
}

_MARKS = re.compile(r"[\u0300-\u036f]")
_APOSTROPHES = re.compile(r"[\u2018\u2019\u0060\u00b4]")
_SPACES = re.compile(r"\s+")
# The parts of a location that each may name a country: "Somalia / Nairobi, Kenya".
_PARTS = re.compile(r"[,/;]")
# The second half of an inverted official name, "Congo, Democratic Republic of the", compared
# after name_key and the short forms below.
_INVERTED = re.compile(
    r"^(?:democratic|islamic|united|plurinational|bolivarian|federated|federal|people's"
    r"|republic|kingdom|state|states|former)\b|\bof(?: the)?$"
)
# Short forms in official lists: "Congo, Dem. Rep.", "Iran, Islamic Rep.".
_SHORT_FORMS = (
    (re.compile(r"\bdem\.?\s*rep\b\.?(?:\s+of(?:\s+the)?)?"), "democratic republic of the"),
    (re.compile(r"\brep\b\.?"), "republic of"),
)
# Names that, alone before such a half, may mean another country.
_AMBIGUOUS_ALONE = frozenset({"congo"})
# Words that mark a remote job in a location, matched as whole words.
_REMOTE = re.compile(
    r"\b(?:remote|home[- ]based|work(?:ing)? from home|wfh|telecommut\w*"
    r"|virtual|online|anywhere)\b",
    re.IGNORECASE,
)


def name_key(name: str) -> str:
    """Lower case, without accents, straight apostrophes, "and" for "&", no leading "The" or
    trailing full stop: the frontend's nameKey."""
    text = _MARKS.sub("", unicodedata.normalize("NFD", name))
    text = _APOSTROPHES.sub("'", text).replace("&", " and ")
    text = _SPACES.sub(" ", text).strip().lower()
    if text.startswith("the "):
        text = text[4:]
    return text.rstrip(".")


_ISO_BY_NAME = {
    **{name_key(name): code for code, name in COUNTRY_NAMES.items()},
    **{name_key(name): code for code, name in DISPLAY.items()},
    **{name_key(name): code for name, code in ALIASES.items()},
}


def country_name(iso: str | None) -> str | None:
    """The English name the public site shows for a code, "&" written "and"."""
    if not iso:
        return None
    code = iso.upper()
    name = DISPLAY.get(code) or COUNTRY_NAMES.get(code)
    return name.replace(" & ", " and ") if name else None


def iso_from_name(name: str) -> str | None:
    return _ISO_BY_NAME.get(name_key(name))


def _inverted_half(text: str) -> str | None:
    """The second half of an inverted name, short forms written out; None if it is not one."""
    if not text or iso_from_name(text) is not None:
        return None
    key = name_key(text)
    for pattern, full in _SHORT_FORMS:
        key = pattern.sub(full, key)
    return key if _INVERTED.search(key) else None


def countries_named(location: str | None) -> list[str]:
    """Every country a location names, in order, each once.

    "Congo, Democratic Republic of the" is read as one name. When the joined name is unknown,
    each part is read alone ("Kenya, Republic of" is Kenya), except "Congo", which names no
    country then.
    """
    parts = [part.strip() for part in _PARTS.split(location or "")]
    found: list[str] = []
    index = 0
    while index < len(parts):
        part = parts[index]
        half = _inverted_half(parts[index + 1]) if index + 1 < len(parts) else None
        joined = half and (iso_from_name(f"{half} {part}") or iso_from_name(f"{part} ({half})"))
        if joined:
            iso = joined
            index += 2
        elif half and name_key(part) in _AMBIGUOUS_ALONE:
            iso = None
            index += 2
        else:
            iso = iso_from_name(part)
            index += 1
        if iso and iso not in found:
            found.append(iso)
    return found


def read_location(location: str | None) -> dict | None:
    """Country and remote marker read from a location; None when there is no location.

    A country is stored only when the location names exactly one. City is not guessed from
    the text: a reader fills it only from a locality the employer publishes.
    """
    if not isinstance(location, str) or not location.strip():
        return None
    named = countries_named(location)
    iso = named[0] if len(named) == 1 else None
    return {
        "country": country_name(iso),
        "country_iso": iso,
        "city": None,
        "is_remote": bool(_REMOTE.search(location)),
    }
