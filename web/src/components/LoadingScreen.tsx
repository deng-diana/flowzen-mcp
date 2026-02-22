import logoSrc from "../assets/flowzen-logo.svg";

export function LoadingScreen() {
  return (
    <div className="loading-screen" style={{ borderRadius: 20, background: "#FFE9D7" }}>
      <div className="loader-ring">
        <div className="loader-ring-inner" />
      </div>
      <div className="loading-brand">
        <img src={logoSrc} alt="Flowzen" width={24} height={24} style={{ borderRadius: "50%", verticalAlign: "middle", marginRight: 6 }} />
        Flowzen
      </div>
      <div className="loading-tagline">Finding your next best action...</div>
    </div>
  );
}
