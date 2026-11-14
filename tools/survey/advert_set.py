"""Role-content survey (W-54): the patterns that decide the advert set, frozen as they stood when
the broad layer's validation sample of 100 was drawn (role-survey.md 19.16; `adverts.py` at d62f97e).

They decide which pages count as adverts (`adverts.is_advert`) and which short lines are site
furniture (`adverts.chrome_lines`), so they also decide the text the coders read. The measures use
`adverts.py`'s own patterns, which may be revised; these never are, so a revised measure never
changes which adverts are measured or their text. Copied word for word; a test fixes their hash.
"""
from __future__ import annotations

import re

SECTION_TYPES: list[tuple[str, re.Pattern]] = [
    ("working_relationships", re.compile(r"^about (?:the|our) (?:team|department|unit|division)\b", re.IGNORECASE)),
    ("context", re.compile(r"^about (?:the|this) (?:programme|program|project)\b", re.IGNORECASE)),
    ("essential_requirements", re.compile(r"^about (?:the )?(?:candidate|applicant)s?\b", re.IGNORECASE)),
    ("about_organisation", re.compile(r"^(?:about(?:$| (?!the (?:role|job|position|post|opportunity|assignment|"
                                      r"vacancy)\b|this (?:role|job|position|post|opportunity)\b|you\b|the candidate\b))|"
                                      r"who we are|our organi[sz]ation|the organi[sz]ation|organi[sz]ational "
                                      r"(?:setting|context|background)|background on|à propos (?!du poste)|qui sommes|"
                                      r"pr[ée]sentation de|l'organisation|l'association|notre organisation|"
                                      r"company description|our mission|org(?:ani[sz]ation)? overview|overview of (?:the )?"
                                      r"(?:organi[sz]ation|company))", re.IGNORECASE)),
    ("role_purpose", re.compile(r"^(?:about (?:the|this) (?:role|job|position|post|opportunity|assignment|vacancy)|"
                                r"à propos du poste)", re.IGNORECASE)),
    ("context", re.compile(r"^(?:context|background|programme (?:background|description)|project "
                           r"(?:background|description|summary)|contexte|description du projet|"
                           r"(?:the )?country context|situation)", re.IGNORECASE)),
    ("role_purpose", re.compile(r"^(?:(?:job|position|role|post) (?:purpose|summary|overview|description)|"
                                r"purpose(?: of the (?:role|position|post|job))?|overview|summary|the role|"
                                r"about the (?:role|job|position)|objecti(?:ve|f)s? (?:of the|du) (?:poste|"
                                r"position|role|assignment|consultancy)|objectif du poste|raison d'[êe]tre|"
                                r"finalit[ée]|mission(?: g[ée]n[ée]rale)?(?: du poste)?$|r[ée]sum[ée] du poste|"
                                r"description du poste|le poste|your role|what is the role)", re.IGNORECASE)),
    ("scope", re.compile(r"^(?:scope|dimensions|key (?:relationships and )?dimensions|scope of work|"
                         r"p[ée]rim[èe]tre|budget|line management|supervision)", re.IGNORECASE)),
    ("responsibilities", re.compile(r"^(?:(?:key |main |major |principal |specific )?(?:duties|responsibilit|"
                                    r"tasks|accountabilit|activities|functions)|what you(?:'ll| will) do|"
                                    r"your (?:responsibilities|mission|tasks)|the job|job description|"
                                    r"(?:principales |vos )?(?:missions|t[âa]ches|responsabilit[ée]s|"
                                    r"attributions|activit[ée]s)|roles? and responsibilit|duties and "
                                    r"responsibilit|in this role|day to day|key result areas|"
                                    r"description des t[âa]ches)", re.IGNORECASE)),
    ("deliverables", re.compile(r"^(?:(?:expected |key )?deliverables|outputs|expected (?:results|outputs)|"
                                r"livrables|r[ée]sultats attendus|results expected|key performance|"
                                r"measures of success|success (?:looks|measures))", re.IGNORECASE)),
    ("working_relationships", re.compile(r"^(?:(?:key |working |internal and external )?(?:relationships|contacts)|"
                                         r"reporting(?: line| lines| to)?|reports to|liens? hi[ée]rarchiques?|"
                                         r"relations (?:de travail|fonctionnelles)|position in the organi)", re.IGNORECASE)),
    ("essential_requirements", re.compile(r"^(?:(?:essential |minimum |required |mandatory )?(?:qualifications?|"
                                          r"requirements?|criteria|skills|experience|education)|"
                                          r"(?:person specification|who you are|what you(?:'ll)? (?:bring|need|"
                                          r"have)|about you|your profile|the ideal candidate|candidate profile|"
                                          r"required skills|requirements and qualifications|"
                                          r"profil(?: recherch[ée]| requis| du candidat)?|comp[ée]tences "
                                          r"requises|qualifications requises|exp[ée]rience(?: requise)?|"
                                          r"formation|dipl[ôo]mes?|crit[èe]res|you have|must have)|"
                                          r"education(?:al)? (?:background|requirements)|work experience|"
                                          r"technical (?:skills|competencies|requirements))", re.IGNORECASE)),
    ("desirable_requirements", re.compile(r"^(?:desirable|preferred|nice to have|an advantage|assets?|"
                                          r"souhait[ée]|atouts?|appr[ée]ci[ée]|additional (?:assets|"
                                          r"qualifications))", re.IGNORECASE)),
    ("competencies", re.compile(r"^(?:(?:core |key |functional |technical |managerial )?competenc|behaviou?rs|"
                                r"values|comp[ée]tences (?:cl[ée]s|comportementales)|savoir-?[êe]tre|qualit[ée]s|"
                                r"personal (?:attributes|qualities)|soft skills)", re.IGNORECASE)),
    ("languages", re.compile(r"^(?:languages?(?: requirements| skills)?|langues?|language proficiency)", re.IGNORECASE)),
    ("field_conditions", re.compile(r"^(?:(?:living|working|field|security) conditions|conditions of (?:service|"
                                    r"work)|hardship|accommodation|conditions (?:de vie|de travail|de s[ée]curit[ée])|"
                                    r"work environment)", re.IGNORECASE)),
    ("pay_benefits", re.compile(r"^(?:(?:salary|remuneration|compensation|pay|benefits|what we offer|we offer|"
                                r"package|terms and conditions|conditions d'emploi|r[ée]mun[ée]ration|salaire|"
                                r"avantages|nous (?:vous )?offrons|ce que nous offrons|contract(?:ual)? "
                                r"(?:details|terms|conditions)|type of contract|contrat|conditions propos[ée]es))", re.IGNORECASE)),
    ("commitments_safeguarding", re.compile(r"^(?:safeguarding|psea|protection from sexual|child (?:safeguarding|"
                                            r"protection policy)|code of conduct|our (?:commitment|values)|"
                                            r"commitment to|engagements?|pr[ée]vention de l'exploitation|"
                                            r"politique de protection|integrity|un considerations?|special notice)", re.IGNORECASE)),
    ("equal_opportunity", re.compile(r"^(?:equal (?:opportunit|employment)|diversity|inclusion|eeo|equity|"
                                     r"[ée]galit[ée] des chances|diversit[ée]|non-?discrimination|"
                                     r"accessibility|reasonable (?:accommodation|adjustments))", re.IGNORECASE)),
    ("how_to_apply", re.compile(r"^(?:how to apply|application(?: process| procedure| instructions| method)?s?|"
                                r"to apply|apply(?: now)?|submission|comment postuler|candidature|"
                                r"pour postuler|modalit[ée]s de candidature|dossier de candidature|"
                                r"closing date|deadline|date limite)", re.IGNORECASE)),
    ("selection_process", re.compile(r"^(?:selection(?: process| criteria)?|recruitment process|assessment|"
                                     r"interview|next steps|processus de (?:s[ée]lection|recrutement)|"
                                     r"[ée]valuation des candidatures|timeline)", re.IGNORECASE)),
    ("fraud_notice", re.compile(r"^(?:(?:no )?fees?|fraud|scam|beware|disclaimer|avertissement|"
                                r"aucun frais|note:? (?:we|the organi[sz]ation) (?:do|does) not charge)", re.IGNORECASE)),
    ("data_protection", re.compile(r"^(?:data protection|privacy|gdpr|personal data|protection des donn[ée]es|"
                                   r"donn[ée]es personnelles|rgpd)", re.IGNORECASE)),
    ("header_facts", re.compile(r"^(?:job (?:details|information|facts)|position details|key (?:details|facts|"
                                r"information)|vacancy (?:details|information|announcement)|grade|level|"
                                r"contract (?:type|duration|length)|duration|start date|type de contrat|"
                                r"dur[ée]e|date de d[ée]but|reference|posting (?:date|period)|"
                                r"organizational unit|department|division|duty station|location|lieu d'affectation|"
                                r"lieu de travail|travel)", re.IGNORECASE)),
]

SECTION_EXTRA: list[tuple[str, re.Pattern]] = [
    ("essential_requirements", re.compile(r"^(?:job|position|key|general|specific|technical|professional) "
                                          r"(?:requirements|qualifications)|^conditions requises|we'?re looking for|"
                                          r"we are looking for|^looking for|(?:skills|experience|qualifications|"
                                          r"knowledge|competences|comp[ée]tences)$|^years of|^academic|"
                                          r"^ann[ée]es d'exp[ée]rience|^education$", re.IGNORECASE)),
    ("languages", re.compile(r"comp[ée]tences linguistiques|language skills", re.IGNORECASE)),
    ("about_organisation", re.compile(r"^organi[sz]ation(?:al)? (?:summary|profile)|^what is |^our (?:aim|vision|"
                                      r"story|work)|^who are we|^company (?:overview|profile)", re.IGNORECASE)),
    ("context", re.compile(r"^country (?:profile|overview)|^contexte", re.IGNORECASE)),
    ("role_purpose", re.compile(r"^(?:position|job|role) profile|^profil du poste$", re.IGNORECASE)),
    ("header_facts", re.compile(r"^(?:starting date|date de commencement|position|title|titre|d[ée]partement|"
                                r"department|location|lieu|contract duration|dur[ée]e du contrat)$|"
                                r"contract duration$", re.IGNORECASE)),
    ("responsibilities", re.compile(r"^fonctions$|responsibilities include|^responsabilit|^main tasks", re.IGNORECASE)),
    ("how_to_apply", re.compile(r"^before you apply", re.IGNORECASE)),
    ("pay_benefits", re.compile(r"^r[ée]?[mn]u[mn][ée]ration", re.IGNORECASE)),
    ("commitments_safeguarding", re.compile(r"^confidentialit", re.IGNORECASE)),
]


def section_type(heading: str) -> str:
    h = heading.strip().replace("&", " and ").replace("’", "'")
    h = re.sub(r"^[\W\d_]+|[\s:.;?!*]+$", "", h)
    h = re.sub(r"\s+", " ", h)
    for sid, pattern in SECTION_TYPES:
        if pattern.search(h):
            return sid
    for sid, pattern in SECTION_EXTRA:
        if pattern.search(h):
            return sid
    return "unclassified"


FACTS: dict[str, re.Pattern] = {
    # Pay as section 5 asks: a figure or range with its currency, a salary word next to a figure, or a
    # named scale (a grade on a salary scale, a band). "Competitive salary" is vague pay, its own item.
    "pay": re.compile(r"(?<![\w])(?:usd|us\$|\$|eur|€|£|gbp|kes|ksh|ngn|₦|inr|₹|rs\.?|chf|cad|aud|xof|fcfa|bdt|"
                      r"ugx|tzs|etb|ghs|zar|sek|nok|dkk)\s?\d[\d,.\s]{2,}|\b\d[\d,.]{2,}\s?(?:usd|eur|€|£|gbp|kes|ksh|"
                      r"ngn|inr|chf|xof|fcfa|bdt|ugx|tzs|etb|ghs|zar|sek|nok|dkk|lakhs?)\b|\b(?:salary|"
                      r"remuneration|stipend|honorarium|gross pay|net pay|r[ée]mun[ée]ration|salaire|allowances?|"
                      r"per diem)\b[^.\n]{0,25}?\b(?!(?:19|20)\d{2}\b(?!\s*(?:per|a (?:month|year)|/\s*(?:month|year|"
                      r"annum|mo|yr)|usd|eur|gbp|"
                      r"kes|ngn|inr|\$|€|£)))(?:\d{1,3}(?:[,.\s]\d{3})+|\d{3,})\b|\b(?:salary|pay) (?:scale|band|grade)"
                      r"\s*:?\s*[A-Z]{0,3}-?\d|\bon the [\w\s]{2,40}? salary scale\b|\bgrade\s?[A-Z]{0,2}-?\d+ of the\b|"
                      r"\b(?:annual|monthly) net (?:base )?salary\b|\bnet base salary\b|\bpay band\b|"
                      r"\b\d+(?:\.\d+)?\s*(?:lakhs?|crores?|lpa)\b", re.IGNORECASE),
    "pay_vague": re.compile(r"\b(?:competitive|attractive|negotiable|commensurate)\b[^.\n]{0,30}\b(?:salary|pay|"
                            r"remuneration|package|compensation)\b|\b(?:salary|remuneration)\b[^.\n]{0,25}?\b"
                            r"(?:commensurate|negotiable|competitive|depending on experience|tbc|tbd)\b|\bpay\s*(?::|is|"
                            r"will be)\s*(?:competitive|negotiable|commensurate)\b|"
                            r"\bsalaire (?:attractif|comp[ée]titif|selon)\b", re.IGNORECASE),
    "grade": re.compile(r"\b(?:grade|band|level|cat[ée]gorie|groupe)\s*:?\s*[A-Z]{0,3}-?\d|\b(?:P|D|G|GS|NO)-\s?[1-7A-E]\b|"
                        r"\bNO[A-E]\b|\b(?:SB|SC|ICS|LICA|IICA|NPSA|IPSA)-?\d", re.IGNORECASE),
    "contract_type": re.compile(r"\bfixed[- ]term\b|\bpermanent\b|\btemporary\b|\bconsultan(?:cy|t)\b|\bindividual "
                                r"contract|\bcdd\b|\bcdi\b|\bcontrat\b|\bcontract type\b|\btype of contract\b|"
                                r"\bfreelance\b|\binternship\b|\bstage\b|\bvolunteer\b|\bcasual\b|\bservice "
                                r"contract\b|\btemporary appointment\b|\bcontinuing appointment\b", re.IGNORECASE),
    "contract_length": re.compile(r"\b(?:contract|duration|period|assignment|appointment|position|post|dur[ée]e|"
                                  r"contrat|mission|consultancy|engagement)\b[^.\n]{0,40}?\b\d{1,3}\s*(?:-|to|à)?\s*"
                                  r"\d{0,3}\s*(?:months?|mois|years?|ans|weeks?|semaines|working days|days|jours)\b|"
                                  r"\b\d{1,2}[- ](?:month|year|mois)s?\b[^.\n]{0,12}\b(?:fixed[- ]term|contract|"
                                  r"assignment|contrat|cdd|appointment)\b|\b(?:duration|dur[ée]e)\s*(?:of (?:the )?"
                                  r"(?:contract|assignment))?\s*:|\buntil \w+ \d{4}\b|\bend date\b|\bone[- ]year "
                                  r"(?:contract|fixed|appointment)\b", re.IGNORECASE),
    "hours": re.compile(r"\bfull[- ]time\b|\bpart[- ]time\b|\b\d{1,2}(?:\.\d)?\s*(?:hours|hrs|h)\s*(?:per|a|/)\s*"
                        r"week|\btemps (?:plein|partiel)\b|\b\d{2,3}\s?%\s*(?:fte|time|temps|of full[- ]time)\b|"
                        r"\bfte\b|\blevel of effort\b|(?<!outside )(?<!outside of )\bworking hours\b|"
                        r"\bheures (?:par|hebdomadaires)\b", re.IGNORECASE),
    "duty_station": re.compile(r"\bduty station\b|\blocation\s*:|(?<![\w-])based in\b|\blieu d'affectation\b|"
                               r"\blieu de (?:travail|mission)\b|\blieu\s*:|(?<![\w-])based? (?:at|in)\b|\bplace of "
                               r"(?:work|assignment|performance)\b|\boffice location\b|\blocalisation\s*:|"
                               r"\bposte bas[ée]\b|\blocation of (?:the )?(?:post|position|assignment)\b", re.IGNORECASE),
    "remote": re.compile(r"\bremote\b|\bhome[- ]based\b|\bwork from home\b|\bhybrid\b|\bt[ée]l[ée]travail\b|"
                         r"\bflexible (?:location|working)\b|\bteleworking\b", re.IGNORECASE),
    "travel": re.compile(r"\btravel\b[^.\n]{0,40}\d{1,3}\s?%|\d{1,3}\s?%[^.\n]{0,30}\btravel|\bfrequent travel\b|"
                         r"\btravel (?:to|within|required|up to)\b|\bd[ée]placements?\b|\broving\b|\bfield visits\b|"
                         r"\bmissions? (?:fr[ée]quentes|sur le terrain)\b", re.IGNORECASE),
    "reports_to": re.compile(r"\breport(?:s|ing)? (?:directly )?to\b|\bline manager\b|\bsupervisor\b|\bunder the "
                             r"(?:direct |overall )?supervision\b|\bsous la (?:responsabilit[ée]|supervision)\b|"
                             r"\brattach[ée]\b|\bsup[ée]rieur hi[ée]rarchique\b", re.IGNORECASE),
    "direct_reports": re.compile(r"\b(?:supervis(?:e|es|ing)|line[- ]manag(?:e|es|ing)|manag(?:e|es|ing)) (?:a team "
                                 r"of )?\d+|\bdirect reports?\b|\bteam of \d+|\bsupervises?\b|\bencadr(?:e|ement)\b|"
                                 r"\bline management\b", re.IGNORECASE),
    "budget": re.compile(r"\bbudget of\b|\bbudget\b[^.\n]{0,30}(?:\d[\d,.]*\s?(?:million|m\b|k\b)|usd|eur|\$|€|£)|"
                         r"(?:usd|eur|\$|€|£)\s?\d[\d,.]*\s?(?:million|m\b)|\bportfolio of\b", re.IGNORECASE),
    "closing_date": re.compile(r"\bclosing date\b|\bdeadline\b|\bdate limite\b|\bapply by\b|\bapplications? "
                               r"(?:close|must be received|will close)\b|\bclosing\b|\bcl[ôo]ture\b|\bexpiry date\b|"
                               r"\bopen until\b|\bavant le \d", re.IGNORECASE),
    "closing_time": re.compile(r"\b\d{1,2}[:.h]\d{2}\s*(?:am|pm|h)?\s*(?:\(?\s*(?:gmt|utc|cet|cest|eat|wat|cat|"
                               r"bst|est|edt|pst|ist|eet|heure)[^)]{0,12}\)?)|\bmidnight\b[^.\n]{0,20}(?:gmt|utc|cet|"
                               r"eat|time)|\b(?:gmt|utc)\s?[+-]\s?\d", re.IGNORECASE),
    "start_date": re.compile(r"\bstart(?:ing)? date\b|\bdate de (?:d[ée]but|prise de (?:poste|fonction))\b|\bas soon "
                             r"as possible\b|\basap\b|\bd[èe]s que possible\b|\bprise de poste\b|\bto start\b|"
                             r"\bimmediate start\b|\bstart in \w+\b", re.IGNORECASE),
    "languages": re.compile(r"\b(?:fluen(?:cy|t)|proficien(?:cy|t)|written and spoken|working knowledge|"
                            r"ma[îi]trise|bonne connaissance|courant)\b[^.\n]{0,60}\b(?:english|french|arabic|"
                            r"spanish|portuguese|swahili|hausa|amharic|anglais|fran[çc]ais|arabe|espagnol)\b|"
                            r"\b(?:english|french|arabic|spanish|portuguese|swahili|anglais|fran[çc]ais|arabe)\b"
                            r"[^.\n]{0,40}\b(?:required|essential|desirable|an asset|fluency|level|obligatoire|"
                            r"souhait[ée]|indispensable)\b|\blanguages?\s*:\s*(?:english|french|arabic|spanish|"
                            r"portuguese|swahili|anglais|fran[çc]ais|arabe|espagnol)\b", re.IGNORECASE),
    "selection_steps": re.compile(r"\bshortlist|\bwritten (?:test|assessment|exercise)\b|\binterview|\bassessment "
                                  r"(?:centre|center)\b|\btechnical test\b|\bentretien|\btest [ée]crit\b|"
                                  r"\bpresel|\bpr[ée]s[ée]lection\b|\bselection process\b|\brecruitment process\b", re.IGNORECASE),
    "how_to_apply": re.compile(r"\bto apply\b|\bhow to apply\b|\bapply (?:online|via|through|here|now|at)\b|\bsubmit "
                               r"(?:your|a|an)\b|\bsend (?:your|a)\b|\bpostuler\b|\bcandidature\b|\bapplication "
                               r"(?:form|portal|link)\b|\bclick (?:here|on)\b|\bcv\b|\bcover(?:ing)? letter\b|"
                               r"\blettre de motivation\b", re.IGNORECASE),
    "no_fee_notice": re.compile(r"(?:not|never) (?:charge|request|ask for|require)[^.\n]{0,40}(?:fee|payment|money)|"
                                r"\bno fees?\b|\bfree of charge\b|\bfraud(?:ulent)?\b|\bscam\b|\baucun frais\b|"
                                r"\bne (?:demande|facture) (?:aucun|jamais)\b", re.IGNORECASE),
    "safeguarding_checks": re.compile(r"\bsafeguarding\b|\bbackground (?:check|screening)|\breference checks?\b|"
                                      r"\bcriminal record|\bdbs\b|\bpolice clearance\b|\bvetting\b|\bpsea\b|"
                                      r"\bmisconduct disclosure\b|\bv[ée]rification des r[ée]f[ée]rences\b|"
                                      r"\bcasier judiciaire\b", re.IGNORECASE),
    "accompanied": re.compile(r"\bnon[- ]family\b|\bfamily duty station\b|\baccompanied\b|\bunaccompanied\b|"
                              r"\bnon accompagn[ée]\b|\bfamily posting\b", re.IGNORECASE),
    "hardship_rr": re.compile(r"\bhardship\b|\br\s?&\s?r\b|\brest and recuperation\b|\brepos et r[ée]cup[ée]ration\b|"
                              r"\bdanger pay\b|\bsecurity (?:phase|level)\b", re.IGNORECASE),
    "housing": re.compile(r"\baccommodation (?:is |will be )?provided\b|\bhousing\b|\bguesthouse\b|\bshared "
                          r"accommodation\b|\blogement\b|\bh[ée]bergement\b|\bcompound\b", re.IGNORECASE),
    "number_of_posts": re.compile(r"\bnumber of (?:posts|positions|vacancies)\b|\b\d+ (?:posts|positions)\b|"
                                  r"\bnombre de postes\b|\bvacancies:\s*\d", re.IGNORECASE),
    "funding_status": re.compile(r"\bsubject to (?:funding|donor approval|the availability)|\bcontingent (?:up)?on "
                                 r"funding\b|\bpending funding\b|\bsous r[ée]serve de financement\b", re.IGNORECASE),
    "equal_opportunity": re.compile(r"\bequal opportunit|\bequal employment\b|\bdiversity\b|\bwithout regard to\b|"
                                    r"\bdoes not discriminate\b|\bnon-?discriminat|\b[ée]galit[ée] des chances\b|"
                                    r"\bdiversit[ée]\b|\binclusive (?:employer|workplace)\b", re.IGNORECASE),
    "adjustments": re.compile(r"\breasonable (?:adjustments?|accommodations?)\b|\baccess needs\b|\bdisability "
                              r"confident\b|\bam[ée]nagements? raisonnables?\b", re.IGNORECASE),
    "reference_number": re.compile(r"\b(?:reference|ref\.?|vacancy|requisition|job|req)\s*(?:no\.?|number|id|#|code)"
                                   r"\s*:?\s*[A-Z0-9][A-Z0-9/_.-]{2,}|\br[ée]f[ée]rence\s*:", re.IGNORECASE),
}

APPLICANT = r"(?:candidates?|applicants?|you|the (?:successful )?(?:candidate|applicant|post ?holder|incumbent))"
RESTRICTIONS: dict[str, re.Pattern] = {
    "sex": re.compile(r"\b(?:female|male|women|men)\s+(?:candidates?|applicants?)\s+only\b|\bonly\s+(?:female|male|women|"
                      r"men)\s+(?:candidates?|applicants?|may apply|need apply|should apply|are eligible)\b|"
                      r"\b(?:position|post|vacancy|role|job|opportunity|applications?)\s+(?:is|are)\s+(?:open\s+|reserved\s+)?"
                      r"(?:only\s+)?for (?:women|men|females|males)(?:\s+(?:candidates|applicants))?\s+only\b|\b" +
                      APPLICANT +
                      r"\s+(?:must|should) be (?:a )?(?:female|male|woman|man)\b|\bopen only to (?:female|male|women|"
                      r"men)\b|\bopen to (?:female|male|women|men)(?: candidates| applicants)? only\b|\bposte "
                      r"r[ée]serv[ée] aux (?:femmes|hommes)\b|\buniquement (?:aux|des) (?:candidates|femmes|hommes)\b|"
                      r"\bcandidatures? f[ée]minines? uniquement\b", re.IGNORECASE),
    "age": re.compile(r"\b" + APPLICANT + r"\b[^.\n]{0,40}?\b(?:aged?|between the ages? of|not (?:older|more) than|under|"
                      r"below|must not (?:be older than|exceed))\s*(?:between\s+)?\d{2}\s*(?:(?:-|–|to|and)\s*\d{2}\s*)?"
                      r"(?:years|yrs)\b|"
                      r"\b(?:upper )?(?:age limit|maximum age)\s*(?:of|:|is)?\s*\d{2}\b|\bbetween\s+\d{2}\s*(?:and|-|–|to)\s*"
                      r"\d{2}\s*years?\s+(?:old|of age)\b|\b\d{2}\s*years?\s*(?:old\s*)?or\s*(?:younger|less|under|below)\b|"
                      r"(?m:^\s*age\s*:\s*\d{2}\s*(?:-|–|to)\s*\d{2}\b)|\bcandidat(?:e|s|es)?\b[^.\n]{0,40}?"
                      r"\b[âa]g[ée]e?s? de (?:moins de|plus de|au plus|entre) \d{2}\b|\b[âa]ge (?:maximum|limite)\s*:?\s*"
                      r"\d{2}\s*ans\b", re.IGNORECASE),
    "religion": re.compile(r"\bmust be (?:a )?(?:practising|committed|born-again|devout)\s+(?:christian|muslim|"
                           r"catholic)\b|\b(?:christian|muslim|catholic) (?:faith|believer) (?:is )?(?:required|"
                           r"essential)\b|\bpersonal (?:christian )?faith (?:is )?required\b|\bactive church member\b",
                           re.IGNORECASE),
    "marital_family": re.compile(r"\b" + APPLICANT + r"\b[^.\n]{0,30}?\b(?:must|should) be (?:single|unmarried|married)\b|"
                                 r"\b(?:single|unmarried|married) (?:candidates|applicants)\b|\b(?:single|unmarried|"
                                 r"married) (?:candidate|applicant)s? only\b|\bc[ée]libataires? uniquement\b",
                                 re.IGNORECASE),
    "nationality": re.compile(r"\b(?:nationals?|citizens?) (?:of [a-z]+(?: [a-z]+)? )?only\b|\bonly (?:open to )?(?:[a-z]+ )?"
                              r"(?:nationals|citizens)\b|\b" + APPLICANT + r" must be (?:an? )?(?:[a-z]+ )?(?:national|"
                              r"citizen)s?\b|\bopen (?:only )?to (?:[a-z]+ )?nationals(?: only)?\b|\blocal candidates "
                              r"only\b|\bressortissants? [^.\n]{0,30}uniquement\b|\bnationalit[ée] [^.\n]{0,20}"
                              r"(?:exig[ée]e|obligatoire)\b|\bnon-?nationals? only\b", re.IGNORECASE),
    # UN-style national posts are a case of their own (section 20.2), recorded apart from nationality.
    "national_post": re.compile(r"(?i:\bnational (?:position|post|officer|professional officer|staff (?:position|post))\b|"
                                r"\bposte national\b)|\bNO-?[A-E]\b"),
    "disability": re.compile(r"\bable[- ]bodied\b", re.IGNORECASE),
    "photo_appearance": re.compile(r"(?<!not )(?<!n't )(?<!never )\b(?:attach|include|send|submit|enclose) (?:a |your )?"
                                   r"(?:recent )?(?:passport[- ]size )?(?:photo|photograph|picture)\b|\b" + APPLICANT +
                                   r"\b[^.\n]{0,20}\b(?:be|look) presentable\b|\bpresentable (?:appearance|candidates?|"
                                   r"applicants?)\b|\bgood appearance\b|\b(?:minimum height|height requirement)\b|\b" +
                                   APPLICANT + r"\b[^.\n]{0,30}\b(?:must|should) (?:be|have)\b[^.\n]{0,20}(?<!at )"
                                   r"\bheight\b(?!s)|"
                                   r"\bphoto (?:d'identit[ée]|r[ée]cente)\b", re.IGNORECASE),
}

INCLUSION: dict[str, re.Pattern] = {
    "women_encouraged": re.compile(r"\b(?:women|female (?:candidates|applicants))[^.\n]{0,30}(?:strongly )?encouraged\b|"
                                   r"\bencourage[sd]? (?:applications from |)(?:women|female)\b|\bcandidatures? "
                                   r"f[ée]minines? (?:sont )?(?:vivement )?encourag[ée]es\b", re.IGNORECASE),
    "both_sexes_mark": re.compile(r"\((?:h\s*/\s*f|f\s*/\s*h|m\s*/\s*f|f\s*/\s*m|m\s*/\s*w\s*/\s*d|m\s*/\s*f\s*/\s*d|"
                                  r"h\s*/\s*f\s*/\s*x)\)|"
                                  r"\b(?:h/f|f/h)\b", re.IGNORECASE),
    "disability_encouraged": re.compile(r"\b(?:persons?|people|candidates?|applicants?) with disabilit(?:y|ies)[^.\n]"
                                        r"{0,40}encouraged\b|\bdisability confident\b|\bguaranteed interview\b|"
                                        r"\bpersonnes (?:en situation de|vivant avec un) handicap\b", re.IGNORECASE),
    "underrepresented_encouraged": re.compile(r"\bunder-?represented\b|\bminorit(?:y|ies)[^.\n]{0,40}encouraged\b|"
                                              r"\bfrom all backgrounds\b|\bdiverse backgrounds\b|\bglobal south\b"
                                              r"[^.\n]{0,40}encouraged\b", re.IGNORECASE),
    "equal_opportunity": FACTS["equal_opportunity"],
    "adjustments_offered": FACTS["adjustments"],
}

KNOWN_STANDARD = re.compile(r"un considerations|does not charge a fee|equal opportunit|zero tolerance|sexual exploitation "
                            r"and abuse|committed to (?:diversity|safeguarding|achieving)|only shortlisted|"
                            r"background checks?|smoke-free|reference checks|without regard to|personal data|"
                            r"aucun frais|seul(?:e)?s les candidat|tol[ée]rance z[ée]ro", re.IGNORECASE)

SHORT_STANDARD = re.compile(r"equal (?:opportunit|employment)|disability confident|zero tolerance|"
                            r"(?:not|never) charge|no (?:recruitment )?fees?\b|[ée]galit[ée] des chances|aucun frais",
                            re.IGNORECASE)
