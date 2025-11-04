# Build stage for frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy frontend files
COPY frontend/package.json frontend/yarn.lock ./

# Install dependencies
RUN yarn install --production=false

# Copy source
COPY frontend/ .

# Build frontend
RUN REACT_APP_BACKEND_URL=/ yarn build

# Runtime stage
FROM python:3.11-slim

WORKDIR /app

# Install curl for node installation
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN python3 -m pip install --no-cache-dir -r requirements.txt

# Create backend directory structure
RUN mkdir -p ./backend/public

# Copy backend code
COPY backend/ ./backend/

# Copy frontend build from builder stage - copy both index.html and static folder
COPY --from=frontend-builder /app/frontend/build/ ./backend/public/

# Verify build exists
RUN ls -la ./backend/public/ && test -f ./backend/public/index.html || (echo "ERROR: Frontend build not found at ./backend/public/!" && ls -la ./backend/ && exit 1)

# Expose port
EXPOSE ${PORT:-8000}

# Set working directory to backend
WORKDIR /app/backend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:${PORT:-8000}/').read()" || exit 1

# Start FastAPI server on main process, Telegram bot in background
CMD python3 -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} & \
    python3 telegram_bot.py & \
    wait
