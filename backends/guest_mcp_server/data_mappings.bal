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

isolated function hotel(string hotelId, string name, string city, string countryCode, HotelCategory category,
        int rooms) returns readonly & Hotel {
    foreach CountrySeed c in countrySeeds {
        if c.code == countryCode {
            return {
                hotelId,
                name,
                city,
                countryCode,
                countryName: c.name,
                region: c.region,
                category,
                rooms,
                currency: c.currency,
                localLanguage: c.localLanguage
            };
        }
    }
    panic error(string `Unknown country code ${countryCode} for hotel ${hotelId}`);
}

isolated function buildRegions() returns readonly & RegionInfo[] {
    RegionInfo[] result = [];
    Region[] regionCodes = [EUROPE, AFRICA, AMERICAS, ASIA_PACIFIC];
    foreach Region code in regionCodes {
        Country[] countries = from CountrySeed c in countrySeeds
            where c.region == code
            select {code: c.code, name: c.name, currency: c.currency, localLanguage: c.localLanguage, flag: flag(c.code)};
        result.push({code, name: regionNames.get(code), countries});
    }
    return result.cloneReadOnly();
}
