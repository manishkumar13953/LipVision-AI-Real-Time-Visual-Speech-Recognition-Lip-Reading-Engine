from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
from werkzeug.utils import secure_filename
import os
import tempfile
import sys
import json
import re
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.abspath('.'))

from vsr_inference import VSRModel

# ============ FLASK APP SETUP ============

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 500 * 1024 * 1024  # 500MB max

# Load model once when app starts
print("\n🚀 Starting Web App...")
print("Loading VSR model...")

try:
    model = VSRModel(model_path='models/vsr_trlrs3_base.pth')
    print("✅ Web app ready! Opening browser...")
except Exception as e:
    print(f"❌ Error: {str(e)}")
    sys.exit(1)

ALLOWED_EXTENSIONS = {'mp4', 'avi', 'mov', 'mkv', 'webm'}
OLLAMA_URL = os.environ.get('OLLAMA_URL', 'http://localhost:11434').rstrip('/')
OLLAMA_MODEL = os.environ.get('OLLAMA_MODEL', 'llama3.2:3b')
# A local model can need extra time on its first, cold request (especially on CPU).
OLLAMA_TIMEOUT_SECONDS = 120
CORRECTION_SYSTEM_PROMPT = (
    'You are a text corrector. The input comes from a lip-reading system and may have missing words, '
    'wrong tenses, and no punctuation. Fix grammar, spelling, capitalization, and punctuation only. '
    'Keep the original meaning. Do NOT add new information, explanations, quotes, or commentary. '
    'Return ONLY the corrected sentence.'
)

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

# ============ ROUTES ============

@app.route('/')
def index():
    """Main page"""
    frontend_dir = os.path.join(app.static_folder, 'frontend')
    if os.path.exists(os.path.join(frontend_dir, 'index.html')):
        return send_from_directory(frontend_dir, 'index.html')
    return render_template('index.html')

@app.route('/sample')
def sample_video():
    """Serve the short local sample clip used in the frontend preview."""
    return send_file(os.path.join(app.root_path, 'demo_short.mp4'), mimetype='video/mp4')

@app.route('/health', methods=['GET'])
def health():
    """Check if API is working"""
    return jsonify({
        'status': 'healthy',
        'model': 'VSR Pre-trained',
        'message': '✅ App is running'
    }), 200

@app.route('/predict', methods=['POST'])
def predict():
    """Process video and predict text"""
    try:
        # Check if file uploaded
        if 'video' not in request.files:
            return jsonify({'error': 'No video file provided'}), 400
        
        file = request.files['video']
        
        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        if not allowed_file(file.filename):
            return jsonify({
                'error': 'Invalid file format. Allowed: mp4, avi, mov, mkv, webm'
            }), 400
        
        # Save file temporarily
        # Preserve the real container type (notably MediaRecorder's WebM) so
        # torchvision/FFmpeg can select the correct demuxer during inference.
        extension = os.path.splitext(secure_filename(file.filename))[1].lower() or '.mp4'
        with tempfile.NamedTemporaryFile(delete=False, suffix=extension) as tmp:
            tmp_path = tmp.name
            file.save(tmp_path)
        
        print(f"\n📹 Processing: {file.filename}")
        
        # Run inference
        prediction = model.predict(tmp_path)
        
        # Delete temp file
        os.unlink(tmp_path)
        
        if prediction is None:
            return jsonify({
                'error': 'Error processing video'
            }), 500
        
        return jsonify({
            'status': 'success',
            'filename': file.filename,
            'prediction': str(prediction),
            'model': 'vsr_trlrs3_base (pre-trained)',
            'wer': '36.0%'
        }), 200
    
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

@app.route('/correct', methods=['POST'])
def correct_text():
    """Correct a lip-reading transcript with a local Ollama model."""
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict) or not isinstance(payload.get('text'), str):
        return jsonify({'error': 'Send a JSON object with a text string.'}), 400

    original = payload['text'].strip()
    if not original:
        return jsonify({'original': '', 'corrected': '', 'model': OLLAMA_MODEL}), 200

    body = json.dumps({
        'model': OLLAMA_MODEL,
        'stream': False,
        'messages': [
            {'role': 'system', 'content': CORRECTION_SYSTEM_PROMPT},
            {'role': 'user', 'content': original},
        ],
        'options': {'temperature': 0.15},
    }).encode('utf-8')
    ollama_request = Request(
        f'{OLLAMA_URL}/api/chat',
        data=body,
        headers={'Content-Type': 'application/json'},
        method='POST',
    )

    try:
        with urlopen(ollama_request, timeout=OLLAMA_TIMEOUT_SECONDS) as response:
            result = json.loads(response.read().decode('utf-8'))
        corrected = str(result.get('message', {}).get('content', '')).strip()
        corrected = re.sub(r'^(?:corrected(?:\s+text)?\s*:\s*)', '', corrected, flags=re.IGNORECASE).strip()
        quote_pairs = {'"': '"', "'": "'", '“': '”', '‘': '’'}
        if len(corrected) >= 2 and quote_pairs.get(corrected[0]) == corrected[-1]:
            corrected = corrected[1:-1].strip()

        # Guard against explanations or a runaway response; preserve the model's transcript.
        if not corrected or len(corrected) > max(1, len(original)) * 3:
            corrected = original
        return jsonify({'original': original, 'corrected': corrected, 'model': OLLAMA_MODEL}), 200
    except HTTPError as exc:
        if exc.code == 404:
            message = f"Ollama model '{OLLAMA_MODEL}' is not installed. Run: ollama pull {OLLAMA_MODEL}"
            return jsonify({'error': message}), 503
        try:
            detail = json.loads(exc.read().decode('utf-8')).get('error', '')
        except (ValueError, AttributeError):
            detail = ''
        message = f'Ollama returned HTTP {exc.code} while correcting the text.'
        if detail:
            message = f'{message} {detail}'
        return jsonify({'error': message}), 502
    except (TimeoutError, OSError) as exc:
        is_timeout = isinstance(exc, TimeoutError) or (isinstance(exc, URLError) and isinstance(exc.reason, TimeoutError))
        if is_timeout:
            return jsonify({'error': 'Ollama took too long to respond. Please try again.'}), 504
        return jsonify({'error': 'Could not connect to Ollama. Make sure Ollama is running.'}), 503
    except (ValueError, KeyError, TypeError, AttributeError):
        return jsonify({'error': 'Ollama returned an invalid correction response.'}), 502

@app.route('/info', methods=['GET'])
def info():
    """Get model information"""
    return jsonify({
        'model_name': 'Visual Speech Recognition (Lip Reading)',
        'model_type': 'Pre-trained (LRS3)',
        'size_mb': 250,
        'wer': '36.0%',
        'input': 'Video (mp4, avi, mov, mkv, webm)',
        'output': 'Text from lip movements',
        'status': 'Ready for production',
        'gpu': 'Not required (CPU works fine)'
    }), 200

if __name__ == '__main__':
    print("\n" + "="*60)
    print("🌐 OPENING WEB APP...")
    print("="*60)
    print("\n✅ Open your browser and go to:")
    print("   http://localhost:5000")
    print("\n(Press Ctrl+C to stop the app)\n")
    
    app.run(host='0.0.0.0', port=5000, debug=False)
