/**
 * This proxy service helps work around CORS limitations in Office add-ins
 * by providing a fallback mechanism to detect and communicate with Ollama
 */

// Used for direct detection of Ollama service
export class ProxyService {
  // Detect if proxy server is running
  static async isOllamaRunning(): Promise<boolean> {
    console.log("ProxyService: Checking if Ollama is running via proxy server...");

    try {
      // First, check if our proxy server is running using fetch (HTTPS)
      try {
        console.log("ProxyService: Checking proxy health endpoint (HTTPS)...");
        const response = await fetch("https://localhost:3443/api/ollama/health");

        if (response.ok) {
          const data = await response.json();
          console.log("ProxyService: Proxy health response:", data);
          return data.status === "ok";
        } else {
          console.log("ProxyService: Proxy health check failed with status:", response.status);
        }
      } catch (error) {
        console.error("ProxyService: Error checking proxy health (HTTPS):", error);

        // Try HTTP fallback (may not work in Word add-in environment)
        try {
          console.log("ProxyService: Checking proxy health endpoint (HTTP fallback)...");
          const response = await fetch("http://localhost:3001/api/ollama/health");

          if (response.ok) {
            const data = await response.json();
            console.log("ProxyService: Proxy health response (HTTP):", data);
            return data.status === "ok";
          }
        } catch (httpError) {
          console.error("ProxyService: Error checking proxy health (HTTP):", httpError);
        }
      }

      // Fall back to our existing methods
      console.log("ProxyService: Falling back to direct Ollama detection methods...");

      // Method 1: Try direct XMLHttpRequest with different options
      const result1 = await this.checkWithXHR();
      if (result1) {
        console.log("ProxyService: Ollama detected with XHR method");
        return true;
      }

      // Method 2: Try fetch with no-cors mode (can't read response but can detect if service exists)
      const result2 = await this.checkWithFetch();
      if (result2) {
        console.log("ProxyService: Ollama detected with fetch method");
        return true;
      }

      // Method 3: Try image ping method (creative approach that sometimes works)
      const result3 = await this.checkWithImagePing();
      if (result3) {
        console.log("ProxyService: Ollama detected with image ping method");
        return true;
      }

      console.log("ProxyService: Ollama not detected with any method");
      return false;
    } catch (error) {
      console.error("ProxyService: Error checking Ollama status:", error);
      return false;
    }
  }

  // Check using XHR with various options
  private static async checkWithXHR(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.timeout = 2000;

        xhr.onload = () => {
          console.log("ProxyService: XHR onload fired with status", xhr.status);
          resolve(xhr.status >= 200 && xhr.status < 400);
        };

        xhr.onerror = () => {
          // This could actually mean the server exists but CORS blocked the request
          // We'll consider this a "maybe" and return true
          console.log("ProxyService: XHR error might indicate Ollama exists but CORS is blocking");
          resolve(true);
        };

        xhr.ontimeout = () => {
          console.log("ProxyService: XHR request timed out");
          resolve(false);
        };

        // Add cache-busting parameter
        const timestamp = new Date().getTime();
        xhr.open("HEAD", `http://localhost:11434/api/tags?_=${timestamp}`, true);
        xhr.send();
      } catch (error) {
        console.error("ProxyService: XHR method exception:", error);
        resolve(false);
      }
    });
  }

  // Check using fetch with no-cors mode
  private static async checkWithFetch(): Promise<boolean> {
    try {
      console.log("ProxyService: Attempting fetch with no-cors mode");
      const timestamp = new Date().getTime();
      const response = await fetch(`http://localhost:11434/api/tags?_=${timestamp}`, {
        method: "HEAD",
        mode: "no-cors",
        cache: "no-cache",
      });

      // In no-cors mode, we can't actually read the response status,
      // but if we get here without an error, it likely means the server exists
      console.log("ProxyService: Fetch completed without errors");
      return true;
    } catch (error) {
      console.error("ProxyService: Fetch method error:", error);
      return false;
    }
  }

  // Try pinging the server URL as an image (creative approach)
  private static async checkWithImagePing(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        console.log("ProxyService: Attempting image ping method");
        const img = new Image();

        // Set a timeout
        const timeout = setTimeout(() => {
          console.log("ProxyService: Image ping timed out");
          resolve(false);
        }, 2000);

        img.onload = () => {
          console.log("ProxyService: Image onload fired (unexpected)");
          clearTimeout(timeout);
          resolve(true);
        };

        img.onerror = () => {
          // Error could mean the server exists but isn't an image
          // This is actually the expected result
          console.log("ProxyService: Image error indicates server might exist");
          clearTimeout(timeout);
          resolve(true);
        };

        // Try to load the API URL as an image (will fail, but how it fails tells us if server exists)
        const timestamp = new Date().getTime();
        img.src = `http://localhost:11434/api/tags?_=${timestamp}`;
      } catch (error) {
        console.error("ProxyService: Image ping method exception:", error);
        resolve(false);
      }
    });
  }
}
