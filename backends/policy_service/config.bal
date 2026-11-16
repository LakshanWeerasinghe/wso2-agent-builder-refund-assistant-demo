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

configurable int port = 8090;
// Folder holding register.json and the PDFs (paths in the register are relative to it).
configurable string policiesDir = "policies";

// Azure OpenAI embeddings. Legacy URL https://<resource>.openai.azure.com/openai needs openAiApiVersion;
// a v1 URL (.../openai/v1) ignores it.
configurable string openAiServiceUrl = "";
configurable string openAiApiKey = "";
configurable string embeddingDeploymentId = "";
configurable string openAiApiVersion = "2024-10-21";
configurable int embeddingDimensions = 1536;

// Azure AI Search (admin key: the service creates the index and writes documents).
configurable string searchServiceUrl = "";
configurable string searchAdminKey = "";
configurable string searchIndexName = "reverie-policies";

configurable int maxChunkChars = 1200;
configurable int chunkOverlapChars = 150;
