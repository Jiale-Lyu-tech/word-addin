# Doublebridge Word Add-in

A powerful Microsoft Word add-in that integrates AI capabilities into your document workflow using Ollama's local language models.

## Features

### Chat Interface

- **Multi-chat Support**: Keep multiple chat sessions with sequential naming (Chat 1, Chat 2, etc.)
- **Chat History Management**: Save, reload, and delete chat sessions
- **Document Selection Integration**: Use selected text from your document directly in chats

### AI Capabilities

- **Local AI Processing**: Uses Ollama to run AI models locally on your machine
- **Model Selection**: Choose from any model you have installed in Ollama
- **Mock Mode**: For testing without Ollama running

### Custom Prompts System

- **Predefined Prompts**: Quick access to common document processing tasks
- **Custom Prompt Creation**: Create and manage your own custom prompts
- **Organization by Category**: Group prompts by purpose (Academic, Business, Creative, etc.)

### Document Integration

- **Smart Selection**: The add-in detects text selections in your document
- **Direct Application**: Apply AI-generated content directly to your document
- **Text Export**: Export chat content to your document or as a text file

## Installation

### Prerequisites

1. Microsoft Word (Office 365 or newer)
2. [Ollama](https://ollama.ai) installed on your machine
3. Node.js and npm

### Setup Instructions

1. Clone this repository:

```
git clone https://github.com/yourusername/doublebridge-word-addin.git
cd word-addin
```

2. Install dependencies:

```
npm install
```

3. Start the development server:

```
npm run dev-server
```

4. Sideload the add-in in Word:
   - Open Word
   - Go to Insert > Add-ins > My Add-ins
   - Choose "Upload My Add-in" and select the manifest file from the project

### Ollama Setup

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Start the Ollama service:

```
ollama serve
```

3. Pull at least one model:

```
ollama pull mistral
```

## Usage Guide

### Getting Started

1. Open the add-in from the Word ribbon
2. The add-in will automatically connect to Ollama if it's running
3. Select a model from the dropdown menu

### Using Chats

- Type in the chat box and press Enter or click Send
- Click "New Chat" to start a fresh conversation
- Click on chat items in the sidebar to switch between conversations
- Hover over a chat to see the delete button (×) to remove it

### Working with Document Text

1. Select text in your document
2. The add-in will show the selection at the top of the chat
3. Click "Use in Chat" to include it in your message
4. Alternatively, use a predefined prompt button to process the selection

### Custom Prompts

1. Click the "Prompts" tab
2. Browse existing prompts or create a new one
3. Define a name, category and content for your prompt
4. Use variables like `{{selectedText}}` to include document content

## Configuration

The add-in automatically discovers Ollama running on the default port (11434). If you're running Ollama on a different port or host, you may need to adjust the connection settings in the services files.

## Troubleshooting

- **Ollama Not Connecting**: Ensure Ollama is running with `ollama serve`
- **Models Not Showing**: Make sure you've pulled at least one model with `ollama pull`
- **Add-in Not Loading**: Check if your development server is running

## Development

This add-in is built using:

- Office JS API
- TypeScript
- HTML/CSS
- Node.js

To contribute:

1. Fork the repository
2. Create your feature branch
3. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
