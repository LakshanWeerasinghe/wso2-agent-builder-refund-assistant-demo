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
import ballerina/uuid;

@http:ServiceConfig {
    cors: {allowOrigins: ["*"], allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["Content-Type"]}
}
// An assessment waits for the agent (up to 180 s), longer than the default 60 s request timeout.
service / on new http:Listener(port, timeout = 240) {

    resource function get health() returns json {
        lock {
            return {status: "ok", cases: cases.length()};
        }
    }

    resource function get regions() returns http:Response|http:BadGateway {
        return proxyGuestApi("/regions");
    }

    resource function get hotels(string? region, string? countryCode) returns http:Response|http:BadGateway {
        string|error path = withQuery("/hotels", {region, countryCode});
        return path is string ? proxyGuestApi(path) : badGateway(path.message());
    }

    resource function get reservations/[string id]() returns http:Response|http:BadGateway {
        string|error encoded = encode(id);
        return encoded is string ? proxyGuestApi(string `/reservations/${encoded}`) : badGateway(encoded.message());
    }

    // A rep submits a guest's complaint; the agent assesses it and the case waits for a decision.
    resource function post refund\-requests(NewRefundRequest request)
            returns http:Created|http:BadRequest|http:NotFound|http:BadGateway {
        if request.reservationId.trim() == "" || request.complaint.trim() == "" {
            return <http:BadRequest>{body: <ErrorBody>{message: "reservationId and complaint are required"}};
        }
        string reservationId = request.reservationId.trim();
        Reservation|error reservation = fetchReservation(reservationId);
        if reservation is NotFoundError {
            return notFound(reservation.message());
        }
        if reservation is error {
            return badGateway(string `Guest API failed: ${reservation.message()}`);
        }
        ApplicablePolicy[]|error policies = fetchApplicablePolicies(reservation);
        if policies is error {
            return badGateway(policies.message());
        }

        string id = uuid:createType4AsString();
        RefundProposal|error proposal = invokeAgent(id, reservationId, request.complaint);
        if proposal is error {
            return badGateway(proposal.message());
        }

        string createdAt = now();
        RefundCase refundCase = {
            id,
            caseNumber: nextCaseNumber(),
            createdAt,
            updatedAt: createdAt,
            createdBy: request.createdBy,
            channel: request.channel,
            reservationId,
            complaint: request.complaint,
            reservation,
            status: "PENDING_APPROVAL",
            proposal,
            proposalHistory: [],
            applicablePolicies: policies
        };
        lock {
            cases[id] = refundCase.clone();
        }
        log:printInfo("Refund case created", caseNumber = refundCase.caseNumber, reservationId = reservationId,
                recommendation = proposal.decision, approvalLevel = proposal.approvalLevel);
        return <http:Created>{body: refundCase};
    }

    // Newest first.
    resource function get refund\-requests(string? region, string? countryCode, string? hotelId, string? status)
            returns RefundCase[] {
        RefundCase[] all;
        lock {
            all = cases.toArray().clone();
        }
        return from RefundCase c in all
            where (region is () || region == "" || c.reservation.hotel.region == region)
                && (countryCode is () || countryCode == "" || c.reservation.hotel.countryCode == countryCode)
                && (hotelId is () || hotelId == "" || c.reservation.hotel.hotelId == hotelId)
                && (status is () || status == "" || c.status == status)
            order by c.caseNumber descending
            select c;
    }

    resource function get refund\-requests/[string id]() returns RefundCase|http:NotFound {
        lock {
            RefundCase? refundCase = cases[id];
            return refundCase is () ? notFound(string `Case ${id} was not found`) : refundCase.clone();
        }
    }

    // Re-runs the agent with the latest policies; the previous proposal goes to the history.
    resource function post refund\-requests/[string id]/reassess()
            returns http:Ok|http:NotFound|http:Conflict|http:BadGateway {
        Reservation reservation;
        string complaint;
        lock {
            RefundCase? found = cases[id];
            if found is () {
                return notFound(string `Case ${id} was not found`);
            }
            if found.status != "PENDING_APPROVAL" {
                return conflictError(string `Case is already ${found.status}`);
            }
            reservation = found.reservation.clone();
            complaint = found.complaint;
        }

        ApplicablePolicy[]|error policies = fetchApplicablePolicies(reservation);
        if policies is error {
            return badGateway(policies.message());
        }
        RefundProposal|error proposal = invokeAgent(id, reservation.reservationId, complaint);
        if proposal is error {
            return badGateway(proposal.message());
        }

        lock {
            RefundCase? found = cases[id];
            if found is () {
                return notFound(string `Case ${id} was not found`);
            }
            if found.status != "PENDING_APPROVAL" {
                return conflictError(string `Case was decided while it was being re-assessed (${found.status})`);
            }
            // While a case is pending, only assessments update it, so updatedAt is when the current proposal was made.
            found.proposalHistory.push({assessedAt: found.updatedAt, proposal: found.proposal});
            found.proposal = proposal.clone();
            found.applicablePolicies = policies.clone();
            found.updatedAt = now();
            log:printInfo("Refund case re-assessed", caseNumber = found.caseNumber,
                    recommendation = found.proposal.decision, refundAmount = found.proposal.refundAmount);
            return <http:Ok>{body: found.clone()};
        }
    }

    // The rep's decision. Money moves only here, in plain integration code, and only on approval.
    resource function post refund\-requests/[string id]/decision(DecisionRequest request)
            returns http:Ok|http:NotFound|http:Conflict|http:Forbidden {
        boolean approved = request.approved;
        ApprovalLevel role = request.role;
        CaseDecision decision = {
            approved,
            decidedBy: request.decidedBy,
            role,
            decidedAt: now()
        };
        string? note = request.note;
        if note is string && note.trim() != "" {
            decision.note = note;
        }

        RefundCase refundCase;
        lock {
            RefundCase? found = cases[id];
            if found is () {
                return notFound(string `Case ${id} was not found`);
            }
            if found.status != "PENDING_APPROVAL" {
                return conflictError(string `Case is already ${found.status}`);
            }
            ApprovalLevel required = found.proposal.approvalLevel;
            if approved && levelRank(role) < levelRank(required) {
                return <http:Forbidden>{
                    body: <ErrorBody>{
                        message: string `Approving this case needs ${levelLabel(required)} authority or above; ` +
                            string `the ${levelLabel(role)} role cannot approve it.`
                    }
                };
            }
            // Claim the case before paying, so a second decision cannot pay it twice.
            found.status = approved ? "APPROVED" : "REJECTED";
            found.decision = decision.clone();
            found.updatedAt = decision.decidedAt;
            refundCase = found.clone();
        }

        if approved && refundCase.proposal.decision == "REFUND" {
            refundCase.refundId = issueRefund(refundCase);
        }
        GuestMessageOverride? override = request.guestMessage;
        if approved || override is GuestMessageOverride {
            refundCase.guestShare = createGuestShare(refundCase, request.sharePolicyIds, override);
        }

        lock {
            RefundCase? found = cases[id];
            if found is RefundCase {
                found.refundId = refundCase?.refundId.clone();
                found.guestShare = refundCase?.guestShare.clone();
            }
        }
        GuestShare? share = refundCase?.guestShare;
        if share is GuestShare {
            lock {
                shareTokens[share.token] = id;
            }
            log:printInfo("Guest notification queued", caseNumber = refundCase.caseNumber,
                    email = refundCase.reservation.guest.email, language = share.message.language, url = share.url);
        }
        return <http:Ok>{body: refundCase};
    }

    resource function get guest/resolutions/[string token]() returns GuestResolution|http:NotFound {
        RefundCase? refundCase = caseForToken(token);
        if refundCase is () {
            return notFound("This resolution link is not valid");
        }
        return toGuestResolution(refundCase, token);
    }

    // Streams a policy PDF, but only one the representative chose to share with this guest.
    resource function get guest/resolutions/[string token]/documents/[string documentId]()
            returns http:Response|http:NotFound|http:BadGateway {
        RefundCase? refundCase = caseForToken(token);
        GuestShare? share = refundCase is () ? () : refundCase?.guestShare;
        if share is () || share.policyIds.indexOf(documentId) is () {
            return notFound("This document is not part of the resolution");
        }
        http:Response|error upstream = policyService->get(string `/policies/${documentId}/document`);
        if upstream is error {
            return badGateway(string `Policy service unavailable: ${upstream.message()}`);
        }
        if upstream.statusCode == http:STATUS_NOT_FOUND {
            return notFound(string `Document ${documentId} was not found`);
        }
        byte[]|error pdf = upstream.getBinaryPayload();
        if upstream.statusCode >= 300 || pdf is error {
            return badGateway(string `Policy service answered ${upstream.statusCode}`);
        }
        http:Response response = new;
        response.setBinaryPayload(pdf, "application/pdf");
        response.setHeader("Content-Disposition", string `inline; filename="${documentId}.pdf"`);
        return response;
    }
}
