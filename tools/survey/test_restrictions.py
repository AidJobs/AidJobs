"""Tests of the restriction rules' revision (W-54, role-survey.md 19.18): residence apart from
nationality (the user's decision of 14 November 2026), one or more tests per wording pattern the
rules missed in rounds 1 and 2, and the "Not" list, which must never be flagged. Each pattern's test
fails on the rules as they stood at 2e8ed49. Every line here was written for the tests by AidJobs;
none is copied from a real advert. Run: python -m pytest tools/survey -q"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import adverts


def restricted(text, title=None):
    return adverts.restrictions_of(text) if title is None else adverts.restrictions_of(text, title)


# --- nationality: nationality, citizenship and ethnicity -------------------------------------------

def test_a_nationality_in_brackets_is_a_nationality_limit():
    assert restricted("We seek an experienced officer (Kenyan national) to join the team.") == {"nationality"}


def test_a_national_named_in_the_title_designates_a_national_post():
    assert restricted("Advise the village committees.", title="Village Adviser (Lao national; 12 months)") == {
        "national_post"}
    assert "national_post" not in restricted("We seek an experienced officer (Kenyan national) to join the team.")


def test_international_candidates_only():
    assert restricted("Education Consultant, remote (open for international candidates only)") == {"nationality"}


def test_citizenship_required():
    assert restricted("US citizenship is required for this contract.") == {"nationality"}
    assert restricted("Applicants must hold Irish citizenship.") == {"nationality"}


def test_citizens_of_member_states():
    assert restricted("Applicants must be citizens of one of the Bank's member states.") == {"nationality"}
    assert restricted("Be a citizen of a Member State of the Union.") == {"nationality"}
    assert restricted("We encourage all candidates who are nationals of our member countries to apply.") == {
        "nationality"}


def test_nationals_of_the_host_country_excluded():
    assert restricted("Nationals of the country where the office is located will not normally be recruited "
                      "to this post.") == {"nationality"}
    assert restricted("Les ressortissants des pays hôtes ne seront normalement pas recrutés à ce poste.") == {
        "nationality"}


def test_a_preference_by_nationality_or_people():
    assert restricted("Preference will be given to nationals of the region.") == {"nationality"}
    assert restricted("If two candidates rank equal, priority goes to Pacific Islanders.") == {"nationality"}
    assert restricted("Nationals of our programme countries are preferred.") == {"nationality"}
    assert restricted("À mérite égal, la préférence sera donnée à un ressortissant de la région.") == {"nationality"}


# --- residence: where applicants live or are based ---------------------------------------------------

def test_commuting_distance():
    assert restricted("You will live within commuting distance of our Oxford office.") == {"residence"}
    assert restricted("Applicants must live within a commutable distance of the office.") == {"residence"}


def test_applicants_based_or_located_somewhere():
    assert restricted("Candidates must be based in Uganda.") == {"residence"}
    assert restricted("Applicants must be legally authorised and based in one of these countries.") == {"residence"}
    assert restricted("Applicants should currently be located in Western Europe.") == {"residence"}
    assert restricted("- Must be located on the West Coast") == {"residence"}


def test_a_residence_line_in_a_list_of_requirements():
    assert restricted("Fluent Dutch.\nResident in Belgium.\nA driving licence.") == {"residence"}


def test_a_home_address_in_a_country():
    assert restricted("Applicants must have a UK-based home address.") == {"residence"}


def test_a_remote_role_within_a_country():
    assert restricted("This remote role can be based anywhere in Canada.") == {"residence"}


def test_a_preference_for_local_people():
    assert restricted("Priority will be given to people from the surrounding area.") == {"residence"}
    assert restricted("Strong preference for locals based in Gulu.") == {"residence"}


def test_a_limit_met_by_nationality_or_residence_is_residence():
    # The user's decision of 14 November 2026: residence, not nationality.
    assert restricted("Open only to citizens or permanent residents of Kenya.") == {"residence"}
    assert restricted("Preference to nationals or residents of the islands.") == {"residence"}
    assert restricted("Être de nationalité belge ou résidents en Belgique depuis trois ans.") == {"residence"}
    assert restricted("Only Thai nationals or individuals with residence status may apply.") == {"residence"}


def test_based_in_a_time_zone():
    assert restricted("Candidates must be based in a time zone between GMT and GMT+3.") == {"residence"}


def test_an_official_residence_for_eligibility():
    assert restricted("Les personnes dont la résidence officielle se trouve en Afrique de l'Ouest peuvent "
                      "postuler.") == {"residence"}


def test_local_candidates_only_is_residence():
    assert restricted("Local candidates only.") == {"residence"}
    assert restricted("Ce poste est ouvert aux candidats locaux uniquement.") == {"residence"}


# --- national posts ----------------------------------------------------------------------------------

def test_national_consultants_and_locally_engaged_posts():
    for text in ("National Consultant, Community Engagement", "Consultants nationaux en santé communautaire",
                 "This is a locally engaged position.", "Employment is on a local contract.",
                 "This is a local hire position."):
        assert restricted(text) == {"national_post"}, text


def test_a_national_category_in_a_general_note_is_not_this_post():
    assert restricted("Positions at the national officer and general service category require local work "
                      "authorisation.") == set()


# --- religion, age and photographs -----------------------------------------------------------------

def test_a_faith_required_or_a_statement_of_faith_affirmed():
    for text in ("Mature and personal Christian faith.", "Christian faith is a prerequisite for employment.",
                 "Able to affirm our statement of faith.", "We seek a spiritually rooted leader."):
        assert restricted(text) == {"religion"}, text
    for text in ("We are a faith-based organisation.", "We serve people of all faiths and none."):
        assert restricted(text) == set(), text


def test_a_french_age_limit_in_an_eligibility_list():
    assert restricted("Le programme est ouvert aux jeunes :\nde nationalité belge ;\nde moins de 30 ans ;") >= {"age"}


def test_a_minimum_age():
    assert restricted("The age of the applicant must be 18 or above.") == {"age"}
    assert restricted("Applicants must be 21 years or older.") == {"age"}


def test_a_photograph_among_the_documents_to_send():
    assert restricted("Send your CV, a passport size photograph and two references.") == {"photo_appearance"}
    assert restricted("Please submit a CV, one passport-sized photograph and a letter.") == {"photo_appearance"}
    assert restricted("Please do not send a recent photograph with your CV.") == set()


# --- a limit or a preference -------------------------------------------------------------------------

def test_each_category_is_marked_limit_or_preference():
    assert adverts.restrictions_column("Preference will be given to nationals of the region.") == \
        "nationality~preference"
    assert adverts.restrictions_column("Only Kenyan nationals may apply. Preference for nationals of the region.") == \
        "nationality"
    assert adverts.restrictions_column("Candidates must be based in Uganda. Local candidates only.") == "residence"
    assert adverts.restriction_labels("Strong preference for locals based in Gulu.") == {"residence": "preference"}


def test_the_form_check_accepts_a_preference_mark():
    assert "residence~preference" in adverts.LISTS["restrictions"]
    assert "residence" in adverts.LISTS["restrictions"]


# --- the "Not" list: never flagged -------------------------------------------------------------------

def test_the_right_to_work_is_never_a_restriction():
    for text in ("You must have the right to work in the UK.",
                 "Applicants must be authorised to work in the United States.",
                 "A valid work permit is required.", "We are unable to sponsor visas.",
                 "Candidates must be legally authorized to work in the US without sponsorship.",
                 "Only one foreign national per family may hold a work permit in the host country."):
        assert restricted(text) == set(), text


def test_open_to_all_nationalities_and_encouragements_are_never_restrictions():
    for text in ("The post is open to all nationalities.",
                 "Applications are welcome regardless of nationality or residence.",
                 "Nationals of non-represented member states are encouraged to apply.",
                 "Local candidates are encouraged to apply.", "Kenyan nationals are encouraged to apply."):
        assert restricted(text) == set(), text


def test_where_the_job_is_based_is_never_a_residence_limit():
    for text in ("The post is based in Nairobi.", "This position is located in Dakar with travel to the field.",
                 "Candidates must be willing to be based in Juba.", "The successful candidate will relocate to Goma.",
                 "You must be able to work hours that overlap with East Africa Time."):
        assert restricted(text) == set(), text


def test_the_people_served_are_never_a_residence_limit():
    for text in ("We support refugees resident in the camps.", "A programme for residents of the county.",
                 "Women living in the district receive cash transfers.", "Residents of the camp receive services."):
        assert restricted(text) == set(), text


def test_residence_and_national_posts_are_recorded_but_never_flagged():
    assert "residence" in adverts.RESTRICTIONS and "residence" not in adverts.FAIRNESS_CATEGORIES
    assert "national_post" not in adverts.FAIRNESS_CATEGORIES
    assert "nationality" in adverts.FAIRNESS_CATEGORIES
