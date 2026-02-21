// danish-addresses - extracted from mcp-danish-addresses
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-danish-addresses/0.1.0 (github.com/robobobby/mcp-danish-addresses)";
  const BASE_URL = "https://api.dataforsyningen.dk";

  async function dawaFetch(path, params = {}) {
    const url = new URL(path, BASE_URL);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`DAWA API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  function formatAddress(a) {
    const lines = [];
    lines.push(`**${a.betegnelse || a.vejnavn + " " + a.husnr}**`);
    if (a.postnr) lines.push(`Postal: ${a.postnr} ${a.postnrnavn || ""}`);
    if (a.kommunekode) lines.push(`Municipality code: ${a.kommunekode}`);
    if (a.supplerendebynavn) lines.push(`Area: ${a.supplerendebynavn}`);
    if (a.x && a.y) lines.push(`Coordinates: ${a.y.toFixed(6)}°N, ${a.x.toFixed(6)}°E`);
    if (a.etage) lines.push(`Floor: ${a.etage}${a.dør ? ", door " + a.dør : ""}`);
    if (a.id) lines.push(`ID: ${a.id}`);
    return lines.join("\n");
  }

  function formatAddressList(results) {
    if (!results.length) return "No addresses found.";
    return results.map((a, i) => `### ${i + 1}. ${a.betegnelse || "Unknown"}\n${formatAddress(a)}`).join("\n\n");
  }


  // Tool 1: Address search (autocomplete/fuzzy)
  server.tool(
    "dk_address_search",
    "Search for Danish addresses by free-text query (street name, full address, postal code + city). Returns matching addresses with coordinates. Great for autocomplete and address validation.",
    {
      query: z.string().describe("Address search text, e.g. 'Nørrebrogade 1, København' or 'Ølsemagle Strand'"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default 10)"),
      municipality: z.string().optional().describe("Filter by municipality code (e.g. '0101' for Copenhagen)"),
      postal_code: z.string().optional().describe("Filter by postal code (e.g. '2200')"),
    },
    async ({ query, limit, municipality, postal_code }) => {
      try {
        const params = { q: query, struktur: "mini", per_side: limit || 10 };
        if (municipality) params.kommunekode = municipality;
        if (postal_code) params.postnr = postal_code;
        const data = await dawaFetch("/adresser", params);
        return { content: [{ type: "text", text: formatAddressList(data) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool 2: Reverse geocoding
  server.tool(
    "dk_reverse_geocode",
    "Find the nearest Danish address to a given latitude/longitude coordinate. Returns the closest address with full details.",
    {
      latitude: z.number().min(54).max(58).describe("Latitude (WGS84), e.g. 55.676"),
      longitude: z.number().min(7).max(16).describe("Longitude (WGS84), e.g. 12.568"),
    },
    async ({ latitude, longitude }) => {
      try {
        const data = await dawaFetch("/adgangsadresser/reverse", {
          x: longitude,
          y: latitude,
          struktur: "mini",
        });
        return { content: [{ type: "text", text: formatAddress(data) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool 3: Postal code lookup
  server.tool(
    "dk_postal_code_lookup",
    "Look up a Danish postal code to get the city/area name, bounding box, and associated municipalities.",
    {
      postal_code: z.string().regex(/^\d{4}$/).describe("4-digit Danish postal code, e.g. '2200'"),
    },
    async ({ postal_code }) => {
      try {
        const data = await dawaFetch(`/postnumre/${postal_code}`);
        const lines = [];
        lines.push(`## ${data.nr} ${data.navn}`);
        if (data.bbox) {
          lines.push(`**Bounding box:** ${data.bbox[1].toFixed(4)}°N to ${data.bbox[3].toFixed(4)}°N, ${data.bbox[0].toFixed(4)}°E to ${data.bbox[2].toFixed(4)}°E`);
        }
        if (data.kommuner && data.kommuner.length) {
          lines.push(`**Municipalities:** ${data.kommuner.map(k => `${k.navn} (${k.kode})`).join(", ")}`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool 4: Municipality info
  server.tool(
    "dk_municipality_lookup",
    "Look up a Danish municipality (kommune) by code or search by name. Returns name, code, region, and geographic bounds.",
    {
      code: z.string().optional().describe("4-digit municipality code (e.g. '0101' for Copenhagen)"),
      name: z.string().optional().describe("Municipality name to search (e.g. 'Solrød')"),
    },
    async ({ code, name }) => {
      try {
        let data;
        if (code) {
          data = [await dawaFetch(`/kommuner/${code}`)];
        } else if (name) {
          data = await dawaFetch("/kommuner", { q: name });
        } else {
          return { content: [{ type: "text", text: "Provide either code or name." }], isError: true };
        }
        if (!data.length) return { content: [{ type: "text", text: "No municipality found." }] };
        const lines = data.map(k => {
          const parts = [`## ${k.navn} (${k.kode})`];
          if (k.regionskode) parts.push(`**Region code:** ${k.regionskode}`);
          if (k.bbox) parts.push(`**Bounds:** ${k.bbox[1].toFixed(4)}°N to ${k.bbox[3].toFixed(4)}°N`);
          if (k.href) parts.push(`**API:** ${k.href}`);
          return parts.join("\n");
        });
        return { content: [{ type: "text", text: lines.join("\n\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool 5: Nearby addresses (area search)
  server.tool(
    "dk_nearby_addresses",
    "Find addresses within a radius of a coordinate. Useful for exploring an area or finding what's around a location.",
    {
      latitude: z.number().min(54).max(58).describe("Center latitude"),
      longitude: z.number().min(7).max(16).describe("Center longitude"),
      radius_meters: z.number().min(1).max(5000).optional().describe("Search radius in meters (default 200, max 5000)"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default 10)"),
    },
    async ({ latitude, longitude, radius_meters, limit }) => {
      try {
        const data = await dawaFetch("/adgangsadresser", {
          cirkel: `${longitude},${latitude},${radius_meters || 200}`,
          struktur: "mini",
          per_side: limit || 10,
        });
        if (!data.length) return { content: [{ type: "text", text: "No addresses found within radius." }] };
        const lines = data.map((a, i) => {
          const dist = haversine(latitude, longitude, a.y, a.x);
          return `${i + 1}. **${a.betegnelse}** (${dist}m away)\n   ${a.y.toFixed(6)}°N, ${a.x.toFixed(6)}°E`;
        });
        return { content: [{ type: "text", text: `## Addresses within ${radius_meters || 200}m\n\n${lines.join("\n")}` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
    return Math.round(2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
  }

  // Resource: usage info
  server.resource(
    "usage",
    "dawa://usage",
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: `# Danish Addresses MCP Server (DAWA)

  ## About
  Uses Danmarks Adressers Web API (DAWA) from Dataforsyningen.
  Free, no authentication required. Covers all Danish addresses.

  ## Tools
  - \`address_search\` — Free-text address search with optional municipality/postal filters
  - \`reverse_geocode\` — Coordinates → nearest address
  - \`postal_code_lookup\` — Postal code → city, municipalities, bounds
  - \`municipality_lookup\` — Municipality info by code or name search
  - \`nearby_addresses\` — Find addresses within a radius of a point

  ## Rate Limits
  No hard rate limit but be reasonable. Data updated daily.

  ## Source
  [DAWA Documentation](https://dawadocs.dataforsyningen.dk/)
  `,
      }],
    })
  );
}
