"""
Integration tests for conversation flow
"""

import pytest
from unittest.mock import AsyncMock, Mock
from app.conversation.manager import ConversationManager
from app.nlp.processor import NLPProcessor
from app.models.schemas import Intent, IntentType

@pytest.fixture
async def conversation_manager():
    # Mock Firestore client
    mock_firestore = AsyncMock()
    mock_firestore.get_conversation.return_value = None
    mock_firestore.store_conversation.return_value = None
    mock_firestore.update_conversation.return_value = None
    
    manager = ConversationManager("test-session", mock_firestore)
    return manager

@pytest.fixture
async def nlp_processor():
    processor = NLPProcessor()
    await processor.initialize()
    return processor

@pytest.mark.asyncio
async def test_greeting_flow(conversation_manager, nlp_processor):
    """Test initial greeting flow"""
    # Simulate greeting
    intent = Intent(
        type=IntentType.UNKNOWN,
        confidence=0.1,
        entities={},
        raw_text="Hello"
    )
    
    response = await conversation_manager.process_user_input("Hello", intent)
    
    assert "help you set up" in response.content.lower()
    assert len(response.suggested_actions) > 0
    
    # Check that state progressed
    session = await conversation_manager.get_session()
    assert session.skill_context["state"] == "gathering"

@pytest.mark.asyncio
async def test_complete_conversation_flow(conversation_manager, nlp_processor):
    """Test complete conversation from greeting to skill creation"""
    
    # Step 1: Initial intent with monitoring request
    monitor_intent = await nlp_processor.extract_intent(
        "I need to monitor my loading dock for unauthorized people at night"
    )
    response1 = await conversation_manager.process_user_input(
        "I need to monitor my loading dock for unauthorized people at night",
        monitor_intent
    )
    
    session = await conversation_manager.get_session()
    context = session.skill_context
    
    # Should have extracted location and detection type
    assert context["location"] == "loading dock"
    assert "person" in context["detection_types"]
    assert "night" in context["schedule"]
    
    # Step 2: Answer alert preference
    alert_intent = await nlp_processor.extract_intent("Yes, alert me immediately")
    response2 = await conversation_manager.process_user_input(
        "Yes, alert me immediately",
        alert_intent
    )
    
    # Should move to confirmation since we have all required info
    session = await conversation_manager.get_session()
    assert session.skill_context["state"] == "confirming"
    assert response2.requires_confirmation
    assert response2.skill_preview is not None
    
    # Step 3: Confirm the skill
    response3 = await conversation_manager.process_user_input(
        "Yes, that looks good",
        Intent(type=IntentType.UNKNOWN, confidence=0.5, entities={}, raw_text="Yes, that looks good")
    )
    
    # Should complete the skill creation
    session = await conversation_manager.get_session()
    assert session.skill_context["state"] == "complete"
    assert "created" in response3.content.lower()

@pytest.mark.asyncio
async def test_package_delivery_scenario(conversation_manager, nlp_processor):
    """Test package delivery scenario"""
    
    # User wants package monitoring
    intent = await nlp_processor.extract_intent(
        "Watch for package deliveries at my front door during business hours"
    )
    response = await conversation_manager.process_user_input(
        "Watch for package deliveries at my front door during business hours",
        intent
    )
    
    session = await conversation_manager.get_session()
    context = session.skill_context
    
    # Should detect package delivery scenario
    assert "package" in context["detection_types"]
    assert context["location"] == "front door"
    assert "business hours" in context["schedule"]
    
    # Should infer package delivery skill type
    assert context["skill_type"] == "package_delivery"

@pytest.mark.asyncio
async def test_missing_information_handling(conversation_manager):
    """Test handling of missing information"""
    
    # Provide minimal information
    intent = Intent(
        type=IntentType.MONITOR,
        confidence=0.8,
        entities={"detection_types": ["person"]},
        raw_text="Monitor for people"
    )
    
    response = await conversation_manager.process_user_input("Monitor for people", intent)
    
    # Should ask for missing information (location)
    assert "where" in response.content.lower() or "location" in response.content.lower()
    assert len(response.suggested_actions) > 0
    
    session = await conversation_manager.get_session()
    assert session.skill_context["state"] == "gathering"

@pytest.mark.asyncio
async def test_conversation_state_persistence(conversation_manager):
    """Test that conversation state persists across interactions"""
    
    # First interaction
    intent1 = Intent(
        type=IntentType.MONITOR,
        confidence=0.8,
        entities={"locations": ["parking lot"], "detection_types": ["vehicle"]},
        raw_text="Monitor parking lot for vehicles"
    )
    
    await conversation_manager.process_user_input("Monitor parking lot for vehicles", intent1)
    
    # Second interaction should maintain context
    intent2 = Intent(
        type=IntentType.ALERT,
        confidence=0.7,
        entities={},
        raw_text="Alert me when detected"
    )
    
    await conversation_manager.process_user_input("Alert me when detected", intent2)
    
    session = await conversation_manager.get_session()
    context = session.skill_context
    
    # Should maintain previous context
    assert context["location"] == "parking lot"
    assert "vehicle" in context["detection_types"]
    assert context["alerts_enabled"] is True