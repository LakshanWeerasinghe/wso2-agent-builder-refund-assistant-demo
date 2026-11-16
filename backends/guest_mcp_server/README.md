# Guest MCP server

This WSO2 Integrator (Ballerina) service stands in for ReverieEscapes' systems of record: property
management (hotels and reservations, with each property's incident log) and the Reverie Circle loyalty
system. It serves fixed mock data in two forms: read-only MCP tools at `/mcp` and a REST API at `/api`.
Both run on one HTTP listener, on port 9090 by default.

See the [project README](../../README.md) for the whole demo. In the deployment diagram, this service is the
"enterprise systems" box outside Azure (steps 4 and 6).

| Caller | Uses | What for |
|---|---|---|
| [agent](../../agents/refund_agent/refund_agent) | `/mcp`: `getReservation`, `getLoyaltyProfile`, `getHotel` | The model reads the stay, incidents and loyalty tier through `ai:McpToolKit`. |
| [agent](../../agents/refund_agent/refund_agent) | `GET /api/reservations/{id}` | The policy search tools load the reservation themselves, so the search scope (hotel, country, region, dates) comes from the system of record, not from the model. |
| [refund-api](../refund_api) | `GET /api/reservations/{id}`, `/api/regions`, `/api/hotels` | Loads the reservation for a new case, and proxies regions, hotels and reservations to the portal. |
| [portal](../../portal) | `GET /api/guests/{id}/loyalty` | Shows the guest's loyalty tier in the case view. This call is best-effort. |

This service calls nothing else. It needs no Azure resources and no `Config.toml`.

## MCP tools

The endpoint is `http://localhost:9090/mcp`. It uses the MCP Streamable HTTP transport in stateless mode,
so there is no session ID and each JSON-RPC request stands alone. Server info:
`ReverieEscapes Guest Services` 1.0.0.

| Tool | Argument | Returns |
|---|---|---|
| `getReservation` | `reservationId`, for example `RES-PAR-24117` | The reservation, with the full hotel, guest, fees and incident log embedded. |
| `getLoyaltyProfile` | `guestId`, for example `G-1001` | Loyalty programme, tier, points balance and member-since date. |
| `getHotel` | `hotelId`, for example `KYO-GIO` | The hotel, with its region, country, category, currency and local language. |

IDs are trimmed and matched case-insensitively. A tool returns its result as JSON text in a `text`
content item. An unknown ID returns `isError: true` with a message such as
`No reservation found with ID RES-XXX`. It is not a JSON-RPC error.

## REST API

The base URL is `http://localhost:9090/api`. Every endpoint is `GET`.

| Endpoint | Returns |
|---|---|
| `/regions` | The four regions, each with its countries (code, name, currency, local language, flag emoji). |
| `/hotels?region=&countryCode=` | Hotels, optionally filtered. `region` is `EUROPE`, `AFRICA`, `AMERICAS` or `ASIA_PACIFIC`. |
| `/hotels/{hotelId}` | One hotel, or 404. |
| `/reservations?hotelId=` | Reservations, optionally filtered by hotel. |
| `/reservations/{reservationId}` | One reservation, or 404. |
| `/guests/{guestId}/loyalty` | One loyalty profile, or 404. |

Filters and path IDs are case-insensitive. An empty filter, such as `?region=` (the portal sends this
for "all"), means no filter. A 404 has the body `{"message": "No hotel found with ID XYZ"}`.

CORS allows any origin, with `GET`, `POST` and `OPTIONS` and the `Content-Type` header.

### Response shapes

A hotel:

```json
{
  "hotelId": "KYO-GIO",
  "name": "ReverieEscapes Kyoto Gion",
  "city": "Kyoto",
  "countryCode": "JP",
  "countryName": "Japan",
  "region": "ASIA_PACIFIC",
  "category": "RYOKAN",
  "rooms": 64,
  "currency": "JPY",
  "localLanguage": "ja"
}
```

A loyalty profile:

```json
{
  "guestId": "G-1002",
  "programme": "Reverie Circle",
  "tier": "PLATINUM",
  "pointsBalance": 182400,
  "memberSince": "2014-09-01"
}
```

A reservation, here with the hotel and guest shortened:

```json
{
  "reservationId": "RES-BER-60455",
  "hotel": {"hotelId": "BER-MIT", "name": "ReverieEscapes Berlin Mitte", "region": "EUROPE", "...": "..."},
  "guest": {
    "guestId": "G-1005",
    "name": "Sophie Laurent",
    "email": "sophie.laurent@example.fr",
    "preferredLanguage": "fr",
    "homeCountry": "FR"
  },
  "roomNumber": "214",
  "roomType": "Superior Queen",
  "checkIn": "2026-11-05",
  "checkOut": "2026-11-08",
  "nights": 3,
  "nightlyRate": 210.00,
  "currency": "EUR",
  "totalRoomCharge": 630.00,
  "fees": [{"code": "CITY_TAX", "label": "Übernachtungsteuer (7.5%)", "amount": 47.25}],
  "rateType": "FLEXIBLE",
  "status": "CHECKED_OUT",
  "bookedVia": "DIRECT",
  "incidents": [
    {
      "incidentId": "INC-BER-207",
      "date": "2026-11-06",
      "category": "HEATING",
      "cause": "HOTEL_EQUIPMENT",
      "description": "Heating failure in room 214 (thermostat valve); room at 15 °C. ...",
      "startedAt": "2026-11-06T23:00",
      "endedAt": "2026-11-07T09:00",
      "durationHours": 10,
      "reportedByGuest": true,
      "guestMoved": false,
      "verifiedBy": "Maintenance log"
    }
  ]
}
```

Field notes, from [types.bal](types.bal):

- An incident's `date` is the night it belongs to. `startedAt` and `endedAt` are hotel-local times
  (`YYYY-MM-DDTHH:MM`), and an overnight incident ends on the next day.
- `category` is one of `AIR_CONDITIONING`, `HEATING`, `HOT_WATER`, `NOISE`, `POWER`, `FACILITY_CLOSURE`,
  `WEATHER` or `CLEANLINESS`.
- `cause` is one of `HOTEL_EQUIPMENT`, `HOTEL_WORKS`, `HOTEL_EVENT`, `HOTEL_MAINTENANCE`,
  `EXTERNAL_GRID`, `EXTERNAL_STORM` or `WEATHER_WARNING`. The policies treat hotel-caused and external
  causes differently.
- `rateType` is `FLEXIBLE` or `NON_REFUNDABLE`; `status` is `CHECKED_OUT`, `IN_HOUSE` or `CANCELLED`;
  `bookedVia` is `DIRECT`, `OTA` or `TRAVEL_AGENT`.
- `tier` is `CLASSIC`, `SILVER`, `GOLD` or `PLATINUM`.

## Mock data

All data is in [data.bal](data.bal) and is read-only. Hotels and regions are built from the country seeds by
the mappings in [data_mappings.bal](data_mappings.bal).

- **Regions:** 4 regions and 18 countries. Each country has its currency and local language.
- **Hotels:** 29 hotels. Europe has 12, Africa 6, the Americas 5 and Asia-Pacific 6. Categories are
  `CITY`, `RESORT`, `SAFARI_LODGE` (Maasai Mara) and `RYOKAN` (Kyoto Gion). A hotel takes its country
  name, region, currency and language from its country.
- **Guests and loyalty:** eight guests, `G-1001` to `G-1008`, each with a loyalty profile.
- **Reservations:** eight, one for each demo case. All are flexible-rate, checked out and booked
  direct.

| Reservation | Hotel | Guest (tier, language) | Stay | Rate per night | Incidents logged |
|---|---|---|---|---|---|
| RES-PAR-24117 | PAR-OPE Paris Opéra | Emily Carter (Gold, en) | 2–6 Nov 2026, 4 nights | EUR 420 | Façade works noise 08:30–17:00 on 3, 4 and 5 Nov; no hot water on the night of 4 Nov |
| RES-KYO-31842 | KYO-GIO Kyoto Gion | Haruto Sato (Platinum, ja) | 8–11 Nov 2026, 3 nights | JPY 98,000 | Public hot-spring bath closed from 8 Nov 15:00 to 10 Nov 10:00 |
| RES-CPT-50391 | CPT-WAT Cape Town Waterfront | Lukas Becker (Gold, de) | 20–24 Oct 2026, 4 nights | ZAR 4,800 | Load-shedding 22:00–02:30 on the nights of 20, 21 and 22 Oct (external grid) |
| RES-MIA-77120 | MIA-BCH Miami Beach | Carlos Mendoza (Silver, es) | 19–23 Oct 2026, 4 nights | USD 389 | Hurricane warning from 20 Oct 11:00 to 22 Oct 18:00; storm power outage on the night of 21 Oct |
| RES-BER-60455 | BER-MIT Berlin Mitte | Sophie Laurent (Classic, fr) | 5–8 Nov 2026, 3 nights | EUR 210 | Heating failure on the night of 6 Nov, 23:00–09:00 |
| RES-BCN-41208 | BCN-GOT Barcelona Gòtic | Giulia Romano (Silver, it) | 28–31 Oct 2026, 3 nights | EUR 260 | Rooftop terrace event noise from 23:00 on the nights of 29 and 30 Oct |
| RES-NYC-80233 | NYC-MID New York Midtown | James O'Neill (Platinum, en) | 9–12 Nov 2026, 3 nights | USD 459 | None |
| RES-SIN-90017 | SIN-MAR Singapore Marina | Priya Nair (Gold, en) | 10–13 Aug 2026, 3 nights | SGD 520 | Air conditioning fault on the night of 11 Aug |

The dates are set around the demo date of 14 November 2026. The Singapore stay ended more than 30 days
before it. The project README lists the refund each case is written to produce.

## Configuration

| Configurable | Default | Meaning |
|---|---|---|
| `port` | `9090` | The port for both `/mcp` and `/api`. |

There is no `Config.toml.template`, because the defaults match the other services. To change the port,
set `BAL_CONFIG_VAR_PORT`, pass `-Cport=<n>` after `bal run --`, or add `port = <n>` to a
`Config.toml`. If you change it, update `guestMcpUrl` and `guestApiUrl` in the refund agent,
`guestApiUrl` in the refund API, and `guestApi` in [portal/config.js](../../portal/config.js).

## Run it

You need Ballerina Swan Lake 2201.14.x. From the repository root:

```bash
cd backends/guest_mcp_server
bal run
```

This package is a member of the backends workspace ([backends/Ballerina.toml](../Ballerina.toml)).
Running `bal build` in `backends/` builds all three backend services, this one included.

Start it before the refund agent, which connects to `/mcp` when it starts.

## Example calls

List the hotels in Asia-Pacific:

```bash
curl "http://localhost:9090/api/hotels?region=ASIA_PACIFIC"
```

Get a reservation with its incident log:

```bash
curl http://localhost:9090/api/reservations/RES-KYO-31842
```

Get a guest's loyalty profile:

```bash
curl http://localhost:9090/api/guests/G-1002/loyalty
```

List the MCP tools. The `Accept` header must include both `application/json` and `text/event-stream`;
without it the server answers 406.

```bash
curl -X POST http://localhost:9090/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

Call a tool:

```bash
curl -X POST http://localhost:9090/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"getLoyaltyProfile","arguments":{"guestId":"G-1002"}}}'
```

The response:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"guestId\":\"G-1002\",\"programme\":\"Reverie Circle\",\"tier\":\"PLATINUM\",\"pointsBalance\":182400,\"memberSince\":\"2014-09-01\"}"
      }
    ]
  }
}
```

Because the server is stateless, you can send `tools/list` and `tools/call` without an `initialize`
request first.

## Design notes

- **Read-only.** No tool or endpoint changes a reservation or pays a refund. The agent can only read;
  the refund is paid by the refund API after a representative approves it.
- **One listener, two faces.** The MCP service and the REST API share one `http:Listener`, so they share
  one port and one deployment. The REST API exists so that code, not the model, can load a reservation:
  the agent's policy search tools and the refund API read it directly.
- **The incident log is the evidence.** The `getReservation` description tells the model that
  incidents not listed were not recorded by the hotel. The agent relies on this to refuse a refund when
  nothing was logged, as for RES-NYC-80233.
- **Flags are computed.** The `flag` field in `/regions` is built from the country code's regional
  indicator symbols. It is not stored.
- **Replacing the mock.** To connect to real systems, keep the tool names, arguments and response
  shapes, and replace the lookups in [main.bal](main.bal) with connector calls. The agent and refund API
  need no change.

## Files

The package follows the WSO2 Integrator project layout: one file per kind of construct, all at the package
root. Empty files are kept so the layout matches what the WSO2 Integrator extension scaffolds.

| File | Contents |
|---|---|
| [main.bal](main.bal) | The shared HTTP listener, the MCP listener, the MCP service with its three tools, and the REST API service. |
| [config.bal](config.bal) | The `port` configurable. |
| [connections.bal](connections.bal) | Empty. This service calls no other system. |
| [types.bal](types.bal) | Record and enum types: region, country, hotel, guest, fee, incident, reservation, loyalty profile, error body, and the country seed used by the mock data. |
| [functions.bal](functions.bal) | Helpers: `normalise` (query filters), `notFound` (404 responses), `flag` (flag emoji) and `loadShedding` (builds a mock load-shedding incident). |
| [data_mappings.bal](data_mappings.bal) | `hotel` (country seed to hotel) and `buildRegions` (country seeds to regions with their countries). |
| [agents.bal](agents.bal) | Empty. This service has no agent. |
| [automation.bal](automation.bal) | Empty. This service has no automation. |
| [data.bal](data.bal) | The mock regions, countries, hotels, guests, loyalty profiles and reservations, and the lookup maps by ID. |
| [Ballerina.toml](Ballerina.toml) | Package `reverie_escapes/guest_mcp_server` ("Guest MCP Server"), distribution 2201.14.1, sticky builds. |
| [Dockerfile](Dockerfile) | Container image for the service. |
| [.gitignore](.gitignore) | Ignores `target/`, `generated/` and `Config.toml`. |
