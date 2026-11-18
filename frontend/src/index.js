import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./design-system/penni-reference.css";
import App from "./App";
import { api } from "./lib/api";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

// Clear the one-shot reload guard now that the bundle loaded successfully.
try { sessionStorage.removeItem("penni.chunk-reload"); } catch { /* ignore */ }

// Wake a sleeping backend while React boots, in parallel with the first render.
api.warmup();

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

serviceWorkerRegistration.register();
