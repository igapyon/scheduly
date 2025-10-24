import React from "react";
import ReactDOM from "react-dom/client";

function AdminApp() {
  return (
    <main style={{ minHeight: "100vh", background: "#f4f4f5", color: "#1f2933", fontFamily: "system-ui, sans-serif", padding: "1.5rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600 }}>Scheduly Admin</h1>
      <p style={{ marginTop: "0.75rem", fontSize: "0.9rem", color: "#475569" }}>管理者モックはここから移植予定です。</p>
    </main>
  );
}

const container = document.getElementById("root");
const root = ReactDOM.createRoot(container);
root.render(<AdminApp />);
