# Agent image for LiveKit Cloud.
#
# Built from the repo root because the agent spawns the MCP tool server from mcp-server/
# as a stdio child: LiveKit requires the container to launch the agent directly, with no
# wrapper script and no background processes.
#
# LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET are injected by LiveKit Cloud and
# must not be set here. Provider keys arrive as LiveKit secrets.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN useradd --create-home --uid 10001 appuser
WORKDIR /app

COPY requirements.txt ./
COPY mcp-server/ mcp-server/
COPY agent/ agent/
RUN pip install -r requirements.txt && chown -R appuser:appuser /app

USER appuser

# Model weights and the demo database are baked into the image, so a cold start does not
# wait on downloads. The free plan can shut an idle agent down, and it cold-starts then.
RUN cd /app/agent && python main.py download-files \
 && cd /app/mcp-server && SONAR_DB_PATH=/app/mcp-server/sonar.db python -m sonar_tools.seed

WORKDIR /app/agent
CMD ["python", "main.py", "start"]
