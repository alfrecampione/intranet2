import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

/**
 * Census API – Places (cities, towns, CDP)
 * Año 2022 (estable)
 */
const YEARS = ["2023", "2022", "2021", "2020"];
const QUERY_VARIANTS = [
    "for=place:*&in=state:*", // documented pattern
    "for=place:*" // fallback in case the endpoint dislikes the state filter
];
const API_KEY = process.env.CENSUS_API_KEY || "";
const CENSUS_URLS = [
  `https://api.census.gov/data/2022/acs/acs5?get=NAME&for=place:*&in=state:*${API_KEY ? `&key=${API_KEY}` : ""}`
];

/**
 * State FIPS → State Abbreviation
 */
const STATE_FIPS_TO_ABBR = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT",
    "10": "DE", "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN",
    "19": "IA", "20": "KS", "21": "KY", "22": "LA", "23": "ME", "24": "MD", "25": "MA",
    "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT", "31": "NE", "32": "NV",
    "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN",
    "48": "TX", "49": "UT", "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI",
    "56": "WY"
};

/**
 * Limpieza básica de nombres
 */
function normalizeCity(name) {
    return name
        .replace(/ city$/i, "")
        .replace(/ town$/i, "")
        .replace(/ village$/i, "")
        .replace(/ borough$/i, "")
        .replace(/ municipality$/i, "")
        .trim();
}

export async function extract() {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const cachePath = path.resolve(__dirname, "US_States_and_Cities.json");

    try {
        let rows;
        let lastError;

        for (const url of CENSUS_URLS) {
            try {
                const response = await fetch(url, {
                    headers: {
                        "User-Agent": "intranet2/US-cities updater"
                    }
                });

                if (!response.ok) {
                    const errorBody = await response.text().catch(() => "");
                    throw new Error(`Census API ${response.status} ${response.statusText}. Body: ${errorBody.slice(0, 200)}`);
                }

                const contentType = response.headers.get("content-type") || "";
                const rawBody = await response.text();

                if (!contentType.toLowerCase().includes("json")) {
                    throw new Error(`Unexpected content-type ${contentType}. Body: ${rawBody.slice(0, 200)}`);
                }

                try {
                    rows = JSON.parse(rawBody);
                    console.log(`Census dataset fetched from ${url}`);
                    break;
                } catch (err) {
                    throw new Error(`Invalid JSON payload: ${err.message}. Body: ${rawBody.slice(0, 200)}`);
                }
            } catch (err) {
                lastError = err;
                console.warn(`Census fetch failed for ${url}: ${err.message}`);
            }
        }

        if (!rows) {
            throw lastError || new Error("Census dataset could not be fetched");
        }

        const result = {};

        // saltar header
        for (let i = 1; i < rows.length; i++) {
            const [fullName, stateFips] = rows[i];

            const state = STATE_FIPS_TO_ABBR[stateFips];
            if (!state) continue;

            // "Los Angeles city, California" → "Los Angeles"
            const city = normalizeCity(fullName.split(",")[0]);

            if (!result[state]) {
                result[state] = [];
            }

            result[state].push(city);
        }

        // ordenar y quitar duplicados
        for (const state of Object.keys(result)) {
            result[state] = [...new Set(result[state])].sort();
        }

        fs.writeFileSync(
            cachePath,
            JSON.stringify(result, null, 2),
            "utf8"
        );

        console.log("✅ Estados y ciudades extraídos del Census");
    } catch (err) {
        console.error("Failed to update US states/cities from Census API:", err.message);

        if (fs.existsSync(cachePath)) {
            console.warn(`Using cached cities from ${cachePath}`);
            return;
        }

        console.warn("No cached US_States_and_Cities.json available. Skipping update.");
    }
}