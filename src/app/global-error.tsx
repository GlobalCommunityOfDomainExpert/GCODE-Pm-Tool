"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html>
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f8fafc" }}>
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "24px",
          }}
        >
          <h2 style={{ marginBottom: 8, fontSize: 18, fontWeight: 600, color: "#0f172a" }}>Something went wrong</h2>
          <p style={{ marginBottom: 24, maxWidth: 420, fontSize: 13, color: "#64748b" }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={reset}
            style={{
              borderRadius: 6,
              background: "#6366f1",
              color: "white",
              padding: "10px 20px",
              fontSize: 13,
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
