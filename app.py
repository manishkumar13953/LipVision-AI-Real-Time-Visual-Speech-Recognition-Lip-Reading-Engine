from flask import Flask, render_template, request, jsonify, send_from_directory, send_file
from werkzeug.utils import secure_filename
import os
import tempfile
import sys

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
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp4') as tmp:
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
