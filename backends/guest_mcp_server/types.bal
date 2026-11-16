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

// Operating regions of the hotel chain.
public enum Region {
    EUROPE,
    AFRICA,
    AMERICAS,
    ASIA_PACIFIC
}

public type HotelCategory "CITY"|"RESORT"|"SAFARI_LODGE"|"RYOKAN";

public type LoyaltyTier "CLASSIC"|"SILVER"|"GOLD"|"PLATINUM";

public type IncidentCategory "AIR_CONDITIONING"|"HEATING"|"HOT_WATER"|"NOISE"|"POWER"|"FACILITY_CLOSURE"|"WEATHER"|"CLEANLINESS";

public type IncidentCause "HOTEL_EQUIPMENT"|"HOTEL_WORKS"|"HOTEL_EVENT"|"HOTEL_MAINTENANCE"|"EXTERNAL_GRID"|"EXTERNAL_STORM"|"WEATHER_WARNING";

public type Country record {|
    // ISO 3166-1 alpha-2 code
    string code;
    string name;
    // ISO 4217 currency code
    string currency;
    // ISO 639-1 language code
    string localLanguage;
    // Flag emoji
    string flag;
|};

public type RegionInfo record {|
    Region code;
    string name;
    Country[] countries;
|};

public type Hotel record {|
    string hotelId;
    string name;
    string city;
    string countryCode;
    string countryName;
    Region region;
    HotelCategory category;
    int rooms;
    string currency;
    string localLanguage;
|};

public type Guest record {|
    string guestId;
    string name;
    string email;
    string preferredLanguage;
    string homeCountry;
|};

public type Fee record {|
    string code;
    string label;
    decimal amount;
|};

// An incident recorded in the property's maintenance/incident log. Times are hotel-local.
public type Incident record {|
    string incidentId;
    // Night the incident belongs to (YYYY-MM-DD)
    string date;
    IncidentCategory category;
    IncidentCause cause;
    string description;
    // YYYY-MM-DDTHH:MM
    string startedAt;
    // YYYY-MM-DDTHH:MM
    string endedAt;
    decimal durationHours;
    boolean reportedByGuest;
    boolean guestMoved;
    // Who verified the incident (for example "Maintenance log" or "Duty manager")
    string verifiedBy;
|};

public type Reservation record {|
    string reservationId;
    Hotel hotel;
    Guest guest;
    string roomNumber;
    string roomType;
    // YYYY-MM-DD
    string checkIn;
    // YYYY-MM-DD
    string checkOut;
    int nights;
    decimal nightlyRate;
    string currency;
    decimal totalRoomCharge;
    Fee[] fees;
    "FLEXIBLE"|"NON_REFUNDABLE" rateType;
    "CHECKED_OUT"|"IN_HOUSE"|"CANCELLED" status;
    "DIRECT"|"OTA"|"TRAVEL_AGENT" bookedVia;
    Incident[] incidents;
|};

public type LoyaltyProfile record {|
    string guestId;
    "Reverie Circle" programme;
    LoyaltyTier tier;
    int pointsBalance;
    // YYYY-MM-DD
    string memberSince;
|};

public type ErrorBody record {|
    string message;
|};

// Seed row for a country in the mock data; a hotel takes its country name, region, currency and language from it.
type CountrySeed record {|
    Region region;
    string code;
    string name;
    string currency;
    string localLanguage;
|};
