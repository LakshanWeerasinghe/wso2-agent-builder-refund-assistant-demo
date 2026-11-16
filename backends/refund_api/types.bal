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

type ApprovalLevel "REPRESENTATIVE"|"DUTY_MANAGER"|"REGIONAL_DIRECTOR";

type CaseStatus "PENDING_APPROVAL"|"APPROVED"|"REJECTED";

type Channel "PHONE"|"EMAIL"|"FRONT_DESK"|"CHAT";

// Reservation types are open: only the fields this service reads are declared, the rest of the
// guest API's JSON is kept as-is in the case snapshot.
type Hotel record {
    string hotelId;
    string name;
    string city;
    string countryCode;
    string countryName;
    string region;
};

type Guest record {
    string guestId;
    string name;
    string email;
    string preferredLanguage;
};

type Reservation record {
    string reservationId;
    Hotel hotel;
    Guest guest;
    string roomType;
    string checkIn;
    string checkOut;
    int nights;
};

// A policy-service `ApplicablePolicy`; other register fields are kept as-is.
type ApplicablePolicy record {
    string documentId;
    string title;
    string titleEnglish;
    string language;
    string scope;
    string policyType;
    string effectiveFrom;
    string? effectiveTo?;
    int precedence;
};

type ProposalLine record {
    string date;
    string description;
    string clauseId;
    decimal percentage;
    decimal amount;
};

type Citation record {
    string documentId;
    string clauseId;
    string language;
    string summary;
};

type GuestMessage record {
    string language;
    string subject;
    string body;
};

// The refund agent's recommendation.
type RefundProposal record {
    string reservationId;
    "REFUND"|"NO_REFUND"|"NEEDS_MORE_INFO" decision;
    decimal refundAmount;
    string currency;
    decimal refundAmountUsd;
    int bonusPoints;
    ApprovalLevel approvalLevel;
    ProposalLine[] lines;
    Citation[] citations;
    string reasoning;
    GuestMessage guestMessage;
};

type ProposalHistoryEntry record {|
    string assessedAt;
    RefundProposal proposal;
|};

type CaseDecision record {|
    boolean approved;
    string decidedBy;
    ApprovalLevel role;
    string note?;
    string decidedAt;
|};

type GuestShare record {|
    string token;
    string url;
    string sharedAt;
    string[] policyIds;
    GuestMessage message;
|};

type RefundCase record {|
    string id;
    // Sequential, e.g. "RC-2026-0001".
    string caseNumber;
    string createdAt;
    string updatedAt;
    string createdBy;
    Channel channel;
    string reservationId;
    string complaint;
    Reservation reservation;
    CaseStatus status;
    RefundProposal proposal;
    ProposalHistoryEntry[] proposalHistory;
    ApplicablePolicy[] applicablePolicies;
    CaseDecision decision?;
    string refundId?;
    GuestShare guestShare?;
|};

type NewRefundRequest record {|
    string reservationId;
    string complaint;
    Channel channel = "PHONE";
    string createdBy = "Guest Relations";
|};

type GuestMessageOverride record {|
    string subject;
    string body;
|};

type DecisionRequest record {|
    boolean approved;
    string decidedBy;
    ApprovalLevel role;
    string note?;
    string[] sharePolicyIds = [];
    GuestMessageOverride guestMessage?;
|};

// Body sent to the agent's invocations endpoint.
type AgentInvocation record {|
    string reservationId;
    string complaint;
    string requestDate;
|};

type ErrorBody record {|
    string message;
|};

// Raised when the reservation does not exist in the guest API.
type NotFoundError distinct error;

type GuestHotel record {|
    string name;
    string city;
    string countryName;
    string countryCode;
|};

type GuestStay record {|
    string checkIn;
    string checkOut;
    int nights;
    string roomType;
|};

type GuestRefund record {|
    decimal amount;
    string currency;
|};

type GuestPolicy record {|
    string documentId;
    string title;
    string titleEnglish;
    string language;
    string scope;
    string policyType;
    string effectiveFrom;
    string? effectiveTo;
    string documentUrl;
|};

type GuestResolution record {|
    string caseNumber;
    string guestName;
    string preferredLanguage;
    GuestHotel hotel;
    GuestStay stay;
    "REFUND_APPROVED"|"NO_REFUND"|"UNDER_REVIEW" outcome;
    GuestRefund refund?;
    int bonusPoints;
    GuestMessage message;
    string? decidedAt;
    GuestPolicy[] policies;
|};
