const express = require("express");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
app.use(cors());
app.use(express.json());

const OLLAMA_BASE_URL = "http://localhost:11434/api";

// Endpoint to list models
app.get("/api/ollama/tags", async (req, res) => {
  try {
    const response = await axios.get(`${OLLAMA_BASE_URL}/tags`);
    res.json(response.data);
  } catch (error) {
    console.error("Error fetching models:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint to generate text
app.post("/api/ollama/generate", async (req, res) => {
  try {
    console.log("Proxy received request:", req.body);
    const response = await axios.post(`${OLLAMA_BASE_URL}/generate`, req.body);
    console.log("Proxy received response:", response.data);
    res.json(response.data);
  } catch (error) {
    console.error("Error generating text:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check endpoint to verify if Ollama is running
app.get("/api/ollama/health", async (req, res) => {
  try {
    await axios.head(`${OLLAMA_BASE_URL}/tags`);
    res.json({ status: "ok", message: "Ollama is running" });
  } catch (error) {
    res.status(503).json({ status: "error", message: "Ollama is not accessible" });
  }
});

// For testing certificates
app.get("/", (req, res) => {
  res.send("Proxy server is running. Use /api/ollama/* endpoints to access Ollama API.");
});

// Start HTTP server
const HTTP_PORT = process.env.HTTP_PORT || 3001;
app.listen(HTTP_PORT, () => {
  console.log(`HTTP Proxy server running on http://localhost:${HTTP_PORT}`);
});

// Try to start HTTPS server using Office's dev certificate if available
try {
  // Office add-in dev certs are typically stored in the .office-addin-dev-certs directory in the user's home folder
  const homeDir = process.env.HOME || process.env.USERPROFILE;
  const certPath = path.join(homeDir, ".office-addin-dev-certs");

  if (fs.existsSync(certPath)) {
    const privateKey = fs.readFileSync(path.join(certPath, "localhost.key"), "utf8");
    const certificate = fs.readFileSync(path.join(certPath, "localhost.crt"), "utf8");
    const credentials = { key: privateKey, cert: certificate };

    const HTTPS_PORT = 3443;
    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(HTTPS_PORT, () => {
      console.log(`HTTPS Proxy server running on https://localhost:${HTTPS_PORT}`);
      console.log(`Word add-in should connect to this secure endpoint`);
    });
  } else {
    console.log("Office add-in dev certificates not found. HTTPS server not started.");
    console.log("Word add-in may not be able to connect due to security restrictions.");
    console.log("Run 'npx office-addin-dev-certs install' to create dev certificates.");
  }
} catch (error) {
  console.error("Failed to start HTTPS server:", error);
}

console.log(`Proxying requests to Ollama at ${OLLAMA_BASE_URL}`);
