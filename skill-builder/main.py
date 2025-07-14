"""
Anava Vision Conversational Skill Builder
Main FastAPI application
"""

import os
import uuid
from datetime import datetime
from typing import Dict, List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import structlog

from app.nlp.processor import NLPProcessor
from app.conversation.manager import ConversationManager
from app.skills.generator import SkillGenerator
from app.skills.templates import TemplateManager
from app.models.schemas import (
    ChatMessage,
    ChatSession,
    SkillConfig,
    DeploymentRequest,
    DeploymentResponse
)
from app.integrations.mcp_client import MCPClient
from app.integrations.firestore import FirestoreClient
from app.config import Settings

# Configure structured logging
logger = structlog.get_logger()

# Load settings
settings = Settings()

# Initialize services
nlp_processor = NLPProcessor()
template_manager = TemplateManager()
firestore_client = FirestoreClient(settings.gcp_project_id)
mcp_client = MCPClient(settings.mcp_server_url)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    logger.info("Starting Anava Skill Builder", version="1.0.0")
    await nlp_processor.initialize()
    await firestore_client.initialize()
    yield
    # Shutdown
    logger.info("Shutting down Anava Skill Builder")
    await firestore_client.close()

# Create FastAPI app
app = FastAPI(
    title="Anava Vision Skill Builder",
    description="Conversational interface for creating AI camera skills",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check endpoint
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": "1.0.0"
    }

# Chat endpoints
@app.post("/api/chat/message")
async def process_message(
    message: ChatMessage,
    session_id: Optional[str] = None
) -> Dict:
    """Process a user message and return bot response"""
    try:
        # Create or get session
        if not session_id:
            session_id = str(uuid.uuid4())
        
        # Get conversation manager for session
        conversation_manager = ConversationManager(session_id, firestore_client)
        
        # Process the message
        intent = await nlp_processor.extract_intent(message.content)
        logger.info("Extracted intent", session_id=session_id, intent=intent)
        
        # Generate response based on intent
        response = await conversation_manager.process_user_input(
            message.content,
            intent
        )
        
        # Store conversation turn
        await conversation_manager.add_turn(message.content, response.content)
        
        return {
            "session_id": session_id,
            "response": response.content,
            "intent": intent.dict(),
            "suggested_actions": response.suggested_actions,
            "skill_preview": response.skill_preview
        }
        
    except Exception as e:
        logger.error("Error processing message", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chat/session/{session_id}")
async def get_session(session_id: str) -> ChatSession:
    """Get conversation history for a session"""
    try:
        conversation_manager = ConversationManager(session_id, firestore_client)
        session = await conversation_manager.get_session()
        return session
    except Exception as e:
        logger.error("Error retrieving session", session_id=session_id, error=str(e))
        raise HTTPException(status_code=404, detail="Session not found")

# Skill generation endpoints
@app.post("/api/skills/generate")
async def generate_skill(session_id: str) -> SkillConfig:
    """Generate a skill configuration from conversation"""
    try:
        conversation_manager = ConversationManager(session_id, firestore_client)
        session = await conversation_manager.get_session()
        
        skill_generator = SkillGenerator()
        skill_config = await skill_generator.generate_from_conversation(
            session.conversation_history
        )
        
        # Store generated skill
        await firestore_client.store_skill(session_id, skill_config)
        
        return skill_config
        
    except Exception as e:
        logger.error("Error generating skill", session_id=session_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/skills/templates")
async def list_templates() -> List[Dict]:
    """List available skill templates"""
    templates = template_manager.list_templates()
    return templates

@app.get("/api/skills/templates/{template_id}")
async def get_template(template_id: str) -> Dict:
    """Get a specific skill template"""
    template = template_manager.get_template(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template

# Deployment endpoints
@app.post("/api/skills/deploy")
async def deploy_skill(request: DeploymentRequest) -> DeploymentResponse:
    """Deploy a skill to specified cameras"""
    try:
        # Validate skill exists
        skill = await firestore_client.get_skill(request.skill_id)
        if not skill:
            raise HTTPException(status_code=404, detail="Skill not found")
        
        # Deploy via MCP server
        deployment_result = await mcp_client.deploy_skill(
            skill,
            request.camera_ids
        )
        
        # Store deployment record
        await firestore_client.store_deployment(
            request.skill_id,
            request.camera_ids,
            deployment_result
        )
        
        return DeploymentResponse(
            deployment_id=deployment_result.deployment_id,
            status="success",
            deployed_cameras=deployment_result.deployed_cameras,
            message=f"Successfully deployed to {len(deployment_result.deployed_cameras)} cameras"
        )
        
    except Exception as e:
        logger.error("Error deploying skill", skill_id=request.skill_id, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

# WebSocket endpoint for real-time chat
@app.websocket("/ws/chat/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    """WebSocket endpoint for real-time chat"""
    await websocket.accept()
    conversation_manager = ConversationManager(session_id, firestore_client)
    
    try:
        while True:
            # Receive message
            data = await websocket.receive_json()
            message = ChatMessage(**data)
            
            # Process message
            intent = await nlp_processor.extract_intent(message.content)
            response = await conversation_manager.process_user_input(
                message.content,
                intent
            )
            
            # Send response
            await websocket.send_json({
                "type": "response",
                "content": response.content,
                "intent": intent.dict(),
                "suggested_actions": response.suggested_actions,
                "skill_preview": response.skill_preview
            })
            
            # Store conversation turn
            await conversation_manager.add_turn(message.content, response.content)
            
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected", session_id=session_id)
    except Exception as e:
        logger.error("WebSocket error", session_id=session_id, error=str(e))
        await websocket.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)