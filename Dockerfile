FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY core/ core/
COPY sources/ sources/
COPY api/ api/
COPY format_converter.py .

EXPOSE 8000

# Use shell form so $PORT gets expanded by the shell
CMD uvicorn api.main:app --host 0.0.0.0 --port ${PORT:-8000}
