// swedish-weather - SMHI Open Data API (Swedish Meteorological and Hydrological Institute)
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-nordic/0.2.0 github.com/robobobby/mcp-nordic";
  const BASE_URL = "https://opendata-download-metfcst.smhi.se/api/category/pmp3g/version/2/geotype/point";

  const SWEDISH_CITIES = {
    stockholm: { lat: 59.329, lon: 18.069, name: "Stockholm" },
    gothenburg: { lat: 57.709, lon: 11.975, name: "Gothenburg" },
    göteborg: { lat: 57.709, lon: 11.975, name: "Gothenburg" },
    malmö: { lat: 55.605, lon: 13.000, name: "Malmö" },
    malmo: { lat: 55.605, lon: 13.000, name: "Malmö" },
    uppsala: { lat: 59.859, lon: 17.639, name: "Uppsala" },
    linköping: { lat: 58.411, lon: 15.622, name: "Linköping" },
    linkoping: { lat: 58.411, lon: 15.622, name: "Linköping" },
    västerås: { lat: 59.611, lon: 16.545, name: "Västerås" },
    vasteras: { lat: 59.611, lon: 16.545, name: "Västerås" },
    örebro: { lat: 59.275, lon: 15.214, name: "Örebro" },
    orebro: { lat: 59.275, lon: 15.214, name: "Örebro" },
    norrköping: { lat: 58.588, lon: 16.192, name: "Norrköping" },
    norrkoping: { lat: 58.588, lon: 16.192, name: "Norrköping" },
    helsingborg: { lat: 56.047, lon: 12.694, name: "Helsingborg" },
    jönköping: { lat: 57.783, lon: 14.161, name: "Jönköping" },
    jonkoping: { lat: 57.783, lon: 14.161, name: "Jönköping" },
    umeå: { lat: 63.826, lon: 20.264, name: "Umeå" },
    umea: { lat: 63.826, lon: 20.264, name: "Umeå" },
    lund: { lat: 55.705, lon: 13.193, name: "Lund" },
    gävle: { lat: 60.675, lon: 17.142, name: "Gävle" },
    gavle: { lat: 60.675, lon: 17.142, name: "Gävle" },
    sundsvall: { lat: 62.391, lon: 17.307, name: "Sundsvall" },
    luleå: { lat: 65.584, lon: 22.147, name: "Luleå" },
    lulea: { lat: 65.584, lon: 22.147, name: "Luleå" },
    kiruna: { lat: 67.857, lon: 20.225, name: "Kiruna" },
    visby: { lat: 57.639, lon: 18.296, name: "Visby (Gotland)" },
    kalmar: { lat: 56.661, lon: 16.362, name: "Kalmar" },
    karlstad: { lat: 59.379, lon: 13.504, name: "Karlstad" },
    växjö: { lat: 56.879, lon: 14.806, name: "Växjö" },
    vaxjo: { lat: 56.879, lon: 14.806, name: "Växjö" },
    halmstad: { lat: 56.674, lon: 12.857, name: "Halmstad" },
    trollhättan: { lat: 58.284, lon: 12.289, name: "Trollhättan" },
    borås: { lat: 57.721, lon: 12.940, name: "Borås" },
    boras: { lat: 57.721, lon: 12.940, name: "Borås" },
    are: { lat: 63.399, lon: 13.081, name: "Åre" },
    åre: { lat: 63.399, lon: 13.081, name: "Åre" },
  };

  // SMHI Wsymb2 weather codes
  const WSYMB2 = {
    1: "Clear sky", 2: "Nearly clear sky", 3: "Variable cloudiness",
    4: "Halfclear sky", 5: "Cloudy sky", 6: "Overcast",
    7: "Fog", 8: "Light rain showers", 9: "Moderate rain showers",
    10: "Heavy rain showers", 11: "Thunderstorm", 12: "Light sleet showers",
    13: "Moderate sleet showers", 14: "Heavy sleet showers",
    15: "Light snow showers", 16: "Moderate snow showers", 17: "Heavy snow showers",
    18: "Light rain", 19: "Moderate rain", 20: "Heavy rain",
    21: "Thunder", 22: "Light sleet", 23: "Moderate sleet", 24: "Heavy sleet",
    25: "Light snowfall", 26: "Moderate snowfall", 27: "Heavy snowfall",
  };

  function resolveLocation(input) {
    const trimmed = input.trim().toLowerCase();
    if (SWEDISH_CITIES[trimmed]) return SWEDISH_CITIES[trimmed];
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]), name: `${coordMatch[1]}°N, ${coordMatch[2]}°E` };
    }
    return null;
  }

  async function geocode(query) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;
    const r = data.results[0];
    if (r.country_code?.toUpperCase() !== "SE") return null;
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  }

  async function getLocation(input) {
    const loc = resolveLocation(input);
    if (loc) return loc;
    const geo = await geocode(input);
    if (geo) return geo;
    throw new Error(`Could not find location "${input}" in Sweden. Try a city name or lat,lon coordinates.`);
  }

  function getParam(params, name) {
    const p = params.find(p => p.name === name);
    return p ? p.values[0] : null;
  }

  async function fetchForecast(lat, lon) {
    // SMHI requires coordinates rounded to 6 decimals
    const url = `${BASE_URL}/lon/${lon.toFixed(6)}/lat/${lat.toFixed(6)}/data.json`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`SMHI API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  server.tool(
    "se_current_weather",
    "Get current weather for a location in Sweden using SMHI (Swedish Meteorological and Hydrological Institute). Includes temperature, wind, precipitation, humidity.",
    {
      location: z.string().describe("Swedish city name (e.g. 'Stockholm', 'Malmö', 'Gothenburg', 'Kiruna') or lat,lon coordinates"),
    },
    async ({ location }) => {
      try {
        const loc = await getLocation(location);
        const data = await fetchForecast(loc.lat, loc.lon);
        const ts = data.timeSeries;
        if (!ts?.length) throw new Error("No forecast data");

        // Find the entry closest to now
        const now = Date.now();
        let closest = ts[0];
        let minDiff = Math.abs(new Date(ts[0].validTime).getTime() - now);
        for (const entry of ts.slice(1, 10)) {
          const diff = Math.abs(new Date(entry.validTime).getTime() - now);
          if (diff < minDiff) { closest = entry; minDiff = diff; }
        }

        const p = closest.parameters;
        const temp = getParam(p, "t");
        const wind = getParam(p, "ws");
        const gust = getParam(p, "gust");
        const windDir = getParam(p, "wd");
        const humidity = getParam(p, "r");
        const pressure = getParam(p, "msl");
        const cloud = getParam(p, "tcc_mean");
        const wsymb = getParam(p, "Wsymb2");
        const precip = getParam(p, "pmean");

        const lines = [
          `## ${loc.name} — Current Weather`,
          `**Conditions:** ${WSYMB2[wsymb] || `Code ${wsymb}`}`,
          `**Temperature:** ${temp}°C`,
          `**Humidity:** ${humidity}%`,
          `**Wind:** ${wind} m/s from ${windDir}° (gusts ${gust} m/s)`,
          `**Pressure:** ${pressure} hPa`,
          `**Cloud cover:** ${cloud != null ? Math.round(cloud * 12.5) + "%" : "N/A"}`,
          precip != null ? `**Precipitation:** ${precip} mm/h` : null,
          `\n*SMHI — ${closest.validTime}*`,
        ].filter(Boolean);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "se_weather_forecast",
    "Get weather forecast for a location in Sweden using SMHI. Returns hourly data for the next N hours.",
    {
      location: z.string().describe("Swedish city name or lat,lon coordinates"),
      hours: z.number().min(1).max(72).optional().describe("Hours ahead (default 24, max 72)"),
    },
    async ({ location, hours }) => {
      try {
        const loc = await getLocation(location);
        const data = await fetchForecast(loc.lat, loc.lon);
        const maxHours = hours || 24;
        const now = Date.now();
        const cutoff = now + maxHours * 3600000;

        const lines = [`## ${loc.name} — ${maxHours}h Forecast\n`];
        for (const entry of data.timeSeries) {
          const t = new Date(entry.validTime);
          if (t.getTime() > cutoff) break;
          if (t.getTime() < now - 3600000) continue;

          const time = t.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          const p = entry.parameters;
          const temp = getParam(p, "t");
          const wind = getParam(p, "ws");
          const wsymb = getParam(p, "Wsymb2");
          const precip = getParam(p, "pmean");

          lines.push(`**${time}:** ${temp}°C, ${WSYMB2[wsymb] || ""}, wind ${wind} m/s${precip > 0 ? `, ${precip} mm/h` : ""}`);
        }
        lines.push(`\n*SMHI Open Data*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
