// About page: what the site is, where the data comes from (CC BY 4.0 credit).
import "../styles.css";
import { lang } from "../i18n";
import { renderShell } from "../ui";

const shell = renderShell("about");

const DATASET = "https://donnees.montreal.ca/dataset/evenements-publics";
const LICENSE = "https://creativecommons.org/licenses/by/4.0/deed.fr";

const fr = `
  <h1>À propos</h1>
  <p><strong>touchgrass</strong> rassemble les activités <strong>gratuites</strong> à Montréal :
  heures du conte, concerts, ateliers, expositions, sorties en plein air et plus encore.</p>

  <h2>D'où viennent les données?</h2>
  <p>Toutes les activités proviennent du jeu de données
  <a href="${DATASET}">« Événements publics »</a> de la <strong>Ville de Montréal</strong>,
  publié sous licence <a href="${LICENSE}">Creative Commons Attribution 4.0 (CC BY 4.0)</a>.
  Les heures et les lieux sont complétés à partir de la page officielle de chaque activité sur montreal.ca.</p>
  <p>La liste est mise à jour automatiquement chaque matin. Les activités annulées, terminées
  ou payantes sont retirées, tout comme les séances du conseil et les consultations publiques.</p>

  <h2>Avant de vous déplacer</h2>
  <p>Plusieurs activités demandent une <strong>inscription</strong> ou un <strong>billet gratuit</strong>
  (étiquettes « INSCRIPTION » et « BILLET »). Vérifiez toujours la page officielle :
  c'est elle qui fait foi.</p>

  <h2>Crédits</h2>
  <p>Données : Ville de Montréal, CC BY 4.0. Cartes : © les contributeurs d'OpenStreetMap.
  touchgrass n'est pas affilié à la Ville de Montréal.</p>`;

const en = `
  <h1>About</h1>
  <p><strong>touchgrass</strong> lists <strong>free</strong> things to do in Montréal:
  storytimes, concerts, workshops, exhibitions, outdoor outings and more.</p>

  <h2>Where does the data come from?</h2>
  <p>Every event comes from the City of Montréal's
  <a href="${DATASET}">"Événements publics"</a> open dataset (<strong>Ville de Montréal</strong>),
  published under the <a href="${LICENSE}">Creative Commons Attribution 4.0 (CC BY 4.0)</a> licence.
  Times and venues are filled in from each event's official page on montreal.ca.</p>
  <p>The list updates automatically every morning. Cancelled, past and paid events are removed,
  as are council meetings and public consultations.</p>

  <h2>Before you go</h2>
  <p>Many events need <strong>registration</strong> or a <strong>free ticket</strong>
  (the "REGISTER" and "TICKET" tags). Always check the official page — it has the final word.</p>
  <p>Event titles and descriptions come from the city and are in French.</p>

  <h2>Credits</h2>
  <p>Data: Ville de Montréal, CC BY 4.0. Maps: © OpenStreetMap contributors.
  touchgrass is not affiliated with the City of Montréal.</p>`;

shell.main.innerHTML = `<article class="prose">${lang === "fr" ? fr : en}</article>`;
