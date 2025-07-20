"""
Pydantic models for request/response schemas
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
from enum import Enum
from pydantic import BaseModel, Field

class IntentType(str, Enum):
    """Types of user intents"""
    MONITOR = "monitor"
    DETECT = "detect"
    ALERT = "alert"
    SCHEDULE = "schedule"
    CONFIGURE = "configure"
    QUERY = "query"
    UNKNOWN = "unknown"

class SkillType(str, Enum):
    """Types of skills that can be created"""
    PERIMETER_SECURITY = "perimeter_security"
    PACKAGE_DELIVERY = "package_delivery"
    VEHICLE_MONITORING = "vehicle_monitoring"
    CROWD_DETECTION = "crowd_detection"
    SAFETY_COMPLIANCE = "safety_compliance"
    CUSTOM = "custom"

class DetectionType(str, Enum):
    """Types of detections"""
    PERSON = "person"
    VEHICLE = "vehicle"
    PACKAGE = "package"
    ANIMAL = "animal"
    MOTION = "motion"
    LOITERING = "loitering"
    INTRUSION = "intrusion"

class ChatMessage(BaseModel):
    """Chat message model"""
    content: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    user_id: Optional[str] = None

class Intent(BaseModel):
    """Extracted intent from user message"""
    type: IntentType
    confidence: float
    entities: Dict[str, Any] = {}
    raw_text: str

class ConversationTurn(BaseModel):
    """A single turn in the conversation"""
    user_message: str
    bot_response: str
    intent: Optional[Intent] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ChatSession(BaseModel):
    """Chat session with conversation history"""
    session_id: str
    user_id: Optional[str] = None
    conversation_history: List[ConversationTurn] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    skill_context: Optional[Dict[str, Any]] = None

class BotResponse(BaseModel):
    """Bot response with additional context"""
    content: str
    suggested_actions: List[str] = []
    skill_preview: Optional[Dict[str, Any]] = None
    requires_confirmation: bool = False

class TimeSchedule(BaseModel):
    """Time schedule for skill activation"""
    days_of_week: List[int] = Field(default_factory=lambda: list(range(7)))  # 0=Monday, 6=Sunday
    start_time: str = "00:00"  # HH:MM format
    end_time: str = "23:59"    # HH:MM format
    timezone: str = "UTC"

class AlertConfig(BaseModel):
    """Alert configuration"""
    enabled: bool = True
    methods: List[str] = ["push", "email"]  # push, email, sms, webhook
    recipients: List[str] = []
    cooldown_minutes: int = 5
    priority: str = "medium"  # low, medium, high, critical

class DetectionConfig(BaseModel):
    """Detection configuration"""
    type: DetectionType
    confidence_threshold: float = 0.7
    zones: List[Dict[str, Any]] = []  # Polygon zones
    ignore_zones: List[Dict[str, Any]] = []
    min_size: Optional[float] = None
    max_size: Optional[float] = None

class ActionConfig(BaseModel):
    """Action configuration"""
    type: str  # alert, record, relay, webhook, light
    parameters: Dict[str, Any] = {}
    conditions: List[str] = []

class SkillConfig(BaseModel):
    """Complete skill configuration"""
    skill_id: Optional[str] = None
    name: str
    description: str
    type: SkillType
    enabled: bool = True
    schedule: TimeSchedule = Field(default_factory=TimeSchedule)
    detections: List[DetectionConfig] = []
    actions: List[ActionConfig] = []
    alerts: AlertConfig = Field(default_factory=AlertConfig)
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class DeploymentRequest(BaseModel):
    """Request to deploy a skill"""
    skill_id: str
    camera_ids: List[str]
    activate_immediately: bool = True
    override_existing: bool = False

class DeploymentResponse(BaseModel):
    """Response from skill deployment"""
    deployment_id: str
    status: str  # success, partial, failed
    deployed_cameras: List[str]
    failed_cameras: List[Dict[str, str]] = []  # camera_id: error_message
    message: str

class SkillTemplate(BaseModel):
    """Pre-built skill template"""
    template_id: str
    name: str
    description: str
    category: SkillType
    preview_image: Optional[str] = None
    base_config: SkillConfig
    customizable_fields: List[str] = []
    example_phrases: List[str] = []