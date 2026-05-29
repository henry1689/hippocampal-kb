export function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-spinner" />
      <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>海马体系统初始化...</div>
    </div>
  );
}
