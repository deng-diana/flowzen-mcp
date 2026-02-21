export function LoadingScreen({ isDark }: { isDark: boolean }) {
  return (
    <div className={`todo-container ${isDark ? "dark" : "light"}`}>
      <div className="loading-screen">
        <div className="loader-ring">
          <div className="loader-ring-inner" />
        </div>
        <div className="loading-brand">🌊 Flowzen</div>
        <div className="loading-tagline">Finding your next best action...</div>
      </div>
    </div>
  );
}
