// Leaflet map with one pin per venue (many events share the same library or
// maison de la culture, so one pin per event would just stack up).
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { city, cityHref } from "./city";
import { byDisplayOrder, Ev } from "./data";
import { chipTime, fmtShortDate } from "./format";
import { countLabel, lang, t } from "./i18n";
import { esc } from "./ui";


const MAX_IN_POPUP = 8;

export function createMap(el: HTMLElement, opts: { scrollWheelZoom?: boolean } = {}): L.Map {
  const map = L.map(el, { scrollWheelZoom: opts.scrollWheelZoom ?? true }).setView(city.center, city.zoom);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  return map;
}

export function pinIcon(label = ""): L.DivIcon {
  return L.divIcon({
    className: "map-pin",
    html: `<span class="map-pin-shape"></span>${label ? `<span class="map-pin-count">${label}</span>` : ""}`,
    iconSize: [30, 36],
    iconAnchor: [15, 34],
    popupAnchor: [0, -30],
  });
}

export function addPin(map: L.Map, lat: number, lng: number): void {
  L.marker([lat, lng], { icon: pinIcon(), keyboard: false }).addTo(map);
}

function popupHtml(events: Ev[]): string {
  const first = events[0];
  const rows = events.slice(0, MAX_IN_POPUP).map((e) => {
    const when = e.multiDay
      ? `${t("until")} ${fmtShortDate(e.endDay)}`
      : `${fmtShortDate(e.startDay)} · ${chipTime(e.startMs)}`;
    return `<li><button type="button" data-id="${e.id}"><span class="pop-when">${esc(when)}</span>${esc(e.title)}</button></li>`;
  }).join("");
  const rest = events.length - MAX_IN_POPUP;
  const more = rest > 0
    ? `<a class="pop-more" href="${cityHref(city, "index.html")}?q=${encodeURIComponent(first.venue ?? "")}">${lang === "fr" ? `Voir les ${events.length} dans la liste` : `See all ${events.length} in the list`}</a>`
    : "";
  return `
    <div class="pop">
      <p class="pop-venue">${esc(first.venue ?? first.borough ?? "")}</p>
      <p class="pop-count">${esc(countLabel(events.length))}${first.borough && first.venue ? ` · ${esc(first.borough)}` : ""}</p>
      <ul>${rows}</ul>${more}
    </div>`;
}

/** Venue pins that can be refreshed when filters change. */
export function venueLayer(map: L.Map, onOpen: (id: string) => void) {
  const layer = L.layerGroup().addTo(map);
  let fitted = false;

  map.getContainer().addEventListener("click", (ev) => {
    const btn = (ev.target as HTMLElement).closest<HTMLElement>(".pop [data-id]");
    if (btn) onOpen(btn.dataset.id!);
  });

  return {
    update(events: Ev[]): void {
      layer.clearLayers();
      const venues = new Map<string, Ev[]>();
      for (const e of events) {
        if (e.lat == null || e.lng == null) continue;
        const key = `${e.lat.toFixed(4)},${e.lng.toFixed(4)}`;
        (venues.get(key) ?? venues.set(key, []).get(key)!).push(e);
      }
      const bounds: L.LatLngTuple[] = [];
      for (const list of venues.values()) {
        list.sort(byDisplayOrder);
        const pos: L.LatLngTuple = [list[0].lat!, list[0].lng!];
        bounds.push(pos);
        L.marker(pos, {
          icon: pinIcon(list.length > 99 ? "99+" : String(list.length)),
          title: `${list[0].venue ?? ""} (${countLabel(list.length)})`,
          keyboard: true,
        }).bindPopup(popupHtml(list), { maxWidth: 300, minWidth: 240 }).addTo(layer);
      }
      if (!fitted && bounds.length > 1) {
        map.fitBounds(bounds, { padding: [24, 24] });
        fitted = true;
      }
    },
  };
}
