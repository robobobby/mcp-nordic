#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Import all Nordic server modules
import { register as registerDanishCVR } from "./servers/danish-cvr.js";
import { register as registerDanishAddresses } from "./servers/danish-addresses.js";
import { register as registerDanishWeather } from "./servers/danish-weather.js";
import { register as registerDanishEnergy } from "./servers/danish-energy.js";
import { register as registerNorwegianCompanies } from "./servers/norwegian-companies.js";
import { register as registerFinnishCompanies } from "./servers/finnish-companies.js";
import { register as registerNorwegianWeather } from "./servers/norwegian-weather.js";
import { register as registerSwedishWeather } from "./servers/swedish-weather.js";

// Parse CLI args for selective loading
const args = new Set(process.argv.slice(2).map(a => a.replace(/^--/, "")));
const loadAll = args.size === 0 || args.has("all");

const server = new McpServer({
  name: "mcp-nordic",
  version: "0.2.0",
});

// Register modules based on flags (default: all)
const modules = {
  "dk-cvr": registerDanishCVR,
  "dk-addresses": registerDanishAddresses,
  "dk-weather": registerDanishWeather,
  "dk-energy": registerDanishEnergy,
  "no-companies": registerNorwegianCompanies,
  "fi-companies": registerFinnishCompanies,
  "no-weather": registerNorwegianWeather,
  "se-weather": registerSwedishWeather,
};

let loaded = 0;
for (const [flag, register] of Object.entries(modules)) {
  if (loadAll || args.has(flag)) {
    register(server);
    loaded++;
  }
}

// Usage resource
server.resource(
  "nordic-info",
  "nordic://info",
  async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Nordic MCP Server

One server, all Nordic data. ${loaded} modules loaded.

## Modules
- **dk-cvr** — Danish company registry (CVR/cvrapi.dk)
- **dk-addresses** — Danish addresses (DAWA)
- **dk-weather** — Danish weather (DMI HARMONIE 2km via Open-Meteo)
- **dk-energy** — Danish energy prices & CO2 (Energi Data Service)
- **no-companies** — Norwegian company registry (Brønnøysund)
- **fi-companies** — Finnish company registry (PRH/YTJ)
- **no-weather** — Norwegian weather (MET Norway/yr.no Locationforecast 2.0)
- **se-weather** — Swedish weather (SMHI Open Data)

## Selective Loading
Load specific modules: \`mcp-nordic --dk-cvr --dk-weather\`
Load everything: \`mcp-nordic\` (default)

## All APIs are free, no authentication required.
`,
    }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
