# LipVision AI

Real-time visual speech recognition that uses lip movement to recognize speech.

## Features

- Recognizes speech from visible lip movements in video
- Includes a web interface built with React and Vite
- Uses a Python backend
- Uses Auto-AVSR for visual speech recognition

## Project Structure

- `app.py` — Python web application
- `vsr_inference.py` — speech recognition inference
- `requirements.txt` — Python dependencies
- `frontend/` — frontend source code and npm configuration
- `templates/` — HTML templates
- `static/` — built frontend assets
- `models/` — model files tracked with Git LFS
- `auto_avsr/` — Auto-AVSR Git submodule

## Requirements

- Python 3.10 or a compatible version
- Node.js and npm
- Git
- Git LFS

## Clone the Project

Install Git LFS, then clone the repository and its submodule:

```bash
git lfs install
git clone --recurse-submodules https://github.com/manishkumar13953/LipVision-AI-Real-Time-Visual-Speech-Recognition-Lip-Reading-Engine.git
cd LipVision-AI-Real-Time-Visual-Speech-Recognition-Lip-Reading-Engine
