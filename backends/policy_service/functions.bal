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
import ballerina/crypto;
import ballerina/data.jsondata;
import ballerina/file;
import ballerina/http;
import ballerina/io;
import ballerina/lang.regexp;
import ballerina/log;
import ballerina/time;
import ballerinax/ai.azure;

const REGISTER_FILE = "register.json";
const INDEX_STATE_FILE = ".index-state.json";

final readonly & string[] NULLABLE_FIELDS = ["region", "countryCode", "hotelId", "effectiveTo"];
final readonly & string[] REGISTER_FIELDS = ["documentId", "title", "titleEnglish", "summary", "version", "language", "scope",
    "region", "countryCode", "hotelId", "policyType", "effectiveFrom", "effectiveTo", "clausePrefix", "owner", "file"];

final regexp:RegExp DOCUMENT_ID_PATTERN = re `[A-Z0-9-]{3,48}`;
final regexp:RegExp DATE_PATTERN = re `\d{4}-\d{2}-\d{2}`;
final regexp:RegExp COUNTRY_CODE_PATTERN = re `[A-Z]{2}`;
final regexp:RegExp CLAUSE_PREFIX_PATTERN = re `[A-Z]{2,4}`;
final regexp:RegExp VERSION_PATTERN = re `\d+(\.\d+)*`;

// Serialises every write to register.json and .index-state.json (and the index updates that go with them).
isolated int storeWrites = 0;

isolated function policyPath(string relativePath) returns string|error => file:joinPath(policiesDir, relativePath);

// --- Register ---

isolated function readRegisterJson() returns map<json>|error {
    string path = check policyPath(REGISTER_FILE);
    if !check file:test(path, file:EXISTS) {
        return {documents: []};
    }
    json content = check io:fileReadJson(path);
    return content.ensureType();
}

isolated function loadRegister() returns RegisterDocument[]|error {
    map<json> register = check readRegisterJson();
    json[] documents = check (register["documents"] ?: []).ensureType();
    RegisterDocument[] result = [];
    foreach json document in documents {
        map<json> fields = check document.ensureType();
        map<json> known = {};
        foreach string name in REGISTER_FIELDS {
            json value = fields[name];
            if value is () && NULLABLE_FIELDS.indexOf(name) is () {
                if name == "summary" || name == "owner" {
                    value = "";
                } else {
                    return error(string `Register entry ${fields["documentId"].toString()} has no '${name}'`);
                }
            }
            known[name] = value;
        }
        RegisterDocument parsed = check known.cloneWithType();
        result.push(parsed);
    }
    return result;
}

isolated function findDocument(string documentId) returns RegisterDocument|error? {
    foreach RegisterDocument document in check loadRegister() {
        if document.documentId == documentId {
            return document;
        }
    }
    return ();
}

// Adds a document to register.json, or replaces the entry with the same id in place. Call inside `lock`.
isolated function upsertRegisterDocument(RegisterDocument document) returns error? {
    map<json> register = check readRegisterJson();
    json[] documents = check (register["documents"] ?: []).ensureType();
    map<json> entry = {};
    foreach string name in REGISTER_FIELDS {
        entry[name] = document.get(name).toJson();
    }
    int? existing = ();
    foreach int i in 0 ..< documents.length() {
        json candidate = documents[i];
        if candidate is map<json> && candidate["documentId"] == document.documentId {
            existing = i;
        }
    }
    if existing is int {
        documents[existing] = entry;
    } else {
        documents.push(entry);
    }
    register["documents"] = documents;
    check io:fileWriteString(check policyPath(REGISTER_FILE), jsondata:prettify(register, 2) + "\n");
}

// Writes the PDF, then the register entry. Call inside `lock`.
isolated function savePolicy(RegisterDocument document, byte[] pdf) returns error? {
    string path = check policyPath(document.file);
    string folder = check file:parentPath(path);
    if !check file:test(folder, file:EXISTS) {
        check file:createDir(folder, file:RECURSIVE);
    }
    check io:fileWriteBytes(path, pdf);
    check upsertRegisterDocument(document);
}

// --- Ingestion state ---

isolated function readIndexState() returns IndexState|error {
    string path = check policyPath(INDEX_STATE_FILE);
    if !check file:test(path, file:EXISTS) {
        return {};
    }
    json content = check io:fileReadJson(path);
    return content.cloneWithType();
}

// Call inside `lock`.
isolated function writeIndexStateEntry(string documentId, IndexStateEntry entry) returns error? {
    IndexState state = check readIndexState();
    state[documentId] = entry;
    check io:fileWriteString(check policyPath(INDEX_STATE_FILE), jsondata:prettify(state.toJson(), 2) + "\n");
}

isolated function sha256Hex(byte[] content) returns string => crypto:hashSha256(content).toBase16();

isolated function readPdf(RegisterDocument document) returns byte[]|error =>
    io:fileReadBytes(check policyPath(document.file));

isolated function ingestionInfo(RegisterDocument document, IndexState state) returns IngestionInfo {
    IndexStateEntry? entry = state[document.documentId];
    if entry is () {
        return {status: "NOT_INDEXED"};
    }
    if entry.status == "FAILED" {
        return {status: "FAILED", indexedAt: entry.indexedAt, 'error: entry.'error ?: "Ingestion failed"};
    }
    byte[]|error pdf = readPdf(document);
    boolean stale = pdf is error || sha256Hex(pdf) != entry.sha256;
    return {status: stale ? "STALE" : "INDEXED", chunkCount: entry.chunkCount, indexedAt: entry.indexedAt};
}

isolated function sortEntries(PolicyEntry[] entries) returns PolicyEntry[] =>
    from PolicyEntry entry in entries
    order by scopeRank(entry.scope) ascending, entry.documentId ascending
    select entry;

// --- Reference data lookups ---

isolated function scopeRank(Scope scope) returns int => SCOPE_RANKS[scope] ?: 0;

isolated function regionName(string? region) returns string => region is string ? REGION_NAMES[region] ?: region : "";

// --- Applicable policies ---

isolated function precedenceOf(RegisterDocument document) returns int =>
    scopeRank(document.scope) * 2 + (document.policyType == "SEASONAL" ? 1 : 0);

isolated function scopeMatches(RegisterDocument document, string? region, string? countryCode, string? hotelId)
        returns boolean {
    match document.scope {
        "GLOBAL" => {
            return true;
        }
        "REGION" => {
            return region is string && document.region == region;
        }
        "COUNTRY" => {
            return countryCode is string && document.countryCode == countryCode;
        }
        _ => {
            return hotelId is string && document.hotelId == hotelId;
        }
    }
}

// The window overlaps the stay nights: effectiveFrom <= checkOut - 1 day (i.e. < checkOut) and effectiveTo >= checkIn.
isolated function windowMatches(RegisterDocument document, string? checkIn, string? checkOut) returns boolean {
    if checkOut is string && document.effectiveFrom >= checkOut {
        return false;
    }
    string? effectiveTo = document.effectiveTo;
    if checkIn is string && effectiveTo is string && effectiveTo < checkIn {
        return false;
    }
    return true;
}

isolated function applicablePolicies(RegisterDocument[] register, IndexState state, string? region,
        string? countryCode, string? hotelId, string? checkIn, string? checkOut) returns ApplicablePolicy[] {
    // A hotel implies its country and a country its region.
    string? country = countryCode ?: (hotelId is string ? HOTEL_COUNTRIES[hotelId] : ());
    string? regionCode = region ?: (country is string ? COUNTRY_REGIONS[country] : ());
    ApplicablePolicy[] result = from RegisterDocument document in register
        where scopeMatches(document, regionCode, country, hotelId) && windowMatches(document, checkIn, checkOut)
        let int precedence = precedenceOf(document)
        order by precedence descending, document.documentId ascending
        select toApplicablePolicy(document, state);
    return result;
}

// --- Validation ---

isolated function isValidDate(string value) returns boolean {
    if !DATE_PATTERN.isFullMatch(value) {
        return false;
    }
    int|error year = int:fromString(value.substring(0, 4));
    int|error month = int:fromString(value.substring(5, 7));
    int|error day = int:fromString(value.substring(8, 10));
    if year is error || month is error || day is error {
        return false;
    }
    return time:dateValidate({year, month, day}) is ();
}

// Blank strings count as absent.
isolated function optionalString(map<json> fields, string name) returns string|error? {
    json value = fields[name];
    if value is () {
        return ();
    }
    if value !is string {
        return error(string `'${name}' must be a string`);
    }
    string trimmed = value.trim();
    return trimmed == "" ? () : trimmed;
}

// Validates upload metadata and returns the register document to store, or an error message.
isolated function validateMetadata(map<json> fields) returns RegisterDocument|string {
    map<string?> values = {};
    foreach string name in REGISTER_FIELDS {
        if name == "file" {
            continue;
        }
        string|error? value = optionalString(fields, name);
        if value is error {
            return value.message();
        }
        values[name] = value;
    }
    foreach string name in ["documentId", "title", "titleEnglish", "summary", "version", "language", "scope",
            "policyType", "effectiveFrom", "clausePrefix", "owner"] {
        if values[name] is () {
            return string `'${name}' is required`;
        }
    }
    string documentId = <string>values["documentId"];
    if !DOCUMENT_ID_PATTERN.isFullMatch(documentId) {
        return "'documentId' must match ^[A-Z0-9-]{3,48}$";
    }
    string language = <string>values["language"];
    if SUPPORTED_LANGUAGES.indexOf(language) is () {
        return string `'language' must be one of ${string:'join(", ", ...SUPPORTED_LANGUAGES)}`;
    }
    string version = <string>values["version"];
    if !VERSION_PATTERN.isFullMatch(version) {
        return "'version' must look like 1.0";
    }
    string clausePrefix = <string>values["clausePrefix"];
    if !CLAUSE_PREFIX_PATTERN.isFullMatch(clausePrefix) {
        return "'clausePrefix' must be 2 to 4 capital letters";
    }
    string scopeValue = <string>values["scope"];
    if scopeValue !is Scope {
        return "'scope' must be GLOBAL, REGION, COUNTRY or HOTEL";
    }
    Scope scope = scopeValue;
    string policyTypeValue = <string>values["policyType"];
    if policyTypeValue !is PolicyType {
        return "'policyType' must be BASE or SEASONAL";
    }
    PolicyType policyType = policyTypeValue;

    string effectiveFrom = <string>values["effectiveFrom"];
    string? effectiveTo = values["effectiveTo"];
    if !isValidDate(effectiveFrom) {
        return "'effectiveFrom' must be a valid YYYY-MM-DD date";
    }
    if effectiveTo is string {
        if !isValidDate(effectiveTo) {
            return "'effectiveTo' must be a valid YYYY-MM-DD date";
        }
        if effectiveTo < effectiveFrom {
            return "'effectiveTo' must not be before 'effectiveFrom'";
        }
    } else if policyType == "SEASONAL" {
        return "A SEASONAL policy needs 'effectiveTo'";
    }

    string? region = values["region"];
    string? countryCode = values["countryCode"];
    string? hotelId = values["hotelId"];
    string? scopeError = validateScope(scope, region, countryCode, hotelId);
    if scopeError is string {
        return scopeError;
    }
    return {
        documentId,
        title: <string>values["title"],
        titleEnglish: <string>values["titleEnglish"],
        summary: <string>values["summary"],
        version,
        language,
        scope,
        region,
        countryCode,
        hotelId,
        policyType,
        effectiveFrom,
        effectiveTo,
        clausePrefix,
        owner: <string>values["owner"],
        file: string `pdf/${documentId}.pdf`
    };
}

isolated function validateScope(Scope scope, string? region, string? countryCode, string? hotelId) returns string? {
    if scope == "GLOBAL" {
        return region is () && countryCode is () && hotelId is () ? ()
            : "A GLOBAL policy must not set region, countryCode or hotelId";
    }
    if region is () || !REGION_NAMES.hasKey(region) {
        return "'region' must be EUROPE, AFRICA, AMERICAS or ASIA_PACIFIC";
    }
    if scope == "REGION" {
        return countryCode is () && hotelId is () ? () : "A REGION policy must not set countryCode or hotelId";
    }
    if countryCode is () || !COUNTRY_CODE_PATTERN.isFullMatch(countryCode) || !COUNTRY_REGIONS.hasKey(countryCode) {
        return "'countryCode' must be a country of the hotel network";
    }
    if COUNTRY_REGIONS[countryCode] != region {
        return string `Country ${countryCode} is not in region ${region}`;
    }
    if scope == "COUNTRY" {
        return hotelId is () ? () : "A COUNTRY policy must not set hotelId";
    }
    if hotelId is () || !HOTEL_COUNTRIES.hasKey(hotelId) {
        return "'hotelId' must be a hotel of the network";
    }
    if HOTEL_COUNTRIES[hotelId] != countryCode {
        return string `Hotel ${hotelId} is not in country ${countryCode}`;
    }
    return ();
}

// RAG ingestion pipeline: PDF -> text -> paragraphs -> clause-aware chunks -> Azure AI Search.

const FRONT_MATTER_SECTION = "Document information";
// Azure AI Search returns at most 50 hits when `top` is not set, so `deleteByFilter` removes at most 50 per call.
const DELETE_BATCH_SIZE = 50;
// Upper bound of old chunks to delete when the state file has no record of the document.
const UNKNOWN_CHUNK_COUNT = 200;

final regexp:RegExp CLAUSE_ID_PATTERN = re `^([A-Z]{2,4})-(\d+)\.(\d+)`;
final regexp:RegExp HEADING_PATTERN = re `^(\d{1,2})\.\s`;
final regexp:RegExp PAGE_NUMBER_PATTERN = re `Page \d+ of \d+`;
final regexp:RegExp LINE_BREAK = re `\r?\n`;
final regexp:RegExp SPACES = re `[ \t\u{00A0}]+`;

// --- 1. Load ---

isolated function loadPdfText(string path) returns string|error {
    ai:TextDataLoader loader = check new (path);
    ai:Document|ai:Document[] loaded = check loader.load();
    ai:Document document = loaded is ai:Document[] ? loaded[0] : loaded;
    return document.content.ensureType();
}

// --- 2. Normalise ---

isolated function isCjk(string:Char? c) returns boolean {
    if c is () {
        return false;
    }
    int cp = c.toCodePointInt();
    return (cp >= 0x3000 && cp <= 0x30FF) || (cp >= 0x3400 && cp <= 0x4DBF) || (cp >= 0x4E00 && cp <= 0x9FFF)
        || (cp >= 0xF900 && cp <= 0xFAFF) || (cp >= 0xFF00 && cp <= 0xFFEF);
}

isolated function firstChar(string s) returns string:Char? => s.length() == 0 ? () : s[0];

isolated function lastChar(string s) returns string:Char? => s.length() == 0 ? () : s[s.length() - 1];

isolated function endsSentence(string paragraph) returns boolean {
    string text = paragraph;
    // Look through closing quotes and brackets: `policy.”`, `とする。」`.
    while text.length() > 1 && ["”", "\"", "’", "」", "』"].indexOf(lastChar(text) ?: "") !is () {
        text = text.substring(0, text.length() - 1);
    }
    string:Char? last = lastChar(text);
    return last is string:Char && [".", "。", ":", "：", ";", "；", "!", "！", "?", "？", ")", "）"].indexOf(last) !is ();
}

// Section number of a line that looks like a heading ("2. Policy hierarchy").
isolated function headingNumber(string line) returns int? {
    regexp:Groups? groups = HEADING_PATTERN.findGroups(line);
    regexp:Span? number = groups is () ? () : groups[1];
    if number is () {
        return ();
    }
    int|error value = int:fromString(number.substring());
    return value is int ? value : ();
}

isolated function isBullet(string line) returns boolean =>
    line.startsWith("•") || line.startsWith("-") || line.startsWith("・");

// [prefix, section, number] of a clause id at the start of the line.
isolated function clauseIdAt(string line) returns [string, string, int, int]? {
    regexp:Groups? groups = CLAUSE_ID_PATTERN.findGroups(line);
    if groups is () {
        return ();
    }
    regexp:Span? whole = groups[0];
    regexp:Span? prefix = groups[1];
    regexp:Span? section = groups[2];
    regexp:Span? number = groups[3];
    if whole is () || prefix is () || section is () || number is () {
        return ();
    }
    int|error sectionNo = int:fromString(section.substring());
    int|error clauseNo = int:fromString(number.substring());
    if sectionNo is error || clauseNo is error {
        return ();
    }
    return [whole.substring(), prefix.substring(), sectionNo, clauseNo];
}

// Letter-spaced capitals (the letterhead) come out as "H O T E L S  &  R E S O R T S": single spaces between
// letters, double spaces between words.
isolated function closeLetterSpacing(string line) returns string {
    string[] closed = [];
    foreach string word in re ` {2,}`.split(line.trim()) {
        string[] letters = re ` `.split(word);
        int single = letters.filter(letter => letter.length() == 1).length();
        closed.push(letters.length() >= 3 && single * 10 >= letters.length() * 6 ? string:'join("", ...letters) : word);
    }
    return string:'join(" ", ...closed);
}

// Drops running footers and page numbers, then unwraps PDF line breaks into paragraphs.
// Wrapped lines can start with a number ("… 31 December" / "2026. It applies …") or a clause reference
// ("… as set out in" / "GLB-5.1 …"), so headings and clause ids only count when they continue the
// document's own numbering.
isolated function normaliseText(string raw, string documentId, string clausePrefix) returns Paragraph[] {
    string footerPrefix = documentId + " · ";
    Paragraph[] paragraphs = [];
    int lastHeading = 0;
    // Highest own clause id seen so far, as [section, number].
    [int, int] lastClause = [0, 0];
    foreach string rawLine in LINE_BREAK.split(raw) {
        string line = SPACES.replaceAll(closeLetterSpacing(rawLine), " ").trim();
        // Footer and page counter can come out on one line, in either order.
        string withoutPage = PAGE_NUMBER_PATTERN.replaceAll(line, "").trim();
        if withoutPage == "" || withoutPage.startsWith(footerPrefix) {
            continue;
        }
        int count = paragraphs.length();
        Paragraph? previous = count == 0 ? () : paragraphs[count - 1];
        boolean previousEnded = previous is () || previous.kind == "HEADING" || endsSentence(previous.text);

        int? heading = headingNumber(line);
        if heading is int && heading > lastHeading && (previousEnded || heading == lastHeading + 1) {
            paragraphs.push({kind: "HEADING", text: line});
            lastHeading = heading;
            continue;
        }
        [string, string, int, int]? clause = clauseIdAt(line);
        if clause is [string, string, int, int] && clause[1] == clausePrefix
                && (clause[2] > lastClause[0] || (clause[2] == lastClause[0] && clause[3] > lastClause[1])) {
            paragraphs.push({kind: "CLAUSE", text: line});
            lastClause = [clause[2], clause[3]];
            continue;
        }
        if previous is () || previousEnded || isBullet(line) {
            paragraphs.push({kind: "TEXT", text: line});
            continue;
        }
        string text = previous.text;
        string separator = " ";
        if isCjk(lastChar(text)) || isCjk(firstChar(line)) {
            separator = "";
        } else if text.endsWith("-") && text.length() > 1 && text[text.length() - 2] != " " {
            // Chrome wraps after the hyphen of a compound ("duty-" / "manager").
            separator = "";
        }
        previous.text = text + separator + line;
    }
    return paragraphs;
}

// --- 3. Structure-aware chunking ---

isolated function toUnits(Paragraph[] paragraphs) returns Unit[] {
    Unit[] units = [];
    string section = FRONT_MATTER_SECTION;
    foreach Paragraph paragraph in paragraphs {
        if paragraph.kind == "HEADING" {
            section = paragraph.text;
            continue;
        }
        if paragraph.kind == "CLAUSE" {
            [string, string, int, int]? clause = clauseIdAt(paragraph.text);
            units.push({section, clauseId: clause is () ? () : clause[0], text: paragraph.text});
            continue;
        }
        int count = units.length();
        if count > 0 && units[count - 1].clauseId is string && units[count - 1].section == section {
            // Lists, definitions and lines broken right after a full stop belong to the clause above them.
            units[count - 1].text += "\n" + paragraph.text;
            continue;
        }
        units.push({section, clauseId: (), text: paragraph.text});
    }
    return units;
}

isolated function splitOversized(string text) returns string[]|error {
    // OpenNLP's sentence detector does not know "。"; split Japanese on it as lines instead.
    boolean cjk = false;
    foreach string:Char c in text {
        if isCjk(c) {
            cjk = true;
            break;
        }
    }
    ai:Chunk[] pieces = cjk
        ? check ai:chunkDocumentRecursively(re `。`.replaceAll(text, "。\n"), maxChunkChars, chunkOverlapChars, ai:LINE)
        : check ai:chunkDocumentRecursively(text, maxChunkChars, chunkOverlapChars, ai:SENTENCE);
    return from ai:Chunk piece in pieces
        let string content = check piece.content.ensureType()
        select cjk ? re `。\n`.replaceAll(content, "。") : content;
}

// [section, clauseIds, text] per chunk, before the context header is added.
isolated function packUnits(Unit[] units) returns [string, string[], string][]|error {
    [string, string[], string][] chunks = [];
    string section = "";
    string[] clauseIds = [];
    string[] texts = [];
    int length = 0;

    foreach Unit unit in units {
        int separatorLength = texts.length() == 0 ? 0 : 2;
        boolean fits = unit.section == section && length + separatorLength + unit.text.length() <= maxChunkChars;
        if !fits && texts.length() > 0 {
            chunks.push([section, clauseIds, string:'join("\n\n", ...texts)]);
            clauseIds = [];
            texts = [];
            length = 0;
        }
        section = unit.section;
        string? clauseId = unit.clauseId;
        if unit.text.length() > maxChunkChars {
            foreach string piece in check splitOversized(unit.text) {
                string[] pieceClauseIds = (clauseId is string) ? [clauseId] : [];
                chunks.push([section, pieceClauseIds, piece]);
            }
            continue;
        }
        if clauseId is string {
            clauseIds.push(clauseId);
        }
        length += (texts.length() == 0 ? 0 : 2) + unit.text.length();
        texts.push(unit.text);
    }
    if texts.length() > 0 {
        chunks.push([section, clauseIds, string:'join("\n\n", ...texts)]);
    }
    return chunks;
}

// --- 4. Context header ---

isolated function scopeLabel(RegisterDocument document) returns string {
    string region = regionName(document.region);
    match document.scope {
        "GLOBAL" => {
            return "Global";
        }
        "REGION" => {
            return string `Region: ${region}`;
        }
        "COUNTRY" => {
            return string `Country: ${document.countryCode ?: ""} (${region})`;
        }
        _ => {
            return string `Hotel: ${document.hotelId ?: ""} (${document.countryCode ?: ""}, ${region})`;
        }
    }
}

isolated function contextHeader(RegisterDocument document, string section) returns string =>
    string `[${document.documentId} v${document.version} | ${document.titleEnglish} | ${scopeLabel(document)} | ${
        document.policyType} ${document.effectiveFrom} to ${document.effectiveTo ?: "open"} | Language: ${
        document.language} | Section: ${section}]`;

// Runs steps 1-4 for one document (no Azure needed).
isolated function buildChunks(RegisterDocument document) returns PolicyChunk[]|error {
    string text = check loadPdfText(check policyPath(document.file));
    Paragraph[] paragraphs = normaliseText(text, document.documentId, document.clausePrefix);
    [string, string[], string][] packed = check packUnits(toUnits(paragraphs));
    return from [string, string[], string] [section, clauseIds, body] in packed
        select {section, clauseIds, content: contextHeader(document, section) + "\n\n" + body};
}

isolated function previewChunks(RegisterDocument document) returns ChunkPreview[]|error {
    PolicyChunk[] chunks = check buildChunks(document);
    return from int i in 0 ..< chunks.length()
        select toChunkPreview(document.documentId, i, chunks[i]);
}

// --- 5. Metadata: see toTextChunk in data_mappings.bal ---

// --- 6. Ingest ---

isolated function searchConfigured() returns boolean =>
    searchServiceUrl != "" && searchAdminKey != "" && openAiServiceUrl != "" && openAiApiKey != ""
        && embeddingDeploymentId != "";

// Deletes chunk keys {documentId}_0 .. {documentId}_{count - 1} in batches that each fit one search page.
isolated function deleteDocumentChunks(azure:AiSearchKnowledgeBase kb, string documentId, int count) returns error? {
    int batchStart = 0;
    while batchStart < count {
        string[] keys = from int i in batchStart ..< int:min(batchStart + DELETE_BATCH_SIZE, count)
            select string `${documentId}_${i}`;
        check kb.deleteByFilter({
            filters: [
                {key: "documentId", operator: ai:EQUAL, value: documentId},
                {key: "chunkKey", operator: ai:IN, value: keys}
            ]
        });
        batchStart += DELETE_BATCH_SIZE;
    }
}

isolated function errorText(error err) returns string {
    string text = err.message();
    error? cause = err.cause();
    while cause is error {
        text += ": " + cause.message();
        cause = cause.cause();
    }
    return text;
}

isolated function ingestDocument(RegisterDocument document, boolean force) returns IngestResult {
    final readonly & RegisterDocument doc = document.cloneReadOnly();
    final string documentId = doc.documentId;
    IndexState|error state = readIndexState();
    if state is error {
        return recordFailure(documentId, "", UNKNOWN_CHUNK_COUNT,
            "Cannot read the index state: " + errorText(state));
    }
    IndexStateEntry? previous = state[documentId];
    final int previousCount = previous is IndexStateEntry ? previous.chunkCount : UNKNOWN_CHUNK_COUNT;
    byte[]|error pdf = readPdf(doc);
    if pdf is error {
        return recordFailure(documentId, "", previousCount, "Cannot read the PDF: " + errorText(pdf));
    }
    final string sha256 = sha256Hex(pdf);
    if !force && previous is IndexStateEntry && previous.status == "INDEXED" && previous.sha256 == sha256 {
        return {documentId, status: "SKIPPED", chunkCount: previous.chunkCount};
    }

    PolicyChunk[]|error chunks = buildChunks(doc);
    if chunks is error {
        return recordFailure(documentId, sha256, previousCount, "Pipeline failed: " + errorText(chunks));
    }
    if chunks.length() == 0 {
        return recordFailure(documentId, sha256, previousCount, "No text could be extracted from the PDF");
    }
    ai:TextChunk[] textChunks = [];
    foreach PolicyChunk chunk in chunks {
        ai:TextChunk|error textChunk = toTextChunk(doc, chunk);
        if textChunk is error {
            return recordFailure(documentId, sha256, previousCount, errorText(textChunk));
        }
        textChunks.push(textChunk);
    }
    final readonly & ai:TextChunk[] readyChunks = textChunks.cloneReadOnly();

    azure:AiSearchKnowledgeBase|error kb = getKnowledgeBase();
    if kb is error {
        return recordFailure(documentId, sha256, previousCount, "Cannot open the knowledge base: " + errorText(kb));
    }
    final azure:AiSearchKnowledgeBase knowledgeBaseRef = kb;
    final int chunkCount = readyChunks.length();
    // Covers both the old chunks and the keys about to be rewritten, so no stale field survives a merge.
    final int deleteCount = int:max(previousCount, chunkCount);

    string? failure = ();
    lock {
        storeWrites += 1;
        error? result = deleteDocumentChunks(knowledgeBaseRef, documentId, deleteCount);
        if result is () {
            result = knowledgeBaseRef.ingest(readyChunks);
        }
        if result is error {
            failure = errorText(result);
        } else {
            error? written = writeIndexStateEntry(documentId,
                {sha256, chunkCount, indexedAt: time:utcToString(time:utcNow()), status: "INDEXED"});
            if written is error {
                failure = "Indexed, but the index state could not be saved: " + errorText(written);
            }
        }
    }
    if failure is string {
        // Some keys up to deleteCount may exist now; remember the bound for the next delete.
        return recordFailure(documentId, sha256, deleteCount, failure);
    }
    log:printInfo("Indexed policy document", documentId = documentId, chunks = chunkCount);
    return {documentId, status: "INDEXED", chunkCount};
}

isolated function recordFailure(string documentId, string sha256, int chunkCount, string message) returns IngestResult {
    log:printError("Policy ingestion failed", documentId = documentId, reason = message);
    lock {
        storeWrites += 1;
        error? written = writeIndexStateEntry(documentId, {
            sha256,
            chunkCount,
            indexedAt: time:utcToString(time:utcNow()),
            status: "FAILED",
            'error: message
        });
        if written is error {
            log:printError("Cannot save the index state", written);
        }
    }
    return {documentId, status: "FAILED", chunkCount: 0, 'error: message};
}

// --- HTTP responses ---

isolated function searchUnavailable() returns http:ServiceUnavailable? {
    if searchServiceUrl == "" || searchAdminKey == "" {
        return {body: <ErrorBody>{message: "Azure AI Search is not configured"}};
    }
    if !searchConfigured() {
        return {body: <ErrorBody>{message: "Azure OpenAI embeddings are not configured"}};
    }
    return ();
}

isolated function badRequest(string message) returns http:BadRequest => {body: <ErrorBody>{message}};

isolated function notFound(string id) returns http:NotFound => {body: <ErrorBody>{message: string `Unknown policy ${id}`}};

isolated function internalError(string message, error err) returns http:InternalServerError {
    log:printError(message, err);
    return {body: <ErrorBody>{message: string `${message}: ${errorText(err)}`}};
}
