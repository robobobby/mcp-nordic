import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { register as registerDanishCVR } from "./servers/danish-cvr.js";
import { register as registerDanishAddresses } from "./servers/danish-addresses.js";
import { register as registerDanishWeather } from "./servers/danish-weather.js";
import { register as registerDanishEnergy } from "./servers/danish-energy.js";
import { register as registerNorwegianCompanies } from "./servers/norwegian-companies.js";
import { register as registerFinnishCompanies } from "./servers/finnish-companies.js";
import { register as registerNorwegianWeather } from "./servers/norwegian-weather.js";
import { register as registerSwedishWeather } from "./servers/swedish-weather.js";

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

export function createServerFromArgv(argv = []) {
  const args = new Set(argv.map((a) => a.replace(/^--/, "")));
  const loadAll = args.size === 0 || args.has("all");
  return createServer({ loadAll, args });
}

export function createServer({ loadAll = true, args = new Set() } = {}) {
  const server = new McpServer({
    name: "mcp-nordic",
    version: "0.2.1",
  });

  let loaded = 0;
  for (const [flag, register] of Object.entries(modules)) {
    if (loadAll || args.has(flag)) {
      register(server);
      loaded++;
    }
  }

  server.resource("nordic-info", "nordic://info", async (uri) => ({
    contents: [{
      uri: uri.href,
      mimeType: "text/markdown",
      text: `# Nordic MCP Server\n\nOne server, all Nordic data. ${loaded} modules loaded.\n\n## Modules\n- **dk-cvr** — Danish company registry (CVR/cvrapi.dk)\n- **dk-addresses** — Danish addresses (DAWA)\n- **dk-weather** — Danish weather (DMI HARMONIE 2km via Open-Meteo)\n- **dk-energy** — Danish energy prices & CO2 (Energi Data Service)\n- **no-companies** — Norwegian company registry (Brønnøysund)\n- **fi-companies** — Finnish company registry (PRH/YTJ)\n- **no-weather** — Norwegian weather (MET Norway/yr.no Locationforecast 2.0)\n- **se-weather** — Swedish weather (SMHI Open Data)\n\n## All APIs are free, no authentication required.\n`,
    }],
  }));

  return { server, loaded };
}
