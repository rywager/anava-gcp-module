# Anava Vision Conversational Skill Builder

This service provides a conversational interface for creating and deploying AI camera skills through natural language processing.

## Features

- Natural language intent recognition
- Conversation flow management
- Skill configuration generation
- Template-based skill creation
- Integration with MCP server for deployment

## Architecture

The service is built with:
- FastAPI for the REST API
- spaCy/Rasa for NLP processing
- Pydantic for data modeling
- WebSocket support for real-time chat

## API Endpoints

- `POST /api/chat/message` - Process user message
- `GET /api/chat/session/{session_id}` - Get conversation history
- `POST /api/skills/generate` - Generate skill from conversation
- `GET /api/skills/templates` - List available templates
- `POST /api/skills/deploy` - Deploy skill to cameras

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run development server
uvicorn main:app --reload --port 8080

# Run tests
pytest
```

## Docker

```bash
# Build image
docker build -t anava-skill-builder .

# Run container
docker run -p 8080:8080 anava-skill-builder
```