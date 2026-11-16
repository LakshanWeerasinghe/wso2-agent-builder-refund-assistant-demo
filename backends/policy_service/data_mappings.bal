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

import ballerina/ai;

const OPEN_EFFECTIVE_TO = 99991231;

// --- Register entry -> API views ---

isolated function toPolicyEntry(RegisterDocument document, IndexState state) returns PolicyEntry => {
    ...document,
    documentUrl: string `/policies/${document.documentId}/document`,
    ingestion: ingestionInfo(document, state)
};

isolated function levelOf(RegisterDocument document) returns string =>
    string `${SCOPE_LABELS[document.scope] ?: document.scope} · ${document.policyType == "SEASONAL" ? "Seasonal" : "Base"}`;

isolated function toApplicablePolicy(RegisterDocument document, IndexState state) returns ApplicablePolicy =>
    {...toPolicyEntry(document, state), precedence: precedenceOf(document), level: levelOf(document)};

// --- Chunk -> preview ---

isolated function toChunkPreview(string documentId, int index, PolicyChunk chunk) returns ChunkPreview => {
    chunkKey: string `${documentId}_${index}`,
    section: chunk.section,
    clauseIds: chunk.clauseIds,
    charCount: chunk.content.length(),
    content: chunk.content
};

// --- Chunk -> knowledge base text chunk (metadata) ---

isolated function dateAsInt(string date) returns int|error => int:fromString(re `-`.replaceAll(date, ""));

isolated function toTextChunk(RegisterDocument document, PolicyChunk chunk) returns ai:TextChunk|error {
    ai:Metadata metadata = {
        // The knowledge base appends the batch index: GLB-RF-2026_0, GLB-RF-2026_1, ...
        "chunkKey": document.documentId + "_",
        "documentId": document.documentId,
        "title": document.title,
        "version": document.version,
        "scope": document.scope,
        "language": document.language,
        "policyType": document.policyType,
        "effectiveFrom": check dateAsInt(document.effectiveFrom),
        "effectiveTo": document.effectiveTo is string ? check dateAsInt(<string>document.effectiveTo) : OPEN_EFFECTIVE_TO,
        "section": chunk.section,
        "clauseIds": string:'join(",", ...chunk.clauseIds)
    };
    string? region = document.region;
    if region is string {
        metadata["region"] = region;
    }
    string? countryCode = document.countryCode;
    if countryCode is string {
        metadata["countryCode"] = countryCode;
    }
    string? hotelId = document.hotelId;
    if hotelId is string {
        metadata["hotelId"] = hotelId;
    }
    return {content: chunk.content, metadata};
}
