export function LoadingScreen() {
  return (
    <div className="loading-screen" style={{ borderRadius: 20, background: "#FFE9D7" }}>
      <div className="loader-ring">
        <div className="loader-ring-inner" />
      </div>
      <div className="loading-brand">🌊 Flowzen</div>
      <div className="loading-tagline">Finding your next best action...</div>
    </div>
  );
}
