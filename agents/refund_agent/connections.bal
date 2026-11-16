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
import ballerina/mcp.v2 as mcpv2;
import ballerinax/ai.azure;

# The read-only tools of the guest MCP server, exposed to the agent. Only the tools listed in
# `permittedTools` are offered to the model; each one forwards the model's call to the server.
@display {label: "Guest Services"}
isolated class GuestServicesToolKit {
    *ai:McpBaseToolKit;
    private final mcpv2:StreamableHttpClient mcpClient;
    private final readonly & ai:ToolConfig[] tools;

    public isolated function init(string serverUrl, mcpv2:Implementation info = {name: "MCP", version: "1.0.0"},
            *mcpv2:StreamableHttpClientConfig config) returns ai:Error? {
        final map<ai:FunctionTool> permittedTools = {
            "getReservation": self.getReservation,
            "getLoyaltyProfile": self.getLoyaltyProfile,
            "getHotel": self.getHotel
        };

        do {
            self.mcpClient = check new mcpv2:StreamableHttpClient(serverUrl, config);
            self.tools = check ai:getPermittedMcpToolConfigs(self.mcpClient, info, permittedTools).cloneReadOnly();
        } on fail error e {
            return error ai:Error("Failed to initialize MCP toolkit", e);
        }
    }

    public isolated function getTools() returns ai:ToolConfig[] => self.tools;

    @ai:AgentTool
    public isolated function getReservation(ai:Context ctx, mcpv2:CallToolParams params)
            returns mcpv2:CallToolResult|error {
        return self.mcpClient->callTool(params);
    }

    @ai:AgentTool
    public isolated function getLoyaltyProfile(ai:Context ctx, mcpv2:CallToolParams params)
            returns mcpv2:CallToolResult|error {
        return self.mcpClient->callTool(params);
    }

    @ai:AgentTool
    public isolated function getHotel(ai:Context ctx, mcpv2:CallToolParams params)
            returns mcpv2:CallToolResult|error {
        return self.mcpClient->callTool(params);
    }
}

// The guest MCP server's tools, for the model. Connects when the agent starts, so the server must be up first.
final GuestServicesToolKit guestTools = check new (guestMcpUrl, {name: "ReverieEscapes Refund Agent", version: "1.0.0"});

final http:Client guestApi = check new (guestApiUrl);
final http:Client policyService = check new (policyServiceUrl);

// Temperature 0: the same request should get the same assessment.
final azure:OpenAiModelProvider chatModel = check new (openAiServiceUrl, openAiApiKey, chatDeploymentId,
    openAiApiVersion, temperature = 0.0d
);

final azure:EmbeddingProvider embeddingModel = check new (openAiServiceUrl, openAiApiKey, openAiApiVersion,
    embeddingDeploymentId
);

// Created on first use: the constructor checks that the index exists, and the agent must be able to
// start before the policy-service has ingested anything.
isolated azure:AiSearchKnowledgeBase? policyKnowledgeBase = ();

isolated function knowledgeBase() returns azure:AiSearchKnowledgeBase|error {
    lock {
        azure:AiSearchKnowledgeBase? existing = policyKnowledgeBase;
        if existing is azure:AiSearchKnowledgeBase {
            return existing;
        }
        azure:AiSearchKnowledgeBase created = check new (searchServiceUrl, searchApiKey, searchIndexName,
            embeddingModel, ai:DISABLE
        );
        policyKnowledgeBase = created;
        return created;
    }
}
