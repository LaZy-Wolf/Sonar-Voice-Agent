.PHONY: setup seed mcp agent web web-env test lint report warm sip

VENV := .venv
PY   := $(VENV)/Scripts/python.exe

setup:
	uv venv --python 3.12 $(VENV)
	uv pip install --python $(PY) -e "./mcp-server[dev]" -e "./agent[dev]"
	$(PY) -m sonar_tools.seed
	cd agent && ../$(PY) main.py download-files

seed:
	$(PY) -m sonar_tools.seed

mcp:
	cd mcp-server && ../$(PY) -m sonar_tools.server

agent:
	cd agent && ../$(PY) main.py dev

web:
	cd web && npm run dev

# Next.js does not read the repo-root .env, so mirror the LiveKit values into web/.env.local.
web-env:
	grep -E '^LIVEKIT_(URL|API_KEY|API_SECRET)=' .env > web/.env.local
	@echo "wrote web/.env.local"

test:
	$(PY) -m pytest mcp-server/tests agent/tests -q

lint:
	$(PY) -m ruff check .

report:
	$(PY) scripts/latency_report.py --jsonl agent/data/turns.jsonl

warm:
	$(PY) scripts/warm.py

sip:
	$(PY) scripts/setup_sip.py
