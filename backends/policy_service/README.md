# Policy service

The policy service is the WSO2 Integrator (Ballerina) service that owns the refund policy library. It
keeps the policy register (`register.json`) and the PDFs, serves them, and works out which documents
apply to a stay and in what order of precedence. It also runs the RAG ingestion pipeline: it turns each
PDF into clause-aware chunks, embeds them with Azure OpenAI and indexes them in Azure AI Search, where
the refund agent searches them. For the overall story and architecture, see the [main README](../../README.md)
(steps 5 and 8 of the deployment diagram).

Who calls it:

- the [portal](../../portal) policy library: list, view, preview chunks, ingest and upload;
- the [refund API](../refund_api): applicable policies when a case is created or re-assessed, and the
  PDF behind its guest-facing proxy;
- the [refund agent](../../agents/refund_agent/refund_agent): its `getApplicablePolicies` tool calls `GET /policies/applicable`.

What it calls:

- the [policies](policies) folder on disk (register, PDFs and the ingestion state file);
- Azure OpenAI, for embeddings, and Azure AI Search, to create the index and write chunks. Both are used
  only by ingestion.

Without Azure settings the service still serves the register, the PDFs, applicable-policy resolution and
chunk previews. Only the two ingest endpoints answer 503.

## Endpoints

Default base URL: `http://localhost:8090`. Errors return `{"message": "..."}`. CORS is open to all
origins for `GET`, `POST` and `OPTIONS`.

| Method and path | What it does | Success | Errors |
|---|---|---|---|
| `GET /health` | Status, whether ingestion is configured, and the number of register documents. | 200 | — |
| `GET /policies` | All register documents with their ingestion status. Optional exact-match filters: `region`, `countryCode`, `hotelId`, `language`, `policyType`. Sorted global first, then region, country, hotel, then by `documentId`. | 200 | 500 |
| `GET /policies/applicable` | Documents that apply to a stay, highest precedence first. Query: `region`, `countryCode`, `hotelId`, `checkIn`, `checkOut` (all optional, dates `YYYY-MM-DD`). | 200 | 400, 500 |
| `GET /policies/{id}` | One register document with its ingestion status. | 200 | 404, 500 |
| `GET /policies/{id}/document` | The PDF, inline, with `Cache-Control: no-cache`. | 200 | 404, 500 |
| `GET /policies/{id}/chunks` | Dry run of pipeline steps 1 to 4: the chunks that would be indexed. No Azure needed. | 200 | 404, 500 |
| `POST /policies/ingest?force=false` | Ingests every register document in turn. Unchanged PDFs are skipped unless `force=true`. | 200 | 503, 500 |
| `POST /policies/{id}/ingest` | Re-ingests one document (always forced). | 200 | 404, 503, 500 |
| `POST /policies` | Uploads a new or replacement policy (see [Upload contract](#upload-contract)). | 201 | 400, 409, 500 |

The ingest endpoints return 200 even when a document fails; the failure is in that document's result.

### Response shapes

A policy entry (`GET /policies`, `GET /policies/{id}`, the body of a 201) is the register entry plus
`documentUrl` and `ingestion`:

```json
{
  "documentId": "FR-PAR-OPE-2026",
  "title": "Règlement de l'établissement relatif aux remboursements — Hôtel ReverieEscapes Paris Opéra",
  "titleEnglish": "Paris Opéra hotel refund rules",
  "summary": "Paris Opéra hotel rules compensating daytime façade-works noise ...",
  "version": "1.3",
  "language": "fr",
  "scope": "HOTEL",
  "region": "EUROPE",
  "countryCode": "FR",
  "hotelId": "PAR-OPE",
  "policyType": "BASE",
  "effectiveFrom": "2026-02-01",
  "effectiveTo": null,
  "clausePrefix": "PAR",
  "owner": "Paris Opéra hotel management — Guest Relations",
  "file": "pdf/FR-PAR-OPE-2026.pdf",
  "documentUrl": "/policies/FR-PAR-OPE-2026/document",
  "ingestion": {"status": "NOT_INDEXED"}
}
```

Once indexed, `ingestion` also carries `chunkCount` and `indexedAt` (and `error` when it failed).
`ingestion.status` is one of:

| Status | Meaning |
|---|---|
| `NOT_INDEXED` | No record in the state file. |
| `INDEXED` | Indexed, and the PDF on disk has the same SHA-256 as when it was indexed. |
| `STALE` | Indexed, but the PDF has changed (or cannot be read) since. |
| `FAILED` | The last ingestion failed; `error` says why. |

An applicable policy (`GET /policies/applicable`) is a policy entry plus `precedence` and `level`:

```json
{"documentId": "SEA-JP-KYO-AUTUMN-2026", "...": "...", "precedence": 9, "level": "Hotel · Seasonal"}
```

A chunk preview (`GET /policies/{id}/chunks`):

```json
{"chunkKey": "GLB-RF-2026_9", "section": "8. Refund method and timing", "clauseIds": ["GLB-8.1", "GLB-8.2"], "charCount": 346, "content": "..."}
```

An ingest result (`POST /policies/ingest`, `POST /policies/{id}/ingest`; the first returns an array):

```json
{"documentId": "GLB-RF-2026", "status": "INDEXED", "chunkCount": 12}
```

`status` is `INDEXED`, `SKIPPED` (unchanged PDF) or `FAILED` (with `error`).

## Applicable policies and precedence

`GET /policies/applicable` returns every register document whose scope matches the stay and whose
effective window overlaps it.

Scope matching:

- A hotel implies its country, and a country its region, from the reference data in
  [data.bal](data.bal). Passing `hotelId` alone is enough; explicit `countryCode` or `region`
  values take priority over the inferred ones.
- `GLOBAL` documents always match. `REGION`, `COUNTRY` and `HOTEL` documents match only the stay's
  region, country or hotel.

Date matching:

- A document applies when `effectiveFrom` is before `checkOut` and `effectiveTo` (if set) is on or after
  `checkIn`. In other words, its window covers at least one night of the stay.
- Either date may be omitted, which drops that side of the check. With no dates, every document in scope
  is returned.
- Malformed dates, or `checkOut` not after `checkIn`, return 400.

Ordering:

- `precedence = scopeRank × 2 + (SEASONAL ? 1 : 0)`, with ranks global 1, region 2, country 3, hotel 4.
  Higher wins. Ties are ordered by `documentId`.
- This gives, from highest: hotel seasonal (9), hotel base (8), country seasonal (7), country base (6),
  region seasonal (5), region base (4), global seasonal (3), global base (2).
- So a seasonal document prevails over base documents of the same or a broader scope, but not over a base
  document of a narrower scope. This is the rule in clauses GLB-2.1 to GLB-2.5.
- `level` is the human-readable label, for example `Hotel · Seasonal`.

For example, a Kyoto Gion stay from 1 to 4 November 2026 returns:

| precedence | level | documentId |
|---|---|---|
| 9 | Hotel · Seasonal | SEA-JP-KYO-AUTUMN-2026 |
| 8 | Hotel · Base | JP-KYO-GIO-2026 |
| 4 | Region · Base | AP-RF-2026 |
| 2 | Global · Base | GLB-LC-2026 |
| 2 | Global · Base | GLB-RF-2026 |

## Upload contract

`POST /policies` takes `multipart/form-data` with two parts:

- `file`: the policy PDF. It must start with `%PDF-` and be at most 20 MB.
- `metadata`: a UTF-8 JSON object with the register fields below (any `file` field is ignored), and an
  optional boolean `replace`.

| Field | Rule |
|---|---|
| `documentId` | Required. `[A-Z0-9-]{3,48}`. |
| `title`, `titleEnglish`, `summary`, `owner` | Required strings. `title` is in the document's own language. |
| `version` | Required. Digits and dots, like `1.0`. |
| `language` | Required. One of `en`, `fr`, `de`, `es`, `it`, `pt`, `nl`, `ja`, `th`, `ar`. |
| `scope` | Required. `GLOBAL`, `REGION`, `COUNTRY` or `HOTEL`. |
| `region`, `countryCode`, `hotelId` | Exactly the fields the scope needs, and they must be consistent: the country must be in the region and the hotel in the country. `GLOBAL` sets none of them. |
| `policyType` | Required. `BASE` or `SEASONAL`. |
| `effectiveFrom` | Required. A valid `YYYY-MM-DD` date. |
| `effectiveTo` | Optional for `BASE`, required for `SEASONAL`. Not before `effectiveFrom`. |
| `clausePrefix` | Required. 2 to 4 capital letters; the pipeline uses it to recognise the document's own clause IDs. |

Blank strings count as missing. What happens on upload:

1. The metadata is validated; a problem returns 400 with the reason.
2. If the `documentId` is already in the register and `replace` is not `true`, the service returns 409.
3. The PDF is written to `{policiesDir}/pdf/{documentId}.pdf`, then the entry is added to `register.json`
   (or replaced in place).
4. If Azure is configured, the document is ingested before the response is sent. An ingestion failure
   does not fail the upload; it shows as `ingestion.status: "FAILED"` in the response.
5. The response is 201 with `Location: /policies/{documentId}` and the policy entry.

## Ingestion pipeline

The pipeline in [functions.bal](functions.bal) runs six steps per document (the metadata mapping of step 5
is in [data_mappings.bal](data_mappings.bal) and the index schema in [connections.bal](connections.bal)). Steps 1 to 4 need no Azure and are what
`GET /policies/{id}/chunks` shows.

### 1. Load

`ai:TextDataLoader` extracts the PDF text.

### 2. Normalise and unwrap

- Lines starting with the running footer (`{documentId} · `) and `Page N of M` counters are dropped.
- Letter-spaced capitals from the letterhead (`H O T E L S`) are closed up.
- PDF line breaks are unwrapped into paragraphs. A line joins the previous paragraph unless that
  paragraph ended a sentence (`.`, `。`, `:`, `;`, `!`, `?`, `)` and their full-width forms, looking through
  closing quotes) or the line is a bullet.
- Japanese and other CJK text is joined without a space. A word wrapped after a compound hyphen
  (`duty-` / `manager`) is joined without one too.
- A line is a heading only if its number continues the document's numbering (`2.` after `1.`). A line is
  a clause only if it starts with the document's own `clausePrefix` and a higher clause number than the
  last one. So a wrapped "2026. It applies…" never becomes a heading, and a cross-reference such as
  `GLB-5.8` inside the Kyoto document never starts a new clause.

### 3. Clause-aware chunking

- Each clause (`GLB-5.1`, `AKI-2.1`, …) is a unit, carrying its section heading. Text that follows a clause
  in the same section (lists, definitions) stays with it. Text before the first heading goes in a
  `Document information` section.
- Units are packed in order, joined by blank lines, up to `maxChunkChars`. A chunk never spans two
  sections.
- A unit longer than `maxChunkChars` is split on its own with `ai:chunkDocumentRecursively`: by
  sentence, or, for CJK text, on `。`, with `chunkOverlapChars` of overlap. Overlap is used only here.

### 4. Context header

Every chunk starts with one header line, then a blank line:

```text
[{documentId} v{version} | {titleEnglish} | {scope label} | {policyType} {effectiveFrom} to {effectiveTo or "open"} | Language: {language} | Section: {section}]
```

The scope label is `Global`, `Region: Europe`, `Country: ZA (Africa)` or `Hotel: KYO-GIO (JP, Asia-Pacific)`.
The header means the embedding knows which document, scope and season a passage belongs to, whatever
its language.

A real chunk from `GET /policies/GLB-RF-2026/chunks` (the tenth of 12):

```json
{
  "chunkKey": "GLB-RF-2026_9",
  "section": "8. Refund method and timing",
  "clauseIds": ["GLB-8.1", "GLB-8.2"],
  "charCount": 346,
  "content": "[GLB-RF-2026 v4.0 | Global Guest Refund and Compensation Policy | Global | BASE 2026-01-01 to open | Language: en | Section: 8. Refund method and timing]\n\nGLB-8.1 Refunds are paid in the booking currency to the original payment method.\n\nGLB-8.2 Refunds are issued within 10 business days of approval, unless a regional rule sets a shorter period."
}
```

`charCount` includes the header.

### 5. Metadata and index schema

The index (`searchIndexName`) is created or updated the first time a document is ingested, by
`azure:AiSearchKnowledgeBase`. The knowledge base's own chunking is turned off (`ai:DISABLE`), because
the chunks are already built.

| Field | Type | Use |
|---|---|---|
| `chunkKey` | String, key | `{documentId}_{n}`, stable across re-indexing |
| `content` | String, searchable | Header plus chunk text |
| `contentVector` | Vector of `embeddingDimensions`, HNSW | Embedding of `content` |
| `documentId`, `scope`, `region`, `countryCode`, `hotelId`, `language`, `policyType` | String, filterable, facetable | Scope filters at query time |
| `version` | String, filterable | |
| `title`, `section`, `clauseIds` | String, searchable | `clauseIds` is comma-separated |
| `effectiveFrom`, `effectiveTo` | Int32, filterable, sortable | `yyyymmdd`; open-ended is `99991231` |

The [refund agent](../../agents/refund_agent/refund_agent) queries this index with the same embedding deployment, so the index
name, the embedding model and `embeddingDimensions` must agree on both sides.

### 6. Idempotent re-indexing and the state file

- The SHA-256 of the PDF is compared with the state file. If the document was indexed from the same PDF,
  it is `SKIPPED` (unless forced).
- Otherwise the service deletes the document's keys `{documentId}_0` up to the larger of the old and new
  chunk counts, in batches of 50, then uploads the new chunks. A document with fewer chunks than before
  leaves nothing behind.
- If the state file has no record of a document, up to 200 old keys are deleted.
- The state is kept in `{policiesDir}/.index-state.json` (git-ignored), one entry per document:
  `sha256`, `chunkCount`, `indexedAt`, `status` (`INDEXED` or `FAILED`) and `error`. Deleting the file
  makes the next run re-index everything.
- After a failure the entry keeps the upper bound of keys that may exist, so the next attempt still
  deletes them.

## Configuration

Copy [Config.toml.template](Config.toml.template) to `Config.toml` (git-ignored) and fill it in. Any
value can also be set as an environment variable, such as `BAL_CONFIG_VAR_PORT=8090`.

| Name | Default | Meaning |
|---|---|---|
| `port` | `8090` | HTTP port. |
| `policiesDir` | `policies` | Folder with `register.json`, the PDFs and the state file, relative to where the service is started (the package folder by default). Register paths are relative to it. |
| `openAiServiceUrl` | `""` | Azure OpenAI URL: legacy `https://<resource>.openai.azure.com/openai`, or a v1 URL ending in `/openai/v1`. |
| `openAiApiKey` | `""` | Azure OpenAI API key. |
| `embeddingDeploymentId` | `""` | Embedding model deployment, for example `text-embedding-3-small`. |
| `openAiApiVersion` | `2024-10-21` | API version for the legacy URL; ignored by a v1 URL. |
| `embeddingDimensions` | `1536` | Vector size; must match the model (`text-embedding-3-small` 1536, `text-embedding-3-large` 3072). |
| `searchServiceUrl` | `""` | `https://<search-service>.search.windows.net`. |
| `searchAdminKey` | `""` | Admin key: the service creates the index and writes documents. |
| `searchIndexName` | `reverie-policies` | Index name, shared with the refund agent. |
| `maxChunkChars` | `1200` | Maximum characters of chunk text, before the header. |
| `chunkOverlapChars` | `150` | Overlap when an oversized clause is split. |

Ingestion is enabled only when the two search settings and the three OpenAI settings
(`openAiServiceUrl`, `openAiApiKey`, `embeddingDeploymentId`) are all set; `GET /health` reports this as
`searchConfigured`.

## Run it

Requires Ballerina Swan Lake Update 14 (2201.14.x). The service is a member of the backends workspace
([backends/Ballerina.toml](../Ballerina.toml)); `bal build` in `backends/` builds all three backend
services. To run just this service, with or without a `Config.toml`:

```bash
cd backends/policy_service
bal run
```

Check it is up:

```bash
curl http://localhost:8090/health
```

Policies that apply to a Kyoto Gion stay, in precedence order:

```bash
curl "http://localhost:8090/policies/applicable?hotelId=KYO-GIO&checkIn=2026-11-01&checkOut=2026-11-04"
```

Preview the chunks of the global policy (no Azure needed):

```bash
curl http://localhost:8090/policies/GLB-RF-2026/chunks
```

Download a PDF:

```bash
curl -o FR-PAR-OPE-2026.pdf http://localhost:8090/policies/FR-PAR-OPE-2026/document
```

Index all registered policies (needs Azure; later runs skip unchanged PDFs):

```bash
curl -X POST http://localhost:8090/policies/ingest
```

Re-index everything, ignoring the state file:

```bash
curl -X POST "http://localhost:8090/policies/ingest?force=true"
```

Upload the demo seasonal protocol (run from `backends/policy_service`):

```bash
curl -X POST http://localhost:8090/policies -F "file=@policies/demo-upload/SEA-ZA-GRID-2026.pdf;type=application/pdf" -F "metadata=@policies/demo-upload/SEA-ZA-GRID-2026.metadata.json;type=application/json"
```

The upload changes `policies/register.json` and adds `policies/pdf/SEA-ZA-GRID-2026.pdf`. To reset the
demo, remove the `SEA-ZA-GRID-2026` entry from `register.json` and delete that PDF.

## Design notes

- The register file is the source of truth. The service re-reads `register.json` and the state file on
  every request, so editing them by hand takes effect without a restart.
- Writes to `register.json`, the state file and the index are serialised by one lock, so concurrent
  uploads and ingestions do not overwrite each other.
- Ingestion is synchronous. `POST /policies/ingest` processes documents one after another, and an upload
  waits for its own ingestion; the portal allows minutes for these calls.
- `GET /policies/{id}/chunks` re-runs extraction and chunking on each call. Use it to check how a new PDF
  will be chunked before indexing it.
- The reference data in [data.bal](data.bal) (regions, countries, hotels, languages) is fixed in
  code. A new hotel or country must be added there before a policy can be uploaded for it.
- `summary` and `owner` are required on upload, but treated as empty strings when missing from a
  hand-edited register entry.

## Files

The package follows the WSO2 Integrator project layout: one file per kind of construct, all at the
package root.

| File | Contents |
|---|---|
| [main.bal](main.bal) | The HTTP listener and the service with its resources, including upload handling. |
| [config.bal](config.bal) | Every configurable: port, `policiesDir`, Azure OpenAI and Azure AI Search settings, chunk sizes. |
| [connections.bal](connections.bal) | The Azure AI Search index definition and the lazily created knowledge base with its Azure OpenAI embedding provider. |
| [types.bal](types.bal) | Record types for the register, API responses, the state file and the pipeline (paragraphs, units, chunks). |
| [functions.bal](functions.bal) | Register and state file I/O, applicable-policy resolution, upload validation, the ingestion pipeline (load, normalise, chunk, context header, delete and ingest) and HTTP error helpers. |
| [data_mappings.bal](data_mappings.bal) | Mappings from a register entry to the policy entry and applicable-policy views, and from a chunk to its preview and to the knowledge-base text chunk with metadata. |
| [data.bal](data.bal) | Static reference data: regions, countries, hotels, supported languages and scope ranks and labels. |
| [agents.bal](agents.bal) | Empty: the service defines no agents. |
| [automation.bal](automation.bal) | Empty: the service has no automation entry point. |
| [policies](policies) | The policy register, PDFs, HTML sources and demo upload (the default `policiesDir`). |
| [Config.toml.template](Config.toml.template) | Configuration template. |
| [Ballerina.toml](Ballerina.toml) | Package definition (`reverie_escapes/policy_service`), a member of the backends workspace. |
| [Dockerfile](Dockerfile) | Container image for the built JAR. |
