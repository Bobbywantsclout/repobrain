import sys

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("RepoBrain")


@mcp.tool()
def hello_world(name: str) -> str:
    """Say hello and confirm the RepoBrain MCP server is connected."""
    return f"Hello, {name}! RepoBrain MCP is connected."


if __name__ == "__main__":
    print("RepoBrain MCP server starting on stdio transport...", file=sys.stderr)
    mcp.run(transport="stdio")
