import { useEffect, useRef, useState } from "react";
import { ArrowUpFromLine, Check, Copy as CopyIcon, FileVideo2, Mic, Play, RotateCcw, Sparkles, Square, Volume2, VolumeX, X } from "lucide-react";
import Navbar from "./components/Navbar.jsx";
import vocabulary from "./data/vocabulary.json";

const MAX_SECONDS = 16;
const MIN_SECONDS = 1;

function correctedWordDiff(original, corrected) {
  const originalWords = original.match(/\S+/g) || [];
  const correctedParts = corrected.match(/\s+|\S+/g) || [];
  const correctedWords = correctedParts.filter((part) => !/^\s+$/.test(part));
  const changed = new Set();
  if (originalWords.length > 1500 || correctedWords.length > 1500) {
    correctedWords.forEach((_, index) => changed.add(index));
  } else {
    const rows = Array.from({ length: correctedWords.length + 1 }, () => new Uint32Array(originalWords.length + 1));
    for (let i = 1; i <= correctedWords.length; i += 1) {
      for (let j = 1; j <= originalWords.length; j += 1) {
        rows[i][j] = correctedWords[i - 1] === originalWords[j - 1]
          ? rows[i - 1][j - 1] + 1
          : Math.max(rows[i - 1][j], rows[i][j - 1]);
      }
    }
    let i = correctedWords.length;
    let j = originalWords.length;
    const unchanged = new Set();
    while (i > 0 && j > 0) {
      if (correctedWords[i - 1] === originalWords[j - 1]) { unchanged.add(i - 1); i -= 1; j -= 1; }
      else if (rows[i - 1][j] >= rows[i][j - 1]) i -= 1;
      else j -= 1;
    }
    correctedWords.forEach((_, index) => { if (!unchanged.has(index)) changed.add(index); });
  }
  let wordIndex = 0;
  return correctedParts.map((part, index) => {
    if (/^\s+$/.test(part)) return part;
    const shouldHighlight = changed.has(wordIndex);
    wordIndex += 1;
    return shouldHighlight ? <mark className="diff-added" key={`diff-${index}`}>{part}</mark> : part;
  });
}

function Predictor() {
  const inputRef = useRef(null);
  const liveVideoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef(null);
  const clipUrlRef = useRef("");
  const speechRef = useRef(null);
  const [mode, setMode] = useState("upload");
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [cameraReady, setCameraReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedFile, setRecordedFile] = useState(null);
  const [recordedUrl, setRecordedUrl] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [isPredicting, setIsPredicting] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [correctedText, setCorrectedText] = useState("");
  const [autoCorrect, setAutoCorrect] = useState(true);
  const [correctionStatus, setCorrectionStatus] = useState("idle");
  const [correctionNote, setCorrectionNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

  const stopSpeech = () => {
    if (speechSupported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const stopCamera = () => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (streamRef.current) streamRef.current.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (liveVideoRef.current) liveVideoRef.current.srcObject = null;
    setCameraReady(false);
  };

  useEffect(() => () => {
    stopCamera();
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    if (speechSupported) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  useEffect(() => {
    if (mode !== "webcam") {
      stopCamera();
      if (isRecording && recorderRef.current?.state === "recording") recorderRef.current.stop();
    }
  }, [mode]);

  useEffect(() => {
    if (mode !== "webcam" || recordedUrl || streamRef.current) return;
    let cancelled = false;
    const openCamera = async () => {
      setError("");
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser cannot access a camera. Try a recent browser over HTTPS or localhost.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (cancelled) { stream.getTracks().forEach((track) => track.stop()); return; }
        streamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          await liveVideoRef.current.play().catch(() => {});
        }
        setCameraReady(true);
      } catch (cameraError) {
        if (cancelled) return;
        const message = cameraError?.name === "NotAllowedError" || cameraError?.name === "SecurityError"
          ? "Camera access was denied. Allow camera access in your browser settings and try again."
          : cameraError?.name === "NotFoundError" || cameraError?.name === "DevicesNotFoundError"
            ? "No camera was found. Connect a camera or use Upload Video instead."
            : "Could not start the camera. Check that it is connected and not in use by another app.";
        setError(message);
      }
    };
    openCamera();
    return () => { cancelled = true; };
  }, [mode, recordedUrl]);

  useEffect(() => {
    if (!isRecording) return undefined;
    const timer = window.setInterval(() => {
      setElapsed(Math.min(MAX_SECONDS, (performance.now() - startedAtRef.current) / 1000));
    }, 100);
    return () => window.clearInterval(timer);
  }, [isRecording]);

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
    stopSpeech();
    clearCorrection();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(nextFile);
    setVideoUrl(URL.createObjectURL(nextFile));
    setTranscript("");
    setError("");
  };

  const predictText = async (videoFile) => {
    const form = new FormData();
    form.append("video", videoFile, videoFile.name);
    const response = await fetch("/predict", { method: "POST", body: form });
    const data = await response.json();
    if (!response.ok || data.error || data.status === "error") {
      throw new Error(data.error || "Could not process this video. Try a short clip with a clear face.");
    }
    return String(data.prediction || "").trim();
  };

  const clearCorrection = () => {
    setCorrectedText("");
    setCorrectionStatus("idle");
    setCorrectionNote("");
  };

  const correctWithAI = async (text) => {
    if (!text?.trim()) {
      setCorrectedText("");
      setCorrectionStatus("unavailable");
      setCorrectionNote("There is no prediction text to correct.");
      return;
    }
    stopSpeech();
    setCorrectionStatus("loading");
    setCorrectedText("");
    setCorrectionNote("");
    try {
      const response = await fetch("/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "AI correction is unavailable.");
      const correction = String(data.corrected || "").trim();
      if (correction) stopSpeech();
      setCorrectedText(correction);
      setCorrectionStatus("success");
    } catch (requestError) {
      setCorrectedText("");
      setCorrectionStatus("unavailable");
      setCorrectionNote(requestError?.message || "AI correction unavailable - is Ollama running?");
    }
  };

  const decode = async (videoFile) => {
    if (!videoFile || isPredicting) return;
    stopSpeech();
    setIsPredicting(true);
    setTranscript("");
    clearCorrection();
    setError("");
    try {
      const result = await predictText(videoFile);
      const prediction = result || "No text was detected. Try a clearer clip with the speaker facing the camera.";
      setTranscript(result);
      if (result && autoCorrect) await correctWithAI(result);
    } catch (requestError) {
      setError(requestError.message || "Prediction failed. Please try again.");
    } finally {
      setIsPredicting(false);
    }
  };

  const startRecording = () => {
    if (!cameraReady || !streamRef.current) return;
    if (!window.MediaRecorder) {
      setError("Video recording is not supported by this browser. Try a recent version of Chrome, Edge, or Firefox.");
      return;
    }
    stopSpeech();
    setTranscript("");
    clearCorrection();
    setError("");
    setRecordedFile(null);
    setRecordedUrl("");
    chunksRef.current = [];
    try {
      const options = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus") ? { mimeType: "video/webm;codecs=vp8,opus" }
        : MediaRecorder.isTypeSupported("video/webm") ? { mimeType: "video/webm" } : undefined;
      const recorder = new MediaRecorder(streamRef.current, options);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => { if (event.data?.size) chunksRef.current.push(event.data); };
      recorder.onerror = () => setError("Recording failed. Please check your camera and try again.");
      recorder.onstop = () => {
        const duration = (performance.now() - startedAtRef.current) / 1000;
        setIsRecording(false);
        setElapsed(Math.min(MAX_SECONDS, duration));
        stopCamera();
        if (duration < MIN_SECONDS) {
          setError("That recording was too short. Record for at least one second, then try again.");
          return;
        }
        const type = recorder.mimeType || chunksRef.current[0]?.type || "video/webm";
        const extension = type.includes("mp4") ? "mp4" : "webm";
        const clip = new File(chunksRef.current, `webcam-recording.${extension}`, { type });
        const url = URL.createObjectURL(clip);
        clipUrlRef.current = url;
        setRecordedFile(clip);
        setRecordedUrl(url);
      };
      startedAtRef.current = performance.now();
      setElapsed(0);
      setIsRecording(true);
      recorder.start(100);
      stopTimerRef.current = window.setTimeout(() => {
        if (recorder.state === "recording") recorder.stop();
      }, MAX_SECONDS * 1000);
    } catch {
      setError("Recording could not start. Try another browser or check the camera permissions.");
      stopCamera();
    }
  };

  const stopRecording = () => {
    if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = null;
    if (recorderRef.current?.state === "recording") recorderRef.current.stop();
  };

  const rerecord = async () => {
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = "";
    setRecordedUrl("");
    setRecordedFile(null);
    setElapsed(0);
    setError("");
  };

  const reset = () => {
    stopSpeech();
    setFile(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl("");
    setTranscript("");
    clearCorrection();
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const speak = () => {
    const speechText = correctedText || transcript;
    if (!speechSupported || !speechText) return;
    if (isSpeaking) { stopSpeech(); return; }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(speechText);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    speechRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  };

  const copyCorrection = async () => {
    const textToCopy = correctedText || transcript;
    if (!textToCopy) return;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCorrectionNote("Could not copy automatically. Select the text and copy it instead.");
    }
  };

  const formatTime = (seconds) => `00:${String(Math.floor(seconds)).padStart(2, "0")}`;

  return (
    <main className="main-content">
      <section className="predict-card" aria-label="Video prediction">
        <div className="card-heading">
          <div className="card-icon"><FileVideo2 size={18} /></div>
          <div><h2>Your video</h2><p>MP4, MOV, AVI, MKV, or WebM · up to 16 seconds</p></div>
          {(file || recordedFile) && <button className="reset-button" type="button" onClick={reset}><RotateCcw size={14} /> Clear</button>}
        </div>

        <div className="input-tabs" role="tablist" aria-label="Choose video source">
          <button type="button" role="tab" aria-selected={mode === "upload"} className={mode === "upload" ? "input-tab active" : "input-tab"} onClick={() => { setMode("upload"); setError(""); }}>Upload Video</button>
          <button type="button" role="tab" aria-selected={mode === "webcam"} className={mode === "webcam" ? "input-tab active" : "input-tab"} onClick={() => { setMode("webcam"); reset(); if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current); clipUrlRef.current = ""; setRecordedUrl(""); setRecordedFile(null); setElapsed(0); }}>Record with Webcam</button>
        </div>
        <label className="auto-correct-toggle"><input type="checkbox" checked={autoCorrect} onChange={(event) => setAutoCorrect(event.target.checked)} /><span className="toggle-track" aria-hidden="true"><i /></span><span>Auto-correct with AI</span><small>Ollama</small></label>

        {mode === "upload" ? <>
          {!file ? (
            <button className="drop-area" type="button" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectVideo(event.dataTransfer.files?.[0]); }}>
              <span className="upload-icon"><ArrowUpFromLine size={20} /></span>
              <strong>Choose a video to upload</strong>
              <span>or drag and drop it here</span>
              <span className="browse-button">Browse video</span>
            </button>
          ) : (
            <div className="selected-video">
              <video src={videoUrl} controls playsInline />
              <div className="file-details"><FileVideo2 size={16} /><span title={file.name}>{file.name}</span><Check size={15} /></div>
            </div>
          )}
          <input ref={inputRef} className="file-input" type="file" accept="video/mp4,video/quicktime,video/x-msvideo,video/x-matroska,video/webm,.mkv,.avi" onChange={(event) => selectVideo(event.target.files?.[0])} />
          <div className="action-row"><span className="local-note">The app analyzes up to the first 16 seconds.</span><button className="predict-button" type="button" disabled={!file || isPredicting} onClick={() => decode(file)}>{isPredicting ? "Predicting…" : <><Play size={15} fill="currentColor" /> Predict text</>}</button></div>
        </> : <div className="webcam-panel">
          {recordedUrl ? <div className="selected-video"><video src={recordedUrl} controls playsInline /><div className="file-details"><FileVideo2 size={16} /><span>Webcam recording · {formatTime(elapsed)} / 00:16</span><Check size={15} /></div></div> : <div className="camera-frame">
            <video ref={liveVideoRef} className="camera-preview" autoPlay muted playsInline aria-label="Mirrored live camera preview" />
            {!cameraReady && <div className="camera-placeholder"><Mic size={22} /><span>Starting your camera…</span></div>}
            {isRecording && <span className="recording-indicator"><i /> REC</span>}
            <div className="camera-timer" aria-live="polite">{formatTime(elapsed)} / 00:16</div>
          </div>}
          {isRecording && <div className="recording-status"><i /> Recording</div>}
          <div className="webcam-actions">
            {!recordedUrl ? <button className={isRecording ? "record-button recording" : "record-button"} type="button" disabled={!cameraReady && !isRecording} onClick={isRecording ? stopRecording : startRecording}>{isRecording ? <><Square size={14} fill="currentColor" /> Stop recording</> : <><span className="record-dot" /> Record</>}</button> : <>
              <button className="secondary-button" type="button" onClick={rerecord}><RotateCcw size={14} /> Re-record</button>
              <button className="predict-button" type="button" disabled={isPredicting} onClick={() => decode(recordedFile)}>{isPredicting ? "Predicting…" : <><Play size={15} fill="currentColor" /> Decode</>}</button>
            </>}
          </div>
          <p className="local-note camera-note">Face the camera and keep your lips visible. Recordings stop automatically at 16 seconds.</p>
        </div>}

        {isPredicting && <div className="loading-status" role="status"><span className="loading-spinner" /> Analyzing video…</div>}
        {error && <div className="message message-error" role="alert"><X size={16} />{error}</div>}
        {transcript && <div className="transcript-results" aria-live="polite">
          <section className="result-card transcript-card"><div className="result-label"><Check size={15} /> ORIGINAL PREDICTION</div><div className="result-output"><p>{transcript}</p></div></section>
          <section className="result-card correction-card"><div className="result-label"><Sparkles size={14} /> AI-CORRECTED TEXT</div>
            {correctionStatus === "loading" ? <div className="correction-loading" role="status"><span className="loading-spinner" /> Correcting grammar with local Ollama…</div> : <>
              <div className="result-output"><p>{correctionStatus === "success" && correctedText ? correctedWordDiff(transcript, correctedText) : transcript}</p>
                {speechSupported && <button className="speak-button" type="button" onClick={speak} disabled={!transcript} aria-label={isSpeaking ? "Stop reading aloud" : "Read corrected text aloud"} title={isSpeaking ? "Stop reading aloud" : "Read corrected text aloud"}>{isSpeaking ? <VolumeX size={19} /> : <Volume2 size={19} />}</button>}
              </div>
              <div className="corrected-actions">
                {(correctionStatus === "idle" || correctionStatus === "unavailable") && <button className="secondary-button correction-action" type="button" onClick={() => correctWithAI(transcript)}>{correctionStatus === "unavailable" ? "Try again" : "Correct with AI"}</button>}
                <button className="secondary-button correction-action" type="button" onClick={copyCorrection}><CopyIcon size={14} /> {copied ? "Copied" : "Copy"}</button>
              </div>
              {correctionStatus === "unavailable" && <p className="correction-notice">{correctionNote || "AI correction unavailable - is Ollama running?"}</p>}
              {correctionNote && correctionStatus !== "unavailable" && <p className="correction-notice">{correctionNote}</p>}
            </>}
          </section>
        </div>}
      </section>

      <p className="privacy-note">LipVision-AI uses the video only to generate a transcript.</p>
    </main>
  );
}

function ModelVocabulary() {
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();
  const matchingTokens = normalizedSearch ? vocabulary.filter((token) => token.toLowerCase().includes(normalizedSearch)) : vocabulary;
  return (
    <footer className="vocabulary-footer">
      <h2>What can the model predict?</h2>
      <p>This project uses the <strong>vsr_trlrs3_base</strong> English visual speech model. It was trained with <strong>438 hours of LRS3 data</strong>; it is best suited to English speech similar to that dataset, and it analyzes only the first 16 seconds of a clip.</p>
      <div className="model-facts" aria-label="Model facts"><div><span>Training data</span><strong>LRS3 · English</strong></div><div><span>Training volume</span><strong>438 hours</strong></div><div><span>Reported benchmark</span><strong>36.0% WER</strong></div><div><span>Clip limit</span><strong>First 16 seconds</strong></div></div>
      <p className="model-limit-note">The 36.0% word error rate is the repository’s reported result on LRS3, not a guaranteed accuracy for your video; performance can be lower on unclear, non-English, or out-of-domain clips. Lower WER is better. The {vocabulary.length.toLocaleString()} entries below are decoder subword tokens, not a fixed list of whole words—the model combines them to form its transcript.</p>
      <details className="vocabulary-details"><summary>View the {vocabulary.length.toLocaleString()} decoder subword tokens</summary><label className="vocabulary-search"><span>Find a token</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tokens" /><small>{matchingTokens.length.toLocaleString()} shown · ▁ marks a word start</small></label><ul className="vocabulary-list" aria-label="Decoder vocabulary tokens">{matchingTokens.map((token, index) => <li key={`${token}-${index}`}>{token}</li>)}</ul></details>
    </footer>
  );
}

function HeroIntro() {
  return (
    <section className="intro hero-intro">
      <div className="hero-copy">
        <span className="intro-label"><Sparkles size={14} /> VISUAL SPEECH RECOGNITION</span>
        <h1>Turn lip movements<br /><span>into readable text.</span></h1>
        <p>Upload a short video or record with your webcam. LipVision-AI reads visible mouth movements to predict speech, then can correct the transcript with your local AI model.</p>
        <div className="hero-steps" aria-label="How lip-reading works">
          <span>VIDEO IN</span><i /><span>LIP MOVEMENT</span><i /><span>TEXT OUT</span>
        </div>
      </div>
      <span className="hero-caption">ENGLISH LIP READING · CLIPS UP TO 16 SECONDS</span>
    </section>
  );
}

export default function App() {
  return <div className="app-shell"><Navbar /><HeroIntro /><div className="feature-layout"><Predictor /><ModelVocabulary /></div><AboutProject /></div>;
}

function AboutProject() {
  return <section className="about-project" aria-labelledby="about-heading"><div className="about-visuals" aria-label="Example speaker portraits"><figure className="lip-reading-image"><img src="/static/frontend/images/lip-reading-example.gif" alt="Animated close-up demonstrating visible lip movements while a person speaks" loading="lazy" /><figcaption>Lip movement example</figcaption></figure></div><div className="about-copy"><span className="about-eyebrow">ABOUT THE PROJECT</span><h2 id="about-heading">Speech recognition through lip movement</h2><p>LipVision-AI analyzes the visible movement of a speaker’s lips in a video and uses a pretrained visual speech recognition model to produce an English text prediction. It processes video without relying on its audio track, so it can be useful when audio is unavailable or muted.</p><p>For a better result, use a short, clear clip with one person facing the camera and their mouth visible. Predictions are estimates and may contain mistakes, especially when the face is obscured, the video is blurry, or the words are outside the model’s training data.</p></div></section>;
}
