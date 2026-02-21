// danish-weather - extracted from mcp-danish-weather
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-danish-weather/0.1.0 (github.com/robobobby/mcp-danish-weather)";
  const BASE_URL = "https://api.open-meteo.com/v1/forecast";

  // Common Danish cities for name-to-coordinate resolution
  const DANISH_CITIES = {
    copenhagen: { lat: 55.676, lon: 12.568, name: "Copenhagen" },
    københavn: { lat: 55.676, lon: 12.568, name: "Copenhagen" },
    aarhus: { lat: 56.163, lon: 10.204, name: "Aarhus" },
    århus: { lat: 56.163, lon: 10.204, name: "Aarhus" },
    odense: { lat: 55.396, lon: 10.389, name: "Odense" },
    aalborg: { lat: 57.048, lon: 9.922, name: "Aalborg" },
    esbjerg: { lat: 55.467, lon: 8.452, name: "Esbjerg" },
    randers: { lat: 56.461, lon: 10.036, name: "Randers" },
    kolding: { lat: 55.490, lon: 9.472, name: "Kolding" },
    horsens: { lat: 55.861, lon: 9.850, name: "Horsens" },
    vejle: { lat: 55.711, lon: 9.536, name: "Vejle" },
    roskilde: { lat: 55.642, lon: 12.087, name: "Roskilde" },
    herning: { lat: 56.139, lon: 8.974, name: "Herning" },
    silkeborg: { lat: 56.170, lon: 9.545, name: "Silkeborg" },
    næstved: { lat: 55.230, lon: 11.760, name: "Næstved" },
    fredericia: { lat: 55.566, lon: 9.752, name: "Fredericia" },
    viborg: { lat: 56.453, lon: 9.402, name: "Viborg" },
    køge: { lat: 55.458, lon: 12.182, name: "Køge" },
    holstebro: { lat: 56.360, lon: 8.616, name: "Holstebro" },
    slagelse: { lat: 55.403, lon: 11.354, name: "Slagelse" },
    hillerød: { lat: 55.927, lon: 12.311, name: "Hillerød" },
    helsingør: { lat: 56.036, lon: 12.614, name: "Helsingør" },
    frederikshavn: { lat: 57.441, lon: 10.537, name: "Frederikshavn" },
    gilleleje: { lat: 56.122, lon: 12.311, name: "Gilleleje" },
    solrød: { lat: 55.533, lon: 12.183, name: "Solrød" },
    "ølsemagle": { lat: 55.490, lon: 12.175, name: "Ølsemagle" },
    hellerup: { lat: 55.730, lon: 12.572, name: "Hellerup" },
    frederiksberg: { lat: 55.680, lon: 12.531, name: "Frederiksberg" },
    gentofte: { lat: 55.752, lon: 12.549, name: "Gentofte" },
    lyngby: { lat: 55.771, lon: 12.504, name: "Lyngby" },
    taastrup: { lat: 55.652, lon: 12.299, name: "Taastrup" },
    glostrup: { lat: 55.664, lon: 12.398, name: "Glostrup" },
    ballerup: { lat: 55.732, lon: 12.364, name: "Ballerup" },
    hvidovre: { lat: 55.641, lon: 12.474, name: "Hvidovre" },
    brøndby: { lat: 55.649, lon: 12.420, name: "Brøndby" },
    ishøj: { lat: 55.615, lon: 12.351, name: "Ishøj" },
    greve: { lat: 55.583, lon: 12.300, name: "Greve" },
    nørrebro: { lat: 55.696, lon: 12.552, name: "Nørrebro" },
    vesterbro: { lat: 55.670, lon: 12.553, name: "Vesterbro" },
    amager: { lat: 55.644, lon: 12.601, name: "Amager" },
  };

  // WMO Weather codes
  const WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Moderate drizzle",
    55: "Dense drizzle", 56: "Freezing drizzle (light)", 57: "Freezing drizzle (dense)",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Freezing rain (light)", 67: "Freezing rain (heavy)",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow", 77: "Snow grains",
    80: "Rain showers (slight)", 81: "Rain showers (moderate)", 82: "Rain showers (violent)",
    85: "Snow showers (slight)", 86: "Snow showers (heavy)",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
  };

  function resolveLocation(input) {
    const trimmed = input.trim().toLowerCase();
    // Check city names
    if (DANISH_CITIES[trimmed]) return DANISH_CITIES[trimmed];
    // Check coordinates: lat,lon
    const coordMatch = trimmed.match(/^(-?\d+\.?\d*)\s*,\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      return { lat: parseFloat(coordMatch[1]), lon: parseFloat(coordMatch[2]), name: `${coordMatch[1]}°N, ${coordMatch[2]}°E` };
    }
    // Check postal code (rough: map common DK postal codes to coords via geocoding fallback)
    return null;
  }

  async function openMeteoFetch(params) {
    const url = new URL(BASE_URL);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    url.searchParams.set("models", "dmi_harmonie_arome_europe");
    url.searchParams.set("timezone", "Europe/Copenhagen");
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Open-Meteo API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  // Geocode via Open-Meteo geocoding API for locations not in our dict
  async function geocode(query) {
    const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=en&format=json`, {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.results?.length) return null;
    const r = data.results[0];
    // Only accept Danish results
    if (r.country_code?.toUpperCase() !== "DK") return null;
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  }

  async function getLocation(input) {
    const loc = resolveLocation(input);
    if (loc) return loc;
    const geo = await geocode(input);
    if (geo) return geo;
    throw new Error(`Could not find location "${input}" in Denmark. Try a city name, postal code, or lat,lon coordinates.`);
  }


  // Tool 1: Current weather
  server.tool(
    "dk_current_weather",
    "Get current weather conditions for a location in Denmark. Uses DMI HARMONIE high-resolution model (2km). Accepts city names, coordinates, or postal codes.",
    {
      location: z.string().describe("Danish city name (e.g. 'Copenhagen', 'Aarhus', 'Gilleleje'), postal code, or lat,lon coordinates"),
    },
    async ({ location }) => {
      try {
        const loc = await getLocation(location);
        const data = await openMeteoFetch({
          latitude: loc.lat,
          longitude: loc.lon,
          current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover",
        });
        const c = data.current;
        const weather = WMO_CODES[c.weather_code] || `Code ${c.weather_code}`;
        const lines = [
          `## ${loc.name} — Current Weather`,
          `**Conditions:** ${weather}`,
          `**Temperature:** ${c.temperature_2m}°C (feels like ${c.apparent_temperature}°C)`,
          `**Humidity:** ${c.relative_humidity_2m}%`,
          `**Wind:** ${c.wind_speed_10m} km/h from ${c.wind_direction_10m}° (gusts ${c.wind_gusts_10m} km/h)`,
          `**Pressure:** ${c.surface_pressure} hPa`,
          `**Cloud cover:** ${c.cloud_cover}%`,
          `**Precipitation:** ${c.precipitation} mm`,
          `\n*DMI HARMONIE model, ${data.current_units?.time || ""} ${c.time}*`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool 2: Weather forecast
  server.tool(
    "dk_weather_forecast",
    "Get hourly or daily weather forecast for a location in Denmark. Uses DMI HARMONIE 2km model for the first 2.5 days, then ECMWF for up to 16 days.",
    {
      location: z.string().describe("Danish city name, postal code, or lat,lon coordinates"),
      days: z.number().min(1).max(16).optional().describe("Forecast days (default 3, max 16)"),
      mode: z.enum(["hourly", "daily"]).optional().describe("Hourly detail or daily summary (default: daily)"),
    },
    async ({ location, days, mode }) => {
      try {
        const loc = await getLocation(location);
        const forecastDays = days || 3;
        const isHourly = mode === "hourly";

        const params = { latitude: loc.lat, longitude: loc.lon, forecast_days: forecastDays };
        if (isHourly) {
          params.hourly = "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover";
        } else {
          params.daily = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant";
        }

        const data = await openMeteoFetch(params);
        const lines = [`## ${loc.name} — ${forecastDays}-Day Forecast\n`];

        if (isHourly) {
          const h = data.hourly;
          for (let i = 0; i < h.time.length; i++) {
            const t = new Date(h.time[i]);
            const time = t.toLocaleString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            const wx = WMO_CODES[h.weather_code[i]] || "";
            lines.push(`**${time}:** ${h.temperature_2m[i]}°C (feels ${h.apparent_temperature[i]}°C), ${wx}, wind ${h.wind_speed_10m[i]} km/h, precip ${h.precipitation[i]} mm`);
          }
        } else {
          const d = data.daily;
          for (let i = 0; i < d.time.length; i++) {
            const date = new Date(d.time[i]);
            const day = date.toLocaleDateString("da-DK", { timeZone: "Europe/Copenhagen", weekday: "long", day: "numeric", month: "long" });
            const wx = WMO_CODES[d.weather_code[i]] || "";
            const sunrise = d.sunrise[i]?.split("T")[1] || "";
            const sunset = d.sunset[i]?.split("T")[1] || "";
            lines.push(`### ${day}`);
            lines.push(`${wx} | ${d.temperature_2m_min[i]}°C to ${d.temperature_2m_max[i]}°C (feels ${d.apparent_temperature_min[i]}° to ${d.apparent_temperature_max[i]}°)`);
            lines.push(`Wind: up to ${d.wind_speed_10m_max[i]} km/h (gusts ${d.wind_gusts_10m_max[i]} km/h) from ${d.wind_direction_10m_dominant[i]}°`);
            lines.push(`Precipitation: ${d.precipitation_sum[i]} mm | ☀️ ${sunrise} — ${sunset}\n`);
          }
        }

        lines.push(`*DMI HARMONIE 2km model via Open-Meteo*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool 3: Compare weather between locations
  server.tool(
    "dk_compare_weather",
    "Compare current weather between two Danish locations side by side. Useful for deciding between destinations or comparing conditions across the country.",
    {
      location1: z.string().describe("First location (city name, postal code, or coordinates)"),
      location2: z.string().describe("Second location"),
    },
    async ({ location1, location2 }) => {
      try {
        const [loc1, loc2] = await Promise.all([getLocation(location1), getLocation(location2)]);
        const [data1, data2] = await Promise.all([
          openMeteoFetch({
            latitude: loc1.lat, longitude: loc1.lon,
            current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover",
          }),
          openMeteoFetch({
            latitude: loc2.lat, longitude: loc2.lon,
            current: "temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,cloud_cover",
          }),
        ]);
        const c1 = data1.current, c2 = data2.current;
        const wx1 = WMO_CODES[c1.weather_code] || "", wx2 = WMO_CODES[c2.weather_code] || "";
        const lines = [
          `## Weather Comparison\n`,
          `| | ${loc1.name} | ${loc2.name} |`,
          `|---|---|---|`,
          `| **Conditions** | ${wx1} | ${wx2} |`,
          `| **Temperature** | ${c1.temperature_2m}°C | ${c2.temperature_2m}°C |`,
          `| **Feels like** | ${c1.apparent_temperature}°C | ${c2.apparent_temperature}°C |`,
          `| **Wind** | ${c1.wind_speed_10m} km/h | ${c2.wind_speed_10m} km/h |`,
          `| **Cloud cover** | ${c1.cloud_cover}% | ${c2.cloud_cover}% |`,
          `| **Precipitation** | ${c1.precipitation} mm | ${c2.precipitation} mm |`,
          `\n*DMI HARMONIE 2km model*`,
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Resource: usage info
  server.resource(
    "usage",
    "dmi://usage",
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: `# Danish Weather MCP Server (DMI HARMONIE)

  ## About
  Uses the DMI HARMONIE AROME high-resolution (2km) weather model via Open-Meteo.
  Free, no authentication required. Optimized for Denmark and Northern Europe.

  ## Tools
  - \`current_weather\` — Current conditions for any Danish location
  - \`weather_forecast\` — Hourly or daily forecast up to 16 days
  - \`compare_weather\` — Side-by-side comparison of two locations

  ## Location Formats
  - City name: copenhagen, aarhus, odense, gilleleje
  - Coordinates: 55.6761,12.5683

  ## Model
  DMI HARMONIE AROME DINI — 2km resolution, updated every 3 hours.
  First 2.5 days: DMI model. After: ECMWF IFS blend.

  ## Data Source
  Danish Meteorological Institute via Open-Meteo.
  `,
      }],
    })
  );
}
