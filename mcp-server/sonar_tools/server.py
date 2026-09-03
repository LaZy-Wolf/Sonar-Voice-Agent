"""MCP wrapper. Serves the tools in `tools.py` over streamable-HTTP at /mcp.

Pinned to mcp 1.x because `livekit-agents[mcp]` requires `mcp<2`. mcp 2.x renames
FastMCP to MCPServer and moves host/port/stateless_http onto run(); revisit when
livekit-agents supports 2.x.
"""

from __future__ import annotations

import os

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from .tools import ALL_TOOLS

load_dotenv(dotenv_path=os.getenv("SONAR_ENV", "../.env"))

mcp = FastMCP(
    "sonar-tools",
    instructions="Front-desk tools for Helios Solar.",
    host=os.getenv("MCP_HOST", "0.0.0.0"),
    port=int(os.getenv("MCP_PORT", "8811")),
    stateless_http=True,
)

for fn in ALL_TOOLS:
    mcp.tool()(fn)


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
