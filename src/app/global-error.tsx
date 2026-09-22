"use client";

// Last-resort boundary: replaces the root layout, so it must render its own <html>/<body>
// and cannot rely on the app's fonts or Tailwind classes being loaded.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#FAF9F6",
          color: "#17324D",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <main style={{ maxWidth: 430, margin: "0 auto", padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 28 }}>Something went wrong.</h1>
          <p style={{ fontSize: 18, lineHeight: 1.5 }}>
            Nothing was saved or sent. Please try again.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              minHeight: 56,
              padding: "0 32px",
              borderRadius: 999,
              border: 0,
              background: "#17324D",
              color: "#fff",
              fontSize: 18,
              fontWeight: 700,
            }}
          >
            Try again
          </button>
          <p style={{ fontSize: 14, marginTop: 24 }}>
            Prototype information — not connected to a real pharmacy.
          </p>
        </main>
      </body>
    </html>
  );
}
