# Architecture

The browser app at `frontend/` talks only to localhost FastAPI. The backend persists metadata in SQLite outside the repository, places every job in an isolated directory, and uses an in-memory single-worker lock for GPU work. Engine adapters own installation/status concerns; API routes do not know their commands. FFmpeg calls use argument arrays, never shell interpolation.
