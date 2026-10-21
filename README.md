# LipVision-AI

LipVision-AI predicts English text from visible lip movements in short videos. The frontend is React/Vite, served by Flask. Uploads and webcam recordings use `POST /predict` with the multipart field `video`.

## Features

- Predicts speech from a video upload or a webcam recording.
- Records webcam clips for up to 16 seconds; camera access requires HTTPS or `localhost`.
- Reads the original or AI-corrected prediction aloud with the browser's Web Speech API.
- Optionally corrects grammar using a local Ollama model through `POST /correct`.
- Uses Auto-AVSR for visual speech recognition.

## Prediction vocabulary

This model uses a 5,000-piece tokenizer trained for the LRS3 dataset. The tokenizer includes complete words, word fragments, and punctuation; it is not a fixed list of words the model can predict. The model combines these pieces to generate an English transcript from the video. Predictions depend on the video and may contain errors.

## Run the app

1. Install Python packages from the repository root:

   ```powershell
   pip install -r requirements.txt
   ```

2. Build the frontend:

   ```powershell
   cd frontend
   npm install
   npm run build
   cd ..
   ```

3. Start Flask from the repository root:

   ```powershell
   python app.py
   ```

4. Open <http://localhost:5000>.

## Camera access

Browsers allow `navigator.mediaDevices.getUserMedia` on secure pages served over HTTPS or on `localhost`. For other hostnames, serve the app over HTTPS and allow camera access in the browser. The live preview is mirrored for selfie framing. Webcam audio is not recorded.

## AI grammar correction with Ollama

The `/correct` endpoint sends transcript text to a local Ollama server; no hosted AI service is used. If Ollama is stopped or the selected model is missing, the original prediction remains available.

1. Install Ollama for Windows from [ollama.com/download](https://ollama.com/download) if it is not already installed.
2. Pull the default model if needed:

   ```powershell
   ollama pull llama3.2:latest
   ```

   If you already have a compatible model installed under a different tag, set `OLLAMA_MODEL` to that tag instead to avoid another download.
3. Start Ollama if it is not already running:

   ```powershell
   ollama serve
   ```

4. In a separate PowerShell window, set optional API/model settings and start Flask. Defaults are `OLLAMA_URL=http://localhost:11434` and `OLLAMA_MODEL=llama3.2:latest`.

   ```powershell
   $env:OLLAMA_URL = "http://localhost:11434"
   $env:OLLAMA_MODEL = "llama3.2:latest"
   .\venv\Scripts\python.exe app.py
   ```

   Set `OLLAMA_MODEL` to another installed compatible model if needed, or omit the assignment to use the default. The endpoint allows up to 120 seconds for a cold local model request. No extra Python dependency is required.

## Project structure

- `app.py` — Flask web application and prediction/correction endpoints
- `vsr_inference.py` — lip-reading model inference
- `requirements.txt` — Python dependencies
- `frontend/` — React/Vite source and npm configuration
- `static/` — built frontend assets served by Flask
- `models/` — model files tracked with Git LFS
- `auto_avsr/` — Auto-AVSR Git submodule

## Clone the project

Install Git LFS, then clone the repository and its submodule:

```powershell
git lfs install
git clone --recurse-submodules https://github.com/manishkumar13953/LipVision-AI-Real-Time-Visual-Speech-Recognition-Lip-Reading-Engine.git
cd LipVision-AI-Real-Time-Visual-Speech-Recognition-Lip-Reading-Engine
```

## Manual feature checklist

- Upload a supported video and confirm prediction still works.
- Record about 3 seconds, stop, preview, and decode it.
- Record for 16 seconds and confirm automatic stop; also check the minimum-length message.
- Deny camera permission and confirm the friendly message appears.
- Click the speaker to start, then again to stop; decode another clip while speech is playing.
- Correct a normal sentence, test empty text, stop Ollama, and try an uninstalled model; the original prediction should remain available.
- Try very long text and confirm an excessively long correction falls back to the original.
- Copy the corrected result and confirm the speaker reads corrected text when available.
