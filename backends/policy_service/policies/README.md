# Policies

The refund policy library for the ReverieEscapes demo. These are the documents the refund agent searches
and cites. The [policy service](..) serves them, decides which apply to a stay, and indexes
them in Azure AI Search.

| Path | What it is |
|---|---|
| [register.json](register.json) | The policy register: one entry per document the policy service knows about. |
| [source/](source) | HTML source of every document, plus the shared print stylesheet `policy.css`. |
| [source/demo-upload/](source/demo-upload) | HTML source of the policy that is uploaded live during the demo. |
| [pdf/](pdf) | Rendered PDFs of the registered documents. These are what gets indexed and shared with guests. |
| [demo-upload/](demo-upload) | The demo upload: its PDF and the metadata to enter when uploading it. |
| [build-pdfs.sh](build-pdfs.sh) | Renders the HTML sources to PDF with headless Chrome. |
| `.index-state.json` | Created by the policy service to track what is indexed. Git-ignored. |

## Hierarchy and precedence

Refund rules are layered. Clauses GLB-2.1 to GLB-2.5 of the global policy set the rules:

- Where documents cover the same matter, the most specific wins: hotel rules, then the country addendum,
  then the regional addendum, then the global policy.
- A seasonal document applies only to nights inside its window. There it prevails over base documents of
  the same or broader scope. A more specific base document still beats a broader seasonal one, unless the
  seasonal document says otherwise.
- Where a more specific document is silent, the broader one applies.
- The versions in force on each night apply. A seasonal document may say it also covers decisions made
  after its issue date for earlier nights in its window (SEA-ZA-GRID-2026 does).
- The original-language version is authoritative.

The policy service turns this into a number for each applicable document (`GET /policies/applicable`),
highest first:

| Precedence | Level |
|---|---|
| 9 | Hotel, seasonal |
| 8 | Hotel, base |
| 7 | Country, seasonal |
| 6 | Country, base |
| 5 | Region, seasonal |
| 4 | Region, base |
| 3 | Global, seasonal |
| 2 | Global, base |

A document applies to a stay when its scope matches the stay's hotel, country or region, and its window
overlaps the nights of the stay.

## Catalogue

| documentId | Title (English) | Language | Scope | Type | In force | Clause prefix |
|---|---|---|---|---|---|---|
| GLB-RF-2026 | Global Guest Refund and Compensation Policy | en | Global | Base | from 2026-01-01 | GLB |
| GLB-LC-2026 | Reverie Circle Loyalty Service Recovery Policy | en | Global | Base | from 2026-01-01 | LC |
| EU-RF-2026 | Europe Regional Refund Addendum | en | Region EUROPE | Base | from 2026-01-01 | EU |
| AF-RF-2026 | Africa Regional Refund Addendum | en | Region AFRICA | Base | from 2026-03-01 | AF |
| AM-RF-2026 | Americas Regional Refund Addendum | en | Region AMERICAS | Base | from 2026-01-01 | AM |
| AP-RF-2026 | Asia-Pacific Regional Refund Addendum | en | Region ASIA_PACIFIC | Base | from 2026-01-01 | AP |
| DE-RF-2026 | Germany country addendum | de | Country DE | Base | from 2026-01-01 | DE |
| ES-RF-2026 | Spain country addendum | es | Country ES | Base | from 2026-01-01 | ES |
| FR-PAR-OPE-2026 | Paris Opéra hotel refund rules | fr | Hotel PAR-OPE | Base | from 2026-02-01 | PAR |
| JP-KYO-GIO-2026 | Kyoto Gion hotel refund and compensation rules | ja | Hotel KYO-GIO | Base | from 2026-01-01 | KYO |
| SEA-EU-SUMMER-2026 | Europe Summer Peak and Heat Protocol 2026 | en | Region EUROPE | Seasonal | 2026-06-15 to 2026-09-15 | SUM |
| SEA-AM-HURRICANE-2026 | Atlantic Hurricane Season Guest Policy 2026 | en | Region AMERICAS | Seasonal | 2026-06-01 to 2026-11-30 | HUR |
| SEA-JP-KYO-AUTUMN-2026 | Kyoto Gion autumn peak season rules 2026 | ja | Hotel KYO-GIO | Seasonal | 2026-10-25 to 2026-12-10 | AKI |
| SEA-ZA-GRID-2026 | South Africa Grid Emergency Compensation Protocol | en | Country ZA | Seasonal | 2026-10-01 to 2026-12-31 | ZAG |

The first 13 are in the register. SEA-ZA-GRID-2026 is not: it is uploaded during the demo (see
[The demo upload](#the-demo-upload)). Each document's original-language title and a one-line summary are in
`register.json`.

## Document conventions

The ingestion pipeline ([policy-service/functions.bal](../functions.bal)) reads the text of
the PDF, not the HTML. It finds sections and clauses by pattern, so every document must follow the same
layout. Copy an existing source file rather than starting from scratch.

| Element | Convention | Why it matters |
|---|---|---|
| Section heading | `<h2>N. Title</h2>`, numbered 1, 2, 3 … with no gaps. One or two digits, then a full stop and a space. | A line counts as a heading only if it continues the numbering, so a wrapped "2026." in body text is not taken as a new section. |
| Clause | `<p class="clause"><span class="cid">PREFIX-S.N</span> Text…</p>`, with the ID first. | Each clause is one chunking unit and stays with its section. Its ID is stored in the chunk's `clauseIds` and cited by the agent. |
| Clause ID | `PREFIX` is the document's `clausePrefix` (2 to 4 capital letters). `S` is the section number, `N` the clause number within it. IDs must increase through the document. | Only IDs with the document's own prefix that come after the last one are treated as new clauses. A reference to another document's clause, such as `<span class="ref">GLB-4.4</span>`, stays part of the text. |
| Clause prefix | Unique across the library. | Citations such as `KYO-2.1` must point to exactly one document. |
| Footer | `@page { @bottom-left { content: "<documentId> · Version <v> · ReverieEscapes Hotels & Resorts"; } }` in the page's `<style>`. | Lines starting with `<documentId> · ` are dropped as running footers. |
| Page numbers | "Page N of M", from `policy.css`. | Dropped by the pipeline. |
| Language | `<html lang="..">` and `<body class="lang-..">`. Use `lang-ja` for Japanese. | Sets the fonts. Japanese text is joined without spaces and split on 。 when a clause is too long. |
| Control table | Document ID, version, scope, effective dates, owner and language at the top. | For readers only. The register, not the PDF, is the source of the metadata. |

Section and clause content can be in any of the supported languages, but the heading numbers and clause
IDs must use ASCII digits and capitals.

## register.json fields

`register.json` holds `{ "documents": [ ... ] }`. Each entry has these fields:

| Field | Required | Values |
|---|---|---|
| `documentId` | Yes | Capitals, digits and hyphens, 3 to 48 characters. Also the HTML and PDF file name. |
| `title` | Yes | Title in the document's own language. |
| `titleEnglish` | Yes | English title, shown in the portal. |
| `summary` | Yes | One English sentence on what the document covers. |
| `version` | Yes | For example `1.0`. Must match the footer and control table. |
| `language` | Yes | One of `en`, `fr`, `de`, `es`, `it`, `pt`, `nl`, `ja`, `th`, `ar`. |
| `scope` | Yes | `GLOBAL`, `REGION`, `COUNTRY` or `HOTEL`. |
| `region` | For REGION, COUNTRY and HOTEL | `EUROPE`, `AFRICA`, `AMERICAS` or `ASIA_PACIFIC`. `null` for GLOBAL. |
| `countryCode` | For COUNTRY and HOTEL | Two-letter code of a country in the hotel network, inside `region`. Otherwise `null`. |
| `hotelId` | For HOTEL | A hotel of the network inside `countryCode`, for example `KYO-GIO`. Otherwise `null`. |
| `policyType` | Yes | `BASE` or `SEASONAL`. |
| `effectiveFrom` | Yes | First day in force, `YYYY-MM-DD`. |
| `effectiveTo` | For SEASONAL | Last day in force, `YYYY-MM-DD`, or `null` for "until replaced". |
| `clausePrefix` | Yes | 2 to 4 capitals, the prefix of every clause ID in the document. |
| `owner` | Yes | The team that owns the document. |
| `file` | Yes | PDF path relative to this folder: `pdf/<documentId>.pdf`. |

The countries and hotels of the network are listed in
[policy-service/data.bal](../data.bal). The service reads the register on every
request, so changes take effect without a restart. Uploads rewrite the file with two-space indentation.

## Edit a document

1. Edit its HTML in [source/](source). If the change is more than a correction, raise `version` in the
   control table, the footer and `register.json`.
2. Render its PDF. Pass one or more document IDs, or none to render everything:

   ```bash
   ./backends/policy_service/policies/build-pdfs.sh DE-RF-2026
   ```

3. Re-index it. Unchanged PDFs are skipped, so you can also run the full ingest:

   ```bash
   curl -X POST http://localhost:8090/policies/DE-RF-2026/ingest
   ```

4. Check the result in **Policy library**, **Preview chunks**, or:

   ```bash
   curl http://localhost:8090/policies/DE-RF-2026/chunks
   ```

The script uses Chrome from its default macOS location. Elsewhere, point `CHROME` at a Chrome or Chromium
binary:

```bash
CHROME=/usr/bin/chromium ./backends/policy_service/policies/build-pdfs.sh DE-RF-2026
```

The script renders `source/*.html` to `pdf/` and `source/demo-upload/*.html` to `demo-upload/`. Chrome
needs the fonts named in `policy.css` (Avenir Next, Iowan Old Style and, for Japanese, Hiragino). Other
machines fall back to other fonts, which changes the layout but not the text.

## Add a seasonal policy

There are two ways. Both make the policy live without redeploying the agent: the next assessment of a stay
inside its window picks it up.

### Upload it

This is what the demo does. In the portal, open **Policy library**, upload the PDF and fill in the
register fields. Or post it to the policy service, with `metadata.json` holding every register field
except `file`:

```bash
curl -X POST http://localhost:8090/policies -F "file=@SEA-XX-2026.pdf;type=application/pdf" -F "metadata=<metadata.json"
```

The service checks the fields, saves the PDF as `pdf/<documentId>.pdf`, adds the entry to
`register.json` and indexes it. An existing `documentId` is rejected with 409 unless the metadata includes
`"replace": true`. The PDF limit is 20 MB.

### Add it to the repository

Use this for a policy that should ship with the demo.

1. Copy a seasonal source, for example `source/SEA-EU-SUMMER-2026.html`, to
   `source/<documentId>.html`. Pick a new clause prefix and follow the
   [document conventions](#document-conventions).
2. Render it:

   ```bash
   ./backends/policy_service/policies/build-pdfs.sh SEA-XX-2026
   ```

3. Add its entry to `register.json`, with `policyType` `SEASONAL`, both effective dates and
   `file` set to `pdf/<documentId>.pdf`.
4. Index it:

   ```bash
   curl -X POST http://localhost:8090/policies/SEA-XX-2026/ingest
   ```

5. Add it to the catalogue above and to the table in the [main README](../../../README.md#policy-documents).

## The demo upload

SEA-ZA-GRID-2026 shows a policy going live in the middle of the demo. It raises grid-interruption
compensation in South Africa to 40% per night (ZAG-2.1), applies to decisions from 14 November 2026 for
earlier nights in its window, and doubles Gold and Platinum points. For the Cape Town reservation, the
recommendation moves from ZAR 2,880 under AF-2.1 to ZAR 5,760 under ZAG-2.1.

| File | Use |
|---|---|
| `demo-upload/SEA-ZA-GRID-2026.pdf` | The PDF to upload. |
| `demo-upload/SEA-ZA-GRID-2026.metadata.json` | The values to enter in the upload form, or to send as the `metadata` part. |
| `source/demo-upload/SEA-ZA-GRID-2026.html` | Its source. Rebuild with `./backends/policy_service/policies/build-pdfs.sh SEA-ZA-GRID-2026`. |

During the demo:

1. Submit the Cape Town case (RES-CPT-50391) first, so the "before" result is on record.
2. In **Policy library**, upload the PDF with the values from the metadata file.
3. Open **Preview chunks** to show the clause chunks and their context headers, and point out the new bar
   on the season timeline.
4. On the case, select **Re-assess with latest policies**.

Or upload from the command line:

```bash
curl -X POST http://localhost:8090/policies -F "file=@policies/demo-upload/SEA-ZA-GRID-2026.pdf;type=application/pdf" -F "metadata=<policies/demo-upload/SEA-ZA-GRID-2026.metadata.json"
```

### Reset after the demo

The upload changes three things: `register.json`, `pdf/`, and the search index. Undo all three, or the
next run starts with the protocol already live.

1. Remove the `SEA-ZA-GRID-2026` entry from `register.json`, leaving the 13 documents in the catalogue.
2. Delete the uploaded copy of the PDF:

   ```bash
   rm policies/pdf/SEA-ZA-GRID-2026.pdf
   ```

3. Remove its chunks from Azure AI Search. The agent filters search by scope and dates, not by the
   register, so chunks left in the index are still found. The policy service has no delete endpoint:
   delete the documents whose `documentId` is `SEA-ZA-GRID-2026` (keys `SEA-ZA-GRID-2026_0`,
   `SEA-ZA-GRID-2026_1`, …) in the Azure portal or with the Search REST API, then remove the
   `SEA-ZA-GRID-2026` entry from `backends/policy_service/policies/.index-state.json`.

Cases are held in memory by the refund API, so restart it to clear the demo's cases.
