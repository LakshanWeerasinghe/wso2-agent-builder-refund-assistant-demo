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

import ballerina/http;
import ballerina/mcp;

// The MCP service and the REST API share one HTTP listener.
listener http:Listener httpListener = new (port);
listener mcp:StreamableHttpListener mcpListener = check new (httpListener);

// Read-only tools: nothing here changes a reservation or pays a refund.
@mcp:StreamableHttpServiceConfig {
    info: {name: "ReverieEscapes Guest Services", version: "1.0.0"},
    sessionMode: mcp:STATELESS
}
service mcp:StreamableHttpService /mcp on mcpListener {

    @mcp:Tool {
        description: "Get a ReverieEscapes reservation by its ID (for example RES-PAR-24117) from the reservation "
            + "system. Returns the hotel (country, region, currency, local language), the guest (name, email, "
            + "preferred language, home country), room, check-in/check-out dates, nights, nightly room rate, "
            + "total room charge, taxes and fees charged, rate type, booking channel, status, and every incident "
            + "recorded in the property's maintenance/incident log during the stay (night, category, cause, "
            + "hotel-local start/end times, duration in hours, whether the guest reported it, whether the guest "
            + "was moved, and who verified it). Incidents not listed here are not recorded by the hotel."
    }
    remote function getReservation(string reservationId) returns Reservation|error {
        Reservation? reservation = reservationsById[reservationId.trim().toUpperAscii()];
        if reservation is () {
            return error(string `No reservation found with ID ${reservationId}`);
        }
        return reservation;
    }

    @mcp:Tool {
        description: "Get a guest's Reverie Circle loyalty profile by guest ID (for example G-1001; the guest ID is "
            + "in the reservation's guest field): tier (CLASSIC, SILVER, GOLD or PLATINUM), current points "
            + "balance and member-since date. The tier determines the service-recovery points awarded."
    }
    remote function getLoyaltyProfile(string guestId) returns LoyaltyProfile|error {
        LoyaltyProfile? profile = loyaltyProfiles[guestId.trim().toUpperAscii()];
        if profile is () {
            return error(string `No loyalty profile found for guest ${guestId}`);
        }
        return profile;
    }

    @mcp:Tool {
        description: "Get a ReverieEscapes hotel by its hotel ID (for example PAR-OPE or KYO-GIO): name, city, "
            + "country code and name, region (EUROPE, AFRICA, AMERICAS or ASIA_PACIFIC), category (CITY, RESORT, "
            + "SAFARI_LODGE or RYOKAN), number of rooms, local currency and local language. The region, country "
            + "and hotel ID determine which refund policies apply."
    }
    remote function getHotel(string hotelId) returns Hotel|error {
        Hotel? hotel = hotelsById[hotelId.trim().toUpperAscii()];
        if hotel is () {
            return error(string `No hotel found with ID ${hotelId}`);
        }
        return hotel;
    }
}

@http:ServiceConfig {
    cors: {
        allowOrigins: ["*"],
        allowMethods: ["GET", "POST", "OPTIONS"],
        allowHeaders: ["Content-Type"]
    }
}
service /api on httpListener {

    resource function get regions() returns RegionInfo[] => regions;

    resource function get hotels(string? region = (), string? countryCode = ()) returns Hotel[] {
        string? regionFilter = normalise(region);
        string? countryFilter = normalise(countryCode);
        return from Hotel h in hotels
            where (regionFilter is () || h.region == regionFilter)
                && (countryFilter is () || h.countryCode == countryFilter)
            select h;
    }

    resource function get hotels/[string hotelId]() returns Hotel|http:NotFound {
        Hotel? hotel = hotelsById[hotelId.toUpperAscii()];
        return hotel ?: notFound(string `No hotel found with ID ${hotelId}`);
    }

    resource function get reservations(string? hotelId = ()) returns Reservation[] {
        string? hotelFilter = normalise(hotelId);
        return from Reservation r in reservations
            where hotelFilter is () || r.hotel.hotelId == hotelFilter
            select r;
    }

    resource function get reservations/[string reservationId]() returns Reservation|http:NotFound {
        Reservation? reservation = reservationsById[reservationId.toUpperAscii()];
        return reservation ?: notFound(string `No reservation found with ID ${reservationId}`);
    }

    resource function get guests/[string guestId]/loyalty() returns LoyaltyProfile|http:NotFound {
        LoyaltyProfile? profile = loyaltyProfiles[guestId.toUpperAscii()];
        return profile ?: notFound(string `No loyalty profile found for guest ${guestId}`);
    }
}
