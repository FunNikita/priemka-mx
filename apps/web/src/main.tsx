import { MaxUI } from "@maxhub/max-ui";
import "@maxhub/max-ui/dist/styles.css";
import { useEffect } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.jsx";
import { useSystemColorScheme } from "./utils/useSystemColorScheme.js";
import "./styles/index.css";

export function Root() {
  const scheme = useSystemColorScheme();

  useEffect(() => {
    document.documentElement.dataset.colorScheme = scheme;
  }, [scheme]);

  return (
    <MaxUI colorScheme={scheme === "dark" ? "dark" : "light"}>
      <App />
    </MaxUI>
  );
}

createRoot(document.getElementById("root")!).render(<Root />);
