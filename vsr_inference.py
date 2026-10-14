import torch
import sys
import os
import torchvision
import argparse

# Add auto_avsr to path
sys.path.insert(0, os.path.abspath('auto_avsr'))

try:
    from lightning import ModelModule
    from datamodule.transforms import VideoTransform
except ImportError as e:
    print(f"❌ Import error: {e}")
    sys.exit(1)

class VSRModel:
    """Visual Speech Recognition Model - Converts Lip Movements to Text"""

    # The Auto-AVSR pipeline is trained on segments up to 16 seconds. Limiting
    # decoding here also avoids loading long uploads entirely into memory.
    MAX_VIDEO_SECONDS = 16
    
    def __init__(self, model_path='models/vsr_trlrs3_base.pth'):
        """Load pre-trained model"""
        print("="*60)
        print("🎬 LOADING VISUAL SPEECH RECOGNITION MODEL")
        print("="*60)
        
        if not os.path.exists(model_path):
            print(f"❌ Error: Model not found at {model_path}")
            print("Please download the model first!")
            sys.exit(1)
        
        print(f"\n📥 Loading model from: {model_path}")
        print(f"   Model size: 250MB")
        print(f"   Accuracy: 36.0% WER")
        
        try:
            # Load model
            ckpt = torch.load(model_path, map_location='cpu')
            
            # Create model structure
            # Auto-AVSR's ModelModule uses Lightning's save_hyperparameters,
            # which expects a namespace/dict rather than a dynamically-created class.
            args = argparse.Namespace(modality='video', ctc_weight=0.1)
            
            self.model = ModelModule(args)
            self.model.model.load_state_dict(ckpt)
            self.model.eval()
            
            # Load video transform
            self.video_transform = VideoTransform(subset='test')
            
            # Initialize face detector
            self._init_detector()
            
            print("\n✅ Model loaded successfully!")
            print("="*60)
        
        except Exception as e:
            print(f"❌ Error loading model: {str(e)}")
            sys.exit(1)
    
    def _init_detector(self):
        """Initialize face detector for detecting mouth region"""
        print("\n🔍 Initializing face detector...")
        
        try:
            from preparation.detectors.mediapipe.detector import LandmarksDetector
            from preparation.detectors.mediapipe.video_process import VideoProcess
            
            self.landmarks_detector = LandmarksDetector()
            self.video_process = VideoProcess(convert_gray=False)
            
            print("✅ Face detector ready (MediaPipe)")
        
        except Exception as e:
            print(f"❌ Error initializing detector: {str(e)}")
            print("Make sure auto_avsr is cloned!")
            sys.exit(1)
    
    def predict(self, video_path):
        """
        Predict text from video of lip movements
        
        Args:
            video_path (str): Path to video file
        
        Returns:
            str: Predicted text
        """
        
        if not os.path.exists(video_path):
            print(f"❌ Error: Video file not found: {video_path}")
            return None
        
        print(f"\n🎬 Processing video: {video_path}")
        print("-"*60)
        
        try:
            # Step 1: Load video
            print("📹 Step 1: Loading video...")
            video = torchvision.io.read_video(
                video_path,
                start_pts=0,
                end_pts=self.MAX_VIDEO_SECONDS,
                pts_unit='sec',
            )[0].numpy()
            print(
                f"   ✅ Video loaded: {video.shape[0]} frames "
                f"(up to the first {self.MAX_VIDEO_SECONDS} seconds)"
            )
            
            # Step 2: Detect face landmarks
            print("👁️  Step 2: Detecting face landmarks...")
            landmarks = self.landmarks_detector(video)
            # MediaPipe returns one landmark result per frame as a list.
            print(f"   ✅ Landmarks detected for {len(landmarks)} frames")
            
            # Step 3: Extract mouth region
            print("✂️  Step 3: Extracting mouth region...")
            video = self.video_process(video, landmarks)
            video = torch.tensor(video)
            video = video.permute((0, 3, 1, 2))
            print(f"   ✅ Mouth region extracted: {video.shape}")
            
            # Step 4: Apply transforms
            print("🔄 Step 4: Applying transforms...")
            video = self.video_transform(video)
            print(f"   ✅ Transforms applied: {video.shape}")
            
            # Step 5: Run inference
            print("🚀 Step 5: Running inference...")
            with torch.no_grad():
                transcript = self.model(video)
            
            print("-"*60)
            print(f"✅ Prediction complete!")
            
            return transcript
        
        except Exception as e:
            print(f"❌ Error during inference: {str(e)}")
            import traceback
            traceback.print_exc()
            return None


# ============ HOW TO USE THIS SCRIPT ============

if __name__ == '__main__':
    print("\n")
    print("╔" + "="*58 + "╗")
    print("║" + " "*58 + "║")
    print("║" + "🎬 VISUAL SPEECH RECOGNITION (LIP READING)".center(58) + "║")
    print("║" + " "*58 + "║")
    print("╚" + "="*58 + "╝")
    
    # Initialize model
    model = VSRModel(model_path='models/vsr_trlrs3_base.pth')
    
    # You can predict on any video
    # Example:
    video_file = 'demo.mp4'  # Change this to your video file
    
    if os.path.exists(video_file):
        result = model.predict(video_file)
        
        if result:
            print("\n" + "="*60)
            print("📝 PREDICTION RESULT")
            print("="*60)
            print(f"\nPredicted Text: {result}")
            print("\n" + "="*60)
    else:
        print(f"\n⚠️  Video file not found: {video_file}")
        print("Please provide a video file to process.")
        print("\nExample:")
        print("  video_file = 'your_video.mp4'")
        print("  result = model.predict(video_file)")
