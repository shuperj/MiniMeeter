import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./App.css";

// React's development build records every component render as a
// performance.measure entry, and the browser keeps them all. The meters
// re-render the mixer dozens of times a second, so a dev session that runs
// for hours fills the WebView with millions of entries until it dies "out
// of memory". Production builds record none.
if (import.meta.env.DEV) setInterval(() => performance.clearMeasures(), 10_000);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
