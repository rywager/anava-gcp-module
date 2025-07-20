"""
Conversation flow templates and responses
"""

from typing import Dict, Any, List
import random

class ConversationFlows:
    """Manages conversation flow templates and responses"""
    
    def __init__(self):
        self.greetings = [
            "Hi! I'll help you set up your camera. What would you like it to watch for?",
            "Hello! Let's configure your camera together. What do you need to monitor?",
            "Welcome! I'm here to help you create a custom camera skill. What should your camera keep an eye on?",
            "Hi there! Tell me what you'd like your camera to do, and I'll help set it up."
        ]
        
        self.clarification_templates = {
            "location": [
                "Where should the camera monitor? For example: loading dock, parking lot, or front entrance.",
                "Which area do you want to watch? You can specify locations like perimeter, lobby, or warehouse.",
                "What location should I configure for monitoring?"
            ],
            "detection_types": [
                "What should the camera detect? For example: people, vehicles, packages, or any motion.",
                "What type of activity are you interested in? I can detect people, vehicles, animals, or general motion.",
                "What specifically should trigger the detection? People, cars, deliveries, or something else?"
            ],
            "alerts": [
                "How should I notify you? Would you like immediate alerts, or just record the events?",
                "Do you want to receive alerts when something is detected?",
                "Should I send you notifications, or would you prefer to just save the recordings?"
            ],
            "schedule": [
                "When should this skill be active? For example: 24/7, only at night, or during specific hours.",
                "What times should the camera monitor? You can say things like 'after business hours' or 'weekends only'.",
                "Should this run all the time, or only during certain hours?"
            ]
        }
        
        self.confirmation_templates = [
            "Perfect! I've configured a skill with the following settings:\n\n{details}\n\nDoes this look correct?",
            "Great! Here's what I've set up:\n\n{details}\n\nShall I save this configuration?",
            "I've created a skill based on your requirements:\n\n{details}\n\nWould you like to deploy this?"
        ]
        
        self.success_templates = [
            "Excellent! Your '{name}' skill has been created and is ready to deploy.",
            "All set! The '{name}' skill is configured and ready to go.",
            "Success! Your camera skill '{name}' has been created."
        ]
    
    def get_greeting(self) -> str:
        """Get a random greeting message"""
        return random.choice(self.greetings)
    
    def get_clarification_question(self, info_type: str, context: Dict[str, Any]) -> str:
        """Get a clarification question for missing information"""
        templates = self.clarification_templates.get(info_type, ["Could you provide more details about that?"])
        base_question = random.choice(templates)
        
        # Add context-aware hints
        if info_type == "location" and context.get("skill_type"):
            base_question += f" Since you're setting up {context['skill_type'].replace('_', ' ')}, common locations include specific areas or zones."
        
        return base_question
    
    def get_confirmation_message(self, skill_preview: Dict[str, Any]) -> str:
        """Generate confirmation message with skill details"""
        details = self._format_skill_details(skill_preview)
        template = random.choice(self.confirmation_templates)
        return template.format(details=details)
    
    def get_success_message(self, skill_name: str) -> str:
        """Get success message after skill creation"""
        template = random.choice(self.success_templates)
        return template.format(name=skill_name)
    
    def _format_skill_details(self, skill_preview: Dict[str, Any]) -> str:
        """Format skill details for display"""
        lines = []
        
        if skill_preview.get("name"):
            lines.append(f"**Name:** {skill_preview['name']}")
        
        if skill_preview.get("description"):
            lines.append(f"**Description:** {skill_preview['description']}")
        
        if skill_preview.get("location"):
            lines.append(f"**Location:** {skill_preview['location']}")
        
        if skill_preview.get("detections"):
            detections = ", ".join(skill_preview["detections"])
            lines.append(f"**Detects:** {detections}")
        
        if skill_preview.get("schedule"):
            lines.append(f"**Active:** {skill_preview['schedule']}")
        
        if skill_preview.get("alerts"):
            lines.append(f"**Alerts:** {skill_preview['alerts']}")
        
        if skill_preview.get("actions"):
            actions = ", ".join(skill_preview["actions"])
            lines.append(f"**Actions:** {actions}")
        
        return "\n".join(lines)
    
    def get_error_response(self, error_type: str = "general") -> str:
        """Get error response message"""
        error_responses = {
            "general": "I'm sorry, I encountered an error. Could you please try again?",
            "understanding": "I didn't quite understand that. Could you rephrase what you'd like the camera to do?",
            "missing_info": "I need a bit more information to create this skill. Let me ask you a few questions.",
            "invalid_input": "That doesn't seem to be a valid option. Please choose from the suggested actions or describe what you need."
        }
        return error_responses.get(error_type, error_responses["general"])