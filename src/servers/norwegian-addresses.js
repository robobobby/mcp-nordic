// norwegian-addresses - Norwegian address lookups via Kartverket (Geonorge Adresser API v1)
// Free, no authentication required. Data from the Norwegian Mapping Authority (Kartverket).
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-nordic/0.3.0 (github.com/robobobby/mcp-nordic)";
  const BASE_URL = "https://ws.geonorge.no/adresser/v1";

  async function apiFetch(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Kartverket API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  function formatAddress(a) {
    const lines = [];
    lines.push(`**${a.adressetekst}**`);
    if (a.postnummer) lines.push(`Postal: ${a.postnummer} ${a.poststed || ""}`);
    lines.push(`Municipality: ${a.kommunenavn} (${a.kommunenummer})`);
    lines.push(`Type: ${a.objtype || "unknown"}`);
    if (a.gardsnummer != null) {
      lines.push(`Cadastral: gnr. ${a.gardsnummer} / bnr. ${a.bruksnummer}${a.festenummer ? ` / fnr. ${a.festenummer}` : ""}`);
    }
    const p = a.representasjonspunkt;
    if (p) lines.push(`Coordinates: ${p.lat.toFixed(6)}°N, ${p.lon.toFixed(6)}°E`);
    if (a.adressetilleggsnavn) lines.push(`Additional name: ${a.adressetilleggsnavn}`);
    if (a.bruksenhetsnummer?.length) {
      lines.push(`Units: ${a.bruksenhetsnummer.length} (${a.bruksenhetsnummer.slice(0, 5).join(", ")}${a.bruksenhetsnummer.length > 5 ? "…" : ""})`);
    }
    if (a.oppdateringsdato) lines.push(`Updated: ${a.oppdateringsdato.split("T")[0]}`);
    return lines.join("\n");
  }

  server.tool(
    "no_address_search",
    "Search for Norwegian addresses by text query. Supports street names, full addresses, postal codes, and municipality filtering.",
    {
      query: z.string().describe("Address search query (e.g. 'Karl Johans gate 1', 'Storgata Oslo', 'Bryggen Bergen')"),
      postal_code: z.string().optional().describe("Filter by postal code (4 digits, e.g. '0154')"),
      municipality: z.string().optional().describe("Filter by municipality name (e.g. 'OSLO', 'BERGEN', 'TRONDHEIM')"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default 10, max 50)"),
      fuzzy: z.boolean().optional().describe("Enable fuzzy matching for misspellings (default false)"),
    },
    async ({ query, postal_code, municipality, limit, fuzzy }) => {
      try {
        const params = {
          sok: query,
          treffPerSide: limit || 10,
        };
        if (postal_code) params.postnummer = postal_code;
        if (municipality) params.kommunenavn = municipality;
        if (fuzzy) params.fuzzy = "true";

        const data = await apiFetch("/sok", params);
        const total = data.metadata?.totaltAntallTreff || 0;

        if (!data.adresser?.length) {
          return { content: [{ type: "text", text: `No addresses found for "${query}".` }] };
        }

        const lines = [`## Address Search: "${query}" (${total} total results)\n`];
        for (const a of data.adresser) {
          lines.push(formatAddress(a));
          lines.push("");
        }
        lines.push(`*Kartverket Adresser API — showing ${data.adresser.length} of ${total}*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "no_reverse_geocode",
    "Find Norwegian addresses near a geographic point (reverse geocoding). Returns addresses within the specified radius.",
    {
      lat: z.number().describe("Latitude (WGS84, e.g. 59.911 for Oslo)"),
      lon: z.number().describe("Longitude (WGS84, e.g. 10.750 for Oslo)"),
      radius: z.number().min(1).max(10000).optional().describe("Search radius in meters (default 100, max 10000)"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default 10)"),
    },
    async ({ lat, lon, radius, limit }) => {
      try {
        const data = await apiFetch("/punktsok", {
          lat,
          lon,
          radius: radius || 100,
          treffPerSide: limit || 10,
        });
        const total = data.metadata?.totaltAntallTreff || 0;

        if (!data.adresser?.length) {
          return { content: [{ type: "text", text: `No addresses found within ${radius || 100}m of ${lat}, ${lon}.` }] };
        }

        const lines = [`## Addresses near ${lat.toFixed(4)}°N, ${lon.toFixed(4)}°E (${radius || 100}m radius, ${total} total)\n`];
        for (const a of data.adresser) {
          const dist = a.meterDistanseTilPunkt;
          lines.push(formatAddress(a));
          if (dist != null) lines.push(`Distance: ${Math.round(dist)}m`);
          lines.push("");
        }
        lines.push(`*Kartverket Adresser API*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "no_postal_code_lookup",
    "List addresses in a Norwegian postal code area. Useful for exploring what's in a given postal district.",
    {
      postal_code: z.string().describe("Norwegian postal code (4 digits, e.g. '0154', '5003', '7010')"),
      street: z.string().optional().describe("Optional street name filter within the postal code area"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default 10)"),
    },
    async ({ postal_code, street, limit }) => {
      try {
        const params = {
          postnummer: postal_code,
          treffPerSide: limit || 10,
        };
        if (street) params.adressenavn = street;

        const data = await apiFetch("/sok", params);
        const total = data.metadata?.totaltAntallTreff || 0;

        if (!data.adresser?.length) {
          return { content: [{ type: "text", text: `No addresses found for postal code ${postal_code}.` }] };
        }

        const poststed = data.adresser[0]?.poststed || "";
        const lines = [`## Postal Code ${postal_code} ${poststed} (${total} addresses total)\n`];
        for (const a of data.adresser) {
          lines.push(formatAddress(a));
          lines.push("");
        }
        lines.push(`*Kartverket Adresser API — showing ${data.adresser.length} of ${total}*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  server.tool(
    "no_municipality_addresses",
    "List addresses in a Norwegian municipality. Can filter by street name.",
    {
      municipality: z.string().describe("Municipality name (e.g. 'OSLO', 'BERGEN', 'TRONDHEIM', 'STAVANGER', 'TROMSØ')"),
      street: z.string().optional().describe("Optional street name filter"),
      limit: z.number().min(1).max(50).optional().describe("Max results (default 10)"),
    },
    async ({ municipality, street, limit }) => {
      try {
        const params = {
          kommunenavn: municipality,
          treffPerSide: limit || 10,
        };
        if (street) params.adressenavn = street;

        const data = await apiFetch("/sok", params);
        const total = data.metadata?.totaltAntallTreff || 0;

        if (!data.adresser?.length) {
          return { content: [{ type: "text", text: `No addresses found in municipality "${municipality}".` }] };
        }

        const lines = [`## Addresses in ${municipality} (${total} total)\n`];
        for (const a of data.adresser) {
          lines.push(formatAddress(a));
          lines.push("");
        }
        lines.push(`*Kartverket Adresser API — showing ${data.adresser.length} of ${total}*`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );
}
