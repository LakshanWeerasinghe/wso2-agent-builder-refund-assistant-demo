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

// Body of `POST /invocations`.
type RefundRequest record {
    string reservationId;
    string complaint;
    // "YYYY-MM-DD"; defaults to today (UTC).
    string requestDate?;
};

type Decision "REFUND"|"NO_REFUND"|"NEEDS_MORE_INFO";

type ApprovalLevel "REPRESENTATIVE"|"DUTY_MANAGER"|"REGIONAL_DIRECTOR";

// One component of the refund calculation.
type CalculationLine record {|
    // Night or day the line applies to, "YYYY-MM-DD".
    string date;
    // English, e.g. "Night of 4 Nov: no hot water 7.2 h (PAR-2.2)".
    string description;
    // The clause that sets the amount, e.g. "PAR-2.2".
    string clauseId;
    // Percentage of the nightly rate or base amount (0 for fixed amounts).
    decimal percentage;
    // In the booking currency.
    decimal amount;
|};

// A policy clause the proposal relies on.
type Citation record {|
    string documentId;
    string clauseId;
    // Language of the document the clause comes from.
    string language;
    // English summary of the clause.
    string summary;
|};

// The message to the guest, in the guest's preferred language.
type GuestMessage record {|
    string language;
    string subject;
    string body;
|};

// What the agent recommends. A representative approves or rejects it; the agent never pays a refund.
type RefundProposal record {|
    string reservationId;
    Decision decision;
    // In the booking currency.
    decimal refundAmount;
    string currency;
    // refundAmount at the policy reference rates.
    decimal refundAmountUsd;
    int bonusPoints;
    ApprovalLevel approvalLevel;
    CalculationLine[] lines;
    Citation[] citations;
    // English, for the representative: precedence applied and the calculation.
    string reasoning;
    GuestMessage guestMessage;
|};

// The parts of a guest-mcp-server reservation that the tools need. Other fields are kept as-is.
type Hotel record {
    string hotelId;
    string name;
    string countryCode;
    string region;
};

type Reservation record {
    string reservationId;
    Hotel hotel;
    string checkIn;
    string checkOut;
};

// An entry from policy-service `GET /policies/applicable`.
type ApplicablePolicyEntry record {
    string documentId;
    string title;
    string titleEnglish?;
    string summary?;
    string language;
    string scope;
    string policyType;
    string effectiveFrom;
    string? effectiveTo?;
    string version?;
    int precedence;
    string level;
};

// What `getApplicablePolicies` returns per document.
type ApplicablePolicy record {|
    string documentId;
    string title;
    string titleEnglish;
    string language;
    string level;
    string policyType;
    // e.g. "2026-06-01 to 2026-11-30" or "from 2026-01-01 (open-ended)".
    string window;
    int precedence;
    string summary;
|};

type ScopeLevel "HOTEL"|"COUNTRY"|"REGION"|"GLOBAL";

// A retrieved policy passage. `content` starts with the chunk's context header.
type PolicyPassage record {|
    string documentId;
    string language;
    string section;
    string clauseIds;
    decimal score;
    string content;
|};

type ScopePassages record {|
    ScopeLevel level;
    // e.g. "Hotel KYO-GIO", "Country JP", "Region ASIA_PACIFIC", "Global".
    string scope;
    PolicyPassage[] passages;
|};

// What `searchPolicies` returns: passages grouped by scope level, most specific first.
type PolicySearchResult record {|
    string query;
    // The stay nights the search was limited to, e.g. "2026-11-02 to 2026-11-05".
    string stayNights;
    ScopePassages[] levels;
|};
