import React from "react";
import ReactDOM from "react-dom/client";

function App() {
  return (
    <main style={{ minHeight: "100vh", background: "#fff", color: "#1f2933", fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600 }}>Scheduly</h1>
      <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "#475569" }}>
        Webpack ビルドを通したエントリポイントです。既存モックは順次移植予定です。
      </p>
    </main>
  );
}

const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);
root.render(<App />);
