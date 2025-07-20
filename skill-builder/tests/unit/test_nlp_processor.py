"""
Unit tests for NLP Processor
"""

import pytest
import asyncio
from app.nlp.processor import NLPProcessor
from app.models.schemas import IntentType, DetectionType

@pytest.fixture
async def nlp_processor():
    processor = NLPProcessor()
    await processor.initialize()
    return processor

@pytest.mark.asyncio
async def test_extract_intent_monitor(nlp_processor):
    """Test monitoring intent extraction"""
    text = "I need to monitor my loading dock for unauthorized access"
    intent = await nlp_processor.extract_intent(text)
    
    assert intent.type == IntentType.MONITOR
    assert intent.confidence > 0.5
    assert "loading dock" in intent.entities.get("locations", [])

@pytest.mark.asyncio
async def test_extract_intent_detect_person(nlp_processor):
    """Test person detection intent"""
    text = "Detect people entering the building at night"
    intent = await nlp_processor.extract_intent(text)
    
    assert intent.type == IntentType.DETECT
    assert DetectionType.PERSON in intent.entities.get("detection_types", [])
    assert any("night" in time for time in intent.entities.get("times", []))

@pytest.mark.asyncio
async def test_extract_intent_alert(nlp_processor):
    """Test alert intent extraction"""
    text = "Alert me immediately when someone arrives"
    intent = await nlp_processor.extract_intent(text)
    
    assert intent.type == IntentType.ALERT
    assert intent.confidence > 0.5

@pytest.mark.asyncio
async def test_extract_entities_package_delivery(nlp_processor):
    """Test package delivery entity extraction"""
    text = "Watch for package deliveries at the front door during business hours"
    intent = await nlp_processor.extract_intent(text)
    
    assert DetectionType.PACKAGE in intent.entities.get("detection_types", [])
    assert any("front door" in loc for loc in intent.entities.get("locations", []))
    assert any("business hours" in time for time in intent.entities.get("times", []))

@pytest.mark.asyncio
async def test_extract_intent_vehicle(nlp_processor):
    """Test vehicle monitoring intent"""
    text = "Monitor the parking lot for unauthorized vehicles"
    intent = await nlp_processor.extract_intent(text)
    
    assert intent.type == IntentType.MONITOR
    assert DetectionType.VEHICLE in intent.entities.get("detection_types", [])
    assert any("parking lot" in loc for loc in intent.entities.get("locations", []))

@pytest.mark.asyncio
async def test_confidence_calculation(nlp_processor):
    """Test confidence calculation"""
    # High confidence case
    high_conf_text = "Monitor the loading dock for people and vehicles during night hours"
    high_intent = await nlp_processor.extract_intent(high_conf_text)
    
    # Low confidence case
    low_conf_text = "Hello there"
    low_intent = await nlp_processor.extract_intent(low_conf_text)
    
    assert high_intent.confidence > low_intent.confidence