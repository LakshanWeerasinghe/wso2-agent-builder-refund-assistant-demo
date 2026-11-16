# Refund agent

The refund agent assesses one refund request and returns a recommendation. It is a Ballerina
`ai:Agent` served through `azure:FoundryListener`, so the same code runs locally and as a Microsoft
Foundry hosted agent. Given a reservation ID and the guest's complaint, it reads the stay, the incident
log and the loyalty tier, finds every policy in force for those nights, and proposes a refund night by
night, with each clause cited and a message to the guest in the guest's language. It never pays
anything: a representative approves or rejects the proposal in the [refund API](../../backends/refund_api).

See the [main README](../../README.md) for the whole demo and the deployment diagram.

## Where it sits

| Direction | Service | What for |
|---|---|---|
| Called by | [refund-api](../../backends/refund_api) | `POST /invocations` for each new case and each re-assessment. |
| Calls | [guest-mcp-server](../../backends/guest_mcp_server) | MCP tools at `/mcp` for the model; REST at `/api` for the agent's own tools. |
| Calls | [policy-service](../../backends/policy_service) | `GET /policies/applicable` for the documents in force during the stay. |
| Calls | Azure AI Search | The policy index that the policy service builds. |
| Calls | Azure OpenAI | The chat model, and the embedding model for search queries. |

Foundry guardrails (content filters and prompt shields) screen the model calls and the agent endpoint.
They are configured in Foundry, not in this code; see
[step 3.11 of the runbook](../../docs/deploy-and-test.md#311-turn-on-the-foundry-guardrails).

### How an assessment is put together

The model never decides what to retrieve or which night an incident belongs to. Before it reasons,
[functions.bal](functions.bal) gathers in code (`assessmentContext`):

- the reservation and incident log;
- the loyalty profile;
- the applicable documents in precedence order;
- the computed nights (and days) each incident falls on;
- policy passages from one search per incident category, the complaint, approval limits, loyalty
  points, eligibility, and taxes and fees. Each search runs once per policy level.

The model then decides and calculates; it can still call the tools for anything missing. The chat
model runs at temperature 0, and `proposeRefund` in [functions.bal](functions.bal) retries once if the answer doesn't match the
proposal schema. Use `gpt-4.1`; `gpt-4.1-mini` skipped searches and mixed up loyalty tiers in testing.

### Running in a Foundry sandbox

In a hosted-agent sandbox, outbound TLS to Azure OpenAI goes through Foundry's egress proxy, which
re-signs certificates with its own CA. [start.sh](start.sh), the container entrypoint, adds that CA
(the file in `NODE_EXTRA_CA_CERTS`) to a copy of the JVM trust store before starting. Without it, every
model call fails with `SSLHandshakeException`. Outside Foundry the variable is unset and the step is
skipped.

`start.sh` started as the file the WSO2 Integrator extension generates. Its "Generated for Microsoft
Foundry" line is removed, so the extension keeps the CA step instead of rewriting the file.

## Endpoints

The listener serves the Foundry invocations protocol at the root path, on port 8088 by default.

| Method and path | What it does |
|---|---|
| `POST /invocations` | Assesses a refund request and returns a `RefundProposal`. |
| `GET /readiness` | Readiness probe. Returns `{"status": "healthy"}`. |

### Request

```json
{
  "reservationId": "RES-PAR-24117",
  "complaint": "Construction noise woke us every morning and there was no hot water one evening.",
  "requestDate": "2026-11-14"
}
```

- `requestDate` is optional, in the form `YYYY-MM-DD`, and defaults to today (UTC). The 30-day rule is
  measured against it. Any other format returns `400` with
  `{"message": "requestDate must be a date in the form YYYY-MM-DD"}`.
- The `agent_session_id` query parameter sets the session ID. The refund API passes the case ID. The
  session ID is logged, but the agent keeps no memory, so each request is assessed on its own.
- Each response carries an `x-agent-invocation-id` header, set by the listener.

### Response

A `RefundProposal` (see [types.bal](types.bal)). The example is shortened, with one line, one citation
and a trimmed message; the figures depend on the model run.

```json
{
  "reservationId": "RES-PAR-24117",
  "decision": "REFUND",
  "refundAmount": 294.00,
  "currency": "EUR",
  "refundAmountUsd": 319.57,
  "bonusPoints": 7500,
  "approvalLevel": "REPRESENTATIVE",
  "lines": [
    {
      "date": "2026-11-04",
      "description": "Night of 4 Nov: no hot water 7.2 h (PAR-2.2)",
      "clauseId": "PAR-2.2",
      "percentage": 40,
      "amount": 168.00
    }
  ],
  "citations": [
    {
      "documentId": "FR-PAR-OPE-2026",
      "clauseId": "PAR-2.2",
      "language": "fr",
      "summary": "Hot-water outage: 40% of the nightly rate."
    }
  ],
  "reasoning": "Documents in force: ... Hotel rules prevail for noise and hot water ...",
  "guestMessage": {
    "language": "en",
    "subject": "Your stay at ReverieEscapes Paris Opéra",
    "body": "Dear ...\n\n...\n\nGuest Relations, ReverieEscapes Paris Opéra"
  }
}
```

| Field | Values |
|---|---|
| `decision` | `REFUND`, `NO_REFUND` or `NEEDS_MORE_INFO`. |
| `approvalLevel` | `REPRESENTATIVE`, `DUTY_MANAGER` or `REGIONAL_DIRECTOR`. |
| `lines[]` | One per compensated night or day, and one per fee or tax refund. `percentage` is 0 for fixed amounts. |
| `citations[]` | Every clause relied on, with the document's language code and an English summary. |
| `reasoning` | English, for the representative: which document won for each matter, the arithmetic, the threshold and the points. |
| `guestMessage` | Subject and plain-text body in the guest's preferred language. |

## Tools

The model gets five tools. The scope of every policy lookup comes from the reservation, never from the
model.

| Tool | Source | What it returns |
|---|---|---|
| `getReservation` | MCP, guest MCP server | The stay, nightly rate, currency, fees and the room's incident log. |
| `getLoyaltyProfile` | MCP, guest MCP server | The guest's Reverie Circle tier. |
| `getHotel` | MCP, guest MCP server | Hotel details, used only when the reservation lacks them. |
| `getApplicablePolicies` | [functions.bal](functions.bal) | The documents in force for the stay, most specific first. |
| `searchPolicies` | [functions.bal](functions.bal) | Policy passages for one issue, grouped by scope level. |

### MCP toolkit

`GuestServicesToolKit` in [connections.bal](connections.bal) is a custom MCP toolkit, written the way WSO2
Integrator generates one. It replaces the deprecated `ai:McpToolKit`:

- it uses the `ballerina/mcp.v2` `StreamableHttpClient`;
- `ai:getPermittedMcpToolConfigs` connects, lists the server's tools and keeps only the permitted ones,
  `getReservation`, `getLoyaltyProfile` and `getHotel`;
- each permitted tool is an `@ai:AgentTool` method that forwards the model's call with `callTool`.

Its instance, `guestTools`, in the same file, connects to `guestMcpUrl` when the
agent starts, so start the guest MCP server first, or the agent fails to start.

### getApplicablePolicies(reservationId)

1. Loads the reservation from `GET {guestApiUrl}/reservations/{id}`.
2. Calls `GET {policyServiceUrl}/policies/applicable` with the hotel's region, country code and hotel ID,
   and the check-in and check-out dates.
3. Sorts by `precedence`, highest first, and returns each document as:

```json
{
  "documentId": "SEA-JP-KYO-AUTUMN-2026",
  "title": "ReverieEscapes 京都祇園 秋の観光繁忙期 特別規程 2026",
  "titleEnglish": "Kyoto Gion autumn peak season rules 2026",
  "language": "ja",
  "level": "Hotel · Seasonal",
  "policyType": "SEASONAL",
  "window": "2026-10-25 to 2026-12-10",
  "precedence": 9,
  "summary": "Kyoto Gion autumn foliage peak rules raising public-bath closure compensation to 25%, ..."
}
```

`precedence` is computed by the policy service (scope rank times 2, plus 1 for a seasonal document), so
a hotel seasonal document is 9 and the global base policy is 2.

`window` reads `from 2026-01-01 (open-ended)` when a document has no end date. `titleEnglish` falls back
to `title`, and `summary` to an empty string.

### searchPolicies(reservationId, query)

The tool runs one Azure AI Search query per scope level, so local rules in French or Japanese are never
crowded out by English global passages.

1. Loads the reservation, as above.
2. Works out the stay nights: check-in to the night before check-out, as `yyyymmdd` integers.
3. For each level (`HOTEL`, `COUNTRY`, `REGION`, `GLOBAL`), retrieves `passagesPerScope` passages with
   these filters:
   - `scope` equals the level;
   - `effectiveFrom <= lastNight` and `effectiveTo >= checkIn`, so only documents in force on at least
     one night match;
   - `hotelId`, `countryCode` or `region` equals the reservation's value (no extra filter for `GLOBAL`).
4. Returns the passages grouped by level, most specific first:

```json
{
  "query": "public bath closure",
  "stayNights": "2026-11-08 to 2026-11-10",
  "levels": [
    {
      "level": "HOTEL",
      "scope": "Hotel KYO-GIO",
      "passages": [
        {
          "documentId": "SEA-JP-KYO-AUTUMN-2026",
          "language": "ja",
          "section": "...",
          "clauseIds": "...",
          "score": 0.83,
          "content": "[SEA-JP-KYO-AUTUMN-2026 v1.0 | Kyoto Gion autumn peak season rules 2026 | ... | Language: ja | Section: ...]\n..."
        }
      ]
    },
    { "level": "COUNTRY", "scope": "Country JP", "passages": [] },
    { "level": "REGION", "scope": "Region ASIA_PACIFIC", "passages": [] },
    { "level": "GLOBAL", "scope": "Global", "passages": [] }
  ]
}
```

Each passage's `content` starts with the context header the policy service adds when it chunks the PDF.
Queries are embedded with `embeddingDeploymentId`, which must be the deployment the policy service used
to build the index.

The `azure:AiSearchKnowledgeBase` is created on the first search, not at startup, because its
constructor checks that the index exists. The agent can therefore start before anything has been
ingested. It is created with chunking disabled, since the agent only reads.

## System prompt

The prompt is in [agents.bal](agents.bal). In summary:

- **Role.** Propose a decision to a representative. Never pay or promise a refund. Never invent a
  clause, rate, incident or percentage.
- **Workflow.** Reservation, loyalty profile, applicable policies, then `searchPolicies` once per issue
  in the complaint and incident log. It always also searches approval thresholds, loyalty points, taxes
  and fees, and the request deadline. Independent searches run in parallel.
- **Precedence (GLB-2.1 to GLB-2.5).**
  - Hotel rules, then country, region and global.
  - A seasonal document applies only inside its window, and there prevails over same or broader
    scope.
  - A more specific base document beats a broader seasonal one unless the seasonal one says otherwise.
  - The original-language text is authoritative.
- **Eligibility.**
  - Within 30 days of check-out, measured against the request date (GLB-4.1).
  - Cancellations and no-shows excluded (GLB-4.2).
  - Only incidents in the incident log count (GLB-4.3).
  - Incidents the guest did not report during the stay get at most 50% (GLB-4.4).
  - `NEEDS_MORE_INFO` only when the reservation is not found or the complaint matches nothing.
- **Calculation.**
  - Night by night; the night of date D starts on D.
  - Check every condition of a clause against the incident record.
  - Only the single highest percentage per night (GLB-5.8), applied to the room rate excluding taxes and
    fees (GLB-5.9).
  - External causes and daytime noise only where a local rule provides.
  - Taxes and fees only where a clause requires it.
  - The total never exceeds the room charges.
- **Approval level.** The most specific threshold that applies (hotel or seasonal, country, region, then
  GLB-7 in USD at the reference rates).
- **Loyalty points.** Per night with room-rate compensation, by tier, plus seasonal or local extras, with
  the per-stay cap applied last. Zero for no refund.
- **Guest message.**
  - Native prose in the guest's language and register, about 120 to 200 words.
  - States the outcome, amount, refund method and timing, and points.
  - Says the policy documents are attached.
  - Never promises more than the proposal, and never mentions approval.
  - Signed "Guest Relations, \<hotel name\>".

The agent runs with `maxIter: 15` and no memory.

## Post-processing

The invocation service in [main.bal](main.bal) checks the parts of the proposal that should not depend on model arithmetic.

- **Before the run.** It loads the reservation and adds the number of days from check-out to the
  request date to the query, so the 30-day rule uses a computed figure. If the reservation cannot be
  loaded, the line is left out and the model finds that through its tools.
- **After the run**, in `normalise` ([data_mappings.bal](data_mappings.bal)):
  - `reservationId` is set to the requested ID.
  - For `NO_REFUND` and `NEEDS_MORE_INFO`, `refundAmount`, `refundAmountUsd` and `bonusPoints` are set
    to 0.
  - For `REFUND`, if there are lines and their sum differs from `refundAmount`, the sum wins and a
    warning is logged.
  - `refundAmountUsd` is recalculated as `refundAmount / rate`, rounded to 2 places, using the GLB-RF-2026
    Appendix A reference rates in [agents.bal](agents.bal). An unknown currency keeps the model's figure.
- Each proposal is logged with its decision, amount, currency, approval level and session ID.

## Configuration

Copy [Config.toml.template](Config.toml.template) to `Config.toml` (git-ignored) and fill it in. In a
container, pass each value as a `BAL_CONFIG_VAR_<NAME>` environment variable with the name in upper
case, for example `BAL_CONFIG_VAR_OPENAIAPIKEY`.

| Name | Default | Meaning |
|---|---|---|
| `openAiServiceUrl` | required | Azure OpenAI URL: `https://<resource>.openai.azure.com/openai` (legacy) or `https://<resource>.services.ai.azure.com/openai/v1`. |
| `openAiApiKey` | required | Azure OpenAI API key. |
| `chatDeploymentId` | required | Chat model deployment. |
| `embeddingDeploymentId` | required | Embedding deployment. Must match the one the policy service indexed with. |
| `openAiApiVersion` | `2024-10-21` | API version for a legacy URL; ignored for a v1 URL. |
| `searchServiceUrl` | required | `https://<search-service>.search.windows.net`. |
| `searchApiKey` | required | Azure AI Search admin key. The knowledge base reads the index definition when it is created, which a query key may not do. |
| `searchIndexName` | `reverie-policies` | The index the policy service builds. |
| `guestMcpUrl` | `http://localhost:9090/mcp` | Guest MCP server, MCP endpoint. |
| `guestApiUrl` | `http://localhost:9090/api` | Guest MCP server, REST endpoint. |
| `policyServiceUrl` | `http://localhost:8090` | Policy service. |
| `passagesPerScope` | `3` | Passages retrieved per scope level on each search. |

The port is not a configurable. The listener uses the `PORT` environment variable, else 8088.

## Run it

Prerequisites are in the [main README](../../README.md#run-locally): Ballerina 2201.14.x,
`ballerinax/ai.azure` 1.6.0 or later, and Azure OpenAI and Azure AI Search resources. Start the
[guest MCP server](../../backends/guest_mcp_server) and the [policy service](../../backends/policy_service)
first, and index the policies.

The agent is the `refund_agent` package of the agents workspace
([agents/Ballerina.toml](../Ballerina.toml)); `bal build` in `agents/` builds every agent in it. To work
on this agent alone, run the commands below from its folder, starting at the repository root:

```bash
cd agents/refund_agent
cp Config.toml.template Config.toml
```

```bash
bal run
```

Check that it is up:

```bash
curl http://localhost:8088/readiness
```

Assess a request:

```bash
curl -X POST http://localhost:8088/invocations -H 'Content-Type: application/json' -d '{"reservationId": "RES-KYO-31842", "complaint": "The public bath was closed for two nights of our stay.", "requestDate": "2026-11-14"}'
```

With a session ID, as the refund API sends it:

```bash
curl -X POST 'http://localhost:8088/invocations?agent_session_id=case-001' -H 'Content-Type: application/json' -d '{"reservationId": "RES-SIN-90017", "complaint": "The air conditioning was noisy.", "requestDate": "2026-11-14"}'
```

The eight demo reservations and their expected outcomes are in the
[demo script](../../README.md#demo-script). A run takes several model and search calls; the refund API
waits up to 180 seconds.

## Deploy as a Foundry hosted agent

The [Dockerfile](Dockerfile) is the one the WSO2 Integrator extension generates for Microsoft
Foundry; [.dockerignore](.dockerignore) and [otel/](otel) come with it. It has two stages:

1. A Go stage builds a slim OpenTelemetry Collector for Application Insights (see
   [otel/builder-config.yaml](otel/builder-config.yaml)).
2. An `eclipse-temurin:25-jre` stage holds the collector, the tracing config, [start.sh](start.sh) and
   the jar built by `bal build`, and runs `start.sh` on port 8088.

No configuration goes into the image except `otel/tracing.toml`, which turns on tracing to the local
collector. Build the jar from the agent's folder, then the image:

```bash
cd agents/refund_agent
bal build
```

```bash
docker buildx build --platform linux/amd64 --provenance=false --load -t reverie-refund-agent:v1 .
```

Foundry hosted agents need a `linux/amd64` image. Push it to a container registry, then create a hosted
agent version with:

- the `invocations` protocol, version `2.0.0`;
- every configurable as a `BAL_CONFIG_VAR_<NAME>` environment variable, with the API keys held as
  secrets;
- `guestMcpUrl`, `guestApiUrl` and `policyServiceUrl` pointing at the Container Apps URLs of those
  services.

Follow [Deploy a hosted agent](https://learn.microsoft.com/en-us/azure/foundry/agents/how-to/deploy-hosted-agent)
for the steps. Then point the refund API at the agent with `agentUrl`, `agentInvocationsPath` and
`agentAccessToken`.

## Design notes

- **Scope comes from the system of record.** Both policy tools take only a reservation ID and load the
  reservation themselves, so the model cannot search the wrong hotel, country or dates.
- **One search per level.** A single query over all documents would rank English global passages above
  short local-language clauses. Four filtered queries keep every level in the result.
- **Date filters cover the whole stay.** A document matches if it is in force on any stay night. The
  model then applies a seasonal rule only to the nights inside its window.
- **Arithmetic is checked in code.** Days since check-out, the total and the USD equivalent are computed
  in Ballerina, not trusted from the model.
- **No memory.** Each invocation is independent; re-assessing a case is a fresh run.

## Files

The package follows the WSO2 Integrator project layout, one file per kind of construct, and is a member
of the agents workspace.

| File | Contents |
|---|---|
| [main.bal](main.bal) | The `FoundryListener` (300 s timeout) and the `FoundryInvocationService`: `GET /readiness` and `POST /invocations`, with request validation and the assessment query. |
| [config.bal](config.bal) | Configurable variables. |
| [connections.bal](connections.bal) | The `GuestServicesToolKit` class and its `guestTools` instance, the guest API and policy service HTTP clients, the chat model provider (temperature 0), the embedding provider and the lazily created Azure AI Search knowledge base. |
| [agents.bal](agents.bal) | The system prompt, the reference rates and the `ai:Agent`. |
| [functions.bal](functions.bal) | The agent run with its retry, days since check-out, the assessment context (reservation, loyalty, applicable documents, incident nights and days, policy passages), the `getApplicablePolicies` and `searchPolicies` tools, reservation loading and date helpers. |
| [data_mappings.bal](data_mappings.bal) | `normalise` (proposal clean-up), and the applicable-document and search-passage mappings. |
| [types.bal](types.bal) | Request, `RefundProposal` and tool result types. |
| [automation.bal](automation.bal) | Empty: the agent has no scheduled automation. |
| [Config.toml.template](Config.toml.template) | Configuration template. |
| [Dockerfile](Dockerfile) | Container image for the Foundry hosted agent. |
| [start.sh](start.sh) | Container entrypoint: trusts the Foundry egress proxy CA, starts the OpenTelemetry Collector when Application Insights is configured, then starts the agent. |
| [otel/](otel), [.dockerignore](.dockerignore) | Generated by the WSO2 Integrator extension with the Dockerfile: the collector build manifest and config, the Ballerina tracing config, and the build-context filter. |
| `Ballerina.toml` | Package metadata and build options. `bal build` generates `Dependencies.toml`. |
| `.gitignore` | Ignores `target/`, `generated/` and `Config.toml`. |
