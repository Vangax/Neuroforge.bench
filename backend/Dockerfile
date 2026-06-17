FROM python:3.12-slim

# libgomp1 for scipy/scikit-learn OpenMP; matplotlib uses the Agg backend (no GUI libs)
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV NEUROFORGE_DATA=/data
VOLUME /data
EXPOSE 8000

CMD ["uvicorn", "neuroforge.main:app", "--host", "0.0.0.0", "--port", "8000"]
