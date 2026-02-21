// danish-cvr - extracted from mcp-danish-cvr
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-danish-cvr/0.1.0 (github.com/robobobby/mcp-danish-cvr)";
  const BASE_URL = "https://cvrapi.dk/api";

  /**
   * Fetch company data from cvrapi.dk
   */
  async function fetchCVR(params) {
    const url = new URL(BASE_URL);
    for (const [key, value] of Object.entries(params)) {
      if (value != null) url.searchParams.set(key, value);
    }
    url.searchParams.set("country", params.country || "dk");
    url.searchParams.set("version", "6");
    url.searchParams.set("format", "json");

    const res = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`CVR API error (${res.status}): ${text}`);
    }

    return res.json();
  }

  /**
   * Format company data into readable text
   */
  function formatCompany(data) {
    if (data.error) return `Error: ${data.error}`;

    const lines = [];
    lines.push(`## ${data.name}`);
    lines.push(`**CVR:** ${data.vat}`);
    if (data.address) lines.push(`**Address:** ${data.address}, ${data.zipcode} ${data.city}`);
    if (data.cityname) lines.push(`**Area:** ${data.cityname}`);
    if (data.industrydesc) lines.push(`**Industry:** ${data.industrydesc} (code: ${data.industrycode})`);
    if (data.companycode) lines.push(`**Company type:** ${data.companydesc} (${data.companycode})`);
    if (data.employees) lines.push(`**Employees:** ${data.employees}`);
    if (data.phone) lines.push(`**Phone:** ${data.phone}`);
    if (data.email) lines.push(`**Email:** ${data.email}`);
    if (data.url) lines.push(`**Website:** ${data.url}`);
    if (data.startdate) lines.push(`**Founded:** ${data.startdate}`);
    if (data.enddate) lines.push(`**Closed:** ${data.enddate}`);

    // Credit/bankruptcy info
    if (data.creditbankrupt) lines.push(`⚠️ **BANKRUPT** (status: ${data.creditstatus})`);

    // Owners
    if (data.owners && data.owners.length > 0) {
      lines.push(`\n**Owners:**`);
      for (const owner of data.owners) {
        lines.push(`- ${owner.name}`);
      }
    }

    // Production units
    if (data.productionunits && data.productionunits.length > 0) {
      lines.push(`\n**Production units:** ${data.productionunits.length}`);
      for (const unit of data.productionunits.slice(0, 5)) {
        lines.push(`- P${unit.pno}: ${unit.name} (${unit.address}, ${unit.zipcode} ${unit.city})`);
      }
      if (data.productionunits.length > 5) {
        lines.push(`  ... and ${data.productionunits.length - 5} more`);
      }
    }

    return lines.join("\n");
  }

  // Create server

  // Tool: search company by name or CVR number
  server.tool(
    "dk_cvr_search",
    "Search the Danish CVR registry for a company by name, CVR number, P-number, or phone. Returns company details including address, industry, employees, owners, and status. Also supports Norwegian companies (country=no).",
    {
      query: z.string().describe("Company name, CVR number, P-number, or phone number to search for"),
      search_type: z.enum(["auto", "vat", "name", "produ", "phone"]).optional()
        .describe("Specific search type. 'auto' (default) searches all fields. 'vat' = CVR number, 'name' = company name, 'produ' = P-number, 'phone' = phone number"),
      country: z.enum(["dk", "no"]).optional()
        .describe("Country to search in. 'dk' = Denmark (default), 'no' = Norway"),
    },
    async ({ query, search_type, country }) => {
      const params = { country: country || "dk" };

      if (search_type && search_type !== "auto") {
        params[search_type] = query;
      } else {
        // Auto-detect: if all digits and 8 chars, likely CVR number
        if (/^\d{8}$/.test(query)) {
          params.vat = query;
        } else {
          params.search = query;
        }
      }

      try {
        const data = await fetchCVR(params);
        return { content: [{ type: "text", text: formatCompany(data) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Tool: lookup by CVR number (direct, explicit)
  server.tool(
    "dk_cvr_lookup",
    "Look up a specific Danish company by its 8-digit CVR number. Returns full company details.",
    {
      cvr_number: z.string().regex(/^\d{8}$/).describe("8-digit CVR number"),
      country: z.enum(["dk", "no"]).optional().describe("'dk' (default) or 'no'"),
    },
    async ({ cvr_number, country }) => {
      try {
        const data = await fetchCVR({ vat: cvr_number, country: country || "dk" });
        return { content: [{ type: "text", text: formatCompany(data) }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Error: ${err.message}` }], isError: true };
      }
    }
  );

  // Resource: usage info
  server.resource(
    "usage",
    "cvr://usage",
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: "text/markdown",
        text: `# Danish CVR MCP Server

  ## Rate Limits
  - **Free tier:** 50 lookups per day per IP
  - Results are cached by cvrapi.dk

  ## Data Coverage
  - **Denmark (dk):** Full CVR registry
  - **Norway (no):** Brønnøysund Register Centre

  ## Available Tools
  - \`cvr_search\` — Search by name, CVR, P-number, or phone
  - \`cvr_lookup\` — Direct lookup by 8-digit CVR number

  ## Data Fields
  Company name, CVR number, address, industry code/description, company type, employee count, phone, email, website, founding date, owners, production units, bankruptcy status.

  ## Source
  Data provided by [cvrapi.dk](https://cvrapi.dk) (free, no auth required).
  `,
      }],
    })
  );

  // Connect via stdio
}
