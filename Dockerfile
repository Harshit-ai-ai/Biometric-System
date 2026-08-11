# Use Python 3.10 slim as base image
FROM python:3.10-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for OpenCV, Dlib, X11/XCB, and C++ compilation
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    libx11-6 \
    libxext6 \
    libsm6 \
    libxrender1 \
    libxcb1 \
    libxcb-render0 \
    libxcb-shape0 \
    libxcb-xfixes0 \
    libxcb-xinerama0 \
    libxkbcommon-x11-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first to leverage Docker cache
COPY smart-classroom/backend/requirements.txt .

# Limit C++ compilation concurrency to prevent OOM crashes during build
ENV CMAKE_BUILD_PARALLEL_LEVEL=1
ENV MAX_JOBS=1

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Force opencv-python-headless to override any sub-dependency that pulled in standard opencv-python
RUN pip uninstall -y opencv-python opencv-python-headless opencv-contrib-python opencv-contrib-python-headless \
    && pip install --no-cache-dir opencv-python-headless

# Copy backend source code
COPY smart-classroom/backend/ .

# Expose the port FastAPI runs on
EXPOSE 8000

# Command to run the application using Uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]