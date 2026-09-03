"""MCP wrapper. Serves the tools in `tools.py` over streamable-HTTP at /mcp.

Written against mcp 2.x, where FastMCP was renamed MCPServer and the transport
options (host, port, stateless_http) moved from the constructor to run().
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from mcp.server.mcpserver import MCPServer

from .tools import ALL_TOOLS

load_dotenv(dotenv_path=os.getenv("SONAR_ENV", "../.env"))

mcp = MCPServer("sonar-tools", instructions="Front-desk tools for Helios Solar.")

for fn in ALL_TOOLS:
    mcp.tool()(fn)


if __name__ == "__main__":
    mcp.run(
        transport="streamable-http",
        host=os.getenv("MCP_HOST", "0.0.0.0"),
        port=int(os.getenv("MCP_PORT", "8811")),
        stateless_http=True,
    )
