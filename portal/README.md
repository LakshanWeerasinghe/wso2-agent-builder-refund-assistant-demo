# Support portal

The support portal is the front end of the ReverieEscapes refund assistant (see the
[main README](../README.md)). It is a static site with no build step.

- A customer representative uses `index.html` to log a guest's complaint, read the refund agent's
  recommendation, and approve or reject it.
- The guest opens `guest.html` from a private link to see the decision and the policy PDFs shared with
  them.

The portal never calls the agent or Azure directly. It calls three services:

- the [refund API](../backends/refund_api) (port 8080), which invokes the [refund agent](../agents/refund_agent) in
  Microsoft Foundry;
- the [policy service](../backends/policy_service) (port 8090), for the policy library, chunk previews, indexing
  and uploads;
- optionally, the REST side of the [guest MCP server](../backends/guest_mcp_server) (port 9090), only to show
  the guest's loyalty tier on a case.

## What it serves

| Path | What it is |
|---|---|
| `index.html` | The representative console: a hash-routed single-page app with the five views below. |
| `guest.html` | The guest resolution page, opened as `guest.html?token=…`. Self-contained, with inline CSS and JavaScript. |
| `config.js` | Sets `window.REVERIE_CONFIG`, the service URLs. Both pages load it. |

### Console views

| Route | View | Calls |
|---|---|---|
| `#/queue` (default) | Refund queue | `GET /refund-requests` |
| `#/cases/{id}` | Refund case | `GET /refund-requests/{id}`, `POST …/reassess`, `POST …/decision`, guest `GET /guests/{guestId}/loyalty`, policy PDFs |
| `#/new` | New request | `GET /reservations/{id}`, policy `GET /policies/applicable`, `POST /refund-requests` |
| `#/policies` | Policy library | policy `GET /policies`, `GET /health`, `GET /policies/{id}/chunks`, `POST /policies/ingest`, `POST /policies/{id}/ingest`, `POST /policies`; refund API `GET /regions`, `GET /hotels` for the upload form |
| `#/network` | Hotel network | `GET /regions`, `GET /hotels`, policy `GET /policies` |

Paths without a prefix are on the refund API. An unknown route redirects to `#/queue`.

The shell around every view has:

- a sidebar with the navigation, a count of cases awaiting a decision, and a status dot for the refund
  API and the policy service;
- a top bar with the region and country scope, the **Acting as** role (Representative, Duty manager or
  Regional director) and the representative's name.

The scope filters every view. The role decides who may approve a case. The shell polls the case list
and both `/health` endpoints every 30 seconds. The policy service dot turns amber when it reports
`searchConfigured: false`.

**Refund queue.** Four KPIs: awaiting decision, needing escalation (approval level above
Representative), approved in the last 7 days, and total refunded in USD. Below them are one tile per
region (click to filter) and the case table. The table has status tabs and searches case number,
reservation, guest, hotel, city and country. Rows above your role's authority are marked.

**Refund case.**

- The complaint, with the property's incident records as a timeline.
- The agent's recommendation:
  - decision, amount, USD equivalent, bonus points and approval level;
  - the per-night calculation lines and the reasoning;
  - every cited clause, with a **View PDF** button.
- An assessment history once the case has been re-assessed.
- The guest and stay, including the loyalty tier from the guest service.
- The policy stack, most specific first, with seasonal windows and cited clauses marked.

While the case is pending, the decision panel lets you:

- choose which PDFs to share (cited ones are pre-selected);
- edit the guest message drafted in the guest's language;
- add an internal note;
- approve or reject.

**Re-assess with latest policies** re-runs the agent. Once decided, the panel shows the outcome, the
refund id and the guest link with **Open** and **Copy**.

**New request.** Look up a reservation to see the stay, its incidents and the policies in scope for
those nights. Enter the complaint and channel, then submit to the agent. A full-screen progress card
runs while the agent works. The side panel has the eight demo scenarios grouped by region; clicking one
fills in the reservation, complaint and channel and runs the lookup. The scenarios are hard-coded in
`js/views/new-request.js`.

**Policy library.**

- Stats: documents, languages, indexed count, and seasonal documents in force.
- A season timeline from January 2026 to March 2027 with a "today" marker.
- The documents, grouped as Global plus one group per region. You can filter them by search,
  language and Base or Seasonal.

Each document row shows its index status (Indexed, Stale, Failed, Not indexed) and has three actions:

- **View PDF**;
- **Preview chunks**, a dry run of the ingestion pipeline showing each chunk's key, clause IDs,
  context header and text;
- **Re-index**.

**Index all** indexes every changed document. **Upload policy** opens a form for a PDF and its
register metadata, then uploads and indexes it.

**Hotel network.** Totals for regions, countries, hotels, rooms and policy documents, then a
policy-layering summary (global, region, country, hotel). Then each region, with its countries, hotels
and the policy documents at each level. Clicking a country sets the country filter.

### Guest page

`guest.html` reads `token` from the query string and calls `GET {refundApi}/guest/resolutions/{token}`.
It shows a letter-style page:

- the case number and decision date;
- the hotel;
- the outcome (Refund approved, No refund issued, or Under review), with the amount and bonus points;
- the message from the team;
- the stay details;
- the shared policy documents.

PDF links go to `{refundApi}/guest/resolutions/{token}/documents/{documentId}`. The refund API proxies
only the documents shared on that case, so the guest never reaches the policy service.

Labels are in the guest's `preferredLanguage` when it is English, French, German, Spanish, Italian or
Japanese, and in English otherwise. A missing or unknown token shows "This link is no longer valid". The
page has a **Print** button and a print stylesheet.

The refund API builds the link as `{portalUrl}/guest.html?token=…`, so its `portalUrl` setting must
point at wherever this folder is served.

### Request shapes

The portal sends these bodies; the full types are in [refund-api/types.bal](../backends/refund_api/types.bal).

`POST /refund-requests`:

```json
{
  "reservationId": "RES-KYO-31842",
  "complaint": "We chose your ryokan for its hot-spring bath, but it was closed for most of our stay.",
  "channel": "EMAIL",
  "createdBy": "Amelia Hart"
}
```

`POST /refund-requests/{id}/decision`:

```json
{
  "approved": true,
  "decidedBy": "Amelia Hart",
  "role": "DUTY_MANAGER",
  "note": "Guest called twice.",
  "sharePolicyIds": ["JP-KYO-GIO-2026", "SEA-JP-KYO-AUTUMN-2026"],
  "guestMessage": { "subject": "…", "body": "…" }
}
```

`sharePolicyIds` and `guestMessage` are sent when approving, and when rejecting only if **Send the guest
an update** is ticked. Otherwise a rejection sends an empty `sharePolicyIds` and no message.

`POST /policies` (policy service) is `multipart/form-data` with two parts:

- `file`: the PDF;
- `metadata`: a JSON blob with `documentId`, `title`, `titleEnglish`, `summary`, `version`, `language`,
  `scope`, `region`, `countryCode`, `hotelId`, `policyType`, `effectiveFrom`, `effectiveTo`,
  `clausePrefix` and `owner`, plus `replace: true` to upload a new version of an existing ID.

## Configuration

Edit [config.js](config.js):

| Key | Default | Meaning |
|---|---|---|
| `refundApi` | `http://localhost:8080` | Base URL of the refund API. Used by both pages. |
| `policyService` | `http://localhost:8090` | Base URL of the policy service. Used by the console only. |
| `guestApi` | `http://localhost:9090/api` | REST base of the guest MCP server, for the loyalty tier on the case view. Optional; not in the shipped `config.js`. If it is unreachable the case shows "Reverie Circle profile unavailable". |

Trailing slashes are stripped. If `config.js` is missing, the defaults apply.

The console also keeps a few settings in the browser's `localStorage`, under the key
`reverie.portal.context`:

- the region and country scope;
- the role;
- the representative's name (default "Amelia Hart").

Clear site data to reset them.

## Run it

Start the services first (see [Run locally](../README.md#run-locally)). Then serve this folder from the
repository root:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory portal
```

Open <http://localhost:8000>. Any static server works. Opening `index.html` as a `file://` URL does not:
the browser blocks ES module imports from `file://`.

Without the backend services the pages still load. Each view shows a "Cannot reach the … at … Is it
running?" message with **Try again**, and the guest page shows its invalid-link or network message.

Pages you can open directly:

- <http://localhost:8000/#/new>, the new request form with the demo scenarios.
- <http://localhost:8000/#/policies>, the policy library.
- `http://localhost:8000/guest.html?token=<token>`, a guest page. Copy the link from a decided case.

To check the services the portal depends on:

```bash
curl http://localhost:8080/health
```

```bash
curl http://localhost:8090/health
```

```bash
curl "http://localhost:8090/policies/applicable?region=ASIA_PACIFIC&countryCode=JP&hotelId=KYO-GIO&checkIn=2026-11-08&checkOut=2026-11-11"
```

The last call returns the same policy stack that the new request view shows. The dates here are
illustrative.

## Design notes

- **No build, no framework.**
  - The console uses native ES modules. `js/app.js` imports each view lazily when its route is first
    opened.
  - The guest page is a single classic script, so it can be hosted on its own.
  - The only external resources are Google Fonts.
- **API data is never parsed as HTML.** Both pages build the DOM with small helpers that set text
  through `textContent` and attributes.
- **Long timeouts for the agent.** Every request has a 30 s timeout except:
  - creating and re-assessing a case: 200 s, because the agent can take a minute or more;
  - uploading a policy: 300 s;
  - re-indexing one document: 300 s;
  - indexing all documents: 600 s.
- **The role switch is a demo control, not authentication.** The console disables **Approve** when your
  role is below the case's approval level. The refund API checks the `role` in the request body
  again and returns 403 when it is too low. Nothing verifies who the user is.
- **Fallbacks keep the shell usable.**
  - The region and country switchers use a built-in list until `GET /regions` answers.
  - The upload form falls back to built-in countries and hotels when the refund API is down.
- **The demo date is fixed in one place only.** The policy library uses 14 November 2026 for "seasonal
  in force", the timeline's "today" marker and the default upload start date. The sidebar date and
  relative times use the real clock.
- **Cases live in the refund API's memory.** After it restarts, old case links show "Case not found".
- **Unsent work survives scope and role changes.**
  - A half-filled new request is kept in module state until it is submitted.
  - Decision drafts (note, message, shared PDFs) are kept per case and per assessment.
- **PDF links differ by audience.** Representatives open PDFs from the policy service
  (`/policies/{id}/document`). Guests open them through the refund API's proxy.

## File layout

| File | Purpose |
|---|---|
| `index.html` | Console entry point: fonts, both stylesheets, `config.js` and `js/app.js`. |
| `guest.html` | Guest resolution page, with its own styles, translations and script. |
| `config.js` | Service URLs (`window.REVERIE_CONFIG`). |
| `css/app.css` | Console shell and shared component styles. |
| `css/policies.css` | Policy library styles (`pol-` prefix), including the chunk preview and upload modals. |
| `js/app.js` | Shell, hash router, region, country and role switchers, health polling, and the context passed to views. |
| `js/api.js` | Fetch clients for the refund API, policy service and guest API, with timeouts and error messages. |
| `js/ui.js` | DOM builder, icons, formatters, badges, modals, PDF viewer, toasts and the progress overlay. |
| `js/views/queue.js` | Refund queue view. |
| `js/views/case.js` | Refund case view: recommendation, policy stack, decision and outcome. |
| `js/views/new-request.js` | New request view and the demo scenarios. |
| `js/views/policies.js` | Policy library: timeline, documents, chunk preview, indexing and upload. |
| `js/views/network.js` | Hotel network view. |

Each view module exports `render(container, ctx)`. `ctx` carries:

- `state`: region, country, role and representative name;
- `api`: the API clients;
- `params`: the route parameters;
- helpers such as `inScope`, `setFilter`, `navigate`, `rerender` and `refreshShell`.
