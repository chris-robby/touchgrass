// About page: what the site is, where the data comes from (CC BY 4.0 credit).
import "../styles.css";
import { lang } from "../i18n";
import { renderShell } from "../ui";

const shell = renderShell("about");

const DATASET = "https://donnees.montreal.ca/dataset/evenements-publics";
const LOISIRS_DATASET = "https://donnees.montreal.ca/dataset/programmation-sports-loisirs-montreal";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/deed.fr";

const fr = `
  <h1>À propos</h1>
  <p><strong>touchgrass</strong> rassemble les activités <strong>gratuites ou à 10 $ et moins</strong> à Montréal :
  heures du conte, concerts, ateliers, expositions, patin et bain libres, sports libres et plus encore.</p>

  <h2>D'où viennent les données?</h2>
  <p>Toutes les activités proviennent des données ouvertes de la <strong>Ville de Montréal</strong>,
  publiées sous licence <a href="${LICENSE}">Creative Commons Attribution 4.0 (CC BY 4.0)</a> :</p>
  <ul>
    <li><a href="${DATASET}">Événements publics</a> — complétés par la page officielle de chaque
    activité sur <a href="https://montreal.ca/evenements">montreal.ca</a> (heures, lieux, annulations).</li>
    <li><a href="${LOISIRS_DATASET}">Programmation de sports et loisirs</a> (<a href="https://loisirs.montreal.ca/">Loisirs Montréal</a>) —
    seulement les activités <strong>sans inscription</strong> dont le prix (gratuit ou 10 $ et moins) est indiqué.</li>
  </ul>
  <p>La liste est mise à jour automatiquement chaque matin. Les activités annulées, terminées
  ou plus chères que 10 $ sont retirées, tout comme les séances du conseil et les consultations publiques.
  Chaque fiche donne des liens pour en savoir plus : page officielle, site de l'organisateur, itinéraire.</p>

  <h2>Avant de vous déplacer</h2>
  <p>Plusieurs activités demandent une <strong>inscription</strong> ou un <strong>billet gratuit</strong>
  (étiquettes « INSCRIPTION » et « BILLET »). Vérifiez toujours la page officielle :
  c'est elle qui fait foi.</p>

  <h2>Crédits</h2>
  <p>Données : Ville de Montréal (Événements publics; Loisirs Montréal), CC BY 4.0. Cartes : © les contributeurs d'OpenStreetMap.
  touchgrass n'est pas affilié à la Ville de Montréal.</p>`;

const en = `
  <h1>About</h1>
  <p><strong>touchgrass</strong> lists <strong>free and $10-and-under</strong> things to do in Montréal:
  storytimes, concerts, workshops, exhibitions, free skating and swimming, drop-in sports and more.</p>

  <h2>Where does the data come from?</h2>
  <p>Every event comes from the City of Montréal's open data (<strong>Ville de Montréal</strong>),
  published under the <a href="${LICENSE}">Creative Commons Attribution 4.0 (CC BY 4.0)</a> licence:</p>
  <ul>
    <li><a href="${DATASET}">Événements publics</a> (public events) — completed with each event's
    official page on <a href="https://montreal.ca/evenements">montreal.ca</a> (times, venues, cancellations).</li>
    <li><a href="${LOISIRS_DATASET}">Programmation de sports et loisirs</a> (<a href="https://loisirs.montreal.ca/">Loisirs Montréal</a>) —
    only <strong>drop-in</strong> activities whose price (free or $10 and under) is stated.</li>
  </ul>
  <p>The list updates automatically every morning. Cancelled and past events, and anything over $10,
  are removed, as are council meetings and public consultations. Every event links to more
  information: the official page, the organizer's website, directions.</p>

  <h2>Before you go</h2>
  <p>Many events need <strong>registration</strong> or a <strong>free ticket</strong>
  (the "REGISTER" and "TICKET" tags). Always check the official page — it has the final word.</p>
  <p>Event titles and descriptions come from the city and are in French.</p>

  <h2>Credits</h2>
  <p>Data: Ville de Montréal (Événements publics; Loisirs Montréal), CC BY 4.0. Maps: © OpenStreetMap contributors.
  touchgrass is not affiliated with the City of Montréal.</p>`;

shell.main.innerHTML = `<article class="prose">${lang === "fr" ? fr : en}</article>`;
