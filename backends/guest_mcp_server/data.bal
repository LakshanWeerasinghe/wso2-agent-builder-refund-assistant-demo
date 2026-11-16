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

// Mock data standing in for the property, reservation and loyalty systems of record; kept in its own file because this large static data fits none of the standard WSO2 Integrator files.

final readonly & map<string> regionNames = {
    EUROPE: "Europe",
    AFRICA: "Africa",
    AMERICAS: "Americas",
    ASIA_PACIFIC: "Asia-Pacific"
};

final readonly & CountrySeed[] countrySeeds = [
    {region: EUROPE, code: "FR", name: "France", currency: "EUR", localLanguage: "fr"},
    {region: EUROPE, code: "DE", name: "Germany", currency: "EUR", localLanguage: "de"},
    {region: EUROPE, code: "ES", name: "Spain", currency: "EUR", localLanguage: "es"},
    {region: EUROPE, code: "IT", name: "Italy", currency: "EUR", localLanguage: "it"},
    {region: EUROPE, code: "GB", name: "United Kingdom", currency: "GBP", localLanguage: "en"},
    {region: EUROPE, code: "NL", name: "Netherlands", currency: "EUR", localLanguage: "nl"},
    {region: EUROPE, code: "PT", name: "Portugal", currency: "EUR", localLanguage: "pt"},
    {region: AFRICA, code: "ZA", name: "South Africa", currency: "ZAR", localLanguage: "en"},
    {region: AFRICA, code: "KE", name: "Kenya", currency: "KES", localLanguage: "en"},
    {region: AFRICA, code: "MA", name: "Morocco", currency: "MAD", localLanguage: "fr"},
    {region: AFRICA, code: "EG", name: "Egypt", currency: "EGP", localLanguage: "ar"},
    {region: AMERICAS, code: "US", name: "United States", currency: "USD", localLanguage: "en"},
    {region: AMERICAS, code: "CA", name: "Canada", currency: "CAD", localLanguage: "en"},
    {region: AMERICAS, code: "MX", name: "Mexico", currency: "MXN", localLanguage: "es"},
    {region: ASIA_PACIFIC, code: "JP", name: "Japan", currency: "JPY", localLanguage: "ja"},
    {region: ASIA_PACIFIC, code: "SG", name: "Singapore", currency: "SGD", localLanguage: "en"},
    {region: ASIA_PACIFIC, code: "TH", name: "Thailand", currency: "THB", localLanguage: "th"},
    {region: ASIA_PACIFIC, code: "IN", name: "India", currency: "INR", localLanguage: "en"}
];

final readonly & RegionInfo[] regions = buildRegions();

final readonly & Hotel[] hotels = [
    hotel("PAR-OPE", "ReverieEscapes Paris Opéra", "Paris", "FR", "CITY", 184),
    hotel("NCE-PRO", "ReverieEscapes Nice Promenade", "Nice", "FR", "RESORT", 126),
    hotel("BER-MIT", "ReverieEscapes Berlin Mitte", "Berlin", "DE", "CITY", 212),
    hotel("MUC-ALT", "ReverieEscapes Munich Altstadt", "Munich", "DE", "CITY", 158),
    hotel("BCN-GOT", "ReverieEscapes Barcelona Gòtic", "Barcelona", "ES", "CITY", 142),
    hotel("MAD-RET", "ReverieEscapes Madrid Retiro", "Madrid", "ES", "CITY", 167),
    hotel("ROM-TRA", "ReverieEscapes Rome Trastevere", "Rome", "IT", "CITY", 98),
    hotel("VCE-CAN", "ReverieEscapes Venice Canal Grande", "Venice", "IT", "CITY", 74),
    hotel("LON-MAY", "ReverieEscapes London Mayfair", "London", "GB", "CITY", 236),
    hotel("EDI-OLD", "ReverieEscapes Edinburgh Old Town", "Edinburgh", "GB", "CITY", 118),
    hotel("AMS-CAN", "ReverieEscapes Amsterdam Canal Ring", "Amsterdam", "NL", "CITY", 104),
    hotel("LIS-ALF", "ReverieEscapes Lisbon Alfama", "Lisbon", "PT", "CITY", 96),
    hotel("CPT-WAT", "ReverieEscapes Cape Town Waterfront", "Cape Town", "ZA", "CITY", 248),
    hotel("JNB-SAN", "ReverieEscapes Johannesburg Sandton", "Johannesburg", "ZA", "CITY", 201),
    hotel("NBO-KAR", "ReverieEscapes Nairobi Karen", "Nairobi", "KE", "CITY", 88),
    hotel("MAR-SAF", "ReverieEscapes Maasai Mara Safari Lodge", "Maasai Mara", "KE", "SAFARI_LODGE", 36),
    hotel("RAK-MED", "ReverieEscapes Marrakech Medina", "Marrakech", "MA", "RESORT", 72),
    hotel("CAI-NIL", "ReverieEscapes Cairo Nile Corniche", "Cairo", "EG", "CITY", 264),
    hotel("NYC-MID", "ReverieEscapes New York Midtown", "New York", "US", "CITY", 412),
    hotel("MIA-BCH", "ReverieEscapes Miami Beach", "Miami Beach", "US", "RESORT", 296),
    hotel("SFO-EMB", "ReverieEscapes San Francisco Embarcadero", "San Francisco", "US", "CITY", 238),
    hotel("YYZ-HAR", "ReverieEscapes Toronto Harbourfront", "Toronto", "CA", "CITY", 274),
    hotel("CUN-RIV", "ReverieEscapes Cancún Riviera", "Cancún", "MX", "RESORT", 318),
    hotel("KYO-GIO", "ReverieEscapes Kyoto Gion", "Kyoto", "JP", "RYOKAN", 64),
    hotel("TYO-GIN", "ReverieEscapes Tokyo Ginza", "Tokyo", "JP", "CITY", 286),
    hotel("SIN-MAR", "ReverieEscapes Singapore Marina", "Singapore", "SG", "CITY", 342),
    hotel("BKK-RIV", "ReverieEscapes Bangkok Riverside", "Bangkok", "TH", "CITY", 258),
    hotel("HKT-KAT", "ReverieEscapes Phuket Kata Beach", "Phuket", "TH", "RESORT", 176),
    hotel("BOM-MAR", "ReverieEscapes Mumbai Marine Drive", "Mumbai", "IN", "CITY", 221)
];

final readonly & map<Hotel> hotelsById = map from Hotel h in hotels select [h.hotelId, h];

final readonly & map<Guest> guests = {
    "G-1001": {guestId: "G-1001", name: "Emily Carter", email: "emily.carter@example.com", preferredLanguage: "en", homeCountry: "US"},
    "G-1002": {guestId: "G-1002", name: "佐藤 陽斗 (Haruto Sato)", email: "haruto.sato@example.jp", preferredLanguage: "ja", homeCountry: "JP"},
    "G-1003": {guestId: "G-1003", name: "Lukas Becker", email: "lukas.becker@example.de", preferredLanguage: "de", homeCountry: "DE"},
    "G-1004": {guestId: "G-1004", name: "Carlos Mendoza", email: "carlos.mendoza@example.mx", preferredLanguage: "es", homeCountry: "MX"},
    "G-1005": {guestId: "G-1005", name: "Sophie Laurent", email: "sophie.laurent@example.fr", preferredLanguage: "fr", homeCountry: "FR"},
    "G-1006": {guestId: "G-1006", name: "James O'Neill", email: "james.oneill@example.ie", preferredLanguage: "en", homeCountry: "IE"},
    "G-1007": {guestId: "G-1007", name: "Giulia Romano", email: "giulia.romano@example.it", preferredLanguage: "it", homeCountry: "IT"},
    "G-1008": {guestId: "G-1008", name: "Priya Nair", email: "priya.nair@example.in", preferredLanguage: "en", homeCountry: "IN"}
};

final readonly & map<LoyaltyProfile> loyaltyProfiles = {
    "G-1001": {guestId: "G-1001", programme: "Reverie Circle", tier: "GOLD", pointsBalance: 41250, memberSince: "2019-04-12"},
    "G-1002": {guestId: "G-1002", programme: "Reverie Circle", tier: "PLATINUM", pointsBalance: 182400, memberSince: "2014-09-01"},
    "G-1003": {guestId: "G-1003", programme: "Reverie Circle", tier: "GOLD", pointsBalance: 23900, memberSince: "2021-02-20"},
    "G-1004": {guestId: "G-1004", programme: "Reverie Circle", tier: "SILVER", pointsBalance: 9850, memberSince: "2022-07-08"},
    "G-1005": {guestId: "G-1005", programme: "Reverie Circle", tier: "CLASSIC", pointsBalance: 1200, memberSince: "2025-11-30"},
    "G-1006": {guestId: "G-1006", programme: "Reverie Circle", tier: "PLATINUM", pointsBalance: 96000, memberSince: "2016-03-15"},
    "G-1007": {guestId: "G-1007", programme: "Reverie Circle", tier: "SILVER", pointsBalance: 12300, memberSince: "2023-05-02"},
    "G-1008": {guestId: "G-1008", programme: "Reverie Circle", tier: "GOLD", pointsBalance: 30110, memberSince: "2020-10-18"}
};

const PAR_WORKS_NOISE = "Façade restoration works (scaffolding, drilling) outside room 504; guest complaint logged at front desk.";
const CPT_LOAD_SHEDDING = "Eskom Stage 4 load-shedding. Backup generator carried lifts, lighting and water; in-room air conditioning off.";
const BCN_TERRACE_EVENT = "Rooftop terrace private event; amplified music audible in room 402.";
const MAINTENANCE_LOG = "Maintenance log";
const DUTY_MANAGER = "Duty manager";

final readonly & Reservation[] reservations = [
    {
        reservationId: "RES-PAR-24117",
        hotel: hotelsById.get("PAR-OPE"),
        guest: guests.get("G-1001"),
        roomNumber: "504",
        roomType: "Deluxe Opéra View",
        checkIn: "2026-11-02",
        checkOut: "2026-11-06",
        nights: 4,
        nightlyRate: 420.00,
        currency: "EUR",
        totalRoomCharge: 1680.00,
        fees: [{code: "CITY_TAX", label: "Taxe de séjour", amount: 32.52}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            {
                incidentId: "INC-PAR-881",
                date: "2026-11-03",
                category: "NOISE",
                cause: "HOTEL_WORKS",
                description: PAR_WORKS_NOISE,
                startedAt: "2026-11-03T08:30",
                endedAt: "2026-11-03T17:00",
                durationHours: 8.5,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            },
            {
                incidentId: "INC-PAR-886",
                date: "2026-11-04",
                category: "NOISE",
                cause: "HOTEL_WORKS",
                description: PAR_WORKS_NOISE,
                startedAt: "2026-11-04T08:30",
                endedAt: "2026-11-04T17:00",
                durationHours: 8.5,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            },
            {
                incidentId: "INC-PAR-889",
                date: "2026-11-04",
                category: "HOT_WATER",
                cause: "HOTEL_EQUIPMENT",
                description: "No hot water in room 504 (boiler pressure fault on the 5th-floor riser); fixed 06:20.",
                startedAt: "2026-11-04T23:10",
                endedAt: "2026-11-05T06:20",
                durationHours: 7.2,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            },
            {
                incidentId: "INC-PAR-893",
                date: "2026-11-05",
                category: "NOISE",
                cause: "HOTEL_WORKS",
                description: PAR_WORKS_NOISE,
                startedAt: "2026-11-05T08:30",
                endedAt: "2026-11-05T17:00",
                durationHours: 8.5,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            }
        ]
    },
    {
        reservationId: "RES-KYO-31842",
        hotel: hotelsById.get("KYO-GIO"),
        guest: guests.get("G-1002"),
        roomNumber: "302",
        roomType: "Garden Deluxe, Japanese-style",
        checkIn: "2026-11-08",
        checkOut: "2026-11-11",
        nights: 3,
        nightlyRate: 98000,
        currency: "JPY",
        totalRoomCharge: 294000,
        fees: [{code: "ACCOMMODATION_TAX", label: "宿泊税 (Kyoto accommodation tax)", amount: 3000}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            {
                incidentId: "INC-KYO-112",
                date: "2026-11-08",
                category: "FACILITY_CLOSURE",
                cause: "HOTEL_MAINTENANCE",
                description: "Large public bath (natural hot spring) closed: heat-exchanger inspection overran. Hotel at full occupancy.",
                startedAt: "2026-11-08T15:00",
                endedAt: "2026-11-10T10:00",
                durationHours: 43,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: DUTY_MANAGER
            }
        ]
    },
    {
        reservationId: "RES-CPT-50391",
        hotel: hotelsById.get("CPT-WAT"),
        guest: guests.get("G-1003"),
        roomNumber: "811",
        roomType: "Harbour View King",
        checkIn: "2026-10-20",
        checkOut: "2026-10-24",
        nights: 4,
        nightlyRate: 4800.00,
        currency: "ZAR",
        totalRoomCharge: 19200.00,
        fees: [],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            loadShedding("INC-CPT-310", "2026-10-20", "2026-10-21"),
            loadShedding("INC-CPT-311", "2026-10-21", "2026-10-22"),
            loadShedding("INC-CPT-312", "2026-10-22", "2026-10-23")
        ]
    },
    {
        reservationId: "RES-MIA-77120",
        hotel: hotelsById.get("MIA-BCH"),
        guest: guests.get("G-1004"),
        roomNumber: "1207",
        roomType: "Oceanfront King",
        checkIn: "2026-10-19",
        checkOut: "2026-10-23",
        nights: 4,
        nightlyRate: 389.00,
        currency: "USD",
        totalRoomCharge: 1556.00,
        fees: [{code: "RESORT_FEE", label: "Resort fee", amount: 180.00}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            {
                incidentId: "INC-MIA-640",
                date: "2026-10-20",
                category: "WEATHER",
                cause: "WEATHER_WARNING",
                description: "NHC Hurricane Warning for Miami-Dade (Hurricane Tobias). Pool, beach service and cabanas closed.",
                startedAt: "2026-10-20T11:00",
                endedAt: "2026-10-22T18:00",
                durationHours: 55,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: DUTY_MANAGER
            },
            {
                incidentId: "INC-MIA-655",
                date: "2026-10-21",
                category: "POWER",
                cause: "EXTERNAL_STORM",
                description: "Storm-related utility outage; generator on life-safety load only; in-room air conditioning off.",
                startedAt: "2026-10-21T21:40",
                endedAt: "2026-10-22T05:10",
                durationHours: 7.5,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            }
        ]
    },
    {
        reservationId: "RES-BER-60455",
        hotel: hotelsById.get("BER-MIT"),
        guest: guests.get("G-1005"),
        roomNumber: "214",
        roomType: "Superior Queen",
        checkIn: "2026-11-05",
        checkOut: "2026-11-08",
        nights: 3,
        nightlyRate: 210.00,
        currency: "EUR",
        totalRoomCharge: 630.00,
        fees: [{code: "CITY_TAX", label: "Übernachtungsteuer (7.5%)", amount: 47.25}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            {
                incidentId: "INC-BER-207",
                date: "2026-11-06",
                category: "HEATING",
                cause: "HOTEL_EQUIPMENT",
                description: "Heating failure in room 214 (thermostat valve); room at 15 °C. Portable heater supplied 01:30; "
                    + "no equivalent room available for a move.",
                startedAt: "2026-11-06T23:00",
                endedAt: "2026-11-07T09:00",
                durationHours: 10,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            }
        ]
    },
    {
        reservationId: "RES-NYC-80233",
        hotel: hotelsById.get("NYC-MID"),
        guest: guests.get("G-1006"),
        roomNumber: "2210",
        roomType: "Skyline King",
        checkIn: "2026-11-09",
        checkOut: "2026-11-12",
        nights: 3,
        nightlyRate: 459.00,
        currency: "USD",
        totalRoomCharge: 1377.00,
        fees: [{code: "DESTINATION_FEE", label: "Destination fee", amount: 105.00}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: []
    },
    {
        reservationId: "RES-BCN-41208",
        hotel: hotelsById.get("BCN-GOT"),
        guest: guests.get("G-1007"),
        roomNumber: "402",
        roomType: "Gothic Quarter Double",
        checkIn: "2026-10-28",
        checkOut: "2026-10-31",
        nights: 3,
        nightlyRate: 260.00,
        currency: "EUR",
        totalRoomCharge: 780.00,
        fees: [{code: "TOURIST_TAX", label: "Impuesto sobre estancias turísticas", amount: 22.50}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            {
                incidentId: "INC-BCN-512",
                date: "2026-10-29",
                category: "NOISE",
                cause: "HOTEL_EVENT",
                description: BCN_TERRACE_EVENT,
                startedAt: "2026-10-29T23:00",
                endedAt: "2026-10-30T01:15",
                durationHours: 2.25,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: DUTY_MANAGER
            },
            {
                incidentId: "INC-BCN-517",
                date: "2026-10-30",
                category: "NOISE",
                cause: "HOTEL_EVENT",
                description: BCN_TERRACE_EVENT,
                startedAt: "2026-10-30T23:00",
                endedAt: "2026-10-31T00:40",
                durationHours: 1.67,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: DUTY_MANAGER
            }
        ]
    },
    {
        reservationId: "RES-SIN-90017",
        hotel: hotelsById.get("SIN-MAR"),
        guest: guests.get("G-1008"),
        roomNumber: "3305",
        roomType: "Marina Bay Premier",
        checkIn: "2026-08-10",
        checkOut: "2026-08-13",
        nights: 3,
        nightlyRate: 520.00,
        currency: "SGD",
        totalRoomCharge: 1560.00,
        fees: [{code: "SERVICE_CHARGE", label: "Service charge (10%)", amount: 156.00}],
        rateType: "FLEXIBLE",
        status: "CHECKED_OUT",
        bookedVia: "DIRECT",
        incidents: [
            {
                incidentId: "INC-SIN-044",
                date: "2026-08-11",
                category: "AIR_CONDITIONING",
                cause: "HOTEL_EQUIPMENT",
                description: "Air conditioning in room 3305 not cooling (fan-coil unit fault); repaired 05:00.",
                startedAt: "2026-08-11T22:30",
                endedAt: "2026-08-12T05:00",
                durationHours: 6.5,
                reportedByGuest: true,
                guestMoved: false,
                verifiedBy: MAINTENANCE_LOG
            }
        ]
    }
];

final readonly & map<Reservation> reservationsById = map from Reservation r in reservations select [r.reservationId, r];
