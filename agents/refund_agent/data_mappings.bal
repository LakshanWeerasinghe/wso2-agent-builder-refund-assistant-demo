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
import ballerina/log;

final readonly & map<decimal> referenceRates = {
    USD: 1.00d,
    EUR: 0.92d,
    GBP: 0.79d,
    ZAR: 18.10d,
    KES: 129.00d,
    MAD: 9.90d,
    EGP: 48.50d,
    CAD: 1.37d,
    MXN: 18.40d,
    JPY: 149.00d,
    SGD: 1.34d,
    THB: 35.20d,
    INR: 84.10d
};

// Makes the totals consistent: the amount is the sum of the lines, and the USD amount uses the reference rates.
isolated function normalise(RefundProposal proposal, string reservationId) returns RefundProposal {
    RefundProposal result = proposal.clone();
    result.reservationId = reservationId;
    if result.decision != "REFUND" {
        result.refundAmount = 0;
        result.refundAmountUsd = 0;
        result.bonusPoints = 0;
        return result;
    }
    decimal linesTotal = from CalculationLine {amount} in result.lines
        collect decimal:sum(amount);
    if result.lines.length() > 0 && linesTotal != result.refundAmount {
        log:printWarn("Refund amount differs from the sum of its lines; using the sum", reservationId = reservationId,
            proposed = result.refundAmount, linesTotal = linesTotal);
        result.refundAmount = linesTotal;
    }
    decimal? rate = referenceRates[result.currency.toUpperAscii()];
    if rate is decimal {
        result.refundAmountUsd = decimal:round(result.refundAmount / rate, 2);
    }
    return result;
}

// An entry from policy-service `GET /policies/applicable` as `getApplicablePolicies` returns it.
isolated function toApplicablePolicy(ApplicablePolicyEntry entry) returns ApplicablePolicy => {
    documentId: entry.documentId,
    title: entry.title,
    titleEnglish: entry.titleEnglish ?: entry.title,
    language: entry.language,
    level: entry.level,
    policyType: entry.policyType,
    window: policyWindow(entry.effectiveFrom, entry?.effectiveTo),
    precedence: entry.precedence,
    summary: entry.summary ?: ""
};

isolated function policyWindow(string effectiveFrom, string? effectiveTo) returns string =>
    effectiveTo is string ? string `${effectiveFrom} to ${effectiveTo}` : string `from ${effectiveFrom} (open-ended)`;

isolated function toPassage(ai:QueryMatch m) returns PolicyPassage {
    ai:Metadata metadata = m.chunk.metadata ?: {};
    anydata content = m.chunk.content;
    return {
        documentId: metadataText(metadata, "documentId"),
        language: metadataText(metadata, "language"),
        section: metadataText(metadata, "section"),
        clauseIds: metadataText(metadata, "clauseIds"),
        score: <decimal>m.similarityScore,
        content: content is string ? content : content.toString()
    };
}

isolated function metadataText(ai:Metadata metadata, string key) returns string {
    anydata value = metadata[key];
    return value is string ? value : value is () ? "" : value.toString();
}
