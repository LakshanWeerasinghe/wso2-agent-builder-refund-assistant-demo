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

configurable int port = 8080;

// The refund agent. Locally: http://localhost:8088 and /invocations. For an agent deployed to
// Foundry, use the agent's invocations endpoint and a Microsoft Entra access token.
configurable string agentUrl = "http://localhost:8088";
configurable string agentInvocationsPath = "/invocations";
configurable string? agentAccessToken = ();
// Foundry starts a sandbox per session ID. Empty: one session per case. A fixed value (for example
// "refund-api") reuses one warm sandbox for every case; the agent keeps no memory between requests.
configurable string agentSessionId = "";
configurable string guestApiUrl = "http://localhost:9090/api";
configurable string policyServiceUrl = "http://localhost:8090";
configurable string portalUrl = "http://localhost:8000";
