export default function Navbar() {
  return (
    <header className="topbar">
      <a className="brand" href="/" aria-label="LipVision-AI home">
        <span className="brand-icon" aria-hidden="true"><i /><b /></span>
        <span>LipVision-AI</span>
      </a>
      <span className="model-status"><i /> Model ready</span>
    </header>
  );
}
