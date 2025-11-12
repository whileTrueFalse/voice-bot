# Multi-stage Dockerfile for Voice Bot with Maya1
FROM python:3.11-slim as python-base

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

WORKDIR /app

# Copy Python requirements first for better caching
COPY maya_voice_service.py .
COPY requirements.txt* ./

# Install Python dependencies
RUN pip install --no-cache-dir \
    torch \
    transformers \
    snac \
    soundfile \
    numpy \
    flask \
    flask-cors \
    accelerate \
    einops

# Copy package.json and install Node dependencies
COPY package*.json ./
RUN npm install

# Copy all application files
COPY . .

# Expose ports
EXPOSE 3000 5000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start both services
CMD ["npm", "start"]