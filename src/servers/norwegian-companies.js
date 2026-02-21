// norwegian-companies - extracted from mcp-norwegian-companies
import { z } from "zod";

export function register(server) {
  const USER_AGENT = "mcp-norwegian-companies/0.1.0 (github.com/robobobby/mcp-norwegian-companies)";
  const BASE_URL = "https://data.brreg.no/enhetsregisteret/api";

  // --- API helpers ---

  async function apiFetch(path, params = {}) {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url.toString(), {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Brønnøysund API error (${res.status}): ${text}`);
    }
    return res.json();
  }

  // --- Formatters ---

  function formatAddress(addr) {
    if (!addr) return "N/A";
    const parts = [];
    if (addr.adresse?.length) parts.push(addr.adresse.join(", "));
    if (addr.postnummer && addr.poststed) parts.push(`${addr.postnummer} ${addr.poststed}`);
    if (addr.kommune) parts.push(`(${addr.kommune})`);
    return parts.join(", ") || "N/A";
  }

  function formatCompanySummary(u) {
    const lines = [
      `**${u.navn}**`,
      `Org.nr: ${u.organisasjonsnummer}`,
    ];
    if (u.organisasjonsform?.beskrivelse) lines.push(`Type: ${u.organisasjonsform.beskrivelse} (${u.organisasjonsform.kode})`);
    if (u.naeringskode1?.beskrivelse) lines.push(`Industry: ${u.naeringskode1.beskrivelse} (${u.naeringskode1.kode})`);
    if (u.antallAnsatte != null) lines.push(`Employees: ${u.antallAnsatte.toLocaleString()}`);
    if (u.stiftelsesdato) lines.push(`Founded: ${u.stiftelsesdato}`);
    lines.push(`Address: ${formatAddress(u.forretningsadresse)}`);
    if (u.hjemmeside) lines.push(`Website: ${u.hjemmeside}`);
    if (u.konkurs) lines.push(`⚠️ BANKRUPTCY`);
    if (u.underAvvikling) lines.push(`⚠️ UNDER DISSOLUTION`);
    return lines.join("\n");
  }

  function formatCompanyDetail(u) {
    const lines = [formatCompanySummary(u)];

    if (u.telefon) lines.push(`Phone: ${u.telefon}`);
    if (u.postadresse) lines.push(`Postal: ${formatAddress(u.postadresse)}`);
    if (u.registreringsdatoEnhetsregisteret) lines.push(`Registered: ${u.registreringsdatoEnhetsregisteret}`);
    if (u.institusjonellSektorkode?.beskrivelse) lines.push(`Sector: ${u.institusjonellSektorkode.beskrivelse}`);
    if (u.naeringskode2?.beskrivelse) lines.push(`Industry 2: ${u.naeringskode2.beskrivelse}`);
    if (u.naeringskode3?.beskrivelse) lines.push(`Industry 3: ${u.naeringskode3.beskrivelse}`);
    if (u.registrertIMvaregisteret) lines.push(`VAT registered: Yes`);
    if (u.sisteInnsendteAarsregnskap) lines.push(`Latest annual report: ${u.sisteInnsendteAarsregnskap}`);

    const flags = [];
    if (u.registrertIForetaksregisteret) flags.push("Business Register");
    if (u.registrertIFrivillighetsregisteret) flags.push("Voluntary Register");
    if (u.registrertIStiftelsesregisteret) flags.push("Foundation Register");
    if (flags.length) lines.push(`Registries: ${flags.join(", ")}`);

    return lines.join("\n");
  }

  // --- MCP Server ---


  // Tool 1: Search companies
  server.tool(
    "no_search_companies",
    "Search Norwegian company registry (Enhetsregisteret) by name, industry, municipality, or organization form",
    {
      query: z.string().optional().describe("Company name to search for"),
      municipality: z.string().optional().describe("Municipality name (e.g., 'OSLO', 'BERGEN', 'STAVANGER')"),
      industry_code: z.string().optional().describe("NACE industry code (e.g., '62.010' for programming)"),
      org_form: z.string().optional().describe("Organization form code (e.g., 'AS', 'ASA', 'ENK', 'NUF')"),
      min_employees: z.number().optional().describe("Minimum number of employees"),
      active_only: z.boolean().optional().default(true).describe("Only show active companies (not bankrupt/dissolved)"),
      limit: z.number().optional().default(10).describe("Number of results (max 50)"),
    },
    async ({ query, municipality, industry_code, org_form, min_employees, active_only, limit }) => {
      const params = { size: Math.min(limit, 50) };
      if (query) params.navn = query;
      if (municipality) params["kommunenummer"] = municipality; // We'll also support name
      if (industry_code) params["naeringskode1"] = industry_code;
      if (org_form) params["organisasjonsform"] = org_form;
      if (min_employees != null) params["fraAntallAnsatte"] = min_employees;
      if (active_only) {
        params["konkurs"] = false;
        params["underAvvikling"] = false;
      }

      // If municipality is a name, try search with it as part of query
      const data = await apiFetch("/enheter", params);
      const units = data._embedded?.enheter || [];

      if (units.length === 0) {
        return { content: [{ type: "text", text: "No companies found matching your criteria." }] };
      }

      const total = data.page?.totalElements || units.length;
      const header = `Found ${total.toLocaleString()} companies (showing ${units.length}):\n`;
      const results = units.map((u, i) => `${i + 1}. ${formatCompanySummary(u)}`).join("\n\n");

      return { content: [{ type: "text", text: header + "\n" + results }] };
    }
  );

  // Tool 2: Lookup by org number
  server.tool(
    "no_company_lookup",
    "Look up a Norwegian company by organization number (organisasjonsnummer). Returns detailed info.",
    {
      org_number: z.string().describe("9-digit organization number"),
    },
    async ({ org_number }) => {
      const clean = org_number.replace(/\s/g, "");
      if (!/^\d{9}$/.test(clean)) {
        return { content: [{ type: "text", text: "Invalid org number. Must be 9 digits." }] };
      }

      try {
        const data = await apiFetch(`/enheter/${clean}`);
        return { content: [{ type: "text", text: formatCompanyDetail(data) }] };
      } catch (e) {
        if (e.message.includes("404")) {
          return { content: [{ type: "text", text: `No company found with org number ${clean}. Try searching sub-units (underenheter) instead.` }] };
        }
        throw e;
      }
    }
  );

  // Tool 3: Sub-unit lookup (branches/offices)
  server.tool(
    "no_search_subunits",
    "Search sub-units (underenheter) - branches, offices, departments of Norwegian companies",
    {
      parent_org_number: z.string().optional().describe("Parent company org number to find its sub-units"),
      query: z.string().optional().describe("Name search"),
      municipality: z.string().optional().describe("Municipality name"),
      limit: z.number().optional().default(10).describe("Number of results (max 50)"),
    },
    async ({ parent_org_number, query, municipality, limit }) => {
      const params = { size: Math.min(limit, 50) };
      if (parent_org_number) params["overordnetEnhet"] = parent_org_number.replace(/\s/g, "");
      if (query) params.navn = query;
      if (municipality) params["kommunenummer"] = municipality;

      const data = await apiFetch("/underenheter", params);
      const units = data._embedded?.underenheter || [];

      if (units.length === 0) {
        return { content: [{ type: "text", text: "No sub-units found." }] };
      }

      const total = data.page?.totalElements || units.length;
      const header = `Found ${total.toLocaleString()} sub-units (showing ${units.length}):\n`;
      const results = units.map((u, i) => {
        const lines = [
          `${i + 1}. **${u.navn}**`,
          `   Org.nr: ${u.organisasjonsnummer}`,
          `   Parent: ${u.overordnetEnhet || "N/A"}`,
        ];
        if (u.naeringskode1?.beskrivelse) lines.push(`   Industry: ${u.naeringskode1.beskrivelse}`);
        if (u.antallAnsatte != null) lines.push(`   Employees: ${u.antallAnsatte}`);
        lines.push(`   Address: ${formatAddress(u.beliggenhetsadresse)}`);
        return lines.join("\n");
      }).join("\n\n");

      return { content: [{ type: "text", text: header + "\n" + results }] };
    }
  );

  // Tool 4: Roles (board members, CEO, etc.)
  server.tool(
    "no_company_roles",
    "Get roles (board members, CEO, auditor, etc.) for a Norwegian company",
    {
      org_number: z.string().describe("9-digit organization number"),
    },
    async ({ org_number }) => {
      const clean = org_number.replace(/\s/g, "");
      const res = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${clean}/roller`, {
        headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      });

      if (!res.ok) {
        if (res.status === 404) {
          return { content: [{ type: "text", text: `No roles found for org number ${clean}.` }] };
        }
        throw new Error(`API error (${res.status})`);
      }

      const data = await res.json();
      const groups = data.rollegrupper || [];

      if (groups.length === 0) {
        return { content: [{ type: "text", text: "No role information available for this company." }] };
      }

      const lines = [`**Roles for ${clean}:**\n`];
      for (const group of groups) {
        lines.push(`## ${group.type?.beskrivelse || "Unknown"}`);
        for (const role of group.roller || []) {
          const person = role.person;
          const org = role.enhet;
          if (person) {
            const name = [person.fornavn, person.mellomnavn, person.etternavn].filter(Boolean).join(" ");
            lines.push(`- ${name} (${role.type?.beskrivelse || "?"})${role.fratraadt ? " [resigned]" : ""}`);
          } else if (org) {
            lines.push(`- ${org.organisasjonsnummer} ${org.organisasjonsform?.kode || ""} (${role.type?.beskrivelse || "?"})`);
          }
        }
        lines.push("");
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
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
