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
import ballerina/http;
import ballerina/lang.regexp;
import ballerina/log;
import ballerina/time;
import ballerinax/ai.azure;

// Days from check-out to the request date, computed here so the 30-day rule never depends on model arithmetic.
isolated function daysSinceCheckOut(string reservationId, string requestDate) returns string {
    Reservation|error reservation = loadReservation(reservationId);
    if reservation is error {
        return "";
    }
    int|error days = daysBetween(reservation.checkOut, requestDate);
    return days is int ? string `
Days from check-out (${reservation.checkOut}) to the request date: ${days}` : "";
}

// Searches every assessment needs, whatever the complaint.
final readonly & string[] standingQueries = [
    "approval authority and thresholds for representatives, duty managers and regional directors",
    "Reverie Circle loyalty bonus points per affected night, tier amounts and cap per stay",
    "eligibility: request deadline after check-out, verified incidents, incidents not reported during the stay",
    "refund of taxes, tourist or city tax, resort fees and service charges"
];

final readonly & ScopeLevel[] levelOrder = ["HOTEL", "COUNTRY", "REGION", "GLOBAL"];

// Gathers, in code, the facts and policy passages the model needs, so that retrieval never depends on the model
// choosing to call the search tool: the reservation and incident log, the loyalty profile, the applicable
// documents, and per-level policy passages for each incident, the complaint and the standing questions.
isolated function assessmentContext(string reservationId, string complaint) returns string|error {
    json reservation = check guestApi->/reservations/[reservationId];
    json guest = check reservation.guest;
    string guestId = check guest.guestId;
    json|error loyalty = guestApi->/guests/[guestId]/loyalty;
    ApplicablePolicy[] applicable = check getApplicablePolicies(reservationId);

    string[] queries = [complaint];
    // One search per incident category: repeated incidents (three nights of noise) need the same clauses.
    map<boolean> categories = {};
    json incidents = check reservation.incidents;
    if incidents is json[] {
        foreach json incident in incidents {
            string category = check incident.category;
            if categories.hasKey(category) {
                continue;
            }
            categories[category] = true;
            string description = check incident.description;
            queries.push(string `${category}: ${description} compensation per affected night`);
        }
    }
    queries.push(...standingQueries);

    // Sequential on purpose: the knowledge base serialises retrievals internally, so concurrent calls only queue
    // and can time out.
    map<PolicyPassage[]> byLevel = {};
    map<boolean> seen = {};
    foreach string query in queries {
        PolicySearchResult result = check searchPolicies(reservationId, query);
        foreach ScopePassages level in result.levels {
            foreach PolicyPassage passage in level.passages {
                string key = passage.documentId + "|" + passage.content;
                if seen.hasKey(key) {
                    continue;
                }
                seen[key] = true;
                PolicyPassage[] list = byLevel[level.level] ?: [];
                list.push(passage);
                byLevel[level.level] = list;
            }
        }
    }

    string[] parts = [
        "RESERVATION (system of record, JSON):",
        reservation.toJsonString(),
        "",
        check incidentNightsText(reservation),
        "",
        "LOYALTY PROFILE (JSON):",
            loyalty is json ? loyalty.toJsonString() : "Not available.",
        "",
        "APPLICABLE POLICY DOCUMENTS (highest precedence first):"
    ];
    foreach ApplicablePolicy p in applicable {
        parts.push(string `- ${p.documentId} | ${p.level} | ${p.titleEnglish} | language ${p.language} | ${
            p.window} | precedence ${p.precedence}`);
    }
    parts.push("", "POLICY PASSAGES retrieved for this stay, grouped by level, most specific first. Each passage " +
        "starts with a context header naming its document. Cite clause IDs exactly as they appear in the text " +
        "(for example GLB-5.1 or KYO-2.1), never document IDs.");
    int passageCount = 0;
    foreach ScopeLevel level in levelOrder {
        PolicyPassage[] passages = byLevel[level] ?: [];
        if passages.length() == 0 {
            continue;
        }
        parts.push("", string `### ${level}`);
        foreach PolicyPassage passage in passages {
            parts.push("", passage.content);
            passageCount += 1;
        }
    }
    log:printInfo("Assessment context", reservationId = reservationId, searches = queries.length(),
            passages = passageCount);
    return string:'join("\n", ...parts);
}

// Lists the stay nights and, for each incident, the nights it falls on, so that night attribution is computed
// rather than left to the model. An incident belongs to the night of the date it starts, and to every later night
// it is still in progress at midnight (GLB-3.1).
isolated function incidentNightsText(json reservation) returns string|error {
    string checkIn = check reservation.checkIn;
    string checkOut = check reservation.checkOut;
    string[] stayNights = [];
    string night = checkIn;
    while night < checkOut {
        stayNights.push(night);
        night = check addDays(night, 1);
    }
    string[] lines = [
        string `STAY NIGHTS (a night is named by the date it starts): ${string:'join(", ", ...stayNights)}`,
        "INCIDENT NIGHTS (computed from the incident log; use these nights, do not re-derive them):"
    ];
    json incidents = check reservation.incidents;
    if incidents !is json[] || incidents.length() == 0 {
        lines.push("- No incidents are recorded for this stay.");
        return string:'join("\n", ...lines);
    }
    foreach json incident in incidents {
        string id = check incident.incidentId;
        string category = check incident.category;
        string startedAt = check incident.startedAt;
        string endedAt = check incident.endedAt;
        string[] nights = check nightsOf(startedAt, endedAt, checkIn, checkOut);
        string onNights = nights.length() == 0 ? "no stay nights" : string `nights ${string:'join(", ", ...nights)}`;
        string[] days = check daysOf(startedAt, endedAt);
        lines.push(string `- ${id} ${category}, ${startedAt} to ${endedAt}: ${onNights}; days ${string:'join(", ", ...days)}`);
    }
    return string:'join("\n", ...lines);
}

isolated function nightsOf(string startedAt, string endedAt, string checkIn, string checkOut) returns string[]|error {
    time:Utc end = check time:utcFromString(endedAt + ":00Z");
    string[] nights = [];
    string night = startedAt.substring(0, 10);
    while true {
        if night >= checkIn && night < checkOut {
            nights.push(night);
        }
        string next = check addDays(night, 1);
        time:Utc nextMidnight = check time:utcFromString(next + "T23:59:00Z");
        if next >= checkOut || time:utcDiffSeconds(end, nextMidnight) <= 0d {
            return nights;
        }
        night = next;
    }
}

// Calendar days an incident touches, from the day it starts to the day it ends, for day-based items such as
// resort-fee waivers.
isolated function daysOf(string startedAt, string endedAt) returns string[]|error {
    string last = endedAt.substring(0, 10);
    string day = startedAt.substring(0, 10);
    string[] days = [day];
    while day < last {
        day = check addDays(day, 1);
        days.push(day);
    }
    return days;
}

# Lists the policy documents that apply to a reservation, highest precedence first: hotel rules, then
# country addenda, regional addenda and the global policies, with seasonal documents ranked above base
# documents of the same scope. Only documents whose effective window overlaps the stay are listed.
#
# + reservationId - The reservation ID, for example "RES-PAR-24117"
# + return - The applicable documents with their ID, original and English titles, language, level,
# policy type, effective window and precedence (higher is more specific)
@ai:AgentTool
isolated function getApplicablePolicies(string reservationId) returns ApplicablePolicy[]|error {
    Reservation reservation = check loadReservation(reservationId);
    ApplicablePolicyEntry[] entries = check policyService->/policies/applicable(
        region = reservation.hotel.region,
        countryCode = reservation.hotel.countryCode,
        hotelId = reservation.hotel.hotelId,
        checkIn = reservation.checkIn,
        checkOut = reservation.checkOut
    );
    ApplicablePolicy[] policies = from ApplicablePolicyEntry entry in entries
        order by entry.precedence descending
        select toApplicablePolicy(entry);
    log:printInfo("Applicable policies", reservationId = reservationId,
            documents = from ApplicablePolicy p in policies
                select p.documentId);
    return policies;
}

# Searches the policy documents that apply to a reservation. Runs one search per scope level (hotel,
# country, region, global), limited to the documents for the reservation's hotel, country and region
# whose effective window overlaps the stay, so local-language hotel and country rules are always
# returned next to the global ones. Search once per issue (for example "no hot water", "daytime
# construction noise", "approval thresholds", "loyalty points for affected nights", "city tax refund").
# Queries may be in English; passages are returned in their original language.
#
# + reservationId - The reservation ID, for example "RES-PAR-24117"
# + query - What to look for, for example "heating failure overnight compensation"
# + return - Passages grouped by scope level, most specific first; each passage starts with a header
# naming its document, version, scope, policy type, effective window, language and section
@ai:AgentTool
isolated function searchPolicies(string reservationId, string query) returns PolicySearchResult|error {
    Reservation reservation = check loadReservation(reservationId);
    string lastNight = check addDays(reservation.checkOut, -1);
    int checkInKey = check dateKey(reservation.checkIn);
    int lastNightKey = check dateKey(lastNight);

    [ScopeLevel, string, string?, string?][] scopes = [
        ["HOTEL", "Hotel " + reservation.hotel.hotelId, "hotelId", reservation.hotel.hotelId],
        ["COUNTRY", "Country " + reservation.hotel.countryCode, "countryCode", reservation.hotel.countryCode],
        ["REGION", "Region " + reservation.hotel.region, "region", reservation.hotel.region],
        ["GLOBAL", "Global", (), ()]
    ];

    azure:AiSearchKnowledgeBase kb = check knowledgeBase();
    ScopePassages[] levels = [];
    foreach [ScopeLevel, string, string?, string?] [level, label, filterKey, value] in scopes {
        (ai:MetadataFilter|ai:MetadataFilters)[] filters = [
            {key: "scope", value: level},
            {key: "effectiveFrom", operator: ai:LESS_THAN_OR_EQUAL, value: lastNightKey},
            {key: "effectiveTo", operator: ai:GREATER_THAN_OR_EQUAL, value: checkInKey}
        ];
        if filterKey is string && value is string {
            filters.push({key: filterKey, value});
        }
        ai:QueryMatch[] matches = check kb.retrieve(query, passagesPerScope, {filters});
        levels.push({level, scope: label, passages: from ai:QueryMatch m in matches
                select toPassage(m)});
    }
    log:printInfo("Policy search", reservationId = reservationId, query = query,
            passages = from ScopePassages l in levels
                select string `${l.level}:${l.passages.length()}`);
    return {query, stayNights: string `${reservation.checkIn} to ${lastNight}`, levels};
}

// Loads the reservation from the guest API so that scope always comes from the system of record.
isolated function loadReservation(string reservationId) returns Reservation|error {
    Reservation|http:ClientError reservation = guestApi->/reservations/[reservationId.trim()];
    if reservation is http:ClientRequestError {
        return error(string `Reservation ${reservationId} was not found.`);
    }
    return reservation;
}

final regexp:RegExp isoDate = re `\d{4}-\d{2}-\d{2}`;

// "2026-11-04" -> 20261104, the integer form used by the index's effectiveFrom/effectiveTo fields.
isolated function dateKey(string date) returns int|error {
    time:Civil civil = check toCivil(date);
    return civil.year * 10000 + civil.month * 100 + civil.day;
}

isolated function addDays(string date, int days) returns string|error {
    time:Utc utc = check time:utcFromString(date + "T00:00:00Z");
    return toIsoDate(time:utcToCivil(time:utcAddSeconds(utc, <decimal>(days * 86400))));
}

isolated function daysBetween(string fromDate, string toDate) returns int|error {
    time:Utc 'from = check time:utcFromString(fromDate + "T00:00:00Z");
    time:Utc to = check time:utcFromString(toDate + "T00:00:00Z");
    return <int>(time:utcDiffSeconds(to, 'from) / 86400d);
}

isolated function toCivil(string date) returns time:Civil|error =>
    time:utcToCivil(check time:utcFromString(date + "T00:00:00Z"));

isolated function toIsoDate(time:Civil civil) returns string =>
    string `${civil.year}-${pad2(civil.month)}-${pad2(civil.day)}`;

isolated function pad2(int value) returns string => value < 10 ? string `0${value}` : value.toString();
