// Copyright (c) 2026 WSO2 LLC (http://www.wso2.com).
//
// WSO2 LLC. licenses this file to you under the Apache License,
// Version 2.0 (the "License"); you may not use this file except
// in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing,
// software distributed under the License is distributed on an
// "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
// KIND, either express or implied.  See the License for the
// specific language governing permissions and limitations
// under the License.

type Scope "GLOBAL"|"REGION"|"COUNTRY"|"HOTEL";

type PolicyType "BASE"|"SEASONAL";

type IngestionStatus "NOT_INDEXED"|"INDEXED"|"STALE"|"FAILED";

// One document of the policy register (register.json). Paths are relative to `policiesDir`.
type RegisterDocument record {|
    string documentId;
    // Title in the document's own language
    string title;
    string titleEnglish;
    string summary;
    string version;
    string language;
    Scope scope;
    string? region;
    string? countryCode;
    string? hotelId;
    PolicyType policyType;
    // YYYY-MM-DD
    string effectiveFrom;
    // YYYY-MM-DD, or () when open-ended
    string? effectiveTo;
    string clausePrefix;
    string owner;
    string file;
|};

type IngestionInfo record {|
    IngestionStatus status;
    int chunkCount?;
    string indexedAt?;
    string 'error?;
|};

type PolicyEntry record {|
    *RegisterDocument;
    string documentUrl;
    IngestionInfo ingestion;
|};

type ApplicablePolicy record {|
    *PolicyEntry;
    // scopeRank * 2 + (SEASONAL ? 1 : 0); higher wins
    int precedence;
    // e.g. "Hotel · Seasonal"
    string level;
|};

type HealthStatus record {|
    string status;
    boolean searchConfigured;
    int documents;
|};

// Dry-run view of one chunk the pipeline would index.
type ChunkPreview record {|
    string chunkKey;
    string section;
    string[] clauseIds;
    int charCount;
    // Context header, a blank line, then the chunk text
    string content;
|};

type IngestResult record {|
    string documentId;
    "INDEXED"|"SKIPPED"|"FAILED" status;
    int chunkCount;
    string 'error?;
|};

// Per-document entry of `{policiesDir}/.index-state.json`.
type IndexStateEntry record {|
    // sha256 (hex) of the PDF that was last ingested
    string sha256;
    int chunkCount;
    string indexedAt;
    "INDEXED"|"FAILED" status;
    string 'error?;
|};

type IndexState map<IndexStateEntry>;

type ErrorBody record {|
    string message;
|};

// A chunk produced by the pipeline, before it is turned into an `ai:TextChunk`.
type PolicyChunk record {|
    string section;
    string[] clauseIds;
    // Context header + blank line + text
    string content;
|};

// A paragraph of the normalised PDF text.
type Paragraph record {|
    "HEADING"|"CLAUSE"|"TEXT" kind;
    string text;
|};

// A clause (or a run of text) the chunker packs into chunks.
type Unit record {|
    string section;
    string? clauseId;
    string text;
|};
