# Anava Skill Builder API Documentation

## Overview

The Anava Skill Builder API provides a conversational interface for creating and deploying AI camera skills through natural language processing. Users can describe what they want their cameras to do, and the system will generate appropriate skill configurations.

## Base URL

- **Production**: `https://anava-skill-builder-[hash]-uc.a.run.app`
- **Development**: `http://localhost:8080`

## Authentication

Currently, the API is designed to work with Google Cloud authentication. In production, it integrates with the broader Anava Vision ecosystem.

## Endpoints

### Health Check

#### GET /health

Returns the health status of the service.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-07-13T10:30:00Z",
  "version": "1.0.0"
}
```

### Chat Interface

#### POST /api/chat/message

Process a user message and return a bot response with extracted intent and skill information.

**Request Body:**
```json
{
  "content": "Monitor my loading dock for unauthorized access at night",
  "timestamp": "2024-07-13T10:30:00Z",
  "user_id": "optional-user-id"
}
```

**Response:**
```json
{
  "session_id": "uuid-session-id",
  "response": "I'll help you set up night security for your loading dock. Should I alert you immediately when someone is detected?",
  "intent": {
    "type": "monitor",
    "confidence": 0.85,
    "entities": {
      "locations": ["loading dock"],
      "detection_types": ["person"],
      "times": ["night"]
    },
    "raw_text": "Monitor my loading dock for unauthorized access at night"
  },
  "suggested_actions": [
    "Alert me immediately",
    "Just record events",
    "Turn on lights when detected"
  ],
  "skill_preview": null
}
```

#### GET /api/chat/session/{session_id}

Get the conversation history for a specific session.

**Response:**
```json
{
  "session_id": "uuid-session-id",
  "user_id": "optional-user-id",
  "conversation_history": [
    {
      "user_message": "Monitor my loading dock",
      "bot_response": "I'll help you set up monitoring...",
      "intent": {...},
      "timestamp": "2024-07-13T10:30:00Z"
    }
  ],
  "created_at": "2024-07-13T10:25:00Z",
  "updated_at": "2024-07-13T10:35:00Z",
  "skill_context": {
    "skill_type": "perimeter_security",
    "location": "loading dock",
    "detection_types": ["person"],
    "schedule": ["night"],
    "state": "gathering"
  }
}
```

### Skill Management

#### POST /api/skills/generate

Generate a complete skill configuration from a conversation session.

**Request Body:**
```json
{
  "session_id": "uuid-session-id"
}
```

**Response:**
```json
{
  "skill_id": "uuid-skill-id",
  "name": "Loading Dock Night Security",
  "description": "Monitor loading dock for unauthorized access during night hours",
  "type": "perimeter_security",
  "enabled": true,
  "schedule": {
    "days_of_week": [0, 1, 2, 3, 4, 5, 6],
    "start_time": "20:00",
    "end_time": "06:00",
    "timezone": "UTC"
  },
  "detections": [
    {
      "type": "person",
      "confidence_threshold": 0.7,
      "zones": [],
      "ignore_zones": [],
      "min_size": 0.05,
      "max_size": null
    }
  ],
  "actions": [
    {
      "type": "record",
      "parameters": {
        "duration_seconds": 30,
        "quality": "high"
      }
    },
    {
      "type": "webhook",
      "parameters": {
        "url": "${CLOUD_WEBHOOK_URL}",
        "include_snapshot": true
      }
    }
  ],
  "alerts": {
    "enabled": true,
    "methods": ["push", "email"],
    "recipients": [],
    "cooldown_minutes": 5,
    "priority": "high"
  },
  "metadata": {
    "created_via": "conversational_builder",
    "location": "loading dock"
  },
  "created_at": "2024-07-13T10:35:00Z"
}
```

#### GET /api/skills/templates

List all available skill templates.

**Response:**
```json
[
  {
    "template_id": "perimeter_security",
    "name": "Perimeter Security",
    "description": "Monitor perimeter for unauthorized access",
    "category": "perimeter_security",
    "customizable_fields": ["schedule", "detection_zones", "alert_recipients"],
    "example_phrases": [
      "Monitor the perimeter for intruders",
      "Watch the fence line 24/7",
      "Detect unauthorized access to the property"
    ]
  }
]
```

#### GET /api/skills/templates/{template_id}

Get a specific skill template with full configuration.

**Response:**
```json
{
  "template_id": "perimeter_security",
  "name": "Perimeter Security",
  "description": "Monitor perimeter for unauthorized access",
  "category": "perimeter_security",
  "base_config": {
    "name": "Perimeter Security",
    "description": "Monitor perimeter boundaries for unauthorized access",
    "type": "perimeter_security",
    "schedule": {...},
    "detections": [...],
    "actions": [...],
    "alerts": {...}
  },
  "customizable_fields": ["schedule", "detection_zones", "alert_recipients"],
  "example_phrases": [...]
}
```

### Deployment

#### POST /api/skills/deploy

Deploy a skill to specified cameras via the MCP server.

**Request Body:**
```json
{
  "skill_id": "uuid-skill-id",
  "camera_ids": ["camera-1", "camera-2"],
  "activate_immediately": true,
  "override_existing": false
}
```

**Response:**
```json
{
  "deployment_id": "uuid-deployment-id",
  "status": "success",
  "deployed_cameras": ["camera-1", "camera-2"],
  "failed_cameras": [],
  "message": "Successfully deployed to 2 cameras"
}
```

### WebSocket

#### WS /ws/chat/{session_id}

Real-time chat interface using WebSocket.

**Send Message:**
```json
{
  "content": "Monitor my parking lot for vehicles",
  "timestamp": "2024-07-13T10:30:00Z"
}
```

**Receive Response:**
```json
{
  "type": "response",
  "content": "I'll set up vehicle monitoring for your parking lot...",
  "intent": {...},
  "suggested_actions": [...],
  "skill_preview": null
}
```

## Data Models

### Intent Types
- `monitor` - User wants to monitor/watch an area
- `detect` - User wants to detect specific objects/people
- `alert` - User wants to receive notifications
- `schedule` - User is specifying time constraints
- `configure` - User wants to modify settings
- `query` - User is asking questions
- `unknown` - Intent could not be determined

### Detection Types
- `person` - Human detection
- `vehicle` - Car, truck, motorcycle detection
- `package` - Package/delivery detection
- `animal` - Animal detection
- `motion` - General motion detection
- `loitering` - Loitering behavior detection
- `intrusion` - Intrusion/trespassing detection

### Skill Types
- `perimeter_security` - Perimeter monitoring and security
- `package_delivery` - Package delivery monitoring
- `vehicle_monitoring` - Vehicle tracking and parking
- `crowd_detection` - Crowd formation and density
- `safety_compliance` - Safety equipment compliance
- `custom` - Custom configurations

## Example Usage

### Basic Conversation Flow

1. **Start Conversation**
```bash
curl -X POST http://localhost:8080/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Monitor my loading dock for people at night"}'
```

2. **Continue Conversation**
```bash
curl -X POST http://localhost:8080/api/chat/message \
  -H "Content-Type: application/json" \
  -d '{"content": "Alert me immediately and turn on lights"}' \
  --url "http://localhost:8080/api/chat/message?session_id=<session_id>"
```

3. **Generate Skill**
```bash
curl -X POST http://localhost:8080/api/skills/generate \
  -H "Content-Type: application/json" \
  -d '{"session_id": "<session_id>"}'
```

4. **Deploy Skill**
```bash
curl -X POST http://localhost:8080/api/skills/deploy \
  -H "Content-Type: application/json" \
  -d '{
    "skill_id": "<skill_id>",
    "camera_ids": ["camera-1", "camera-2"],
    "activate_immediately": true
  }'
```

## Error Handling

The API uses standard HTTP status codes:

- `200` - Success
- `400` - Bad Request (invalid input)
- `404` - Not Found (session/skill not found)
- `422` - Validation Error
- `500` - Internal Server Error

Error responses include details:

```json
{
  "detail": "Session not found",
  "error_code": "SESSION_NOT_FOUND",
  "timestamp": "2024-07-13T10:30:00Z"
}
```

## Rate Limiting

Currently no rate limiting is implemented, but it may be added in production environments.

## Integration

The Skill Builder integrates with:

- **Firestore** - For conversation and skill storage
- **MCP Server** - For camera communication and deployment
- **Google Cloud APIs** - For authentication and logging