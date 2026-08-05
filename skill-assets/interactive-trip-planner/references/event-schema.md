# Date-bound event data contract

`data/events.json` keeps date-bound events separate from durable places in `data/pois.json`. It is an array of event records. A record always has a stable `id`; its synthetic map id is `event:<id>`.

Validate a guide before consuming its events:

```bash
node skill/scripts/validate-trip-events.js \
  --events data/events.json \
  --pois data/pois.json \
  --itinerary data/itinerary.json \
  --sources data/sources.json
```

The command prints `{ eventCount, scopes, statuses, warnings, errors }` and exits `1` if `errors` is non-empty.

## Required fields

```json
{
  "id": "neighborhood-concert",
  "name": "Neighborhood concert",
  "scope": "venue",
  "city": "Madrid",
  "status": "confirmed",
  "startsAt": "2026-10-18T19:30:00+02:00",
  "endsAt": "2026-10-18T21:00:00+02:00",
  "venuePoiId": "concert-hall",
  "routeImpact": "anchor",
  "whyWorthIt": "A date-bound local performance with a useful neighborhood setting.",
  "plan": "Use it as the evening anchor after nearby dinner.",
  "tip": "Reserve before the trip and recheck entry timing.",
  "officialUrl": "https://example.org/concert",
  "sourceIds": ["concert-official"]
}
```

Every record requires non-empty `id`, `name`, `city`, `startsAt`, `endsAt`, `whyWorthIt`, `plan`, and `tip`; an `http` or `https` `officialUrl`; and a non-empty `sourceIds` list. `id` must match exactly `/^[A-Za-z0-9][A-Za-z0-9._-]*$/`; the validator rejects whitespace, path separators, colons, leading punctuation, and other characters outside this grammar rather than relying on the browser to discard them. Each source id must exist in `sources.json`. `startsAt` and `endsAt` accept `YYYY-MM-DD` date windows or ISO date-times, must parse as valid dates, and cannot run backwards. `confirmed` records require date-times for both fields.

Optional fields include `name_zh`, `area`, `coords` (`[lat, lng]`), `venuePoiId`, `hostPoiId`, `affectedCities` (an array of additional city ids), and `recheckAt` (`YYYY-MM-DD`). Coordinates, when supplied, must be valid latitude/longitude values. `recheckAt` must be a real calendar date. Referenced source records may use `recheckBefore`; when present it must also be a real `YYYY-MM-DD` calendar date.

## Scopes and route impact

- `venue`: a mappable performance, exhibition, market, or festival site. It needs either a `venuePoiId` that exists in `pois.json` or valid `coords`; it can become `event:<id>` in the map.
- `hosted`: a special program at an existing place. It requires a `hostPoiId` that exists in `pois.json`; it belongs in the host-place detail rather than adding another marker.
- `citywide`: a parade, holiday, seasonal ritual, crowd surge, or transport restriction. It may omit both location ids and belongs in day/city context.

`routeImpact` is one of `anchor`, `candidate`, `nearby`, or `avoidance`. It explains whether an event fixes a day, is an optional stop, is only worth considering nearby, or requires routing around it.

## Statuses and itinerary references

- `confirmed`: official date, time, and venue are known. Only a confirmed `venue` record may be scheduled into an itinerary.
- `announced`: an official date window exists, but a final time, venue, or booking decision is still missing.
- `program-pending`: an official window exists but useful sessions are not published; show it as a recheck item, never as a fabricated stop.
- `historical-lead`: only a past edition or secondary discovery lead exists; retain it for research and recheck it before presenting it as current.

Use `event:<id>` only for event references in itinerary `anchors`, `candidates`, `routeStops[].poiId`, or an object itinerary's `defaultAssignments[].poiId`. The validator also resolves the builder-compatible legacy `defaultAssignments[].name` form when its exact value names an event, so it cannot bypass the event checks. The validator accepts both the legacy itinerary array and the canonical `{ trip, days, defaultAssignments }` object. An event assignment is valid only when all of these are true: the event exists, is `confirmed`, uses `scope: venue`, the target is not a `Transit` day, the day date falls inclusively inside the event window, and the day city matches `city` or one of `affectedCities`. Canonical day matching prefers an ISO `day.date`; otherwise it accepts `MM/DD` or `MM-DD` using `trip.startDate` for the year. Changing an event's status, scope, date window, or city can therefore make a previously stored assignment stale; validators and the traveler runtime remove or reject it.

`historical-lead` remains internal research material. Traveler builders and renderers must exclude it from venue markers, hosted-place details, and citywide day notices.

## Sources

`sourceIds` are references, not traveler-facing labels. Prefer official organizers, venues, city calendars, and ticketing operators for event date, venue, and booking facts. Use editorial calendars and community sources to discover leads; promote them to a current event only after official confirmation. Record `recheckAt` when a program, venue, ticket rule, or route impact can still change.

## More examples

```json
[
  {
    "id": "market-workshop",
    "name": "Market workshop",
    "scope": "hosted",
    "city": "Madrid",
    "status": "announced",
    "startsAt": "2026-10-15",
    "endsAt": "2026-10-15",
    "hostPoiId": "market",
    "routeImpact": "candidate",
    "whyWorthIt": "A useful date-bound program at a planned market.",
    "plan": "Keep it as a same-day option until the session details are final.",
    "tip": "Recheck the host page before assigning a time.",
    "officialUrl": "https://example.org/workshop",
    "sourceIds": ["market-calendar"],
    "recheckAt": "2026-10-01"
  },
  {
    "id": "city-parade",
    "name": "City parade",
    "scope": "citywide",
    "city": "Madrid",
    "status": "program-pending",
    "startsAt": "2026-10-17",
    "endsAt": "2026-10-18",
    "routeImpact": "avoidance",
    "whyWorthIt": "It can change crowding and street access across the center.",
    "plan": "Avoid using the center as a timed transfer until routes are published.",
    "tip": "Recheck closures and public-transport notices.",
    "officialUrl": "https://example.org/parade",
    "sourceIds": ["city-calendar"]
  }
]
```
