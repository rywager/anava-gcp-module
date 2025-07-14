"""
Pytest configuration and shared fixtures
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, Mock

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture
def mock_firestore_client():
    """Mock Firestore client for testing"""
    mock_client = AsyncMock()
    mock_client.get_conversation.return_value = None
    mock_client.store_conversation.return_value = None
    mock_client.update_conversation.return_value = None
    mock_client.store_skill.return_value = None
    mock_client.get_skill.return_value = None
    mock_client.list_skills.return_value = []
    mock_client.store_deployment.return_value = None
    return mock_client

@pytest.fixture
def mock_mcp_client():
    """Mock MCP client for testing"""
    from app.integrations.mcp_client import MCPDeploymentResult
    
    mock_client = AsyncMock()
    mock_client.deploy_skill.return_value = MCPDeploymentResult(
        deployment_id="test-deployment-123",
        deployed_cameras=["camera-1", "camera-2"],
        failed_cameras=[]
    )
    mock_client.get_camera_list.return_value = [
        {"camera_id": "camera-1", "name": "Front Door", "status": "online"},
        {"camera_id": "camera-2", "name": "Loading Dock", "status": "online"}
    ]
    mock_client.test_connection.return_value = True
    return mock_client

@pytest.fixture
def sample_skill_context():
    """Sample skill context for testing"""
    return {
        "skill_type": "perimeter_security",
        "location": "loading dock",
        "detection_types": ["person"],
        "schedule": ["night"],
        "alerts_enabled": True,
        "actions": ["lights"],
        "state": "complete"
    }

@pytest.fixture
def sample_conversation_history():
    """Sample conversation history for testing"""
    from app.models.schemas import ConversationTurn, Intent, IntentType
    
    return [
        ConversationTurn(
            user_message="I need to monitor my loading dock",
            bot_response="I'll help you set up monitoring. What should the camera watch for?",
            intent=Intent(
                type=IntentType.MONITOR,
                confidence=0.8,
                entities={"locations": ["loading dock"]},
                raw_text="I need to monitor my loading dock"
            )
        ),
        ConversationTurn(
            user_message="Watch for people at night",
            bot_response="Should I alert you when people are detected?",
            intent=Intent(
                type=IntentType.DETECT,
                confidence=0.9,
                entities={"detection_types": ["person"], "times": ["night"]},
                raw_text="Watch for people at night"
            )
        ),
        ConversationTurn(
            user_message="Yes, alert me immediately",
            bot_response="Perfect! I've created your skill.",
            intent=Intent(
                type=IntentType.ALERT,
                confidence=0.7,
                entities={},
                raw_text="Yes, alert me immediately"
            )
        )
    ]