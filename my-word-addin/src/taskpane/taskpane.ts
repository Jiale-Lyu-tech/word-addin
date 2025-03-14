/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { ollamaService } from "../services/ollamaService";
import { ProxyService } from "../services/proxyService";

/* global document, Office */

// Flag to indicate we're in mock mode
let usingMockMode = false;

// Store custom prompts
interface CustomPrompt {
  id: string;
  name: string;
  description: string;
  category: string;
  content: string;
}

// Sample custom prompts - in real use, these would be loaded from storage
const customPrompts: CustomPrompt[] = [
  {
    id: "general-editor",
    name: "General Document Editor",
    description: "Helps edit and improve document content",
    category: "Default",
    content: "Please edit and improve the following text while maintaining the original meaning:\n\n{{selectedText}}",
  },
  {
    id: "academic-writing",
    name: "Academic Writing Assistant",
    description: "Helps improve academic writing style",
    category: "Default",
    content: "Please improve the following academic text, enhancing clarity and scholarly tone:\n\n{{selectedText}}",
  },
  {
    id: "business-reviewer",
    name: "Business Document Reviewer",
    description: "Reviews business documents for improvements",
    category: "Default",
    content: "Please review this business document excerpt and suggest improvements:\n\n{{selectedText}}",
  },
  {
    id: "creative-coach",
    name: "Creative Writing Coach",
    description: "Provides feedback on creative writing",
    category: "Default",
    content: "Please provide feedback on this creative writing excerpt:\n\n{{selectedText}}",
  },
];

// Add an interface to represent a chat
interface ChatHistory {
  id: string;
  name: string;
  messages: {
    type: "user" | "assistant" | "system" | "error";
    content: string;
  }[];
}

// Store chat histories
let chatHistories: ChatHistory[] = [];

// Track the current active chat
let currentChatId: string = "";

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    const sideloadMsg = document.getElementById("sideload-msg");
    const appBody = document.getElementById("app-body");
    if (sideloadMsg) sideloadMsg.style.display = "none";
    if (appBody) appBody.style.display = "flex";

    // Add debugging info
    console.log("Office Add-in initialized");
    console.log("User agent:", navigator.userAgent);
    console.log("Platform:", navigator.platform);

    // Initialize the first chat
    initializeFirstChat();

    initializeUI();

    // Register for selection change events
    registerSelectionChangedEvent();
  }
});

async function initializeUI() {
  // Debug info to console
  console.log("Initializing UI...");
  console.log("Office context:", Office.context ? "Available" : "Not available");

  // First try both our detection methods to check if Ollama is running
  let isOllamaRunning = false;
  try {
    console.log("Checking if Ollama is running with multiple detection methods...");
    // Try the ollamaService first, which includes ProxyService
    isOllamaRunning = await ollamaService.isOllamaRunning();
    console.log("Final Ollama detection result:", isOllamaRunning);
  } catch (error) {
    console.error("Error checking Ollama status:", error);
  }

  // Initialize model selector
  const modelSelector = document.querySelector(".model-selector select");
  if (modelSelector) {
    try {
      // Set a loading state
      modelSelector.innerHTML = '<option value="" disabled selected>Loading models...</option>';

      // Get models from Ollama - if connected, this will get real models
      console.log("Fetching models from Ollama service...");
      const models = await ollamaService.listModels();
      console.log("Models received:", models);

      if (models && models.length > 0) {
        // Clear the selector
        modelSelector.innerHTML = "";

        // Add each model as an option
        models.forEach((model) => {
          const option = document.createElement("option");
          option.value = model.name;
          option.textContent = model.name;
          modelSelector.appendChild(option);
        });

        // Select the first model by default
        if (models.length > 0 && modelSelector instanceof HTMLSelectElement) {
          modelSelector.value = models[0].name;
        }

        // Clear any error messages
        const chatMessages = document.querySelector(".chat-messages");
        if (chatMessages) {
          chatMessages.innerHTML = "";

          if (isOllamaRunning) {
            const welcomeElement = document.createElement("div");
            welcomeElement.className = "message system-message";
            welcomeElement.textContent = `Ready to chat! Using model: ${models[0].name}`;
            chatMessages.appendChild(welcomeElement);
          } else {
            // We have models but Ollama detection fails
            // This might be a false negative, but let's show a soft warning
            usingMockMode = true;
            showOllamaConnectionWarning(chatMessages);
          }
        }
      } else {
        console.log("No models were received or models array is empty");
        modelSelector.innerHTML = '<option value="" disabled selected>No models available</option>';

        // Show error message in chat
        const chatMessages = document.querySelector(".chat-messages");
        if (chatMessages) {
          showOllamaConnectionError(chatMessages);
        }
      }
    } catch (error) {
      console.error("Failed to load models:", error);
      modelSelector.innerHTML = '<option value="" disabled selected>Error loading models</option>';

      // Show error message in chat
      const chatMessages = document.querySelector(".chat-messages");
      if (chatMessages) {
        showOllamaConnectionError(chatMessages);
      }
    }
  } else {
    console.error("Model selector not found");
  }

  // Initialize navigation with tab switching functionality
  const navButtons = document.querySelectorAll(".nav-button");
  navButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      // Remove active class from all buttons
      navButtons.forEach((btn) => btn.classList.remove("active"));

      // Add active class to clicked button
      (e.target as HTMLElement).classList.add("active");

      // Get the tab name
      const tabName = (e.target as HTMLElement).textContent?.trim() || "";

      // Clear existing tab content elements
      document.querySelectorAll(".tab-content").forEach((content) => {
        (content as HTMLElement).style.display = "none";
      });

      // Show the appropriate content
      if (tabName === "RegChat") {
        // Show chat interface
        const chatSection = document.querySelector(".chat-section");
        if (chatSection) {
          (chatSection as HTMLElement).style.display = "flex";
        }
      } else if (tabName === "Prompts") {
        // Hide chat section
        const chatSection = document.querySelector(".chat-section");
        if (chatSection) {
          (chatSection as HTMLElement).style.display = "none";
        }

        // Show prompts content
        let promptsContent = document.getElementById("prompts-content");
        if (!promptsContent) {
          // Create it if it doesn't exist
          promptsContent = document.createElement("div");
          promptsContent.id = "prompts-content";
          promptsContent.className = "tab-content";

          // Add it to the main content
          const mainContent = document.querySelector(".main-content");
          if (mainContent) {
            mainContent.appendChild(promptsContent);

            // Ensure it takes the full size of the main content
            const mainContentRect = mainContent.getBoundingClientRect();
            promptsContent.style.width = mainContentRect.width + "px";
            promptsContent.style.height = mainContentRect.height + "px";
          }
        }

        // Display it
        promptsContent.style.display = "block";
        promptsContent.style.zIndex = "10";

        // If it's empty, show the prompt management UI
        if (promptsContent.children.length === 0) {
          showPromptManagement();
        }
      }
      // Other tabs can be handled similarly
    });
  });

  // Initialize new chat button
  const newChatButton = document.querySelector(".new-chat-button");
  newChatButton?.addEventListener("click", () => {
    // Create a new chat
    createNewChat();
  });

  // Initialize chat item delete buttons
  document.querySelectorAll(".chat-item").forEach((chatItem) => {
    const deleteButton = chatItem.querySelector(".chat-item-delete");
    if (deleteButton) {
      deleteButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent triggering chat selection

        // Find the chat ID or create one if it doesn't exist yet
        if (!(chatItem as HTMLElement).dataset.chatId) {
          const chatName = chatItem.querySelector("span")?.textContent;
          if (chatName) {
            const match = chatName.match(/Chat (\d+)/);
            if (match && match[1]) {
              const index = parseInt(match[1]) - 1;
              if (chatHistories[index]) {
                (chatItem as HTMLElement).dataset.chatId = chatHistories[index].id;
              }
            }
          }
        }

        if ((chatItem as HTMLElement).dataset.chatId) {
          deleteChat((chatItem as HTMLElement).dataset.chatId as string);
        }
      });
    }

    // Add click handler for chat selection if not already present
    if (!(chatItem as HTMLElement).hasAttribute("data-has-click-handler")) {
      (chatItem as HTMLElement).setAttribute("data-has-click-handler", "true");
      chatItem.addEventListener("click", () => {
        // Find the chat ID or use the first chat
        const chatId =
          (chatItem as HTMLElement).dataset.chatId || (chatHistories.length > 0 ? chatHistories[0].id : "");
        if (chatId) {
          switchToChat(chatId);
        }
      });
    }
  });

  // Initialize send button
  const sendButton = document.querySelector(".send-button");
  const chatInput = document.querySelector(".chat-input textarea");

  if (sendButton) {
    console.log("Send button found, adding event listener");
    sendButton.addEventListener("click", async () => {
      console.log("Send button clicked");
      if (chatInput instanceof HTMLTextAreaElement && chatInput.value.trim()) {
        const message = chatInput.value.trim();
        console.log("Sending message:", message);
        await sendMessage(message);
        chatInput.value = "";
      } else {
        console.log("Chat input is empty or not found");
      }
    });
  } else {
    console.error("Send button not found");
  }

  // Add keyboard shortcut for send
  if (chatInput) {
    chatInput.addEventListener("keydown", async (e) => {
      if ((e as KeyboardEvent).key === "Enter" && !(e as KeyboardEvent).shiftKey) {
        e.preventDefault();
        console.log("Enter key pressed");
        if (chatInput instanceof HTMLTextAreaElement && chatInput.value.trim()) {
          const message = chatInput.value.trim();
          console.log("Sending message via Enter key:", message);
          await sendMessage(message);
          chatInput.value = "";
        }
      }
    });
  } else {
    console.error("Chat input not found");
  }

  // Initialize quick action buttons
  const actionButtons = document.querySelectorAll(".action-button");
  actionButtons.forEach((button) => {
    button.addEventListener("click", (e) => {
      const action = (e.target as HTMLElement).textContent;
      handleQuickAction(action);
    });
  });

  // Initialize predefined prompt buttons
  initializePromptButtons();
}

// A softer warning for when we have models but Ollama detection fails
function showOllamaConnectionWarning(chatMessages: Element) {
  console.log("Displaying Ollama connection warning");

  const warningElement = document.createElement("div");
  warningElement.className = "message system-message";
  warningElement.innerHTML = `
    <strong>Warning:</strong> Models were loaded but we couldn't verify if Ollama is fully accessible.
    <br>You may still be able to use the add-in, but if you experience issues:
    <br>1. Make sure Ollama is running with 'ollama serve'
    <br>2. Restart the add-in
    <br><br><button id="retry-connection" style="padding: 8px 16px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">Check Connection Again</button>
  `;
  chatMessages.appendChild(warningElement);

  // Add event listener to retry button
  const retryButton = warningElement.querySelector("#retry-connection");
  if (retryButton) {
    retryButton.addEventListener("click", async () => {
      // Update warning text
      warningElement.innerHTML = "Checking Ollama connection...";

      try {
        // Try both detection methods again
        const isRunning = await ollamaService.isOllamaRunning();

        if (isRunning) {
          // Success! Show a success message
          warningElement.className = "message system-message";
          warningElement.innerHTML = `
            <strong>Connection successful!</strong> Ollama is running and accessible.
            You can now chat with your models.
          `;
          usingMockMode = false;
        } else {
          // Still not running
          showOllamaConnectionError(chatMessages);
        }
      } catch (error) {
        console.error("Error rechecking connection:", error);
        showOllamaConnectionError(chatMessages);
      }
    });
  }
}

function showOllamaConnectionError(chatMessages: Element) {
  console.log("Displaying Ollama connection error UI");

  // First, clear any existing messages
  chatMessages.innerHTML = "";

  const errorElement = document.createElement("div");
  errorElement.className = "message error-message";
  errorElement.innerHTML = `
    <strong>Unable to connect to Ollama.</strong> Please make sure:
    <br>1. Ollama is installed on your machine
    <br>2. The Ollama service is running
    <br>3. It's accessible at http://localhost:11434
    <br><br>To install and run Ollama:
    <br>1. Visit <a href="https://ollama.ai" target="_blank">https://ollama.ai</a> to download
    <br>2. Install Ollama
    <br>3. Run 'ollama serve' in terminal
    <br>4. Pull a model: 'ollama pull mistral'
    <br><br>You can still use the add-in with mock responses for testing.
    <br><br><button id="retry-connection" style="padding: 8px 16px; background-color: #4285f4; color: white; border: none; border-radius: 4px; cursor: pointer;">Retry Connection</button>
    <button id="test-mock" style="margin-left: 10px; padding: 8px 16px; background-color: #757575; color: white; border: none; border-radius: 4px; cursor: pointer;">Use Mock Mode</button>
  `;
  chatMessages.appendChild(errorElement);

  // Add event listener to retry button
  const retryButton = errorElement.querySelector("#retry-connection");
  if (retryButton) {
    retryButton.addEventListener("click", async () => {
      // Clear error message
      errorElement.innerHTML = "Checking Ollama connection...";

      try {
        console.log("Retry button clicked, checking Ollama connection...");
        // Check if Ollama is running - use both methods
        const isRunning = await ollamaService.isOllamaRunning();
        console.log("Ollama running check result:", isRunning);

        if (isRunning) {
          console.log("Ollama is now running, reinitializing UI");
          usingMockMode = false;
          // Reinitialize UI
          initializeUI();
        } else {
          console.log("Ollama is still not running, showing error again");
          // Show error message again
          errorElement.innerHTML = "Still unable to connect to Ollama. Please make sure it's running.";
          setTimeout(() => {
            showOllamaConnectionError(chatMessages);
          }, 1000);
        }
      } catch (error) {
        console.error("Error checking Ollama connection:", error);
        errorElement.innerHTML = "Error checking Ollama connection. Please try again.";
      }
    });
  }

  // Add event listener for mock mode button
  const mockButton = errorElement.querySelector("#test-mock");
  if (mockButton) {
    mockButton.addEventListener("click", () => {
      console.log("Mock mode button clicked");
      usingMockMode = true;
      // Clear error message
      chatMessages.innerHTML = "";

      // Add welcome message for mock mode
      const welcomeElement = document.createElement("div");
      welcomeElement.className = "message system-message";
      welcomeElement.innerHTML = `
        <strong>Using mock mode.</strong> The add-in will work with simulated responses.
        <br>You can try sending messages, but responses will be mock data.
        <br>To use real Ollama models, please make sure Ollama is running and click "Retry Connection".
      `;
      chatMessages.appendChild(welcomeElement);

      // Update model selector with mock models
      const modelSelector = document.querySelector(".model-selector select");
      if (modelSelector) {
        modelSelector.innerHTML = "";
        ["mistral", "llama3.2"].forEach((modelName) => {
          const option = document.createElement("option");
          option.value = modelName;
          option.textContent = modelName + " (mock)";
          modelSelector.appendChild(option);
        });

        if (modelSelector instanceof HTMLSelectElement) {
          modelSelector.value = "mistral";
        }
      }
    });
  }
}

async function sendMessage(message: string) {
  console.log("sendMessage called with:", message);

  // Validate message
  if (!message || typeof message !== "string" || message.trim() === "") {
    console.error("Invalid message:", message);
    return;
  }

  // Get necessary elements
  const chatMessagesElement = document.querySelector(".chat-messages");
  const modelSelector = document.querySelector(".model-selector select") as HTMLSelectElement;

  if (!chatMessagesElement) {
    console.error("Chat messages container not found");
    return;
  }

  if (!modelSelector) {
    console.error("Model selector not found");
    return;
  }

  // Get the selected model
  const selectedModel = modelSelector.value;

  // Get the current scroll position before adding content
  const isScrolledToBottom =
    chatMessagesElement.scrollHeight - chatMessagesElement.clientHeight <= chatMessagesElement.scrollTop + 10;

  // Create and append user message
  const userMessageElement = document.createElement("div");
  userMessageElement.classList.add("message", "user-message");
  userMessageElement.textContent = message;
  chatMessagesElement.appendChild(userMessageElement);

  // Clear the input field
  const chatInput = document.querySelector(".chat-input textarea") as HTMLTextAreaElement;
  if (chatInput) {
    chatInput.value = "";
    chatInput.style.height = "36px"; // Reset height if it was expanded
  }

  // Only scroll if user was already at the bottom
  if (isScrolledToBottom) {
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
  }

  // Show loading message
  const loadingElement = document.createElement("div");
  loadingElement.classList.add("message", "system-message");
  loadingElement.textContent = "Thinking...";
  chatMessagesElement.appendChild(loadingElement);

  // Only scroll if user was already at the bottom
  if (isScrolledToBottom) {
    chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
  }

  try {
    // Get response from Ollama
    const response = await ollamaService.chat(selectedModel, message);

    // Remove loading message
    chatMessagesElement.removeChild(loadingElement);

    // Create assistant message container
    const assistantMessageElement = document.createElement("div");
    assistantMessageElement.classList.add("message", "assistant-message");

    // Create message content div
    const messageContentElement = document.createElement("div");
    messageContentElement.classList.add("message-content");
    messageContentElement.textContent = response;
    assistantMessageElement.appendChild(messageContentElement);

    // Create message actions div
    const messageActionsElement = document.createElement("div");
    messageActionsElement.classList.add("message-actions");

    // Create apply button
    const applyButton = document.createElement("button");
    applyButton.classList.add("message-action-button", "apply-button");
    applyButton.innerHTML = '<i class="fas fa-file-import"></i> Apply to Document';
    applyButton.title = "Insert this text into Word document";
    applyButton.addEventListener("click", () => applyTextToDocument(response));
    messageActionsElement.appendChild(applyButton);

    // Add actions to message
    assistantMessageElement.appendChild(messageActionsElement);

    // Add the complete message to chat
    chatMessagesElement.appendChild(assistantMessageElement);

    // Only scroll if user was already at the bottom
    if (isScrolledToBottom) {
      chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    }

    // Save the updated chat to history
    saveCurrentChatMessages();
  } catch (error: any) {
    // Remove loading message
    chatMessagesElement.removeChild(loadingElement);

    // Create and append error message
    const errorMessageElement = document.createElement("div");
    errorMessageElement.classList.add("message", "error-message");
    errorMessageElement.textContent = `Error: ${error.message || "Something went wrong"}`;
    chatMessagesElement.appendChild(errorMessageElement);

    // Only scroll if user was already at the bottom
    if (isScrolledToBottom) {
      chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    }

    console.error("Error sending message:", error);

    // Save the updated chat to history
    saveCurrentChatMessages();
  }
}

// Function to apply text to the Word document
async function applyTextToDocument(text: string) {
  if (!text || typeof text !== "string" || text.trim() === "") {
    console.error("Invalid text to apply:", text);
    return;
  }

  try {
    console.log("Applying text to document:", text.substring(0, 50) + "...");

    await Word.run(async (context) => {
      // Get the current selection
      const range = context.document.getSelection();

      // Insert the text, replacing any selected text
      range.insertText(text, Word.InsertLocation.replace);

      // Sync the changes to the document
      await context.sync();

      console.log("Text successfully applied to document");

      // Show a brief success message in the chat
      const chatMessages = document.querySelector(".chat-messages");
      if (chatMessages) {
        const successMessage = document.createElement("div");
        successMessage.className = "message system-message";
        successMessage.textContent = "✓ Text successfully inserted into document";
        chatMessages.appendChild(successMessage);

        // Auto-remove the success message after 3 seconds
        setTimeout(() => {
          try {
            if (successMessage.parentNode === chatMessages) {
              chatMessages.removeChild(successMessage);
            }
          } catch (e) {
            console.error("Error removing success message:", e);
          }
        }, 3000);

        // Scroll to show the success message if needed
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    });
  } catch (error) {
    console.error("Error applying text to document:", error);

    // Show error message in chat
    const chatMessages = document.querySelector(".chat-messages");
    if (chatMessages) {
      const errorMessage = document.createElement("div");
      errorMessage.className = "message error-message";
      errorMessage.textContent = "Failed to insert text into document. Please make sure Word is active.";
      chatMessages.appendChild(errorMessage);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    }
  }
}

function clearChatMessages() {
  const chatMessages = document.querySelector(".chat-messages");
  if (chatMessages) {
    chatMessages.innerHTML = "";
  }

  // Also clear the current chat's messages in the history
  const currentChat = chatHistories.find((chat) => chat.id === currentChatId);
  if (currentChat) {
    currentChat.messages = [];
  }
}

async function handleQuickAction(action: string | null) {
  switch (action) {
    case "Translate":
      // Handle translation
      break;
    case "Export Chat":
      exportChat();
      break;
    case "Insert to Document":
      await insertToDocument();
      break;
  }
}

function exportChat() {
  const chatMessages = document.querySelector(".chat-messages");
  const content = chatMessages?.textContent || "";

  // Create a blob and download it
  const blob = new Blob([content], { type: "text/plain" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "chat-export.txt";
  a.click();
  window.URL.revokeObjectURL(url);
}

async function insertToDocument() {
  try {
    await Word.run(async (context) => {
      const range = context.document.getSelection();
      const chatMessages = document.querySelector(".chat-messages");
      const content = chatMessages?.textContent || "";

      range.insertText(content, "Replace");
      await context.sync();
    });
  } catch (error) {
    console.error("Error:", error);
  }
}

// Add styles for messages
const style = document.createElement("style");
style.textContent = `
  .message {
    margin-bottom: 12px;
    padding: 8px 12px;
    border-radius: 4px;
    max-width: 85%;
    white-space: pre-wrap;
  }

  .user-message {
    background: #f0f2f5;
    margin-left: auto;
  }

  .assistant-message {
    background: #e3f2fd;
    margin-right: auto;
  }

  .system-message {
    background: #fff3e0;
    margin: 8px auto;
    font-style: italic;
  }

  .error-message {
    background: #ffebee;
    color: #c62828;
    margin: 8px auto;
  }
`;
document.head.appendChild(style);

// Function to register for selection changed events
function registerSelectionChangedEvent() {
  Office.context.document.addHandlerAsync(
    Office.EventType.DocumentSelectionChanged,
    getSelectedText,
    function (result) {
      if (result.status === Office.AsyncResultStatus.Failed) {
        console.error("Error registering for selection changed event:", result.error.message);
      } else {
        console.log("Successfully registered for selection changed event");
      }
    }
  );
}

// Function to get the selected text when selection changes
async function getSelectedText() {
  try {
    await Word.run(async (context) => {
      // Get the selected range
      const range = context.document.getSelection();

      // Load the selected text
      range.load("text");

      // Execute the batch
      await context.sync();

      // Get the text
      const selectedText = range.text;

      // Display the selected text in the add-in
      displaySelectedText(selectedText);
    });
  } catch (error) {
    console.error("Error getting selected text:", error);
  }
}

// Function to display the selected text in the add-in
function displaySelectedText(text: string) {
  if (!text || text.trim() === "") {
    // No text selected, do nothing or hide the selection display
    return;
  }

  // Check if we have an existing selection display element
  let selectionDisplay = document.getElementById("selection-display");

  // If no element exists, create one
  if (!selectionDisplay) {
    selectionDisplay = document.createElement("div");
    selectionDisplay.id = "selection-display";
    selectionDisplay.className = "selection-display";

    // Insert it at the top of the chat messages
    const chatMessages = document.querySelector(".chat-messages");
    if (chatMessages && chatMessages.firstChild) {
      chatMessages.insertBefore(selectionDisplay, chatMessages.firstChild);
    } else if (chatMessages) {
      chatMessages.appendChild(selectionDisplay);
    }
  }

  // Truncate text if it's too long
  const maxLength = 200;
  const displayText = text.length > maxLength ? text.substring(0, maxLength) + "..." : text;

  // Update the display with a more space-efficient layout
  selectionDisplay.innerHTML = `
    <div class="selection-header">Selected Text:</div>
    <div class="selection-container">
      <div class="selection-content">${displayText}</div>
      <button class="selection-use-button">Use in Chat</button>
    </div>
  `;

  // Add event listener to the "Use in Chat" button
  const useButton = selectionDisplay.querySelector(".selection-use-button");
  if (useButton) {
    useButton.addEventListener("click", () => {
      const chatInput = document.querySelector(".chat-input textarea") as HTMLTextAreaElement;
      if (chatInput) {
        // Append the selected text to the input
        if (chatInput.value) {
          chatInput.value += "\n\n" + text;
        } else {
          chatInput.value = text;
        }

        // Focus the input
        chatInput.focus();
      }
    });
  }
}

// Function to initialize the prompt buttons
function initializePromptButtons() {
  const promptButtons = document.querySelectorAll(".prompt-button");

  promptButtons.forEach((button) => {
    button.addEventListener("click", () => {
      // Get the prompt type from the button's data attribute
      const promptType = (button as HTMLElement).dataset.prompt;

      // Get the selected text directly from Word
      Word.run(async (context) => {
        const range = context.document.getSelection();
        range.load("text");
        await context.sync();

        const selectedText = range.text;

        if (!selectedText || selectedText.trim() === "") {
          showNotification("Please select text from the document first");
          return;
        }

        // Create the appropriate prompt based on the button clicked
        const prompt = createPromptFromType(promptType, selectedText);

        // If we have a valid prompt (it won't be empty string for normal prompt types)
        if (prompt) {
          // Send the message to the AI
          await sendMessage(prompt);
        }
      }).catch((error) => {
        console.error("Error getting selected text for prompt:", error);
        showNotification("Error accessing the selected text");
      });
    });
  });
}

// Function to create the appropriate prompt based on the prompt type
function createPromptFromType(promptType: string | undefined, selectedText: string): string {
  // If this is a custom prompt ID (not one of the standard types)
  if (promptType && promptType !== "custom" && promptType.startsWith("custom-")) {
    const promptId = promptType.replace("custom-", "");
    const customPrompt = customPrompts.find((p) => p.id === promptId);

    if (customPrompt) {
      // Replace variables in the prompt content
      return customPrompt.content.replace("{{selectedText}}", selectedText);
    }
  }

  switch (promptType) {
    case "summarize":
      return `Please provide a concise summary of the following text:\n\n${selectedText}`;

    case "key-points":
      return `Please identify and list the key points from the following text:\n\n${selectedText}`;

    case "explain":
      return `Please explain the following text in simple terms that are easy to understand:\n\n${selectedText}`;

    case "analyze":
      return `Please analyze the following text, identifying main themes, arguments, and any notable elements:\n\n${selectedText}`;

    case "translate-en":
      return `Please translate the following text to English:\n\n${selectedText}`;

    case "translate-zh":
      return `Please translate the following text to Chinese:\n\n${selectedText}`;

    case "next-steps":
      return `Based on the following text, what would be the recommended next steps or actions?\n\n${selectedText}`;

    case "custom":
      // Show the custom prompt selector
      showCustomPromptSelector(selectedText);
      return ""; // We're handling this separately, so don't return a prompt

    default:
      return `Please analyze the following text:\n\n${selectedText}`;
  }
}

// Function to show the custom prompt selector
function showCustomPromptSelector(selectedText: string) {
  // Check if there's already a prompt selector
  let customPromptSelector = document.getElementById("custom-prompt-selector");

  // If it exists, remove it first (to refresh the content)
  if (customPromptSelector) {
    customPromptSelector.remove();
  }

  // Create custom prompt selector
  customPromptSelector = document.createElement("div");
  customPromptSelector.id = "custom-prompt-selector";
  customPromptSelector.className = "custom-prompt-selector";

  // Create header for the selector
  const headerDiv = document.createElement("div");
  headerDiv.className = "custom-prompt-header";
  headerDiv.innerHTML = `
    <h3>Select a Custom Prompt</h3>
    <button class="close-prompt-selector">×</button>
  `;
  customPromptSelector.appendChild(headerDiv);

  // Create the prompt list
  const promptListDiv = document.createElement("div");
  promptListDiv.className = "custom-prompt-list";

  // Add each custom prompt to the list
  customPrompts.forEach((prompt) => {
    const promptDiv = document.createElement("div");
    promptDiv.className = "custom-prompt-item";
    promptDiv.dataset.promptId = prompt.id;
    promptDiv.innerHTML = `
      <div class="prompt-item-name">${prompt.name}</div>
      <div class="prompt-item-category">${prompt.category}</div>
    `;

    // Add click handler
    promptDiv.addEventListener("click", () => {
      // Use the selected custom prompt
      const customPromptContent = prompt.content.replace("{{selectedText}}", selectedText);
      sendMessage(customPromptContent);

      // Remove the selector
      customPromptSelector?.remove();
    });

    promptListDiv.appendChild(promptDiv);
  });

  // Add "New Prompt" button
  const newPromptButton = document.createElement("button");
  newPromptButton.className = "new-prompt-button";
  newPromptButton.textContent = "+ New Prompt";
  newPromptButton.addEventListener("click", () => {
    // Switch to prompts tab and show new prompt form
    activatePromptsTab();
    showNewPromptForm(selectedText);

    // Remove the selector
    customPromptSelector?.remove();
  });

  // Add the list and button to the selector
  customPromptSelector.appendChild(promptListDiv);
  customPromptSelector.appendChild(newPromptButton);

  // Add close button handler
  const closeButton = headerDiv.querySelector(".close-prompt-selector");
  if (closeButton) {
    closeButton.addEventListener("click", () => {
      customPromptSelector?.remove();
    });
  }

  // Add the selector to the page
  const chatInterface = document.querySelector(".chat-interface");
  if (chatInterface) {
    chatInterface.appendChild(customPromptSelector);
  }
}

// Function to activate the Prompts tab
function activatePromptsTab() {
  const promptsButton = Array.from(document.querySelectorAll(".nav-button")).find(
    (button) => button.textContent === "Prompts"
  );

  if (promptsButton) {
    // Simulate a click on the Prompts tab
    promptsButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }
}

// Function to show the new prompt form
function showNewPromptForm(selectedText: string = "") {
  // Create or get the prompts content container
  let promptsContent = document.getElementById("prompts-content");
  if (!promptsContent) {
    promptsContent = document.createElement("div");
    promptsContent.id = "prompts-content";
    promptsContent.className = "tab-content";

    // Add it to the main content
    const mainContent = document.querySelector(".main-content");
    if (mainContent) {
      mainContent.appendChild(promptsContent);
    }
  }

  // Clear existing content
  promptsContent.innerHTML = "";

  // Create the new prompt form
  const newPromptForm = document.createElement("div");
  newPromptForm.className = "new-prompt-form";
  newPromptForm.innerHTML = `
    <h2>Create New Prompt</h2>
    
    <div class="form-group">
      <label for="prompt-name">Prompt Name <span class="required">*</span></label>
      <input type="text" id="prompt-name" placeholder="Enter prompt name" required>
    </div>
    
    <div class="form-group">
      <label for="prompt-description">Description</label>
      <input type="text" id="prompt-description" placeholder="Describe what this prompt does">
    </div>
    
    <div class="form-group">
      <label for="prompt-category">Category <span class="required">*</span></label>
      <select id="prompt-category" required>
        <option value="General">General</option>
        <option value="Academic">Academic</option>
        <option value="Business">Business</option>
        <option value="Creative">Creative</option>
      </select>
    </div>
    
    <div class="form-group">
      <label for="prompt-content">Prompt Content <span class="required">*</span></label>
      <textarea id="prompt-content" placeholder="Enter the content of your prompt" required></textarea>
    </div>
    
    <div class="form-help">
      <p>Available variables:</p>
      <ul>
        <li><code>{{selectedText}}</code> - Selected text</li>
        <li><code>{{documentTitle}}</code> - Document title</li>
      </ul>
    </div>
    
    <div class="form-actions">
      <button type="button" id="cancel-prompt">Cancel</button>
      <button type="button" id="create-prompt">Create Prompt</button>
    </div>
  `;

  // Add the form to the prompts content
  promptsContent.appendChild(newPromptForm);

  // Pre-fill the content with template if we have selected text
  if (selectedText) {
    const contentArea = document.getElementById("prompt-content") as HTMLTextAreaElement;
    if (contentArea) {
      contentArea.value = `Please analyze the following text:\n\n{{selectedText}}`;
    }
  }

  // Add event listeners
  const cancelButton = document.getElementById("cancel-prompt");
  const createButton = document.getElementById("create-prompt");

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      // Go back to chat tab
      const chatButton = Array.from(document.querySelectorAll(".nav-button")).find(
        (button) => button.textContent === "RegChat"
      );
      if (chatButton) {
        chatButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
  }

  if (createButton) {
    createButton.addEventListener("click", () => {
      // Get form values
      const nameInput = document.getElementById("prompt-name") as HTMLInputElement;
      const descriptionInput = document.getElementById("prompt-description") as HTMLInputElement;
      const categorySelect = document.getElementById("prompt-category") as HTMLSelectElement;
      const contentTextarea = document.getElementById("prompt-content") as HTMLTextAreaElement;

      // Validate
      if (!nameInput.value || !categorySelect.value || !contentTextarea.value) {
        showNotification("Please fill in all required fields");
        return;
      }

      // Create new prompt
      const newPrompt: CustomPrompt = {
        id: "custom-" + new Date().getTime().toString(),
        name: nameInput.value,
        description: descriptionInput.value || "",
        category: categorySelect.value,
        content: contentTextarea.value,
      };

      // Add to custom prompts
      customPrompts.push(newPrompt);

      // Show success message
      showNotification("Prompt created successfully");

      // Return to chat tab
      const chatButton = Array.from(document.querySelectorAll(".nav-button")).find(
        (button) => button.textContent === "RegChat"
      );
      if (chatButton) {
        chatButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
  }
}

// Function to show the prompt management UI
function showPromptManagement() {
  const promptsContent = document.getElementById("prompts-content");
  if (!promptsContent) return;

  // Clear existing content
  promptsContent.innerHTML = "";

  // Create the prompt management UI
  const promptManagement = document.createElement("div");
  promptManagement.className = "prompt-management";
  promptManagement.innerHTML = `
    <div class="prompt-management-header">
      <h2>Custom Prompts</h2>
      <button class="new-prompt-management-button">+ New Prompt</button>
    </div>
    
    <div class="prompt-list-container">
      <div class="prompt-list-header">
        <span>Prompt Name</span>
        <span>Category</span>
        <span>Actions</span>
      </div>
      <div class="prompt-list">
        <!-- Prompts will be added here -->
      </div>
    </div>
  `;

  // Add to prompts content
  promptsContent.appendChild(promptManagement);

  // Add new prompt button handler
  const newPromptButton = promptManagement.querySelector(".new-prompt-management-button");
  if (newPromptButton) {
    newPromptButton.addEventListener("click", () => {
      showNewPromptForm();
    });
  }

  // Populate prompt list
  const promptList = promptManagement.querySelector(".prompt-list");
  if (promptList) {
    customPrompts.forEach((prompt) => {
      const promptItem = document.createElement("div");
      promptItem.className = "prompt-list-item";
      promptItem.innerHTML = `
        <span class="prompt-list-name">${prompt.name}</span>
        <span class="prompt-list-category">${prompt.category}</span>
        <div class="prompt-list-actions">
          <button class="edit-prompt" data-id="${prompt.id}">Edit</button>
          <button class="delete-prompt" data-id="${prompt.id}">Delete</button>
        </div>
      `;

      promptList.appendChild(promptItem);
    });

    // Add event listeners for edit and delete buttons
    promptList.querySelectorAll(".edit-prompt").forEach((button) => {
      button.addEventListener("click", (e) => {
        const promptId = (e.currentTarget as HTMLElement).dataset.id;
        const prompt = customPrompts.find((p) => p.id === promptId);
        if (prompt) {
          editPrompt(prompt);
        }
      });
    });

    promptList.querySelectorAll(".delete-prompt").forEach((button) => {
      button.addEventListener("click", (e) => {
        const promptId = (e.currentTarget as HTMLElement).dataset.id;
        if (promptId) {
          deletePrompt(promptId);
        }
      });
    });
  }
}

// Function to edit a prompt
function editPrompt(prompt: CustomPrompt) {
  // Show the new prompt form but pre-filled with the prompt data
  const promptsContent = document.getElementById("prompts-content");
  if (!promptsContent) return;

  // Clear existing content
  promptsContent.innerHTML = "";

  // Create the edit prompt form
  const editPromptForm = document.createElement("div");
  editPromptForm.className = "new-prompt-form";
  editPromptForm.innerHTML = `
    <h2>Edit Prompt</h2>
    
    <div class="form-group">
      <label for="prompt-name">Prompt Name <span class="required">*</span></label>
      <input type="text" id="prompt-name" placeholder="Enter prompt name" value="${prompt.name}" required>
    </div>
    
    <div class="form-group">
      <label for="prompt-description">Description</label>
      <input type="text" id="prompt-description" placeholder="Describe what this prompt does" value="${prompt.description}">
    </div>
    
    <div class="form-group">
      <label for="prompt-category">Category <span class="required">*</span></label>
      <select id="prompt-category" required>
        <option value="General" ${prompt.category === "General" ? "selected" : ""}>General</option>
        <option value="Academic" ${prompt.category === "Academic" ? "selected" : ""}>Academic</option>
        <option value="Business" ${prompt.category === "Business" ? "selected" : ""}>Business</option>
        <option value="Creative" ${prompt.category === "Creative" ? "selected" : ""}>Creative</option>
        <option value="Default" ${prompt.category === "Default" ? "selected" : ""}>Default</option>
      </select>
    </div>
    
    <div class="form-group">
      <label for="prompt-content">Prompt Content <span class="required">*</span></label>
      <textarea id="prompt-content" placeholder="Enter the content of your prompt" required>${prompt.content}</textarea>
    </div>
    
    <div class="form-help">
      <p>Available variables:</p>
      <ul>
        <li><code>{{selectedText}}</code> - Selected text</li>
        <li><code>{{documentTitle}}</code> - Document title</li>
      </ul>
    </div>
    
    <div class="form-actions">
      <button type="button" id="cancel-prompt">Cancel</button>
      <button type="button" id="update-prompt" data-id="${prompt.id}">Update Prompt</button>
    </div>
  `;

  // Add the form to the prompts content
  promptsContent.appendChild(editPromptForm);

  // Add event listeners
  const cancelButton = document.getElementById("cancel-prompt");
  const updateButton = document.getElementById("update-prompt");

  if (cancelButton) {
    cancelButton.addEventListener("click", () => {
      // Go back to prompt management
      showPromptManagement();
    });
  }

  if (updateButton) {
    updateButton.addEventListener("click", (e) => {
      const promptId = (e.currentTarget as HTMLElement).dataset.id;

      // Get form values
      const nameInput = document.getElementById("prompt-name") as HTMLInputElement;
      const descriptionInput = document.getElementById("prompt-description") as HTMLInputElement;
      const categorySelect = document.getElementById("prompt-category") as HTMLSelectElement;
      const contentTextarea = document.getElementById("prompt-content") as HTMLTextAreaElement;

      // Validate
      if (!nameInput.value || !categorySelect.value || !contentTextarea.value) {
        showNotification("Please fill in all required fields");
        return;
      }

      // Update the prompt
      const promptIndex = customPrompts.findIndex((p) => p.id === promptId);
      if (promptIndex !== -1) {
        customPrompts[promptIndex] = {
          id: promptId || "",
          name: nameInput.value,
          description: descriptionInput.value || "",
          category: categorySelect.value,
          content: contentTextarea.value,
        };

        // Show success message
        showNotification("Prompt updated successfully");

        // Go back to prompt management
        showPromptManagement();
      }
    });
  }
}

// Function to delete a prompt
function deletePrompt(promptId: string) {
  // Find the prompt index
  const promptIndex = customPrompts.findIndex((p) => p.id === promptId);

  if (promptIndex !== -1) {
    // Get the prompt name for the confirmation message
    const promptName = customPrompts[promptIndex].name;

    // Confirm deletion
    const confirmDelete = confirm(`Are you sure you want to delete the prompt "${promptName}"?`);

    if (confirmDelete) {
      // Remove the prompt
      customPrompts.splice(promptIndex, 1);

      // Show success message
      showNotification("Prompt deleted successfully");

      // Refresh the prompt management UI
      showPromptManagement();
    }
  }
}

// Function to show a notification message
function showNotification(message: string) {
  const chatMessages = document.querySelector(".chat-messages");
  if (chatMessages) {
    const notificationElement = document.createElement("div");
    notificationElement.className = "message system-message";
    notificationElement.textContent = message;
    chatMessages.appendChild(notificationElement);

    // Auto-remove the notification after a few seconds
    setTimeout(() => {
      try {
        if (notificationElement.parentNode === chatMessages) {
          chatMessages.removeChild(notificationElement);
        }
      } catch (e) {
        console.error("Error removing notification:", e);
      }
    }, 3000);

    // Scroll to show the notification
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }
}

// Function to initialize the first chat
function initializeFirstChat() {
  // If we have static chat items but no chat histories yet, create them from the static items
  const staticChatItems = document.querySelectorAll(".chat-list .chat-item");
  if (chatHistories.length === 0 && staticChatItems.length > 0) {
    // Create chat histories for each static item
    staticChatItems.forEach((item, index) => {
      const chatId = "chat-" + (new Date().getTime() + index);
      const chatName = item.querySelector("span")?.textContent || `Chat ${index + 1}`;

      // Create chat history object
      const chat: ChatHistory = {
        id: chatId,
        name: chatName,
        messages: [],
      };

      // Add to histories
      chatHistories.push(chat);

      // Set data attribute for the chat item
      (item as HTMLElement).dataset.chatId = chatId;
    });

    // Set current chat to the first one
    if (chatHistories.length > 0) {
      currentChatId = chatHistories[0].id;

      // Set the first item as active
      if (staticChatItems[0]) {
        staticChatItems[0].classList.add("active-chat");
      }
    }

    return; // Skip the rest of the function since we've initialized from static items
  }

  // Create the first chat if none exists (for non-static case)
  if (chatHistories.length === 0) {
    const firstChatId = "chat-" + new Date().getTime();
    const firstChat: ChatHistory = {
      id: firstChatId,
      name: "Chat 1",
      messages: [],
    };

    chatHistories.push(firstChat);
    currentChatId = firstChatId;

    // Initialize the chat list with the first chat
    const chatList = document.querySelector(".chat-list");
    if (chatList) {
      // Remove any existing chat items (except the new chat button)
      Array.from(chatList.children).forEach((child) => {
        if (!child.classList.contains("new-chat-button")) {
          chatList.removeChild(child);
        }
      });

      // Add the first chat item
      const chatItem = document.createElement("div");
      chatItem.className = "chat-item active-chat";
      chatItem.dataset.chatId = firstChatId;

      // Create a span for the chat name
      const chatName = document.createElement("span");
      chatName.textContent = "Chat 1";
      chatItem.appendChild(chatName);

      // Create delete button
      const deleteButton = document.createElement("span");
      deleteButton.className = "chat-item-delete";
      deleteButton.innerHTML = "×";
      deleteButton.title = "Delete chat";
      deleteButton.addEventListener("click", (e) => {
        e.stopPropagation(); // Prevent triggering chat selection
        deleteChat(firstChatId);
      });
      chatItem.appendChild(deleteButton);

      // Add event listener for chat selection
      chatItem.addEventListener("click", () => switchToChat(firstChatId));

      // Append to the list after the new chat button
      const newChatButton = chatList.querySelector(".new-chat-button");
      if (newChatButton && newChatButton.nextSibling) {
        chatList.insertBefore(chatItem, newChatButton.nextSibling);
      } else {
        chatList.appendChild(chatItem);
      }
    }
  }
}

// Function to create a new chat
function createNewChat() {
  // Save current chat messages first
  saveCurrentChatMessages();

  // Create a new chat
  const newChatId = "chat-" + new Date().getTime();
  const chatCount = chatHistories.length + 1;

  // Create new chat history object
  const newChat: ChatHistory = {
    id: newChatId,
    name: `Chat ${chatCount}`,
    messages: [],
  };

  // Add to chat histories
  chatHistories.push(newChat);
  currentChatId = newChatId;

  // Update the UI using the same function used for deletions
  // This ensures consistent ordering of chat items
  updateChatListUI();

  // Clear chat messages for new chat
  clearChatMessages();

  // Show welcome message for the new chat
  const chatMessages = document.querySelector(".chat-messages");
  if (chatMessages) {
    const welcomeElement = document.createElement("div");
    welcomeElement.className = "message system-message";
    welcomeElement.textContent = "New chat started. Select text from your document or type a message to begin.";
    chatMessages.appendChild(welcomeElement);
  }
}

// Function to delete a chat and update the numbering
function deleteChat(chatId: string) {
  // Don't delete if it's the only chat
  if (chatHistories.length <= 1) {
    showNotification("Cannot delete the only chat");
    return;
  }

  // Find the index of the chat to delete
  const deleteIndex = chatHistories.findIndex((chat) => chat.id === chatId);
  if (deleteIndex === -1) return;

  // If we're deleting the current chat, switch to another chat first
  if (chatId === currentChatId) {
    // Find the next chat to switch to (prefer the previous one)
    const nextChatIndex = deleteIndex > 0 ? deleteIndex - 1 : deleteIndex + 1;
    currentChatId = chatHistories[nextChatIndex].id;
  }

  // Remove the chat from the history array
  chatHistories.splice(deleteIndex, 1);

  // Update the chat names to be sequential (Chat 1, Chat 2, etc.)
  chatHistories.forEach((chat, index) => {
    chat.name = `Chat ${index + 1}`;
  });

  // Update the UI
  updateChatListUI();

  // Load the current chat
  if (currentChatId) {
    loadChatMessages(currentChatId);
  }

  showNotification("Chat deleted");
}

// Function to update the chat list UI after changes
function updateChatListUI() {
  const chatList = document.querySelector(".chat-list");
  if (!chatList) return;

  // Remove all existing chat items (except the new chat button)
  Array.from(chatList.children).forEach((child) => {
    if (!child.classList.contains("new-chat-button")) {
      chatList.removeChild(child);
    }
  });

  // Add chat items for each chat in the histories
  chatHistories.forEach((chat) => {
    const chatItem = document.createElement("div");
    chatItem.className = "chat-item";
    if (chat.id === currentChatId) {
      chatItem.classList.add("active-chat");
    }
    chatItem.dataset.chatId = chat.id;

    // Create a span for the chat name
    const chatName = document.createElement("span");
    chatName.textContent = chat.name;
    chatItem.appendChild(chatName);

    // Create delete button
    const deleteButton = document.createElement("span");
    deleteButton.className = "chat-item-delete";
    deleteButton.innerHTML = "×";
    deleteButton.title = "Delete chat";
    deleteButton.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent triggering chat selection
      deleteChat(chat.id);
    });
    chatItem.appendChild(deleteButton);

    // Add event listener for chat selection
    chatItem.addEventListener("click", () => switchToChat(chat.id));

    // Add to the list in the correct order
    chatList.appendChild(chatItem);
  });
}

// Function to switch to a specific chat
function switchToChat(chatId: string) {
  // Save current chat messages first
  saveCurrentChatMessages();

  // Set the current chat ID
  currentChatId = chatId;

  // Update active chat in UI
  const chatItems = document.querySelectorAll(".chat-item");
  chatItems.forEach((item) => {
    if (item instanceof HTMLElement && item.dataset.chatId === chatId) {
      item.classList.add("active-chat");
    } else {
      item.classList.remove("active-chat");
    }
  });

  // Load chat messages for the selected chat
  loadChatMessages(chatId);
}

// Function to save the current chat messages
function saveCurrentChatMessages() {
  if (!currentChatId) return;

  const currentChat = chatHistories.find((chat) => chat.id === currentChatId);
  if (!currentChat) return;

  // Get all message elements from the chat
  const chatMessages = document.querySelector(".chat-messages");
  if (!chatMessages) return;

  // Clear existing messages in the chat history
  currentChat.messages = [];

  // Save each message
  chatMessages.querySelectorAll(".message").forEach((messageEl) => {
    // Determine message type
    let type: "user" | "assistant" | "system" | "error" = "system";
    if (messageEl.classList.contains("user-message")) {
      type = "user";
    } else if (messageEl.classList.contains("assistant-message")) {
      // For assistant messages, get the content from the message-content div
      type = "assistant";
    } else if (messageEl.classList.contains("error-message")) {
      type = "error";
    }

    // Get message content
    let content = "";
    if (type === "assistant") {
      const contentEl = messageEl.querySelector(".message-content");
      content = contentEl ? contentEl.textContent || "" : "";
    } else {
      content = messageEl.textContent || "";
    }

    // Add to history
    currentChat.messages.push({ type, content });
  });
}

// Function to load chat messages for a specific chat
function loadChatMessages(chatId: string) {
  const chatToLoad = chatHistories.find((chat) => chat.id === chatId);
  if (!chatToLoad) return;

  // Clear current messages
  const chatMessages = document.querySelector(".chat-messages");
  if (!chatMessages) return;

  chatMessages.innerHTML = "";

  // Add each message from history
  chatToLoad.messages.forEach((message) => {
    if (message.type === "user") {
      // Add user message
      const userMessageElement = document.createElement("div");
      userMessageElement.classList.add("message", "user-message");
      userMessageElement.textContent = message.content;
      chatMessages.appendChild(userMessageElement);
    } else if (message.type === "assistant") {
      // Add assistant message with actions
      const assistantMessageElement = document.createElement("div");
      assistantMessageElement.classList.add("message", "assistant-message");

      // Create message content div
      const messageContentElement = document.createElement("div");
      messageContentElement.classList.add("message-content");
      messageContentElement.textContent = message.content;
      assistantMessageElement.appendChild(messageContentElement);

      // Create message actions div
      const messageActionsElement = document.createElement("div");
      messageActionsElement.classList.add("message-actions");

      // Create apply button
      const applyButton = document.createElement("button");
      applyButton.classList.add("message-action-button", "apply-button");
      applyButton.innerHTML = '<i class="fas fa-file-import"></i> Apply to Document';
      applyButton.title = "Insert this text into Word document";
      applyButton.addEventListener("click", () => applyTextToDocument(message.content));
      messageActionsElement.appendChild(applyButton);

      // Add actions to message
      assistantMessageElement.appendChild(messageActionsElement);

      // Add the complete message to chat
      chatMessages.appendChild(assistantMessageElement);
    } else if (message.type === "system") {
      // Add system message
      const systemMessageElement = document.createElement("div");
      systemMessageElement.classList.add("message", "system-message");
      systemMessageElement.textContent = message.content;
      chatMessages.appendChild(systemMessageElement);
    } else if (message.type === "error") {
      // Add error message
      const errorMessageElement = document.createElement("div");
      errorMessageElement.classList.add("message", "error-message");
      errorMessageElement.textContent = message.content;
      chatMessages.appendChild(errorMessageElement);
    }
  });

  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}
