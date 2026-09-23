import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <main>
      <h1>Приёмка</h1>
      <p>Базовый каркас мини-приложения MAX.</p>
    </main>
  </StrictMode>,
);
