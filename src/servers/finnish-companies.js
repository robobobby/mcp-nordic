// finnish-companies - extracted from mcp-finnish-companies
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-finnish-companies/0.1.0 (github.com/robobobby/mcp-finnish-companies)";
  const BASE_URL = "https://avoindata.prh.fi/opendata-ytj-api/v3";

  // Language codes: 1=Finnish, 2=Swedish, 3=English
  const LANG_MAP = { fi: "1", sv: "2", en: "3" };

  // Common company forms
  const COMPANY_FORMS = {
    OY: "Limited company (Oy)",
    OYJ: "Public limited company (Oyj)",
    KY: "Limited partnership (Ky)",
    AY: "General partnership (Ay)",
    OK: "Cooperative (Osk)",
    SÄÄ: "Foundation",
    ASY: "Housing company",
    VOJ: "Government enterprise",
    SE: "European company (SE)",
  };

  // --- API helpers ---

  async function apiFetch(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`PRH API error (${res.status}): ${text.slice(0, 500)}`);
    }
    return res.json();
  }

  // --- Formatters ---

  function getName(company, lang = "en") {
    const langCode = LANG_MAP[lang] || "3";
    const names = company.names || [];
    // Current name (no endDate), prefer type 1 (trade name)
    const current = names.filter(n => !n.endDate).sort((a, b) => (a.type === "1" ? -1 : 1));
    return current[0]?.name || names[0]?.name || "Unknown";
  }

  function getDescription(descriptions, lang = "en") {
    if (!descriptions?.length) return null;
    const langCode = LANG_MAP[lang] || "3";
    const match = descriptions.find(d => d.languageCode === langCode)
      || descriptions.find(d => d.languageCode === "3")
      || descriptions[0];
    return match?.description || null;
  }

  function formatAddress(addr) {
    if (!addr) return null;
    const parts = [];
    if (addr.street) parts.push(addr.street);
    if (addr.postCode && addr.postOffice) parts.push(`${addr.postCode} ${addr.postOffice}`);
    else if (addr.postCode) parts.push(addr.postCode);
    if (addr.city) parts.push(addr.city);
    return parts.join(", ") || null;
  }

  function getCompanyFormLabel(company) {
    const forms = company.companyForms || [];
    const current = forms.find(f => !f.endDate) || forms[0];
    if (!current) return null;
    const desc = getDescription(current.descriptions, "en");
    const code = current.type;
    // Map numeric code to letter code from names
    return desc || code || null;
  }

  function getSituation(company) {
    const situations = company.companySituations || [];
    if (!situations.length) return null;
    return situations.map(s => {
      const desc = getDescription(s.descriptions, "en");
      return desc || s.type || "Unknown situation";
    }).join(", ");
  }

  function formatCompanySummary(company) {
    const name = getName(company);
    const bid = company.businessId?.value;
    const form = getCompanyFormLabel(company);
    const industry = company.mainBusinessLine
      ? getDescription(company.mainBusinessLine.descriptions, "en")
      : null;
    const regDate = company.registrationDate;
    const website = company.website?.url;
    const situation = getSituation(company);
    const status = company.tradeRegisterStatus;

    const addresses = company.addresses || [];
    const streetAddr = addresses.find(a => a.type === "1"); // 1=street, 2=postal
    const addr = formatAddress(streetAddr) || formatAddress(addresses[0]);

    const lines = [`**${name}**`, `Business ID: ${bid}`];
    if (form) lines.push(`Type: ${form}`);
    if (industry) lines.push(`Industry: ${industry}`);
    if (regDate) lines.push(`Registered: ${regDate}`);
    if (addr) lines.push(`Address: ${addr}`);
    if (website) lines.push(`Website: ${website}`);
    if (situation) lines.push(`⚠️ ${situation}`);
    if (status === "2") lines.push(`⚠️ DEREGISTERED`);

    return lines.join("\n");
  }

  function formatCompanyDetail(company) {
    const lines = [formatCompanySummary(company)];

    // EUID
    if (company.euId?.value) lines.push(`EUID: ${company.euId.value}`);

    // All addresses
    const addresses = company.addresses || [];
    for (const addr of addresses) {
      const label = addr.type === "1" ? "Street" : "Postal";
      const formatted = formatAddress(addr);
      if (formatted) lines.push(`${label} address: ${formatted}`);
    }

    // Registration entries
    const entries = company.registeredEntries || [];
    const registers = entries
      .filter(e => !e.endDate)
      .map(e => {
        const desc = getDescription(e.descriptions, "en");
        return desc || e.register || "Unknown register";
      });
    if (registers.length) lines.push(`Registers: ${registers.join(", ")}`);

    // Business ID registration date
    if (company.businessId?.registrationDate) {
      lines.push(`Business ID granted: ${company.businessId.registrationDate}`);
    }

    // End date
    if (company.endDate) lines.push(`Dissolved: ${company.endDate}`);

    // Previous names
    const names = (company.names || []).filter(n => n.endDate && n.type === "1");
    if (names.length) {
      lines.push(`Previous names: ${names.map(n => `${n.name} (until ${n.endDate})`).join(", ")}`);
    }

    // Auxiliary/parallel names
    const auxNames = (company.names || []).filter(n => !n.endDate && n.type !== "1");
    if (auxNames.length) {
      lines.push(`Also known as: ${auxNames.map(n => n.name).join(", ")}`);
    }

    return lines.join("\n");
  }

  // --- MCP Server ---


  // Tool 1: Search companies
  server.tool(
    "fi_search_companies",
    "Search Finnish company registry (PRH/YTJ) by name, location, business ID, or company form. Free government API.",
    {
      name: z.string().optional().describe("Company name to search for"),
      location: z.string().optional().describe("Town or city (e.g., 'Helsinki', 'Tampere', 'Espoo')"),
      business_id: z.string().optional().describe("Finnish Business ID (Y-tunnus), e.g., '0112038-9'"),
      company_form: z.string().optional().describe("Company form code: OY (ltd), OYJ (public ltd), KY (limited partnership), AY (general partnership), OK (cooperative), SÄÄ (foundation)"),
      business_line: z.string().optional().describe("Main line of business - TOL 2008 code (e.g., '62010') or text description"),
      post_code: z.string().optional().describe("Postal code"),
      page: z.number().optional().default(1).describe("Page number (100 results per page)"),
    },
    async ({ name, location, business_id, company_form, business_line, post_code, page }) => {
      if (!name && !location && !business_id && !company_form && !business_line && !post_code) {
        return { content: [{ type: "text", text: "Please provide at least one search criterion (name, location, business_id, company_form, business_line, or post_code)." }] };
      }

      const params = {};
      if (name) params.name = name;
      if (location) params.location = location;
      if (business_id) params.businessId = business_id;
      if (company_form) params.companyForm = company_form;
      if (business_line) params.mainBusinessLine = business_line;
      if (post_code) params.postCode = post_code;
      if (page && page > 1) params.page = page;

      const data = await apiFetch("/companies", params);
      const companies = data.companies || [];
      const total = data.totalResults || 0;

      if (companies.length === 0) {
        return { content: [{ type: "text", text: "No companies found matching your criteria." }] };
      }

      const header = `Found ${total.toLocaleString()} companies (showing ${companies.length}, page ${page || 1}):\n`;
      const results = companies.map((c, i) => `${i + 1}. ${formatCompanySummary(c)}`).join("\n\n");

      return { content: [{ type: "text", text: header + "\n" + results }] };
    }
  );

  // Tool 2: Lookup by Business ID
  server.tool(
    "fi_company_lookup",
    "Look up a Finnish company by Business ID (Y-tunnus). Returns detailed information including registers, addresses, and history.",
    {
      business_id: z.string().describe("Finnish Business ID (Y-tunnus), e.g., '0112038-9' or '2331972-6'"),
    },
    async ({ business_id }) => {
      const clean = business_id.trim();
      // Finnish business IDs are format: 7 digits, dash, 1 check digit
      if (!/^\d{7}-\d$/.test(clean)) {
        return { content: [{ type: "text", text: "Invalid Business ID format. Expected format: 1234567-8 (7 digits, dash, check digit)." }] };
      }

      const data = await apiFetch("/companies", { businessId: clean });
      const companies = data.companies || [];

      if (companies.length === 0) {
        return { content: [{ type: "text", text: `No company found with Business ID ${clean}.` }] };
      }

      return { content: [{ type: "text", text: formatCompanyDetail(companies[0]) }] };
    }
  );

  // Tool 3: Search by industry
  server.tool(
    "fi_search_by_industry",
    "Find Finnish companies by industry (TOL 2008 classification). Useful for market research and competitor analysis.",
    {
      industry: z.string().describe("Industry - either a TOL 2008 code (e.g., '62010' for software) or descriptive text (e.g., 'software', 'restaurant')"),
      location: z.string().optional().describe("Filter by town/city"),
      company_form: z.string().optional().describe("Filter by company form (OY, OYJ, etc.)"),
      page: z.number().optional().default(1).describe("Page number"),
    },
    async ({ industry, location, company_form, page }) => {
      const params = { mainBusinessLine: industry };
      if (location) params.location = location;
      if (company_form) params.companyForm = company_form;
      if (page && page > 1) params.page = page;

      const data = await apiFetch("/companies", params);
      const companies = data.companies || [];
      const total = data.totalResults || 0;

      if (companies.length === 0) {
        return { content: [{ type: "text", text: `No companies found in industry "${industry}".` }] };
      }

      const header = `Found ${total.toLocaleString()} companies in "${industry}" (showing ${companies.length}):\n`;
      const results = companies.map((c, i) => `${i + 1}. ${formatCompanySummary(c)}`).join("\n\n");

      return { content: [{ type: "text", text: header + "\n" + results }] };
    }
  );

  // Tool 4: Recently registered companies
  server.tool(
    "fi_recent_registrations",
    "Find recently registered Finnish companies. Great for tracking new business formation trends.",
    {
      days_back: z.number().optional().default(7).describe("How many days back to look (default 7)"),
      location: z.string().optional().describe("Filter by town/city"),
      company_form: z.string().optional().describe("Filter by company form (OY, OYJ, etc.)"),
      business_line: z.string().optional().describe("Filter by industry"),
      page: z.number().optional().default(1).describe("Page number"),
    },
    async ({ days_back, location, company_form, business_line, page }) => {
      const end = new Date();
      const start = new Date(end.getTime() - days_back * 24 * 60 * 60 * 1000);
      const fmt = d => d.toISOString().slice(0, 10);

      const params = {
        registrationDateStart: fmt(start),
        registrationDateEnd: fmt(end),
      };
      if (location) params.location = location;
      if (company_form) params.companyForm = company_form;
      if (business_line) params.mainBusinessLine = business_line;
      if (page && page > 1) params.page = page;

      const data = await apiFetch("/companies", params);
      const companies = data.companies || [];
      const total = data.totalResults || 0;

      if (companies.length === 0) {
        return { content: [{ type: "text", text: `No companies registered in the last ${days_back} days matching your criteria.` }] };
      }

      const header = `${total.toLocaleString()} companies registered ${fmt(start)} to ${fmt(end)} (showing ${companies.length}):\n`;
      const results = companies.map((c, i) => `${i + 1}. ${formatCompanySummary(c)}`).join("\n\n");

      return { content: [{ type: "text", text: header + "\n" + results }] };
    }
  );

  // --- Start ---

  async function main() {
  }

  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
