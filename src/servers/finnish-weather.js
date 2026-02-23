// finnish-weather - Finnish weather via Open-Meteo (ECMWF + ICON models)
// Free, no authentication required. Covers all of Finland.
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-nordic/0.3.0 (github.com/robobobby/mcp-nordic)";
  const BASE_URL = "https://api.open-meteo.com/v1/forecast";

  const FINNISH_CITIES = {
    helsinki: { lat: 60.170, lon: 24.941, name: "Helsinki" },
    espoo: { lat: 60.206, lon: 24.656, name: "Espoo" },
    tampere: { lat: 61.498, lon: 23.761, name: "Tampere" },
    vantaa: { lat: 60.293, lon: 25.044, name: "Vantaa" },
    oulu: { lat: 65.012, lon: 25.465, name: "Oulu" },
    turku: { lat: 60.452, lon: 22.267, name: "Turku" },
    åbo: { lat: 60.452, lon: 22.267, name: "Turku" },
    jyväskylä: { lat: 62.243, lon: 25.747, name: "Jyväskylä" },
    jyvaskyla: { lat: 62.243, lon: 25.747, name: "Jyväskylä" },
    lahti: { lat: 60.984, lon: 25.656, name: "Lahti" },
    kuopio: { lat: 62.893, lon: 27.678, name: "Kuopio" },
    pori: { lat: 61.485, lon: 21.797, name: "Pori" },
    joensuu: { lat: 62.601, lon: 29.763, name: "Joensuu" },
    lappeenranta: { lat: 61.059, lon: 28.187, name: "Lappeenranta" },
    hämeenlinna: { lat: 60.997, lon: 24.465, name: "Hämeenlinna" },
    hameenlinna: { lat: 60.997, lon: 24.465, name: "Hämeenlinna" },
    vaasa: { lat: 63.096, lon: 21.616, name: "Vaasa" },
    seinäjoki: { lat: 62.790, lon: 22.840, name: "Seinäjoki" },
    seinajoki: { lat: 62.790, lon: 22.840, name: "Seinäjoki" },
    rovaniemi: { lat: 66.500, lon: 25.717, name: "Rovaniemi" },
    kokkola: { lat: 63.838, lon: 23.130, name: "Kokkola" },
    kotka: { lat: 60.467, lon: 26.946, name: "Kotka" },
    mikkeli: { lat: 61.688, lon: 27.272, name: "Mikkeli" },
    porvoo: { lat: 60.395, lon: 25.665, name: "Porvoo" },
    rauma: { lat: 61.128, lon: 21.511, name: "Rauma" },
    kajaani: { lat: 64.227, lon: 27.728, name: "Kajaani" },
    savonlinna: { lat: 61.869, lon: 28.878, name: "Savonlinna" },
    kouvola: { lat: 60.869, lon: 26.704, name: "Kouvola" },
    levi: { lat: 67.800, lon: 24.813, name: "Levi" },
    saariselkä: { lat: 68.415, lon: 27.413, name: "Saariselkä" },
    saariselka: { lat: 68.415, lon: 27.413, name: "Saariselkä" },
    inari: { lat: 69.071, lon: 27.028, name: "Inari" },
    sodankylä: { lat: 67.418, lon: 26.590, name: "Sodankylä" },
    sodankyla: { lat: 67.418, lon: 26.590, name: "Sodankylä" },
    ivalo: { lat: 68.659, lon: 27.553, name: "Ivalo" },
    muonio: { lat: 67.923, lon: 23.685, name: "Muonio" },
    enontekiö: { lat: 68.394, lon: 23.635, name: "Enontekiö" },
    kilpisjärvi: { lat: 69.048, lon: 20.789, name: "Kilpisjärvi" },
    kilpisjarvi: { lat: 69.048, lon: 20.789, name: "Kilpisjärvi" },
    utsjoki: { lat: 69.908, lon: 27.028, name: "Utsjoki" },
    hanko: { lat: 59.824, lon: 22.969, name: "Hanko" },
    naantali: { lat: 60.468, lon: 22.026, name: "Naantali" },
    mariehamn: { lat: 60.097, lon: 19.935, name: "Mariehamn (Åland)" },
    maarianhamina: { lat: 60.097, lon: 19.935, name: "Mariehamn (Åland)" },
  };

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
    if (FINNISH_CITIES[trimmed]) return FINNISH_CITIES[trimmed];
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
    if (r.country_code?.toUpperCase() !== "FI") return null;
    return { lat: r.latitude, lon: r.longitude, name: r.name };
  }

  async function getLocation(input) {
    const loc = resolveLocation(input);
    if (loc) return loc;
    const geo = await geocode(input);
    if (geo) return geo;
    throw new Error(`Could not find location "${input}" in Finland. Try a city name or lat,lon coordinates.`);
  }

  async function openMeteoFetch(params) {
    const url = new URL(BASE_URL);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    url.searchParams.set("timezone", "Europe/Helsinki");
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Open-Meteo API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  server.tool(
    "fi_current_weather",
    "Get current weather conditions for a location in Finland. Includes temperature, wind, precipitation, humidity, and cloud cover.",
    {
      location: z.string().describe("Finnish city name (e.g. 'Helsinki', 'Tampere', 'Rovaniemi', 'Levi') or lat,lon coordinates"),
    },
    async ({ location }) => {
      try {
        const loc = await getLocation(location);
        const data = await openMeteoFetch({
          latitude: loc.lat,
          longitude: loc.lon,
          current: "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,surface_pressure,cloud_cover,snowfall",
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
          c.snowfall > 0 ? `**Snowfall:** ${c.snowfall} cm` : null,
          `\n*Open-Meteo — ${c.time} (Europe/Helsinki)*`,
        ].filter(Boolean);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "fi_weather_forecast",
    "Get hourly or daily weather forecast for a location in Finland. Up to 16 days ahead.",
    {
      location: z.string().describe("Finnish city name or lat,lon coordinates"),
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
          params.hourly = "temperature_2m,apparent_temperature,precipitation,snowfall,weather_code,wind_speed_10m,wind_gusts_10m,cloud_cover";
        } else {
          params.daily = "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,snowfall_sum,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant";
        }

        const data = await openMeteoFetch(params);
        const lines = [`## ${loc.name} — ${forecastDays}-Day Forecast\n`];

        if (isHourly) {
          const h = data.hourly;
          for (let i = 0; i < h.time.length; i++) {
            const t = new Date(h.time[i]);
            const time = t.toLocaleString("fi-FI", { timeZone: "Europe/Helsinki", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
            const wx = WMO_CODES[h.weather_code[i]] || "";
            const snow = h.snowfall[i] > 0 ? `, snow ${h.snowfall[i]} cm` : "";
            lines.push(`**${time}:** ${h.temperature_2m[i]}°C (feels ${h.apparent_temperature[i]}°C), ${wx}, wind ${h.wind_speed_10m[i]} km/h, precip ${h.precipitation[i]} mm${snow}`);
          }
        } else {
          const d = data.daily;
          for (let i = 0; i < d.time.length; i++) {
            const date = new Date(d.time[i]);
            const day = date.toLocaleDateString("fi-FI", { timeZone: "Europe/Helsinki", weekday: "long", day: "numeric", month: "long" });
            const wx = WMO_CODES[d.weather_code[i]] || "";
            const sunrise = d.sunrise[i]?.split("T")[1] || "";
            const sunset = d.sunset[i]?.split("T")[1] || "";
            const snow = d.snowfall_sum[i] > 0 ? `\nSnowfall: ${d.snowfall_sum[i]} cm` : "";
            lines.push(`### ${day}`);
            lines.push(`${wx} | ${d.temperature_2m_min[i]}°C to ${d.temperature_2m_max[i]}°C (feels ${d.apparent_temperature_min[i]}° to ${d.apparent_temperature_max[i]}°)`);
            lines.push(`Wind: up to ${d.wind_speed_10m_max[i]} km/h (gusts ${d.wind_gusts_10m_max[i]} km/h) from ${d.wind_direction_10m_dominant[i]}°`);
            lines.push(`Precipitation: ${d.precipitation_sum[i]} mm${snow} | ☀️ ${sunrise} — ${sunset}\n`);
          }
        }

        lines.push(`*Open-Meteo forecast (Europe/Helsinki)*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "fi_compare_weather",
    "Compare current weather between two Finnish locations side by side.",
    {
      location1: z.string().describe("First location (city name or coordinates)"),
      location2: z.string().describe("Second location"),
    },
    async ({ location1, location2 }) => {
      try {
        const [loc1, loc2] = await Promise.all([getLocation(location1), getLocation(location2)]);
        const [data1, data2] = await Promise.all([
          openMeteoFetch({
            latitude: loc1.lat, longitude: loc1.lon,
            current: "temperature_2m,apparent_temperature,precipitation,snowfall,weather_code,wind_speed_10m,cloud_cover",
          }),
          openMeteoFetch({
            latitude: loc2.lat, longitude: loc2.lon,
            current: "temperature_2m,apparent_temperature,precipitation,snowfall,weather_code,wind_speed_10m,cloud_cover",
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
          c1.snowfall > 0 || c2.snowfall > 0 ? `| **Snowfall** | ${c1.snowfall} cm | ${c2.snowfall} cm |` : null,
          `\n*Open-Meteo*`,
        ].filter(Boolean);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
