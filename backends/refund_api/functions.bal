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
import ballerina/time;
import ballerina/url;
import ballerina/uuid;

// In-memory store: enough for a demo, lost on restart.
isolated map<RefundCase> cases = {};
// Guest share token -> case id.
isolated map<string> shareTokens = {};
isolated int caseSequence = 0;

function fetchReservation(string reservationId) returns Reservation|NotFoundError|error {
    http:Response response = check guestApi->get(string `/reservations/${check encode(reservationId)}`);
    if response.statusCode == http:STATUS_NOT_FOUND {
        return error NotFoundError(string `Reservation ${reservationId} was not found`);
    }
    if response.statusCode >= 300 {
        return error(string `Guest API answered ${response.statusCode}`);
    }
    json payload = check response.getJsonPayload();
    return payload.cloneWithType();
}

function fetchApplicablePolicies(Reservation reservation) returns ApplicablePolicy[]|error {
    string path = check withQuery("/policies/applicable", {
        region: reservation.hotel.region,
        countryCode: reservation.hotel.countryCode,
        hotelId: reservation.hotel.hotelId,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut
    });
    ApplicablePolicy[]|error policies = policyService->get(path);
    if policies is error {
        return error(string `Policy service failed: ${policies.message()}`, policies);
    }
    return policies;
}

function invokeAgent(string caseId, string reservationId, string complaint) returns RefundProposal|error {
    string separator = agentInvocationsPath.includes("?") ? "&" : "?";
    string sessionId = agentSessionId == "" ? caseId : agentSessionId;
    string path = string `${agentInvocationsPath}${separator}agent_session_id=${check encode(sessionId)}`;
    string? token = agentAccessToken;
    map<string> headers = token is string && token != "" ? {Authorization: string `Bearer ${token}`} : {};
    AgentInvocation body = {reservationId, complaint, requestDate: today()};
    RefundProposal|error proposal = agentClient->post(path, body, headers);
    if proposal is error {
        log:printError("Refund agent invocation failed", proposal, caseId = caseId);
        return error(string `Refund agent failed: ${proposal.message()}`, proposal);
    }
    return proposal;
}

// Copies a guest API JSON response (status and body) back to the caller.
function proxyGuestApi(string path) returns http:Response|http:BadGateway {
    http:Response|error upstream = guestApi->get(path);
    if upstream is error {
        return badGateway(string `Guest API unavailable: ${upstream.message()}`);
    }
    http:Response response = new;
    response.statusCode = upstream.statusCode;
    json|error body = upstream.getJsonPayload();
    response.setJsonPayload(body is json ? body : {message: string `Guest API answered ${upstream.statusCode}`});
    return response;
}

// Stands in for the payment and loyalty systems. Replace with real connector calls.
function issueRefund(RefundCase refundCase) returns string {
    string refundId = string `RF-${uuid:createType4AsString().substring(0, 8).toUpperAscii()}`;
    RefundProposal proposal = refundCase.proposal;
    log:printInfo("Refund issued", refundId = refundId, caseNumber = refundCase.caseNumber,
            reservationId = proposal.reservationId, amount = proposal.refundAmount, currency = proposal.currency,
            bonusPoints = proposal.bonusPoints);
    return refundId;
}

function createGuestShare(RefundCase refundCase, string[] requested, GuestMessageOverride? override)
        returns GuestShare {
    string token = re `-`.replaceAll(uuid:createType4AsString(), "");
    string[] policyIds = from ApplicablePolicy policy in refundCase.applicablePolicies
        where requested.indexOf(policy.documentId) !is ()
        select policy.documentId;
    GuestMessage proposed = refundCase.proposal.guestMessage;
    GuestMessage message = override is () ? proposed
        : {language: proposed.language, subject: override.subject, body: override.body};
    return {
        token,
        url: string `${portalUrl}/guest.html?token=${token}`,
        sharedAt: now(),
        policyIds,
        message
    };
}

function caseForToken(string token) returns RefundCase? {
    string? id;
    lock {
        id = shareTokens[token];
    }
    if id is () {
        return ();
    }
    lock {
        return cases[id].clone();
    }
}

isolated function nextCaseNumber() returns string {
    int sequence;
    lock {
        caseSequence += 1;
        sequence = caseSequence;
    }
    string digits = sequence.toString();
    string padded = digits.length() >= 4 ? digits : "0000".substring(digits.length()) + digits;
    return string `RC-${time:utcToCivil(time:utcNow()).year}-${padded}`;
}

isolated function levelRank(ApprovalLevel level) returns int {
    match level {
        "REPRESENTATIVE" => {
            return 1;
        }
        "DUTY_MANAGER" => {
            return 2;
        }
    }
    return 3;
}

isolated function levelLabel(ApprovalLevel level) returns string {
    match level {
        "REPRESENTATIVE" => {
            return "representative";
        }
        "DUTY_MANAGER" => {
            return "duty manager";
        }
    }
    return "regional director";
}

isolated function withQuery(string path, map<string?> params) returns string|error {
    string[] pairs = [];
    foreach [string, string?] [name, value] in params.entries() {
        if value is string && value != "" {
            pairs.push(string `${name}=${check encode(value)}`);
        }
    }
    return pairs.length() == 0 ? path : string `${path}?${string:'join("&", ...pairs)}`;
}

isolated function encode(string value) returns string|error => url:encode(value, "UTF-8");

isolated function now() returns string => time:utcToString(time:utcNow());

isolated function today() returns string => now().substring(0, 10);

isolated function notFound(string message) returns http:NotFound => {body: <ErrorBody>{message}};

isolated function conflictError(string message) returns http:Conflict => {body: <ErrorBody>{message}};

isolated function badGateway(string message) returns http:BadGateway => {body: <ErrorBody>{message}};
