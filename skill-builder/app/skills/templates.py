"""
Skill Templates - Pre-built skill configurations
"""

from typing import Dict, List, Optional
from app.models.schemas import (
    SkillTemplate, SkillConfig, SkillType, DetectionConfig, 
    DetectionType, ActionConfig, AlertConfig, TimeSchedule
)

class TemplateManager:
    """Manages pre-built skill templates"""
    
    def __init__(self):
        self.templates = self._initialize_templates()
    
    def _initialize_templates(self) -> Dict[str, SkillTemplate]:
        """Initialize pre-built templates"""
        templates = {}
        
        # Perimeter Security Template
        templates["perimeter_security"] = SkillTemplate(
            template_id="perimeter_security",
            name="Perimeter Security",
            description="Monitor perimeter for unauthorized access",
            category=SkillType.PERIMETER_SECURITY,
            base_config=SkillConfig(
                name="Perimeter Security",
                description="Monitor perimeter boundaries for unauthorized access",
                type=SkillType.PERIMETER_SECURITY,
                schedule=TimeSchedule(),
                detections=[
                    DetectionConfig(
                        type=DetectionType.PERSON,
                        confidence_threshold=0.8,
                        min_size=0.05
                    ),
                    DetectionConfig(
                        type=DetectionType.INTRUSION,
                        confidence_threshold=0.7
                    )
                ],
                actions=[
                    ActionConfig(
                        type="record",
                        parameters={"duration_seconds": 60, "quality": "high"}
                    ),
                    ActionConfig(
                        type="relay",
                        parameters={"relay_id": "1", "action": "on", "duration_seconds": 300}
                    ),
                    ActionConfig(
                        type="webhook",
                        parameters={"url": "${CLOUD_WEBHOOK_URL}", "include_snapshot": True}
                    )
                ],
                alerts=AlertConfig(enabled=True, priority="high", cooldown_minutes=2)
            ),
            customizable_fields=["schedule", "detection_zones", "alert_recipients"],
            example_phrases=[
                "Monitor the perimeter for intruders",
                "Watch the fence line 24/7",
                "Detect unauthorized access to the property"
            ]
        )
        
        # Package Delivery Template
        templates["package_delivery"] = SkillTemplate(
            template_id="package_delivery",
            name="Package Delivery Monitor",
            description="Monitor for package deliveries and notify when packages arrive",
            category=SkillType.PACKAGE_DELIVERY,
            base_config=SkillConfig(
                name="Package Delivery Monitor",
                description="Detect package deliveries and send notifications",
                type=SkillType.PACKAGE_DELIVERY,
                schedule=TimeSchedule(start_time="08:00", end_time="20:00"),
                detections=[
                    DetectionConfig(
                        type=DetectionType.PERSON,
                        confidence_threshold=0.7
                    ),
                    DetectionConfig(
                        type=DetectionType.PACKAGE,
                        confidence_threshold=0.6,
                        min_size=0.02,
                        max_size=0.3
                    )
                ],
                actions=[
                    ActionConfig(
                        type="record",
                        parameters={"duration_seconds": 30, "quality": "medium"}
                    ),
                    ActionConfig(
                        type="webhook",
                        parameters={"url": "${CLOUD_WEBHOOK_URL}", "include_snapshot": True}
                    )
                ],
                alerts=AlertConfig(enabled=True, priority="low", cooldown_minutes=10)
            ),
            customizable_fields=["schedule", "delivery_zones", "notification_method"],
            example_phrases=[
                "Watch for package deliveries",
                "Monitor the front door for packages",
                "Alert me when deliveries arrive"
            ]
        )
        
        # Vehicle Monitoring Template
        templates["vehicle_monitoring"] = SkillTemplate(
            template_id="vehicle_monitoring",
            name="Vehicle Monitoring",
            description="Monitor vehicle activity in parking areas",
            category=SkillType.VEHICLE_MONITORING,
            base_config=SkillConfig(
                name="Vehicle Monitoring",
                description="Track vehicle movements and parking violations",
                type=SkillType.VEHICLE_MONITORING,
                schedule=TimeSchedule(),
                detections=[
                    DetectionConfig(
                        type=DetectionType.VEHICLE,
                        confidence_threshold=0.8,
                        min_size=0.1
                    )
                ],
                actions=[
                    ActionConfig(
                        type="record",
                        parameters={"duration_seconds": 45, "quality": "high"}
                    ),
                    ActionConfig(
                        type="webhook",
                        parameters={"url": "${CLOUD_WEBHOOK_URL}", "include_snapshot": True}
                    )
                ],
                alerts=AlertConfig(enabled=True, priority="medium", cooldown_minutes=5)
            ),
            customizable_fields=["parking_zones", "violation_types", "schedule"],
            example_phrases=[
                "Monitor the parking lot for vehicles",
                "Watch for unauthorized parking",
                "Track vehicle movements"
            ]
        )
        
        # Crowd Detection Template
        templates["crowd_detection"] = SkillTemplate(
            template_id="crowd_detection",
            name="Crowd Detection",
            description="Monitor for crowd formation and density",
            category=SkillType.CROWD_DETECTION,
            base_config=SkillConfig(
                name="Crowd Detection",
                description="Detect crowd formation and monitor density levels",
                type=SkillType.CROWD_DETECTION,
                schedule=TimeSchedule(),
                detections=[
                    DetectionConfig(
                        type=DetectionType.PERSON,
                        confidence_threshold=0.7
                    )
                ],
                actions=[
                    ActionConfig(
                        type="record",
                        parameters={"duration_seconds": 60, "quality": "high"}
                    ),
                    ActionConfig(
                        type="webhook",
                        parameters={
                            "url": "${CLOUD_WEBHOOK_URL}", 
                            "include_snapshot": True,
                            "include_count": True
                        }
                    )
                ],
                alerts=AlertConfig(enabled=True, priority="medium", cooldown_minutes=3)
            ),
            customizable_fields=["crowd_threshold", "density_zones", "alert_levels"],
            example_phrases=[
                "Monitor for crowds forming",
                "Detect when too many people gather",
                "Watch crowd density levels"
            ]
        )
        
        # Safety Compliance Template
        templates["safety_compliance"] = SkillTemplate(
            template_id="safety_compliance",
            name="Safety Compliance",
            description="Monitor safety equipment usage and compliance",
            category=SkillType.SAFETY_COMPLIANCE,
            base_config=SkillConfig(
                name="Safety Compliance Monitor",
                description="Ensure safety equipment usage and compliance monitoring",
                type=SkillType.SAFETY_COMPLIANCE,
                schedule=TimeSchedule(start_time="06:00", end_time="22:00"),
                detections=[
                    DetectionConfig(
                        type=DetectionType.PERSON,
                        confidence_threshold=0.8
                    )
                ],
                actions=[
                    ActionConfig(
                        type="record",
                        parameters={"duration_seconds": 30, "quality": "high"}
                    ),
                    ActionConfig(
                        type="webhook",
                        parameters={
                            "url": "${CLOUD_WEBHOOK_URL}", 
                            "include_snapshot": True,
                            "compliance_check": True
                        }
                    )
                ],
                alerts=AlertConfig(enabled=True, priority="high", cooldown_minutes=1)
            ),
            customizable_fields=["safety_zones", "equipment_types", "compliance_rules"],
            example_phrases=[
                "Monitor hard hat compliance",
                "Check safety equipment usage",
                "Ensure workers wear protective gear"
            ]
        )
        
        return templates
    
    def list_templates(self) -> List[Dict]:
        """List all available templates"""
        return [
            {
                "template_id": template.template_id,
                "name": template.name,
                "description": template.description,
                "category": template.category,
                "customizable_fields": template.customizable_fields,
                "example_phrases": template.example_phrases
            }
            for template in self.templates.values()
        ]
    
    def get_template(self, template_id: str) -> Optional[Dict]:
        """Get a specific template"""
        template = self.templates.get(template_id)
        if not template:
            return None
        
        return {
            "template_id": template.template_id,
            "name": template.name,
            "description": template.description,
            "category": template.category,
            "base_config": template.base_config.dict(),
            "customizable_fields": template.customizable_fields,
            "example_phrases": template.example_phrases
        }
    
    def get_template_by_category(self, category: SkillType) -> Optional[SkillTemplate]:
        """Get template by category"""
        for template in self.templates.values():
            if template.category == category:
                return template
        return None
    
    def customize_template(self, template_id: str, customizations: Dict) -> Optional[SkillConfig]:
        """Customize a template with user-specific settings"""
        template = self.templates.get(template_id)
        if not template:
            return None
        
        # Start with base config
        config = template.base_config.copy(deep=True)
        
        # Apply customizations
        if "name" in customizations:
            config.name = customizations["name"]
        
        if "schedule" in customizations:
            # Parse schedule customization
            schedule_data = customizations["schedule"]
            if isinstance(schedule_data, dict):
                config.schedule = TimeSchedule(**schedule_data)
        
        if "detection_zones" in customizations:
            # Add zones to detections
            zones = customizations["detection_zones"]
            for detection in config.detections:
                detection.zones = zones
        
        if "alert_recipients" in customizations:
            config.alerts.recipients = customizations["alert_recipients"]
        
        return config