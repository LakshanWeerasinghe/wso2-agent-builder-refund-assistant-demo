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
import ballerinax/ai.azure;
import ballerinax/azure.ai.search;

const VECTOR_PROFILE = "policy-vector-profile";
const HNSW_ALGORITHM = "policy-hnsw";

// --- Index and knowledge base ---

isolated function policyIndex() returns search:SearchIndex => {
    name: searchIndexName,
    fields: [
        {name: "chunkKey", 'type: "Edm.String", 'key: true, filterable: true, retrievable: true},
        {name: "content", 'type: "Edm.String", searchable: true, retrievable: true},
        {
            name: "contentVector",
            'type: "Collection(Edm.Single)",
            searchable: true,
            retrievable: false,
            dimensions: <int:Signed32>embeddingDimensions,
            vectorSearchProfile: VECTOR_PROFILE
        },
        {name: "documentId", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "scope", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "region", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "countryCode", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "hotelId", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "language", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "policyType", 'type: "Edm.String", filterable: true, facetable: true},
        {name: "version", 'type: "Edm.String", filterable: true},
        {name: "title", 'type: "Edm.String", searchable: true},
        {name: "section", 'type: "Edm.String", searchable: true},
        {name: "clauseIds", 'type: "Edm.String", searchable: true},
        {name: "effectiveFrom", 'type: "Edm.Int32", filterable: true, sortable: true},
        {name: "effectiveTo", 'type: "Edm.Int32", filterable: true, sortable: true}
    ],
    vectorSearch: {
        profiles: [{name: VECTOR_PROFILE, algorithm: HNSW_ALGORITHM}],
        algorithms: [{name: HNSW_ALGORITHM, kind: "hnsw"}]
    }
};

isolated azure:AiSearchKnowledgeBase? knowledgeBase = ();

// Created on first ingestion; creating it creates or updates the index.
isolated function getKnowledgeBase() returns azure:AiSearchKnowledgeBase|error {
    lock {
        azure:AiSearchKnowledgeBase? existing = knowledgeBase;
        if existing is azure:AiSearchKnowledgeBase {
            return existing;
        }
        azure:EmbeddingProvider embeddings = check new (openAiServiceUrl, openAiApiKey, openAiApiVersion,
            embeddingDeploymentId);
        azure:AiSearchKnowledgeBase created = check new (searchServiceUrl, searchAdminKey, policyIndex(), embeddings,
            ai:DISABLE);
        knowledgeBase = created;
        return created;
    }
}
