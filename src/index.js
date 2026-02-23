#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServerFromArgv } from "./create-server.js";

const { server } = createServerFromArgv(process.argv.slice(2));
const transport = new StdioServerTransport();
await server.connect(transport);
