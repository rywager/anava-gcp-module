"""
Unit tests for Skill Builder
"""

import pytest
from app.skills.builder import SkillBuilder
from app.models.schemas import SkillType, DetectionType

@pytest.fixture
def skill_builder():
    return SkillBuilder()

def test_build_preview_basic(skill_builder):
    """Test basic skill preview generation"""
    context = {
        "location": "Loading Dock",
        "detection_types": ["person"],
        "schedule": ["night"],
        "alerts_enabled": True,
        "actions": ["lights"],
        "skill_type": "perimeter_security"
    }
    
    preview = skill_builder.build_preview(context)
    
    assert preview["name"] == "Loading Dock Perimeter Security"
    assert "Loading Dock" in preview["description"]
    assert "Person" in preview["detections"]
    assert "Nighttime" in preview["schedule"]
    assert "lights" in preview["actions"]

def test_build_skill_config_package_delivery(skill_builder):
    """Test skill config generation for package delivery"""
    context = {
        "location": "Front Door",
        "detection_types": ["package", "person"],
        "schedule": ["business hours"],
        "alerts_enabled": True,
        "skill_type": "package_delivery"
    }
    
    config = skill_builder.build_skill_config(context)
    
    assert config.type == SkillType.PACKAGE_DELIVERY
    assert config.name == "Front Door Package Detection"
    assert len(config.detections) == 2
    assert any(d.type == DetectionType.PACKAGE for d in config.detections)
    assert any(d.type == DetectionType.PERSON for d in config.detections)
    assert config.schedule.start_time == "08:00"
    assert config.schedule.end_time == "18:00"

def test_build_skill_config_vehicle_monitoring(skill_builder):
    """Test skill config generation for vehicle monitoring"""
    context = {
        "location": "Parking Lot",
        "detection_types": ["vehicle"],
        "schedule": ["24/7"],
        "alerts_enabled": False,
        "skill_type": "vehicle_monitoring"
    }
    
    config = skill_builder.build_skill_config(context)
    
    assert config.type == SkillType.VEHICLE_MONITORING
    assert config.name == "Parking Lot Vehicle Monitoring"
    assert len(config.detections) == 1
    assert config.detections[0].type == DetectionType.VEHICLE
    assert not config.alerts.enabled
    assert len(config.actions) >= 2  # At least record and webhook

def test_generate_skill_name_variations(skill_builder):
    """Test skill name generation variations"""
    # Test perimeter security
    context1 = {"location": "Fence Line", "skill_type": "perimeter_security"}
    name1 = skill_builder._generate_skill_name(context1)
    assert name1 == "Fence Line Perimeter Security"
    
    # Test custom with detection type
    context2 = {"location": "Warehouse", "skill_type": "custom", "detection_types": ["motion"]}
    name2 = skill_builder._generate_skill_name(context2)
    assert name2 == "Warehouse Motion Detection"
    
    # Test fallback
    context3 = {"location": "Office"}
    name3 = skill_builder._generate_skill_name(context3)
    assert name3 == "Office Monitoring"

def test_schedule_parsing(skill_builder):
    """Test schedule parsing"""
    # Test night schedule
    context1 = {"schedule": ["night"]}
    schedule1 = skill_builder._build_schedule(context1)
    assert schedule1.start_time == "20:00"
    assert schedule1.end_time == "06:00"
    
    # Test business hours
    context2 = {"schedule": ["business hours"]}
    schedule2 = skill_builder._build_schedule(context2)
    assert schedule2.start_time == "08:00"
    assert schedule2.end_time == "18:00"
    assert schedule2.days_of_week == list(range(5))  # Weekdays only
    
    # Test weekend
    context3 = {"schedule": ["weekend"]}
    schedule3 = skill_builder._build_schedule(context3)
    assert schedule3.days_of_week == [5, 6]  # Saturday and Sunday

def test_action_building(skill_builder):
    """Test action configuration building"""
    context = {
        "actions": ["lights", "siren"],
        "alerts_enabled": True
    }
    
    actions = skill_builder._build_actions(context)
    
    # Should have record, relay for lights, relay for siren, and webhook
    assert len(actions) >= 4
    
    # Check for record action
    record_action = next((a for a in actions if a.type == "record"), None)
    assert record_action is not None
    
    # Check for relay actions
    relay_actions = [a for a in actions if a.type == "relay"]
    assert len(relay_actions) >= 2  # For lights and siren