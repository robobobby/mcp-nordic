// danish-energy - extracted from mcp-danish-energy
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-danish-energy/0.1.0 (github.com/robobobby/mcp-danish-energy)";
  const BASE_URL = "https://api.energidataservice.dk/dataset";

  // Price areas
  const PRICE_AREAS = {
    DK1: "Western Denmark (west of Storebælt)",
    DK2: "Eastern Denmark (east of Storebælt)",
  };

  async function fetchDataset(dataset, params = {}) {
    const url = new URL(`${BASE_URL}/${dataset}`);
    url.searchParams.set("format", "json");
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), { headers: { "User-Agent": USER_AGENT } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Energi Data Service API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  function formatPrice(dkk) {
    if (dkk == null) return "N/A";
    // API gives DKK/MWh, convert to øre/kWh for consumer relevance
    const oerePerKwh = dkk / 10;
    return `${oerePerKwh.toFixed(1)} øre/kWh (${dkk.toFixed(1)} DKK/MWh)`;
  }

  function resolvePriceArea(input) {
    if (!input) return null;
    const upper = input.toUpperCase().trim();
    if (upper === "DK1" || upper === "DK2") return upper;
    const lower = input.toLowerCase().trim();
    // Map common regions
    if (["west", "western", "jylland", "jutland", "fyn", "funen", "esbjerg", "aarhus", "aalborg", "odense", "herning", "vejle", "kolding", "horsens", "randers", "viborg", "silkeborg"].includes(lower)) return "DK1";
    if (["east", "eastern", "sjælland", "zealand", "copenhagen", "københavn", "amager", "roskilde", "helsingør", "hillerød", "næstved", "køge", "lolland", "falster", "bornholm"].includes(lower)) return "DK2";
    return null;
  }


  // Tool 1: Current electricity prices
  server.tool(
    "dk_electricity_prices",
    "Get current and upcoming Danish electricity spot prices (Elspot). Returns hourly prices for today and tomorrow (when available). Prices include the raw spot price, not taxes/tariffs.",
    {
      area: z.string().optional().describe("Price area: DK1 (western Denmark) or DK2 (eastern Denmark), or a city/region name. Default: both areas."),
      hours: z.number().optional().describe("Number of hours to return (default: 24, max: 168 for a full week)"),
    },
    async ({ area, hours = 24 }) => {
      const priceArea = area ? resolvePriceArea(area) : null;
      const filter = priceArea ? JSON.stringify({ PriceArea: priceArea }) : undefined;
      const limit = priceArea ? hours : hours * 2; // Both areas = 2x rows

      const data = await fetchDataset("Elspotprices", {
        limit,
        sort: "HourDK desc",
        filter,
        start: "now-P1D",
      });

      if (!data.records?.length) {
        return { content: [{ type: "text", text: "No price data available for the requested period." }] };
      }

      // Group by area
      const byArea = {};
      for (const r of data.records) {
        if (!byArea[r.PriceArea]) byArea[r.PriceArea] = [];
        byArea[r.PriceArea].push(r);
      }

      let output = "# Danish Electricity Spot Prices\n\n";
      for (const [areaCode, records] of Object.entries(byArea)) {
        output += `## ${areaCode} — ${PRICE_AREAS[areaCode] || areaCode}\n\n`;

        // Stats
        const prices = records.map(r => r.SpotPriceDKK).filter(p => p != null);
        if (prices.length) {
          const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
          const min = Math.min(...prices);
          const max = Math.max(...prices);
          output += `**Average:** ${formatPrice(avg)}\n`;
          output += `**Range:** ${formatPrice(min)} — ${formatPrice(max)}\n\n`;
        }

        output += "| Time (DK) | Price |\n|---|---|\n";
        for (const r of records.slice(0, 48)) {
          const time = r.HourDK?.replace("T", " ").slice(0, 16) || "?";
          output += `| ${time} | ${formatPrice(r.SpotPriceDKK)} |\n`;
        }
        output += "\n";
      }

      output += "*Source: Energi Data Service (Energinet). Prices are spot prices excl. taxes, tariffs, and VAT.*\n";

      return { content: [{ type: "text", text: output }] };
    }
  );

  // Tool 2: CO2 emissions
  server.tool(
    "dk_co2_emissions",
    "Get real-time CO2 emission intensity of Danish electricity production (g CO2/kWh). Updated every 5 minutes. Useful for timing energy-intensive tasks to low-carbon periods.",
    {
      area: z.string().optional().describe("Price area: DK1 or DK2, or a city/region name. Default: both areas."),
      hours: z.number().optional().describe("Hours of history to return (default: 1, max: 24)"),
    },
    async ({ area, hours = 1 }) => {
      const priceArea = area ? resolvePriceArea(area) : null;
      const filter = priceArea ? JSON.stringify({ PriceArea: priceArea }) : undefined;
      const limit = Math.min(hours * 12, 288) * (priceArea ? 1 : 2); // 12 readings/hour (5min intervals)

      const data = await fetchDataset("CO2Emis", {
        limit,
        sort: "Minutes5DK desc",
        filter,
      });

      if (!data.records?.length) {
        return { content: [{ type: "text", text: "No CO2 emission data available." }] };
      }

      const byArea = {};
      for (const r of data.records) {
        if (!byArea[r.PriceArea]) byArea[r.PriceArea] = [];
        byArea[r.PriceArea].push(r);
      }

      let output = "# Danish CO2 Emission Intensity\n\n";
      for (const [areaCode, records] of Object.entries(byArea)) {
        const latest = records[0];
        const values = records.map(r => r.CO2Emission).filter(v => v != null);
        const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

        output += `## ${areaCode} — ${PRICE_AREAS[areaCode] || areaCode}\n\n`;
        output += `**Current:** ${latest.CO2Emission} g CO2/kWh (${latest.Minutes5DK?.replace("T", " ").slice(0, 16)})\n`;
        if (avg != null) output += `**Average (last ${hours}h):** ${avg.toFixed(0)} g CO2/kWh\n`;

        // Classify
        const co2 = latest.CO2Emission;
        let label = "🟢 Very clean";
        if (co2 > 300) label = "🔴 High emissions";
        else if (co2 > 200) label = "🟡 Moderate";
        else if (co2 > 100) label = "🟢 Clean";
        output += `**Status:** ${label}\n\n`;
      }

      output += "*Source: Energi Data Service (Energinet). Real-time 5-minute resolution.*\n";
      return { content: [{ type: "text", text: output }] };
    }
  );

  // Tool 3: Energy production mix
  server.tool(
    "dk_energy_mix",
    "Get the real-time Danish electricity production mix: wind (offshore/onshore), solar, conventional, and cross-border exchange. Updated every 5 minutes.",
    {
      area: z.string().optional().describe("Price area: DK1 or DK2, or a city/region name. Default: both areas."),
    },
    async ({ area }) => {
      const priceArea = area ? resolvePriceArea(area) : null;
      const filter = priceArea ? JSON.stringify({ PriceArea: priceArea }) : undefined;

      const data = await fetchDataset("ElectricityProdex5MinRealtime", {
        limit: priceArea ? 1 : 2,
        sort: "Minutes5DK desc",
        filter,
      });

      if (!data.records?.length) {
        return { content: [{ type: "text", text: "No production data available." }] };
      }

      let output = "# Danish Electricity Production Mix\n\n";

      for (const r of data.records) {
        const offshore = r.OffshoreWindPower || 0;
        const onshore = r.OnshoreWindPower || 0;
        const solar = r.SolarPower || 0;
        const smallPlants = r.ProductionLt100MW || 0;
        const largePlants = r.ProductionGe100MW || 0;
        const totalProduction = smallPlants + largePlants;
        const totalRenewable = offshore + onshore + solar;
        const renewableShare = totalProduction > 0 ? (totalRenewable / totalProduction * 100) : 0;

        output += `## ${r.PriceArea} — ${PRICE_AREAS[r.PriceArea] || r.PriceArea}\n`;
        output += `*${r.Minutes5DK?.replace("T", " ").slice(0, 16)}*\n\n`;

        output += `### Production\n`;
        output += `| Source | MW |\n|---|---|\n`;
        output += `| ⚡ Offshore wind | ${offshore.toFixed(1)} |\n`;
        output += `| 🌬️ Onshore wind | ${onshore.toFixed(1)} |\n`;
        output += `| ☀️ Solar | ${solar.toFixed(1)} |\n`;
        output += `| 🏭 Large plants (≥100MW) | ${largePlants.toFixed(1)} |\n`;
        output += `| 🔧 Small plants (<100MW) | ${smallPlants.toFixed(1)} |\n`;
        output += `| **Total** | **${totalProduction.toFixed(1)}** |\n`;
        output += `| **Renewable share** | **${renewableShare.toFixed(1)}%** |\n\n`;

        // Cross-border exchanges (positive = import, negative = export)
        const exchanges = [
          ["🇩🇪 Germany", r.ExchangeGermany],
          ["🇳🇱 Netherlands", r.ExchangeNetherlands],
          ["🇬🇧 Great Britain", r.ExchangeGreatBritain],
          ["🇳🇴 Norway", r.ExchangeNorway],
          ["🇸🇪 Sweden", r.ExchangeSweden],
          ["🌉 Great Belt", r.ExchangeGreatBelt],
        ].filter(([, v]) => v != null);

        if (exchanges.length) {
          output += `### Cross-border Exchange (MW)\n`;
          output += `| Connection | MW | Direction |\n|---|---|---|\n`;
          for (const [name, mw] of exchanges) {
            const dir = mw > 0 ? "→ Import" : mw < 0 ? "← Export" : "—";
            output += `| ${name} | ${Math.abs(mw).toFixed(1)} | ${dir} |\n`;
          }
          output += "\n";
        }
      }

      output += "*Source: Energi Data Service (Energinet). Real-time 5-minute resolution.*\n";
      return { content: [{ type: "text", text: output }] };
    }
  );

  // Tool 4: Price forecast / cheapest hours
  server.tool(
    "dk_cheapest_hours",
    "Find the cheapest hours to use electricity today/tomorrow. Useful for scheduling EV charging, laundry, dishwasher, heat pumps, etc.",
    {
      area: z.string().describe("Price area: DK1 or DK2, or a city/region name."),
      count: z.number().optional().describe("Number of cheapest hours to return (default: 5)"),
      consecutive: z.boolean().optional().describe("If true, find the cheapest consecutive block of 'count' hours (default: false)"),
    },
    async ({ area, count = 5, consecutive = false }) => {
      const priceArea = resolvePriceArea(area);
      if (!priceArea) {
        return { content: [{ type: "text", text: "Could not determine price area. Use DK1 (western Denmark) or DK2 (eastern Denmark), or a city name." }] };
      }

      const data = await fetchDataset("Elspotprices", {
        limit: 48,
        sort: "HourDK asc",
        filter: JSON.stringify({ PriceArea: priceArea }),
        start: "now-PT1H",
      });

      if (!data.records?.length) {
        return { content: [{ type: "text", text: "No price data available." }] };
      }

      const records = data.records.filter(r => r.SpotPriceDKK != null);

      let output = `# Cheapest Hours — ${priceArea} (${PRICE_AREAS[priceArea]})\n\n`;

      if (consecutive && count > 1) {
        // Find cheapest consecutive block
        let bestStart = 0;
        let bestAvg = Infinity;
        for (let i = 0; i <= records.length - count; i++) {
          const block = records.slice(i, i + count);
          const avg = block.reduce((s, r) => s + r.SpotPriceDKK, 0) / count;
          if (avg < bestAvg) {
            bestAvg = avg;
            bestStart = i;
          }
        }

        const block = records.slice(bestStart, bestStart + count);
        output += `**Best ${count}-hour block:**\n`;
        output += `**Start:** ${block[0].HourDK?.replace("T", " ").slice(0, 16)}\n`;
        output += `**End:** ${block[block.length - 1].HourDK?.replace("T", " ").slice(0, 16)} + 1h\n`;
        output += `**Average price:** ${formatPrice(bestAvg)}\n\n`;

        output += "| Hour | Price |\n|---|---|\n";
        for (const r of block) {
          output += `| ${r.HourDK?.replace("T", " ").slice(0, 16)} | ${formatPrice(r.SpotPriceDKK)} |\n`;
        }
      } else {
        // Find N cheapest individual hours
        const sorted = [...records].sort((a, b) => a.SpotPriceDKK - b.SpotPriceDKK);
        const cheapest = sorted.slice(0, count);

        output += `**${count} cheapest hours:**\n\n`;
        output += "| Rank | Hour | Price |\n|---|---|---|\n";
        for (let i = 0; i < cheapest.length; i++) {
          const r = cheapest[i];
          output += `| ${i + 1} | ${r.HourDK?.replace("T", " ").slice(0, 16)} | ${formatPrice(r.SpotPriceDKK)} |\n`;
        }
      }

      output += "\n*Prices are spot prices excl. taxes, tariffs, and VAT. Source: Energi Data Service.*\n";
      return { content: [{ type: "text", text: output }] };
    }
  );

  // Connect
}
