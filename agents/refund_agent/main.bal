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
import ballerinax/ai.azure;

// Listens on the port in the `PORT` environment variable, else on 8088. An assessment can take over a
// minute, longer than the default 60 s request timeout.
listener azure:FoundryListener foundryListener = new (timeout = 300);

service azure:FoundryInvocationService on foundryListener {

    resource function get readiness() returns json => {status: "healthy"};

    resource function post invocations(@http:Payload RefundRequest request, azure:FoundryContext ctx)
            returns RefundProposal|http:BadRequest|error {
        string requestDate = request.requestDate ?: toIsoDate(time:utcToCivil(time:utcNow()));
        if !isoDate.isFullMatch(requestDate) || toCivil(requestDate) is error {
            return <http:BadRequest>{body: {message: "requestDate must be a date in the form YYYY-MM-DD"}};
        }
        string reservationId = request.reservationId.trim();
        string query = string `Assess this refund request.
            Reservation ID: ${reservationId}
            Request date: ${requestDate}${daysSinceCheckOut(reservationId, requestDate)}
            Guest complaint (verbatim, may be in any language):
            """
            ${request.complaint}
            """
            ${check assessmentContext(reservationId, request.complaint)}`;

        RefundProposal proposal = check refundAgent.run(query, ctx.sessionId);

        log:printInfo("Refund Proposal", reservationId = reservationId, decision = proposal.decision,
                sessionId = ctx.sessionId);
        return proposal;
    }
}

