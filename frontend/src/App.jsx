import { useEffect, useRef, useState } from "react";
import { ArrowUpFromLine, Check, FileVideo2, Play, RotateCcw, Sparkles, X } from "lucide-react";
import Navbar from "./components/Navbar.jsx";
import vocabulary from "./data/vocabulary.json";

function Predictor() {
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [isPredicting, setIsPredicting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const selectVideo = (nextFile) => {
    if (!nextFile) return;
    if (!/\.(mp4|mov|avi|mkv|webm)$/i.test(nextFile.name)) {
      setError("Choose an MP4, MOV, AVI, MKV, or WebM video.");
      return;
    }
    if (nextFile.size > 500 * 1024 * 1024) {
      setError("The video must be smaller than 500 MB.");
      return;
    }
    setFile(nextFile);
    setVideoUrl(URL.createObjectURL(nextFile));
    setTranscript("");
    setError("");
  };

  const predictText = async (videoFile) => {
    // Connect or replace this request when the model API changes.
    const form = new FormData();
    form.append("video", videoFile);
    const response = await fetch("/predict", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok || data.error || data.status === "error") {
      throw new Error(data.error || "Could not process this video. Try a short clip with a clear face.");
    }
    return String(data.prediction || "").trim();
  };

  const runPrediction = async () => {
    if (!file || isPredicting) return;
    setIsPredicting(true);
    setTranscript("");
    setError("");
    try {
      setTranscript(await predictText(file));
    } catch (requestError) {
      setError(requestError.message || "Prediction failed. Please try again.");
    } finally {
      setIsPredicting(false);
    }
  };

  const reset = () => {
    setFile(null);
    setVideoUrl((oldUrl) => {
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      return "";
    });
    setTranscript("");
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <main className="main-content">
      <section className="intro">
        <span className="intro-label"><Sparkles size={14} /> VISUAL SPEECH RECOGNITION</span>
        <h1>Turn video into text</h1>
        <p>Upload a short video of someone speaking. LipVision-AI predicts the words from lip movement.</p>
      </section>

      <section className="predict-card" aria-label="Video prediction">
        <div className="card-heading">
          <div className="card-icon"><FileVideo2 size={18} /></div>
          <div><h2>Your video</h2><p>MP4, MOV, AVI, MKV, or WebM</p></div>
          {file && <button className="reset-button" type="button" onClick={reset}><RotateCcw size={14} /> Clear</button>}
        </div>

        {!file ? (
          <button
            className="drop-area"
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); selectVideo(event.dataTransfer.files?.[0]); }}
          >
            <span className="upload-icon"><ArrowUpFromLine size={20} /></span>
            <strong>Choose a video to upload</strong>
            <span>or drag and drop it here</span>
            <span className="browse-button">Browse video</span>
          </button>
        ) : (
          <div className="selected-video">
            <video ref={videoRef} src={videoUrl} controls playsInline />
            <div className="file-details"><FileVideo2 size={16} /><span title={file.name}>{file.name}</span><Check size={15} /></div>
          </div>
        )}

        <input
          ref={inputRef}
          className="file-input"
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mkv,.avi"
          onChange={(event) => selectVideo(event.target.files?.[0])}
        />

        <div className="action-row">
          <span className="local-note">The app analyzes up to the first 16 seconds.</span>
          <button className="predict-button" type="button" disabled={!file || isPredicting} onClick={runPrediction}>
            {isPredicting ? "Predicting…" : <><Play size={15} fill="currentColor" /> Predict text</>}
          </button>
        </div>

        {error && <div className="message message-error"><X size={16} />{error}</div>}
        {transcript && <section className="result-card" aria-live="polite"><div className="result-label"><Check size={15} /> PREDICTED TEXT</div><p>{transcript}</p></section>}
      </section>

      <p className="privacy-note">LipVision-AI uses the video only to generate a transcript.</p>
    </main>
  );
}

function ModelVocabulary() {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const matchingTokens = normalizedSearch
    ? vocabulary.filter((token) => token.toLowerCase().includes(normalizedSearch))
    : vocabulary;

  return (
    <footer className="vocabulary-footer">
      <h2>What can the model predict?</h2>
      <p>
        This project uses the <strong>vsr_trlrs3_base</strong> English visual speech model. It was
        trained with <strong>438 hours of LRS3 data</strong>; it is best suited to English speech
        similar to that dataset, and it analyzes only the first 16 seconds of a clip.
      </p>
      <div className="model-facts" aria-label="Model facts">
        <div><span>Training data</span><strong>LRS3 · English</strong></div>
        <div><span>Training volume</span><strong>438 hours</strong></div>
        <div><span>Reported benchmark</span><strong>36.0% WER</strong></div>
        <div><span>Clip limit</span><strong>First 16 seconds</strong></div>
      </div>
      <p className="model-limit-note">
        The 36.0% word error rate is the repository’s reported result on LRS3, not a guaranteed
        accuracy for your video; performance can be lower on unclear, non-English, or out-of-domain
        clips. Lower WER is better. The {vocabulary.length.toLocaleString()} entries below are decoder
        subword tokens, not a fixed list of whole words—the model combines them to form its transcript.
      </p>
      <details className="vocabulary-details">
        <summary>View the {vocabulary.length.toLocaleString()} decoder subword tokens</summary>
        <label className="vocabulary-search">
          <span>Find a token</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search tokens"
          />
          <small>{matchingTokens.length.toLocaleString()} shown · ▁ marks a word start</small>
        </label>
        <ul className="vocabulary-list" aria-label="Decoder vocabulary tokens">
          {matchingTokens.map((token, index) => <li key={`${token}-${index}`}>{token}</li>)}
        </ul>
      </details>
    </footer>
  );
}

export default function App() {
  return (
    <div className="app-shell">
      <Navbar />
      <Predictor />
      <AboutProject />
      <ModelVocabulary />
    </div>
  );
}

function AboutProject() {
  return (
    <section className="about-project" aria-labelledby="about-heading">
      <div className="about-visuals" aria-label="Example speaker portraits">
        <figure className="lip-reading-image">
          <img src="/static/frontend/images/lip-reading-example.gif" alt="Animated close-up demonstrating visible lip movements while a person speaks" loading="lazy" />
          <figcaption>Lip movement example</figcaption>
        </figure>
      </div>
      <div className="about-copy">
        <span className="about-eyebrow">ABOUT THE PROJECT</span>
        <h2 id="about-heading">Speech recognition through lip movement</h2>
        <p>
          LipVision-AI analyzes the visible movement of a speaker’s lips in a video and uses a
          pretrained visual speech recognition model to produce an English text prediction. It
          processes video without relying on its audio track, so it can be useful when audio is
          unavailable or muted.
        </p>
        <p>
          For a better result, use a short, clear clip with one person facing the camera and their
          mouth visible. Predictions are estimates and may contain mistakes, especially when the
          face is obscured, the video is blurry, or the words are outside the model’s training data.
        </p>
      </div>
    </section>
  );
}
