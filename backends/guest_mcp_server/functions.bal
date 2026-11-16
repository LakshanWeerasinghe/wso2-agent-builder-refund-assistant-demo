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

// Empty query parameters (as sent by the portal for "all") mean no filter.
isolated function normalise(string? value) returns string? {
    if value is () {
        return ();
    }
    string trimmed = value.trim();
    return trimmed == "" ? () : trimmed.toUpperAscii();
}

isolated function notFound(string message) returns http:NotFound => {body: <ErrorBody>{message}};

// Flag emoji from the two regional indicator symbols of an ISO country code.
isolated function flag(string countryCode) returns string {
    int[] codePoints = from int cp in countryCode.toUpperAscii().toCodePointInts()
        select cp - 65 + 0x1F1E6;
    string|error emoji = string:fromCodePointInts(codePoints);
    return emoji is string ? emoji : "";
}

// One overnight load-shedding slot at Cape Town Waterfront, 22:00 to 02:30 the next day.
isolated function loadShedding(string incidentId, string night, string nextDay) returns readonly & Incident => {
    incidentId,
    date: night,
    category: "POWER",
    cause: "EXTERNAL_GRID",
    description: CPT_LOAD_SHEDDING,
    startedAt: night + "T22:00",
    endedAt: nextDay + "T02:30",
    durationHours: 4.5,
    reportedByGuest: true,
    guestMoved: false,
    verifiedBy: MAINTENANCE_LOG
};
