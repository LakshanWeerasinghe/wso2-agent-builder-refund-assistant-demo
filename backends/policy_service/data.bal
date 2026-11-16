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

// Static reference data (regions, countries, hotels, languages, scopes) that fits no other file: used to validate uploads, infer scope and label chunks.

final readonly & map<string> REGION_NAMES = {
    EUROPE: "Europe",
    AFRICA: "Africa",
    AMERICAS: "Americas",
    ASIA_PACIFIC: "Asia-Pacific"
};

// Country code -> region code
final readonly & map<string> COUNTRY_REGIONS = {
    FR: "EUROPE", DE: "EUROPE", ES: "EUROPE", IT: "EUROPE", GB: "EUROPE", NL: "EUROPE", PT: "EUROPE",
    ZA: "AFRICA", KE: "AFRICA", MA: "AFRICA", EG: "AFRICA",
    US: "AMERICAS", CA: "AMERICAS", MX: "AMERICAS",
    JP: "ASIA_PACIFIC", SG: "ASIA_PACIFIC", TH: "ASIA_PACIFIC", IN: "ASIA_PACIFIC"
};

// Hotel id -> country code
final readonly & map<string> HOTEL_COUNTRIES = {
    "PAR-OPE": "FR", "NCE-PRO": "FR", "BER-MIT": "DE", "MUC-ALT": "DE", "BCN-GOT": "ES", "MAD-RET": "ES",
    "ROM-TRA": "IT", "VCE-CAN": "IT", "LON-MAY": "GB", "EDI-OLD": "GB", "AMS-CAN": "NL", "LIS-ALF": "PT",
    "CPT-WAT": "ZA", "JNB-SAN": "ZA", "NBO-KAR": "KE", "MAR-SAF": "KE", "RAK-MED": "MA", "CAI-NIL": "EG",
    "NYC-MID": "US", "MIA-BCH": "US", "SFO-EMB": "US", "YYZ-HAR": "CA", "CUN-RIV": "MX",
    "KYO-GIO": "JP", "TYO-GIN": "JP", "SIN-MAR": "SG", "BKK-RIV": "TH", "HKT-KAT": "TH", "BOM-MAR": "IN"
};

final readonly & string[] SUPPORTED_LANGUAGES = ["en", "fr", "de", "es", "it", "pt", "nl", "ja", "th", "ar"];

final readonly & map<int> SCOPE_RANKS = {GLOBAL: 1, REGION: 2, COUNTRY: 3, HOTEL: 4};

final readonly & map<string> SCOPE_LABELS = {GLOBAL: "Global", REGION: "Region", COUNTRY: "Country", HOTEL: "Hotel"};
