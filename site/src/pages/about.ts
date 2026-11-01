// About page (shared by every city): what the site is, where each city's data comes from, credits.
import "../styles.css";
import { lang } from "../i18n";
import { renderShell } from "../ui";

const shell = renderShell("about");

const DATASET = "https://donnees.montreal.ca/dataset/evenements-publics";
const LOISIRS_DATASET = "https://donnees.montreal.ca/dataset/programmation-sports-loisirs-montreal";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/deed.fr";
const OPL_FEED = "https://open.ottawa.ca/documents/ottawa::library-programs-and-events-feed";
const OTTAWA_LICENSE = "https://ottawa.ca/en/city-hall/get-know-your-city/open-data#open-data-licence-version-2-0";

const fr = `
  <h1>À propos</h1>
  <p><strong>touchgrass</strong> rassemble les activités <strong>gratuites ou à 10 $ et moins</strong> à Montréal et à Ottawa :
  heures du conte, concerts, ateliers, expositions, patin et bain libres, sports libres et plus encore.</p>

  <h2>D'où viennent les données?</h2>
  <p>Chaque ville a ses propres pages et ses propres sources : les activités ne se mélangent pas.</p>
  <h3>Montréal</h3>
  <p>Les activités proviennent des données ouvertes de la <strong>Ville de Montréal</strong>
  (licence <a href="${LICENSE}">CC BY 4.0</a>) et des calendriers publics de Concordia, de l'UQAM et de l'Université de Montréal :</p>
  <ul>
    <li><a href="${DATASET}">Événements publics</a> — complétés par la page officielle de chaque
    activité sur <a href="https://montreal.ca/evenements">montreal.ca</a> (heures, lieux, annulations).</li>
    <li><a href="${LOISIRS_DATASET}">Programmation de sports et loisirs</a> (<a href="https://loisirs.montreal.ca/">Loisirs Montréal</a>) —
    seulement les activités <strong>sans inscription</strong> dont le prix (gratuit ou 10 $ et moins) est indiqué.</li>
    <li><a href="https://www.concordia.ca/events.html">Événements de l'Université Concordia</a> — conférences,
    expositions, ateliers et spectacles ouverts au public, gratuits ou à 10 $ et moins (fiches en anglais).</li>
    <li><a href="https://evenements.uqam.ca/">Événements de l'UQAM</a> et
    <a href="https://calendrier.umontreal.ca/">calendrier de l'Université de Montréal</a> — conférences,
    concerts, expositions, cinéma et ateliers ouverts au public, gratuits ou à 10 $ et moins.</li>
  </ul>
  <h3>Ottawa</h3>
  <p>Les programmes de la <strong>Bibliothèque publique d'Ottawa</strong> (heures du conte, clubs de lecture,
  jeux, ateliers, conversation…), tirés du <a href="${OPL_FEED}">fil des programmes et événements</a>
  publié en données ouvertes par la Ville d'Ottawa (<a href="${OTTAWA_LICENSE}">licence de données ouvertes</a>).
  Les programmes de la bibliothèque sont gratuits; les fiches sont souvent en anglais ou bilingues.</p>
  <p>S'y ajoutent les événements publics de l'<a href="https://events.carleton.ca/">Université Carleton</a> et de
  l'<a href="https://www.uottawa.ca/fr/evenements">Université d'Ottawa</a> (conférences, expositions, colloques) —
  seulement ceux ouverts au grand public et annoncés comme gratuits.</p>
  <p>La liste est mise à jour automatiquement chaque matin. Les activités annulées, terminées
  ou plus chères que 10 $ sont retirées, tout comme les séances du conseil et les consultations publiques.
  Chaque fiche donne des liens pour en savoir plus : page officielle, site de l'organisateur, itinéraire.</p>

  <h2>Avant de vous déplacer</h2>
  <p>Plusieurs activités demandent une <strong>inscription</strong> ou un <strong>billet gratuit</strong>
  (étiquettes « INSCRIPTION » et « BILLET »). Vérifiez toujours la page officielle :
  c'est elle qui fait foi.</p>

  <h2>Crédits</h2>
  <p>Données : Ville de Montréal (Événements publics; Loisirs Montréal), CC BY 4.0; Université Concordia, UQAM, Université de Montréal.
  Contient de l'information visée par la licence de données ouvertes de la Ville d'Ottawa (Bibliothèque publique d'Ottawa); Université Carleton, Université d'Ottawa.
  Cartes : © les contributeurs d'OpenStreetMap.
  touchgrass n'est pas affilié à la Ville de Montréal, à la Ville d'Ottawa ni à leurs bibliothèques.</p>`;

const en = `
  <h1>About</h1>
  <p><strong>touchgrass</strong> lists <strong>free and $10-and-under</strong> things to do in Montréal and Ottawa:
  storytimes, concerts, workshops, exhibitions, free skating and swimming, drop-in sports and more.</p>

  <h2>Where does the data come from?</h2>
  <p>Each city has its own pages and its own sources: events never mix.</p>
  <h3>Montréal</h3>
  <p>Events come from the City of Montréal's open data (<strong>Ville de Montréal</strong>,
  <a href="${LICENSE}">CC BY 4.0</a> licence) and the public calendars of Concordia, UQAM and Université de Montréal:</p>
  <ul>
    <li><a href="${DATASET}">Événements publics</a> (public events) — completed with each event's
    official page on <a href="https://montreal.ca/evenements">montreal.ca</a> (times, venues, cancellations).</li>
    <li><a href="${LOISIRS_DATASET}">Programmation de sports et loisirs</a> (<a href="https://loisirs.montreal.ca/">Loisirs Montréal</a>) —
    only <strong>drop-in</strong> activities whose price (free or $10 and under) is stated.</li>
    <li><a href="https://www.concordia.ca/events.html">Concordia University events</a> — public talks,
    exhibitions, workshops and performances that are free or $10 and under.</li>
    <li><a href="https://evenements.uqam.ca/">UQAM events</a> and the
    <a href="https://calendrier.umontreal.ca/">Université de Montréal calendar</a> — public talks,
    concerts, exhibitions, films and workshops that are free or $10 and under.</li>
  </ul>
  <h3>Ottawa</h3>
  <p><strong>Ottawa Public Library</strong> programs (storytimes, book clubs, games, workshops,
  conversation groups…), from the <a href="${OPL_FEED}">Library Programs and Events Feed</a> published
  as open data by the City of Ottawa (<a href="${OTTAWA_LICENSE}">Open Data Licence</a>).
  Library programs are free.</p>
  <p>Plus public events from <a href="https://events.carleton.ca/">Carleton University</a> and the
  <a href="https://www.uottawa.ca/en/events-all">University of Ottawa</a> (talks, exhibitions, symposia) —
  only those open to the general public and stated as free.</p>
  <p>The list updates automatically every morning. Cancelled and past events, and anything over $10,
  are removed, as are council meetings and public consultations. Every event links to more
  information: the official page, the organizer's website, directions.</p>

  <h2>Before you go</h2>
  <p>Many events need <strong>registration</strong> or a <strong>free ticket</strong>
  (the "REGISTER" and "TICKET" tags). Always check the official page — it has the final word.</p>
  <p>Montréal event titles and descriptions come from the city and are mostly in French.</p>

  <h2>Credits</h2>
  <p>Data: Ville de Montréal (Événements publics; Loisirs Montréal), CC BY 4.0; Concordia University, UQAM, Université de Montréal.
  Contains information licensed under the Open Data Licence – City of Ottawa (Ottawa Public Library); Carleton University, University of Ottawa.
  Maps: © OpenStreetMap contributors.
  touchgrass is not affiliated with the City of Montréal, the City of Ottawa or their libraries.</p>`;

shell.main.innerHTML = `<article class="prose">${lang === "fr" ? fr : en}</article>`;
