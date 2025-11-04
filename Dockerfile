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

# Install Node.js runtime (needed for potential server-side rendering)
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy backend requirements
COPY backend/requirements.txt .

# Install Python dependencies
RUN python3 -m pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY backend/ ./backend/

# Copy frontend build from builder stage (copy to /app for correct structure)
COPY --from=frontend-builder /app/frontend/build /app/frontend/build

# Expose port
EXPOSE ${PORT:-8000}

# Set working directory to backend
WORKDIR /app/backend

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python3 -c "import requests; requests.get('http://localhost:${PORT:-8000}/api/')" || exit 1

# Start FastAPI server and Telegram bot
CMD python3 -m uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000} & \
    python3 telegram_bot.py & \
    wait
