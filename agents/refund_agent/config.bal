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

// Azure OpenAI, from Config.toml or BAL_CONFIG_VAR_* environment variables.
configurable string openAiServiceUrl = ?;
configurable string openAiApiKey = ?;
configurable string chatDeploymentId = ?;
configurable string embeddingDeploymentId = ?;
// Required for a legacy service URL (`https://<resource>.openai.azure.com/openai`); ignored for a
// v1 service URL (`.../openai/v1`).
configurable string openAiApiVersion = "2024-10-21";

// Azure AI Search index of policy passages, built by the policy-service.
configurable string searchServiceUrl = ?;
configurable string searchApiKey = ?;
configurable string searchIndexName = "reverie-policies";

configurable string guestMcpUrl = "http://localhost:9090/mcp";
configurable string guestApiUrl = "http://localhost:9090/api";
configurable string policyServiceUrl = "http://localhost:8090";
configurable int passagesPerScope = 3;
