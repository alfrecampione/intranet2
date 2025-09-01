import fs from "fs";

const citiesByState = JSON.parse(
    fs.readFileSync("./src/config/US_States_and_Cities.json", "utf8")
);


const STATE_ABBR_TO_NAME = {
    al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas",
    ca: "california", co: "colorado", ct: "connecticut", de: "delaware",
    fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho",
    il: "illinois", in: "indiana", ia: "iowa", ks: "kansas",
    ky: "kentucky", la: "louisiana", me: "maine", md: "maryland",
    ma: "massachusetts", mi: "michigan", mn: "minnesota", ms: "mississippi",
    mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada",
    nh: "new hampshire", nj: "new jersey", nm: "new mexico", ny: "new york",
    nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma",
    or: "oregon", pa: "pennsylvania", ri: "rhode island", sc: "south carolina",
    sd: "south dakota", tn: "tennessee", tx: "texas", ut: "utah",
    vt: "vermont", va: "virginia", wa: "washington", wv: "west virginia",
    wi: "wisconsin", wy: "wyoming",
};

const getCity = async (req, res) => {
    try {
        const stateAbbr = (req.query.state || "").toLowerCase();

        if (!stateAbbr || !STATE_ABBR_TO_NAME[stateAbbr]) {
            return res.status(400).json({ error: "Invalid or missing state abbreviation" });
        }

        const stateName = STATE_ABBR_TO_NAME[stateAbbr];
        const cities = citiesByState[stateName.charAt(0).toUpperCase() + stateName.slice(1)] || [];

        return res.json(cities);
    } catch (err) {
        console.error("Error fetching cities:", err);
        return res.status(500).json({ error: "Server error" });
    }
};

export { getCity };