"""
Skill Generator - Generates skills from conversation history
"""

from typing import List
import structlog

from app.models.schemas import ConversationTurn, SkillConfig
from app.skills.builder import SkillBuilder
from app.nlp.processor import NLPProcessor

logger = structlog.get_logger()

class SkillGenerator:
    """Generates skill configurations from conversation history"""
    
    def __init__(self):
        self.builder = SkillBuilder()
        self.nlp_processor = NLPProcessor()
    
    async def generate_from_conversation(self, conversation_history: List[ConversationTurn]) -> SkillConfig:
        """Generate a skill configuration from conversation history"""
        # Analyze conversation to extract requirements
        aggregated_context = await self._analyze_conversation(conversation_history)
        
        # Build skill configuration
        skill_config = self.builder.build_skill_config(aggregated_context)
        
        logger.info("Generated skill from conversation", 
                   skill_id=skill_config.skill_id,
                   skill_name=skill_config.name)
        
        return skill_config
    
    async def _analyze_conversation(self, conversation_history: List[ConversationTurn]) -> dict:
        """Analyze conversation history to extract requirements"""
        context = {
            "skill_type": None,
            "location": None,
            "detection_types": [],
            "schedule": [],
            "alerts_enabled": None,
            "actions": [],
            "state": "complete"
        }
        
        # Process each user message to extract information
        for turn in conversation_history:
            if turn.user_message:
                # Extract intent and entities from user message
                intent = await self.nlp_processor.extract_intent(turn.user_message)
                
                # Merge entities into context
                if intent.entities.get("locations"):
                    if not context["location"]:
                        context["location"] = intent.entities["locations"][0]
                
                if intent.entities.get("detection_types"):
                    context["detection_types"].extend(intent.entities["detection_types"])
                
                if intent.entities.get("times"):
                    context["schedule"].extend(intent.entities["times"])
                
                if intent.entities.get("actions"):
                    context["actions"].extend(intent.entities["actions"])
                
                # Check for alert preferences
                if any(word in turn.user_message.lower() for word in ["alert", "notify", "tell me"]):
                    context["alerts_enabled"] = True
                elif any(word in turn.user_message.lower() for word in ["no alert", "just record", "don't notify"]):
                    context["alerts_enabled"] = False
        
        # Deduplicate lists
        context["detection_types"] = list(set(context["detection_types"]))
        context["schedule"] = list(set(context["schedule"]))
        context["actions"] = list(set(context["actions"]))
        
        # Infer skill type if not determined
        if not context["skill_type"]:
            context["skill_type"] = self._infer_skill_type_from_context(context)
        
        # Set defaults if nothing specified
        if not context["detection_types"]:
            context["detection_types"] = ["motion"]
        
        if not context["schedule"]:
            context["schedule"] = ["24/7"]
        
        if context["alerts_enabled"] is None:
            context["alerts_enabled"] = True
        
        return context
    
    def _infer_skill_type_from_context(self, context: dict) -> str:
        """Infer skill type from aggregated context"""
        detection_types = context.get("detection_types", [])
        location = context.get("location", "").lower() if context.get("location") else ""
        
        # Check for specific patterns
        if "package" in str(detection_types) or "delivery" in location:
            return "package_delivery"
        elif "vehicle" in str(detection_types) or "parking" in location:
            return "vehicle_monitoring"
        elif "perimeter" in location or "fence" in location:
            return "perimeter_security"
        elif len(detection_types) > 1:
            return "crowd_detection"
        else:
            return "custom"