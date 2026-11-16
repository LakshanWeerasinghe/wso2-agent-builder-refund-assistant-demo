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

import ballerina/http;
import ballerina/log;
import ballerina/mime;

const MAX_UPLOAD_BYTES = 20971520;

// Indexing every document takes a couple of minutes, longer than the default 60 s request timeout.
listener http:Listener httpListener = new (port, timeout = 600);

@http:ServiceConfig {
    cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"]
    }
}
service / on httpListener {

    function init() {
        log:printInfo("Policy service started", port = port, policiesDir = policiesDir,
                searchConfigured = searchConfigured());
    }

    resource function get health() returns HealthStatus {
        RegisterDocument[]|error register = loadRegister();
        if register is error {
            log:printError("Cannot read the policy register", register);
        }
        return {status: "ok", searchConfigured: searchConfigured(), documents: register is error ? 0 : register.length()};
    }

    resource function get policies(string? region, string? countryCode, string? hotelId, string? language,
            string? policyType) returns PolicyEntry[]|http:InternalServerError {
        do {
            RegisterDocument[] register = check loadRegister();
            IndexState state = check readIndexState();
            PolicyEntry[] entries = from RegisterDocument document in register
                where (region is () || document.region == region)
                    && (countryCode is () || document.countryCode == countryCode)
                    && (hotelId is () || document.hotelId == hotelId)
                    && (language is () || document.language == language)
                    && (policyType is () || document.policyType == policyType)
                select toPolicyEntry(document, state);
            return sortEntries(entries);
        } on fail error err {
            return internalError("Cannot read the policy register", err);
        }
    }

    resource function get policies/applicable(string? region, string? countryCode, string? hotelId,
            string? checkIn, string? checkOut)
            returns ApplicablePolicy[]|http:BadRequest|http:InternalServerError {
        foreach string? date in [checkIn, checkOut] {
            if date is string && !isValidDate(date) {
                return badRequest("checkIn and checkOut must be YYYY-MM-DD dates");
            }
        }
        if checkIn is string && checkOut is string && checkOut <= checkIn {
            return badRequest("checkOut must be after checkIn");
        }
        do {
            return applicablePolicies(check loadRegister(), check readIndexState(), region, countryCode, hotelId,
                    checkIn, checkOut);
        } on fail error err {
            return internalError("Cannot read the policy register", err);
        }
    }

    resource function get policies/[string id]() returns PolicyEntry|http:NotFound|http:InternalServerError {
        do {
            RegisterDocument? document = check findDocument(id);
            if document is () {
                return notFound(id);
            }
            return toPolicyEntry(document, check readIndexState());
        } on fail error err {
            return internalError("Cannot read the policy register", err);
        }
    }

    resource function get policies/[string id]/document()
            returns http:Response|http:NotFound|http:InternalServerError {
        do {
            RegisterDocument? document = check findDocument(id);
            if document is () {
                return notFound(id);
            }
            byte[] pdf = check readPdf(document);
            http:Response response = new;
            response.setBinaryPayload(pdf, "application/pdf");
            response.setHeader("Content-Disposition", string `inline; filename="${id}.pdf"`);
            response.setHeader("Cache-Control", "no-cache");
            return response;
        } on fail error err {
            return internalError(string `Cannot read the PDF of ${id}`, err);
        }
    }

    resource function get policies/[string id]/chunks()
            returns ChunkPreview[]|http:NotFound|http:InternalServerError {
        do {
            RegisterDocument? document = check findDocument(id);
            if document is () {
                return notFound(id);
            }
            return check previewChunks(document);
        } on fail error err {
            return internalError(string `Cannot run the pipeline on ${id}`, err);
        }
    }

    resource function post policies/ingest(boolean force = false)
            returns http:Ok|http:ServiceUnavailable|http:InternalServerError {
        http:ServiceUnavailable? unavailable = searchUnavailable();
        if unavailable is http:ServiceUnavailable {
            return unavailable;
        }
        RegisterDocument[]|error register = loadRegister();
        if register is error {
            return internalError("Cannot read the policy register", register);
        }
        IngestResult[] results = from RegisterDocument document in register
            select ingestDocument(document, force);
        http:Ok ok = {body: results};
        return ok;
    }

    resource function post policies/[string id]/ingest()
            returns http:Ok|http:NotFound|http:ServiceUnavailable|http:InternalServerError {
        http:ServiceUnavailable? unavailable = searchUnavailable();
        if unavailable is http:ServiceUnavailable {
            return unavailable;
        }
        RegisterDocument?|error document = findDocument(id);
        if document is error {
            return internalError("Cannot read the policy register", document);
        }
        if document is () {
            return notFound(id);
        }
        http:Ok ok = {body: ingestDocument(document, true)};
        return ok;
    }

    // multipart/form-data: `file` (the PDF) and `metadata` (JSON register fields without `file`, optional `replace`).
    resource function post policies(http:Request request)
            returns http:Created|http:BadRequest|http:Conflict|http:InternalServerError {
        mime:Entity[]|http:ClientError parts = request.getBodyParts();
        if parts is http:ClientError {
            return badRequest("Expected multipart/form-data with parts 'file' and 'metadata'");
        }
        byte[]? pdf = ();
        string? metadataText = ();
        foreach mime:Entity part in parts {
            string name = part.getContentDisposition().name;
            byte[]|mime:ParserError content = part.getByteArray();
            if content is mime:ParserError {
                return badRequest(string `Cannot read part '${name}'`);
            }
            if name == "file" {
                pdf = content;
            } else if name == "metadata" {
                string|error text = string:fromBytes(content);
                if text is error {
                    return badRequest("'metadata' must be UTF-8 JSON");
                }
                metadataText = text;
            }
        }
        if pdf is () || pdf.length() == 0 {
            return badRequest("Part 'file' (the policy PDF) is required");
        }
        if pdf.length() > MAX_UPLOAD_BYTES {
            return badRequest("The PDF is larger than 20 MB");
        }
        if pdf.length() < 5 || pdf.slice(0, 5) != "%PDF-".toBytes() {
            return badRequest("Part 'file' is not a PDF");
        }
        if metadataText is () {
            return badRequest("Part 'metadata' (JSON) is required");
        }
        json|error metadataJson = metadataText.fromJsonString();
        if metadataJson !is map<json> {
            return badRequest("'metadata' must be a JSON object");
        }
        json replaceFlag = metadataJson["replace"];
        if replaceFlag !is boolean? {
            return badRequest("'replace' must be a boolean");
        }
        RegisterDocument|string validated = validateMetadata(metadataJson);
        if validated is string {
            return badRequest(validated);
        }
        final readonly & RegisterDocument document = validated.cloneReadOnly();
        final readonly & byte[] pdfBytes = pdf.cloneReadOnly();
        final boolean replace = replaceFlag == true;

        string? conflictMessage = ();
        error? saveError = ();
        lock {
            storeWrites += 1;
            RegisterDocument?|error existing = findDocument(document.documentId);
            if existing is error {
                saveError = existing;
            } else if existing is RegisterDocument && !replace {
                conflictMessage = string `Policy ${document.documentId} already exists; set "replace": true to replace it`;
            } else {
                saveError = savePolicy(document, pdfBytes);
            }
        }
        if conflictMessage is string {
            return <http:Conflict>{body: <ErrorBody>{message: conflictMessage}};
        }
        if saveError is error {
            return internalError("Cannot save the policy", saveError);
        }
        log:printInfo("Policy uploaded", documentId = document.documentId, replaced = replace);

        if searchConfigured() {
            _ = ingestDocument(document, true);
        }
        IndexState|error state = readIndexState();
        return <http:Created>{
            headers: {"Location": string `/policies/${document.documentId}`},
            body: toPolicyEntry(document, state is error ? {} : state)
        };
    }
}
