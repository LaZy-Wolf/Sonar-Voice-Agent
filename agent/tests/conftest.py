"""Put agent/ on sys.path.

The worker runs as `python main.py dev` from inside agent/, so its modules are
top-level rather than a package. Tests run from the repo root, hence this.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
