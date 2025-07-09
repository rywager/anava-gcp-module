FROM python:3.11-slim

# Install system dependencies including git
RUN apt-get update && apt-get install -y \
    curl \
    gnupg \
    lsb-release \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install Terraform
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | apt-key add - && \
    echo "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list && \
    apt-get update && apt-get install -y terraform && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the Terraform module during build
RUN mkdir -p /terraform-cache
COPY terraform-anava-module /terraform-cache/anava-gcp-module

# Copy application files
COPY main.py .
COPY worker.py .
COPY start_worker.sh .
COPY terraform_import_existing.sh .
COPY templates/ templates/

# Make scripts executable
RUN chmod +x start_worker.sh terraform_import_existing.sh

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV TF_IN_AUTOMATION=true
ENV TF_PLUGIN_CACHE_DIR=/tmp/terraform-plugins

# Run the application with worker polling
ENTRYPOINT ["/app/start_worker.sh"]
CMD ["gunicorn", "--bind", ":8080", "--workers", "1", "--threads", "8", "--timeout", "0", "main:app"]