"""
Conversation Manager for handling chat flow and state
"""

from datetime import datetime
from typing import Dict, List, Optional, Any
import structlog

from app.models.schemas import (
    Intent, IntentType, BotResponse, ChatSession, 
    ConversationTurn, SkillType, DetectionType
)
from app.conversation.flows import ConversationFlows
from app.skills.builder import SkillBuilder

logger = structlog.get_logger()

class ConversationManager:
    """Manages conversation state and flow"""
    
    def __init__(self, session_id: str, firestore_client):
        self.session_id = session_id
        self.firestore_client = firestore_client
        self.flows = ConversationFlows()
        self.skill_builder = SkillBuilder()
        self.session: Optional[ChatSession] = None
        
    async def get_session(self) -> ChatSession:
        """Get or create chat session"""
        if self.session:
            return self.session
            
        # Try to load from Firestore
        session_data = await self.firestore_client.get_conversation(self.session_id)
        
        if session_data:
            self.session = ChatSession(**session_data)
        else:
            # Create new session
            self.session = ChatSession(
                session_id=self.session_id,
                skill_context=self._initialize_skill_context()
            )
            await self.firestore_client.store_conversation(self.session_id, self.session.dict())
        
        return self.session
    
    def _initialize_skill_context(self) -> Dict[str, Any]:
        """Initialize empty skill context"""
        return {
            "skill_type": None,
            "location": None,
            "detection_types": [],
            "schedule": None,
            "alerts_enabled": None,
            "actions": [],
            "confirmation_pending": False,
            "state": "greeting"  # greeting, gathering, confirming, complete
        }
    
    async def process_user_input(self, user_input: str, intent: Intent) -> BotResponse:
        """Process user input and generate response"""
        session = await self.get_session()
        context = session.skill_context or self._initialize_skill_context()
        
        # Update context based on intent
        self._update_context_from_intent(context, intent)
        
        # Determine response based on conversation state
        if context["state"] == "greeting":
            response = self._handle_greeting(intent, context)
        elif context["state"] == "gathering":
            response = self._handle_gathering(intent, context)
        elif context["state"] == "confirming":
            response = self._handle_confirmation(user_input, context)
        elif context["state"] == "complete":
            response = self._handle_complete(intent, context)
        else:
            response = self._handle_unknown_state(context)
        
        # Update session context
        session.skill_context = context
        session.updated_at = datetime.utcnow()
        await self.firestore_client.update_conversation(self.session_id, session.dict())
        
        return response
    
    def _update_context_from_intent(self, context: Dict[str, Any], intent: Intent):
        """Update skill context from extracted intent"""
        # Update locations
        if intent.entities.get("locations"):
            context["location"] = intent.entities["locations"][0]  # Take first location
        
        # Update detection types
        if intent.entities.get("detection_types"):
            context["detection_types"].extend(intent.entities["detection_types"])
            context["detection_types"] = list(set(context["detection_types"]))  # Deduplicate
        
        # Update schedule
        if intent.entities.get("times"):
            context["schedule"] = intent.entities["times"]
        
        # Update actions
        if intent.entities.get("actions"):
            context["actions"].extend(intent.entities["actions"])
            context["actions"] = list(set(context["actions"]))
        
        # Determine skill type if not set
        if not context["skill_type"]:
            context["skill_type"] = self._infer_skill_type(intent, context)
    
    def _infer_skill_type(self, intent: Intent, context: Dict[str, Any]) -> Optional[str]:
        """Infer skill type from intent and context"""
        detection_types = context.get("detection_types", [])
        location = context.get("location", "").lower() if context.get("location") else ""
        
        # Check for specific skill types
        if "package" in str(detection_types) or "delivery" in location:
            return SkillType.PACKAGE_DELIVERY
        elif "vehicle" in str(detection_types) or "parking" in location:
            return SkillType.VEHICLE_MONITORING
        elif "crowd" in str(detection_types) or len(detection_types) > 1:
            return SkillType.CROWD_DETECTION
        elif "perimeter" in location or "fence" in location:
            return SkillType.PERIMETER_SECURITY
        elif intent.type == IntentType.MONITOR and detection_types:
            return SkillType.CUSTOM
        
        return None
    
    def _handle_greeting(self, intent: Intent, context: Dict[str, Any]) -> BotResponse:
        """Handle initial greeting state"""
        if intent.type == IntentType.UNKNOWN:
            # Initial greeting
            context["state"] = "gathering"
            return BotResponse(
                content=self.flows.get_greeting(),
                suggested_actions=["Monitor loading dock", "Detect vehicles", "Watch for packages"]
            )
        else:
            # User provided initial intent
            context["state"] = "gathering"
            return self._handle_gathering(intent, context)
    
    def _handle_gathering(self, intent: Intent, context: Dict[str, Any]) -> BotResponse:
        """Handle information gathering state"""
        missing_info = self._get_missing_information(context)
        
        if missing_info:
            # Ask for missing information
            question = self.flows.get_clarification_question(missing_info[0], context)
            return BotResponse(
                content=question,
                suggested_actions=self._get_suggested_values(missing_info[0])
            )
        else:
            # All information gathered, move to confirmation
            context["state"] = "confirming"
            skill_preview = self.skill_builder.build_preview(context)
            
            return BotResponse(
                content=self.flows.get_confirmation_message(skill_preview),
                skill_preview=skill_preview,
                requires_confirmation=True,
                suggested_actions=["Yes, deploy this", "No, let me change something"]
            )
    
    def _handle_confirmation(self, user_input: str, context: Dict[str, Any]) -> BotResponse:
        """Handle confirmation state"""
        user_input_lower = user_input.lower()
        
        if any(word in user_input_lower for word in ["yes", "correct", "deploy", "confirm", "looks good"]):
            # User confirmed
            context["state"] = "complete"
            skill_config = self.skill_builder.build_skill_config(context)
            
            return BotResponse(
                content=self.flows.get_success_message(skill_config.name),
                skill_preview=skill_config.dict(),
                suggested_actions=["Deploy to cameras", "Create another skill", "View skill details"]
            )
        elif any(word in user_input_lower for word in ["no", "change", "modify", "different"]):
            # User wants changes
            context["state"] = "gathering"
            return BotResponse(
                content="What would you like to change?",
                suggested_actions=["Change location", "Change detection type", "Change schedule", "Change alerts"]
            )
        else:
            # Unclear response
            return BotResponse(
                content="I didn't understand. Would you like to deploy this skill as configured?",
                requires_confirmation=True,
                suggested_actions=["Yes", "No"]
            )
    
    def _handle_complete(self, intent: Intent, context: Dict[str, Any]) -> BotResponse:
        """Handle completed state"""
        return BotResponse(
            content="Your skill has been created! What would you like to do next?",
            suggested_actions=["Deploy to cameras", "Create another skill", "View all skills"]
        )
    
    def _handle_unknown_state(self, context: Dict[str, Any]) -> BotResponse:
        """Handle unknown state"""
        context["state"] = "greeting"
        return BotResponse(
            content="I'm sorry, I got a bit confused. Let's start over. What would you like your camera to do?",
            suggested_actions=["Monitor area", "Detect objects", "Set up alerts"]
        )
    
    def _get_missing_information(self, context: Dict[str, Any]) -> List[str]:
        """Determine what information is still needed"""
        missing = []
        
        if not context.get("location"):
            missing.append("location")
        
        if not context.get("detection_types"):
            missing.append("detection_types")
        
        if context.get("alerts_enabled") is None:
            missing.append("alerts")
        
        if not context.get("schedule"):
            missing.append("schedule")
        
        return missing
    
    def _get_suggested_values(self, info_type: str) -> List[str]:
        """Get suggested values for missing information"""
        suggestions = {
            "location": ["Loading dock", "Parking lot", "Front entrance", "Perimeter"],
            "detection_types": ["People", "Vehicles", "Packages", "Any motion"],
            "alerts": ["Alert me immediately", "Just record", "Alert during business hours"],
            "schedule": ["24/7", "Night only", "Business hours", "Weekends"]
        }
        return suggestions.get(info_type, [])
    
    async def add_turn(self, user_message: str, bot_response: str):
        """Add a conversation turn to the session"""
        session = await self.get_session()
        
        turn = ConversationTurn(
            user_message=user_message,
            bot_response=bot_response
        )
        
        session.conversation_history.append(turn)
        session.updated_at = datetime.utcnow()
        
        await self.firestore_client.update_conversation(self.session_id, session.dict())