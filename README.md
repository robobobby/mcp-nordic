# mcp-nordic

One MCP server for all Nordic data. 22 tools across 6 modules, zero API keys required.

## What's included

| Module | Tools | Data Source |
|--------|-------|-------------|
| 🇩🇰 `dk-cvr` | `dk_cvr_search`, `dk_cvr_lookup` | [cvrapi.dk](https://cvrapi.dk) |
| 🇩🇰 `dk-addresses` | `dk_address_search`, `dk_reverse_geocode`, `dk_postal_code_lookup`, `dk_municipality_lookup`, `dk_nearby_addresses` | [DAWA](https://dawadocs.dataforsyningen.dk) |
| 🇩🇰 `dk-weather` | `dk_current_weather`, `dk_weather_forecast`, `dk_compare_weather` | [DMI HARMONIE 2km](https://open-meteo.com) |
| 🇩🇰 `dk-energy` | `dk_electricity_prices`, `dk_co2_emissions`, `dk_energy_mix`, `dk_cheapest_hours` | [Energi Data Service](https://www.energidataservice.dk) |
| 🇳🇴 `no-companies` | `no_search_companies`, `no_company_lookup`, `no_search_subunits`, `no_company_roles` | [Brønnøysund](https://data.brreg.no) |
| 🇫🇮 `fi-companies` | `fi_search_companies`, `fi_company_lookup`, `fi_search_by_industry`, `fi_recent_registrations` | [PRH/YTJ](https://avoindata.prh.fi) |

All APIs are free, open, and require no authentication.

## Quick start

```json
{
  "mcpServers": {
    "nordic": {
      "command": "npx",
      "args": ["-y", "mcp-nordic"]
    }
  }
}
```

Or clone and run directly:

```bash
git clone https://github.com/robobobby/mcp-nordic.git
cd mcp-nordic
npm install
node src/index.js
```

## Selective loading

Only need Danish weather and Finnish companies?

```json
{
  "mcpServers": {
    "nordic": {
      "command": "npx",
      "args": ["-y", "mcp-nordic", "--dk-weather", "--fi-companies"]
    }
  }
}
```

Available flags: `--dk-cvr`, `--dk-addresses`, `--dk-weather`, `--dk-energy`, `--no-companies`, `--fi-companies`, `--all` (default).

## Examples

Ask your AI assistant:

- "Look up the company Novo Nordisk in Denmark"
- "What's the weather in Copenhagen vs Oslo?"
- "When's the cheapest time to charge my EV today in DK1?"
- "Find recently registered Finnish companies in the tech sector"
- "What's the current energy mix in Denmark?"
- "Search for Norwegian companies in the oil industry"

## Individual servers

Each module is also available as a standalone server:

- [mcp-danish-cvr](https://github.com/robobobby/mcp-danish-cvr)
- [mcp-danish-addresses](https://github.com/robobobby/mcp-danish-addresses)
- [mcp-danish-weather](https://github.com/robobobby/mcp-danish-weather)
- [mcp-danish-energy](https://github.com/robobobby/mcp-danish-energy)
- [mcp-norwegian-companies](https://github.com/robobobby/mcp-norwegian-companies)
- [mcp-finnish-companies](https://github.com/robobobby/mcp-finnish-companies)

## License

MIT
