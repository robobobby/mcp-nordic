// norwegian-weather - MET Norway Locationforecast 2.0 (powers yr.no)
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-nordic/0.2.0 github.com/robobobby/mcp-nordic bobby@claudewitz.dk";
  const BASE_URL = "https://api.met.no/weatherapi/locationforecast/2.0";

  const NORWEGIAN_CITIES = {
    oslo: { lat: 59.913, lon: 10.752, name: "Oslo" },
    bergen: { lat: 60.393, lon: 5.324, name: "Bergen" },
    trondheim: { lat: 63.431, lon: 10.395, name: "Trondheim" },
    stavanger: { lat: 58.970, lon: 5.733, name: "Stavanger" },
    drammen: { lat: 59.744, lon: 10.204, name: "Drammen" },
    fredrikstad: { lat: 59.221, lon: 10.935, name: "Fredrikstad" },
    kristiansand: { lat: 58.147, lon: 7.996, name: "Kristiansand" },
    tromsø: { lat: 69.649, lon: 18.956, name: "Tromsø" },
    tromso: { lat: 69.649, lon: 18.956, name: "Tromsø" },
    sandnes: { lat: 58.852, lon: 5.735, name: "Sandnes" },
    bodø: { lat: 67.280, lon: 14.405, name: "Bodø" },
    bodo: { lat: 67.280, lon: 14.405, name: "Bodø" },
    ålesund: { lat: 62.472, lon: 6.150, name: "Ålesund" },
    alesund: { lat: 62.472, lon: 6.150, name: "Ålesund" },
    haugesund: { lat: 59.414, lon: 5.268, name: "Haugesund" },
    tønsberg: { lat: 59.267, lon: 10.408, name: "Tønsberg" },
    moss: { lat: 59.434, lon: 10.659, name: "Moss" },
    porsgrunn: { lat: 59.141, lon: 9.656, name: "Porsgrunn" },
    skien: { lat: 59.210, lon: 9.609, name: "Skien" },
    molde: { lat: 62.737, lon: 7.159, name: "Molde" },
    harstad: { lat: 68.798, lon: 16.542, name: "Harstad" },
    lillehammer: { lat: 61.115, lon: 10.466, name: "Lillehammer" },
    narvik: { lat: 68.438, lon: 17.427, name: "Narvik" },
    hammerfest: { lat: 70.664, lon: 23.682, name: "Hammerfest" },
    kirkenes: { lat: 69.727, lon: 30.045, name: "Kirkenes" },
    longyearbyen: { lat: 78.223, lon: 15.627, name: "Longyearbyen (Svalbard)" },
    lofoten: { lat: 68.209, lon: 13.611, name: "Lofoten (Svolvær)" },
    svolvær: { lat: 68.234, lon: 14.568, name: "Svolvær" },
    nordkapp: { lat: 71.169, lon: 25.784, name: "Nordkapp" },
    flåm: { lat: 60.863, lon: 7.114, name: "Flåm" },
    flam: { lat: 60.863, lon: 7.114, name: "Flåm" },
    geilo: { lat: 60.534, lon: 8.206, name: "Geilo" },
    voss: { lat: 60.629, lon: 6.413, name: "Voss" },
  };

  function resolveLocation(input) {
    const trimmed = input.trim().toLowerCase();
    if (NORWEGIAN_CITIES[trimmed]) return NORWEGIAN_CITIES[trimmed];
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
    if (r.country_code?.toUpperCase() !== "NO") return null;
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  }

  async function getLocation(input) {
    const loc = resolveLocation(input);
    if (loc) return loc;
    const geo = await geocode(input);
    if (geo) return geo;
    throw new Error(`Could not find location "${input}" in Norway. Try a city name or lat,lon coordinates.`);
  }

  const SYMBOL_MAP = {
    clearsky: "Clear sky", fair: "Fair", partlycloudy: "Partly cloudy",
    cloudy: "Cloudy", fog: "Fog", lightrain: "Light rain", rain: "Rain",
    heavyrain: "Heavy rain", lightrainshowers: "Light rain showers",
    rainshowers: "Rain showers", heavyrainshowers: "Heavy rain showers",
    lightsleet: "Light sleet", sleet: "Sleet", heavysleet: "Heavy sleet",
    lightsnow: "Light snow", snow: "Snow", heavysnow: "Heavy snow",
    lightsnowshowers: "Light snow showers", snowshowers: "Snow showers",
    heavysnowshowers: "Heavy snow showers", rainandthunder: "Rain and thunder",
    heavyrainandthunder: "Heavy rain and thunder",
    lightrainandthunder: "Light rain and thunder",
    sleetandthunder: "Sleet and thunder", snowandthunder: "Snow and thunder",
    lightrainshowersandthunder: "Light rain showers and thunder",
    rainshowersandthunder: "Rain showers and thunder",
    heavyrainshowersandthunder: "Heavy rain showers and thunder",
  };

  function symbolToText(symbol) {
    if (!symbol) return "Unknown";
    // Strip _day/_night/_polartwilight suffix
    const base = symbol.replace(/_(day|night|polartwilight)$/, "");
    return SYMBOL_MAP[base] || base;
  }

  async function fetchForecast(lat, lon) {
    const url = `${BASE_URL}/complete?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`;
    const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`MET Norway API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  server.tool(
    "no_current_weather",
    "Get current weather for a location in Norway using MET Norway (yr.no). Includes temperature, wind, precipitation, humidity, and cloud cover.",
    {
      location: z.string().describe("Norwegian city name (e.g. 'Oslo', 'Bergen', 'Tromsø', 'Lofoten') or lat,lon coordinates"),
    },
    async ({ location }) => {
      try {
        const loc = await getLocation(location);
        const data = await fetchForecast(loc.lat, loc.lon);
        const ts = data.properties.timeseries;
        if (!ts?.length) throw new Error("No forecast data available");

        const now = ts[0];
        const inst = now.data.instant.details;
        const symbol = now.data.next_1_hours?.summary?.symbol_code
          || now.data.next_6_hours?.summary?.symbol_code || "";
        const precip1h = now.data.next_1_hours?.details?.precipitation_amount;

        const lines = [
          `## ${loc.name} — Current Weather`,
          `**Conditions:** ${symbolToText(symbol)}`,
          `**Temperature:** ${inst.air_temperature}°C`,
          `**Humidity:** ${inst.relative_humidity}%`,
          `**Wind:** ${inst.wind_speed} m/s from ${inst.wind_from_direction}° (gusts ${inst.wind_speed_of_gust ?? "N/A"} m/s)`,
          `**Pressure:** ${inst.air_pressure_at_sea_level} hPa`,
          `**Cloud cover:** ${inst.cloud_area_fraction}%`,
          precip1h != null ? `**Precipitation (next hour):** ${precip1h} mm` : null,
          `\n*MET Norway Locationforecast 2.0 — ${now.time}*`,
        ].filter(Boolean);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "no_weather_forecast",
    "Get weather forecast for a location in Norway using MET Norway (yr.no). Returns hourly data for the next N hours.",
    {
      location: z.string().describe("Norwegian city name or lat,lon coordinates"),
      hours: z.number().min(1).max(72).optional().describe("Hours ahead to forecast (default 24, max 72)"),
    },
    async ({ location, hours }) => {
      try {
        const loc = await getLocation(location);
        const data = await fetchForecast(loc.lat, loc.lon);
        const ts = data.properties.timeseries;
        const maxHours = hours || 24;
        const slice = ts.slice(0, maxHours);

        const lines = [`## ${loc.name} — ${maxHours}h Forecast\n`];
        for (const entry of slice) {
          const t = new Date(entry.time);
          const time = t.toLocaleString("nb-NO", { timeZone: "Europe/Oslo", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
          const inst = entry.data.instant.details;
          const symbol = entry.data.next_1_hours?.summary?.symbol_code
            || entry.data.next_6_hours?.summary?.symbol_code || "";
          const precip = entry.data.next_1_hours?.details?.precipitation_amount;
          lines.push(`**${time}:** ${inst.air_temperature}°C, ${symbolToText(symbol)}, wind ${inst.wind_speed} m/s${precip != null ? `, ${precip} mm` : ""}`);
        }
        lines.push(`\n*MET Norway Locationforecast 2.0*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
