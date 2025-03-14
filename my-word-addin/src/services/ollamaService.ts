import { ProxyService } from "./proxyService";

interface OllamaResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
}

interface ModelInfo {
  name: string;
  modified_at: string;
  size: number;
}

export class OllamaService {
  // Use our HTTPS proxy server instead of the HTTP one
  private proxyUrl: string = "https://localhost:3443/api/ollama";
  private mockModels: ModelInfo[] = [
    {
      name: "mistral",
      modified_at: new Date().toISOString(),
      size: 4113301824,
    },
    {
      name: "llama3.2",
      modified_at: new Date().toISOString(),
      size: 2019393189,
    },
  ];

  // Flag to track connection status
  private ollamaDetected: boolean = false;

  // Make request using fetch API instead of XMLHttpRequest
  private async makeRequest(url: string, method: string, body?: any): Promise<any> {
    console.log(`Making ${method} request to ${url}`);

    try {
      const options: RequestInit = {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        // Set timeout using AbortController - 30 seconds
        signal: AbortSignal.timeout(30000),
      };

      if (body) {
        const bodyStr = JSON.stringify(body);
        console.log(`Request body: ${bodyStr}`);
        options.body = bodyStr;
      }

      console.log("Sending fetch request...");
      const response = await fetch(url, options);
      console.log(`Response received with status: ${response.status}`);

      if (!response.ok) {
        throw {
          status: response.status,
          statusText: response.statusText,
          response: await response.text(),
        };
      }

      const data = await response.json();
      console.log("Parsed response data:", data);
      return data;
    } catch (error: any) {
      console.error("Error in makeRequest:", error);

      // Check if it's an abort error (timeout)
      if (error.name === "TimeoutError" || error.name === "AbortError") {
        throw {
          status: 0,
          statusText: "Timeout",
          response: "Request timed out after 30 seconds",
        };
      }

      throw error;
    }
  }

  async listModels(): Promise<ModelInfo[]> {
    try {
      console.log("Fetching models from proxy server...");

      // First check if Ollama is running via proxy
      const isRunning = await this.isOllamaRunning();
      if (!isRunning) {
        console.warn("Ollama is not running, using mock models");
        return this.mockModels;
      }

      try {
        const data = await this.makeRequest(`${this.proxyUrl}/tags`, "GET");
        console.log("Models fetched successfully:", data.models);
        return data.models || [];
      } catch (apiError) {
        console.error("API error when fetching models:", apiError);
        console.log("Using mock models instead");
        return this.mockModels;
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      return this.mockModels;
    }
  }

  async chat(model: string, prompt: string): Promise<string> {
    try {
      console.log("Sending request to proxy server:", { model, prompt });

      // First check if Ollama is running via proxy
      const isRunning = await this.isOllamaRunning();
      if (!isRunning) {
        console.warn("Ollama is not running, returning mock response");
        return `This is a mock response because Ollama is not accessible. Your message was: "${prompt}"`;
      }

      const requestBody = {
        model,
        prompt,
        stream: false,
      };

      console.log("Request body:", JSON.stringify(requestBody));

      try {
        // Try to send the actual request through our proxy
        const data = await this.makeRequest(`${this.proxyUrl}/generate`, "POST", requestBody);
        console.log("Received response from proxy:", data);
        return data.response;
      } catch (apiError) {
        console.error("API error when sending chat message:", apiError);
        return `This is a mock response because Ollama is not accessible. Your message was: "${prompt}"`;
      }
    } catch (error) {
      console.error("Error sending chat message:", error);
      return `This is a mock response because an error occurred. Your message was: "${prompt}"`;
    }
  }

  async isOllamaRunning(): Promise<boolean> {
    // First check if we've already detected Ollama
    if (this.ollamaDetected) {
      console.log("Ollama was previously detected as running");
      return true;
    }

    try {
      console.log("Checking if Ollama is running via proxy...");

      // Use the health endpoint on our proxy server with fetch
      try {
        console.log("Checking health endpoint...");
        const response = await fetch(`${this.proxyUrl}/health`);

        if (response.ok) {
          const data = await response.json();
          console.log("Health check response:", data);

          if (data && data.status === "ok") {
            console.log("Ollama is running according to proxy health check");
            this.ollamaDetected = true;
            return true;
          } else {
            console.log("Ollama is not running according to proxy health check");
            return false;
          }
        } else {
          console.log("Health check failed with status:", response.status);
          return false;
        }
      } catch (error) {
        console.error("Error checking Ollama health via proxy:", error);

        // Fallback to trying the ProxyService methods
        console.log("Health check failed, trying proxy service methods...");
        const proxyResult = await ProxyService.isOllamaRunning();

        if (proxyResult) {
          console.log("Ollama detected with proxy service");
          this.ollamaDetected = true;
          return true;
        }

        return false;
      }
    } catch (error) {
      console.error("Error checking Ollama status:", error);
      return false;
    }
  }

  // Helper method to get a detailed error message
  private getErrorMessage(error: any): string {
    if (typeof error === "string") {
      return error;
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (error && error.response) {
      return error.response;
    }
    return "Unknown error";
  }
}

export const ollamaService = new OllamaService();
