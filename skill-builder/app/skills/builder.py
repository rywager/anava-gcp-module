"""
Skill Builder - Creates skill configurations from conversation context
"""

from datetime import datetime
from typing import Dict, Any, List
import uuid

from app.models.schemas import (
    SkillConfig, SkillType, DetectionConfig, DetectionType,
    ActionConfig, AlertConfig, TimeSchedule
)

class SkillBuilder:
    """Builds skill configurations from conversation context"""
    
    def build_preview(self, context: Dict[str, Any]) -> Dict[str, Any]:
        """Build a preview of the skill for confirmation"""
        preview = {
            "name": self._generate_skill_name(context),
            "description": self._generate_description(context),
            "location": context.get("location", "Not specified"),
            "detections": self._format_detections(context),
            "schedule": self._format_schedule(context),
            "alerts": self._format_alerts(context),
            "actions": self._format_actions(context)
        }
        return preview
    
    def build_skill_config(self, context: Dict[str, Any]) -> SkillConfig:
        """Build complete skill configuration"""
        skill_id = str(uuid.uuid4())
        
        return SkillConfig(
            skill_id=skill_id,
            name=self._generate_skill_name(context),
            description=self._generate_description(context),
            type=context.get("skill_type", SkillType.CUSTOM),
            enabled=True,
            schedule=self._build_schedule(context),
            detections=self._build_detections(context),
            actions=self._build_actions(context),
            alerts=self._build_alerts(context),
            metadata={
                "created_via": "conversational_builder",
                "location": context.get("location"),
                "conversation_context": context
            }
        )
    
    def _generate_skill_name(self, context: Dict[str, Any]) -> str:
        """Generate a descriptive skill name"""
        location = context.get("location", "Area")
        skill_type = context.get("skill_type", "monitoring")
        
        if skill_type == SkillType.PACKAGE_DELIVERY:
            return f"{location} Package Detection"
        elif skill_type == SkillType.VEHICLE_MONITORING:
            return f"{location} Vehicle Monitoring"
        elif skill_type == SkillType.PERIMETER_SECURITY:
            return f"{location} Perimeter Security"
        elif skill_type == SkillType.CROWD_DETECTION:
            return f"{location} Crowd Monitoring"
        else:
            detection_types = context.get("detection_types", [])
            if detection_types:
                return f"{location} {detection_types[0].title()} Detection"
            return f"{location} Monitoring"
    
    def _generate_description(self, context: Dict[str, Any]) -> str:
        """Generate skill description"""
        location = context.get("location", "specified area")
        detections = context.get("detection_types", [])
        schedule = context.get("schedule", ["24/7"])
        
        detection_str = "activity"
        if detections:
            detection_str = ", ".join(d for d in detections)
        
        schedule_str = "continuously"
        if schedule and schedule[0] != "24/7":
            schedule_str = f"during {schedule[0]}"
        
        return f"Monitor {location} for {detection_str} {schedule_str}"
    
    def _format_detections(self, context: Dict[str, Any]) -> List[str]:
        """Format detection types for preview"""
        detection_types = context.get("detection_types", [])
        if not detection_types:
            return ["Motion detection"]
        return [d.replace("_", " ").title() for d in detection_types]
    
    def _format_schedule(self, context: Dict[str, Any]) -> str:
        """Format schedule for preview"""
        schedule = context.get("schedule", ["24/7"])
        if not schedule:
            return "24/7"
        
        schedule_str = schedule[0] if isinstance(schedule, list) else schedule
        
        # Convert common phrases
        if "night" in schedule_str.lower():
            return "Nighttime (8 PM - 6 AM)"
        elif "business hours" in schedule_str.lower():
            return "Business hours (8 AM - 6 PM)"
        elif "weekend" in schedule_str.lower():
            return "Weekends only"
        elif "24/7" in schedule_str:
            return "24/7 - Always active"
        else:
            return schedule_str
    
    def _format_alerts(self, context: Dict[str, Any]) -> str:
        """Format alert settings for preview"""
        if context.get("alerts_enabled") is False:
            return "Recording only (no alerts)"
        elif context.get("alerts_enabled") is True:
            return "Immediate alerts enabled"
        else:
            # Default based on context
            if context.get("actions") and "alert" in str(context["actions"]):
                return "Immediate alerts enabled"
            return "Smart alerts (based on priority)"
    
    def _format_actions(self, context: Dict[str, Any]) -> List[str]:
        """Format actions for preview"""
        actions = []
        
        # Always record
        actions.append("Record video")
        
        # Check for specific actions
        if context.get("actions"):
            for action in context["actions"]:
                if "light" in action.lower():
                    actions.append("Turn on lights")
                elif "siren" in action.lower() or "alarm" in action.lower():
                    actions.append("Sound alarm")
        
        # Add alerts if enabled
        if context.get("alerts_enabled") is not False:
            actions.append("Send notification")
        
        return actions
    
    def _build_schedule(self, context: Dict[str, Any]) -> TimeSchedule:
        """Build time schedule configuration"""
        schedule_info = context.get("schedule", ["24/7"])
        schedule_str = schedule_info[0] if isinstance(schedule_info, list) else schedule_info
        
        # Parse schedule string
        if "night" in schedule_str.lower():
            return TimeSchedule(
                start_time="20:00",
                end_time="06:00",
                days_of_week=list(range(7))
            )
        elif "business hours" in schedule_str.lower():
            return TimeSchedule(
                start_time="08:00",
                end_time="18:00",
                days_of_week=list(range(5))  # Monday to Friday
            )
        elif "weekend" in schedule_str.lower():
            return TimeSchedule(
                days_of_week=[5, 6]  # Saturday and Sunday
            )
        else:
            # Default 24/7
            return TimeSchedule()
    
    def _build_detections(self, context: Dict[str, Any]) -> List[DetectionConfig]:
        """Build detection configurations"""
        detection_types = context.get("detection_types", [])
        detections = []
        
        if not detection_types:
            # Default to motion detection
            detections.append(DetectionConfig(
                type=DetectionType.MOTION,
                confidence_threshold=0.6
            ))
        else:
            for det_type in detection_types:
                detection = DetectionConfig(
                    type=DetectionType(det_type),
                    confidence_threshold=0.7
                )
                
                # Add specific configurations based on type
                if det_type == DetectionType.PERSON:
                    detection.min_size = 0.05  # 5% of frame
                elif det_type == DetectionType.VEHICLE:
                    detection.min_size = 0.1   # 10% of frame
                elif det_type == DetectionType.PACKAGE:
                    detection.min_size = 0.02  # 2% of frame
                    detection.max_size = 0.3   # 30% of frame
                
                detections.append(detection)
        
        return detections
    
    def _build_actions(self, context: Dict[str, Any]) -> List[ActionConfig]:
        """Build action configurations"""
        actions = []
        
        # Always add recording
        actions.append(ActionConfig(
            type="record",
            parameters={
                "duration_seconds": 30,
                "pre_buffer_seconds": 5,
                "quality": "high"
            }
        ))
        
        # Add context-specific actions
        if context.get("actions"):
            for action in context["actions"]:
                if "light" in action.lower():
                    actions.append(ActionConfig(
                        type="relay",
                        parameters={
                            "relay_id": "1",
                            "action": "on",
                            "duration_seconds": 300  # 5 minutes
                        }
                    ))
                elif "siren" in action.lower() or "alarm" in action.lower():
                    actions.append(ActionConfig(
                        type="relay",
                        parameters={
                            "relay_id": "2",
                            "action": "pulse",
                            "duration_seconds": 60
                        }
                    ))
        
        # Add webhook for cloud integration
        actions.append(ActionConfig(
            type="webhook",
            parameters={
                "url": "${CLOUD_WEBHOOK_URL}",
                "method": "POST",
                "include_snapshot": True
            }
        ))
        
        return actions
    
    def _build_alerts(self, context: Dict[str, Any]) -> AlertConfig:
        """Build alert configuration"""
        alerts_enabled = context.get("alerts_enabled", True)
        
        if not alerts_enabled:
            return AlertConfig(enabled=False)
        
        # Determine priority based on skill type
        priority = "medium"
        if context.get("skill_type") == SkillType.PERIMETER_SECURITY:
            priority = "high"
        elif context.get("skill_type") == SkillType.PACKAGE_DELIVERY:
            priority = "low"
        
        return AlertConfig(
            enabled=True,
            methods=["push", "email"],
            cooldown_minutes=5,
            priority=priority
        )