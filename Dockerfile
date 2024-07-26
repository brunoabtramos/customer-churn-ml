# Use the official Python base image
FROM python:3.8-slim

# Install dependencies
RUN apt-get -y update && apt-get install -y --no-install-recommends \
  libusb-1.0-0-dev \
  libudev-dev \
  build-essential \
  ca-certificates && \
  rm -rf /var/lib/apt/lists/*

# Keep python from buffering the stdout - so the logs are flushed quickly
ENV PYTHONUNBUFFERED=TRUE

# Don't compile bytecode
ENV PYTHONDONTWRITEBYTECODE=TRUE

# Add application directory to PATH
ENV PATH="/opt/app:${PATH}"

# Set the working directory
WORKDIR /opt/app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --upgrade pip
RUN pip install -r requirements.txt
# Copy your training script into the container
COPY ./lib/applications/handlers/ml-processor/training-script.py /opt/ml/code/training-script.py
ENTRYPOINT ["python", "/opt/ml/code/training-script.py"]
