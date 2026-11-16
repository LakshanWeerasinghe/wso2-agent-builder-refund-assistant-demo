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

function toGuestResolution(RefundCase refundCase, string token) returns GuestResolution {
    Reservation reservation = refundCase.reservation;
    RefundProposal proposal = refundCase.proposal;
    GuestShare share = <GuestShare>refundCase?.guestShare;
    CaseDecision? decision = refundCase?.decision;
    boolean approved = decision is CaseDecision && decision.approved;
    GuestResolution resolution = {
        caseNumber: refundCase.caseNumber,
        guestName: reservation.guest.name,
        preferredLanguage: reservation.guest.preferredLanguage,
        hotel: {
            name: reservation.hotel.name,
            city: reservation.hotel.city,
            countryName: reservation.hotel.countryName,
            countryCode: reservation.hotel.countryCode
        },
        stay: {
            checkIn: reservation.checkIn,
            checkOut: reservation.checkOut,
            nights: reservation.nights,
            roomType: reservation.roomType
        },
        outcome: !approved ? "UNDER_REVIEW" : proposal.decision == "REFUND" ? "REFUND_APPROVED" : "NO_REFUND",
        bonusPoints: 0,
        message: share.message,
        decidedAt: decision is CaseDecision ? decision.decidedAt : (),
        policies: from ApplicablePolicy policy in refundCase.applicablePolicies
            where share.policyIds.indexOf(policy.documentId) !is ()
            select {
                documentId: policy.documentId,
                title: policy.title,
                titleEnglish: policy.titleEnglish,
                language: policy.language,
                scope: policy.scope,
                policyType: policy.policyType,
                effectiveFrom: policy.effectiveFrom,
                effectiveTo: policy?.effectiveTo,
                documentUrl: string `/guest/resolutions/${token}/documents/${policy.documentId}`
            }
    };
    if resolution.outcome == "REFUND_APPROVED" {
        resolution.refund = {amount: proposal.refundAmount, currency: proposal.currency};
        resolution.bonusPoints = proposal.bonusPoints;
    }
    return resolution;
}
