"""
Natural Language Processing module for intent extraction and entity recognition
"""

import re
from typing import Dict, List, Tuple, Any, Optional
import spacy
from spacy.matcher import Matcher
import structlog

from app.models.schemas import Intent, IntentType, DetectionType

logger = structlog.get_logger()

class NLPProcessor:
    """Process natural language input to extract intents and entities"""
    
    def __init__(self):
        self.nlp = None
        self.matcher = None
        self.intent_patterns = {}
        self.entity_patterns = {}
        
    async def initialize(self):
        """Initialize NLP models and patterns"""
        # Load spaCy model
        self.nlp = spacy.load("en_core_web_sm")
        self.matcher = Matcher(self.nlp.vocab)
        
        # Initialize intent patterns
        self._setup_intent_patterns()
        
        # Initialize entity patterns
        self._setup_entity_patterns()
        
        logger.info("NLP processor initialized")
    
    def _setup_intent_patterns(self):
        """Setup patterns for intent recognition"""
        # Monitor intent patterns
        monitor_patterns = [
            [{"LOWER": {"IN": ["monitor", "watch", "observe", "track"]}}, {"POS": {"IN": ["NOUN", "PROPN"]}, "OP": "+"}],
            [{"LOWER": {"IN": ["keep", "need"]}}, {"LOWER": {"IN": ["eye", "watch", "track"]}}, {"LOWER": "on", "OP": "?"}, {"POS": "NOUN", "OP": "+"}],
            [{"LOWER": "monitor"}, {"LOWER": {"IN": ["for", "the"]}, "OP": "*"}, {"POS": "NOUN", "OP": "+"}]
        ]
        self.matcher.add("MONITOR", monitor_patterns)
        
        # Detect intent patterns
        detect_patterns = [
            [{"LOWER": {"IN": ["detect", "find", "identify", "spot", "recognize"]}}, {"POS": {"IN": ["NOUN", "PROPN"]}, "OP": "+"}],
            [{"LOWER": {"IN": ["look", "search"]}}, {"LOWER": "for"}, {"POS": "NOUN", "OP": "+"}],
            [{"LOWER": "when"}, {"POS": "NOUN", "OP": "+"}, {"LEMMA": {"IN": ["appear", "arrive", "enter", "show"]}}]
        ]
        self.matcher.add("DETECT", detect_patterns)
        
        # Alert intent patterns
        alert_patterns = [
            [{"LOWER": {"IN": ["alert", "notify", "tell", "inform", "message", "text", "email"]}}, {"LOWER": "me", "OP": "?"}],
            [{"LOWER": {"IN": ["send", "trigger"]}}, {"LOWER": {"IN": ["alert", "notification", "alarm"]}}, {"OP": "*"}],
            [{"LOWER": {"IN": ["immediately", "right", "instantly"]}, "OP": "?"}, {"LOWER": {"IN": ["alert", "notify"]}}]
        ]
        self.matcher.add("ALERT", alert_patterns)
        
        # Schedule intent patterns
        schedule_patterns = [
            [{"LOWER": {"IN": ["at", "during", "between", "from", "after", "before"]}}, {"LOWER": {"IN": ["night", "day", "morning", "evening", "hours"]}, "OP": "+"}],
            [{"LOWER": {"IN": ["business", "work", "office"]}}, {"LOWER": "hours"}],
            [{"POS": "NUM"}, {"LOWER": {"IN": ["am", "pm", "o'clock"]}}],
            [{"LOWER": {"IN": ["24/7", "always", "continuously", "round-the-clock"]}}]
        ]
        self.matcher.add("SCHEDULE", schedule_patterns)
        
        # Configure intent patterns
        configure_patterns = [
            [{"LOWER": {"IN": ["set", "configure", "setup", "change", "update", "modify"]}}, {"OP": "*"}],
            [{"LOWER": {"IN": ["turn", "switch"]}}, {"LOWER": {"IN": ["on", "off"]}}, {"OP": "*"}],
            [{"LOWER": {"IN": ["enable", "disable", "activate", "deactivate"]}}, {"OP": "*"}]
        ]
        self.matcher.add("CONFIGURE", configure_patterns)
    
    def _setup_entity_patterns(self):
        """Setup patterns for entity extraction"""
        # Location entities
        location_patterns = [
            [{"LOWER": {"IN": ["loading", "parking", "front", "back", "side", "main"]}}, {"LOWER": {"IN": ["dock", "lot", "door", "entrance", "gate", "area", "zone"]}}],
            [{"LOWER": {"IN": ["perimeter", "fence", "boundary", "property", "building", "warehouse", "office", "lobby", "hallway", "stairwell"]}}],
            [{"POS": "PROPN", "OP": "+"}, {"LOWER": {"IN": ["street", "road", "avenue", "building", "floor", "room"]}}]
        ]
        self.matcher.add("LOCATION", location_patterns)
        
        # Time entities
        time_patterns = [
            [{"LOWER": {"IN": ["night", "nighttime", "overnight", "evening", "morning", "afternoon", "dawn", "dusk"]}}],
            [{"LOWER": {"IN": ["business", "work", "office"]}}, {"LOWER": "hours"}],
            [{"TEXT": {"REGEX": r"\d{1,2}(:\d{2})?\s*(am|pm|AM|PM)"}}],
            [{"LOWER": {"IN": ["weekend", "weekday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]}}]
        ]
        self.matcher.add("TIME", time_patterns)
        
        # Object entities
        object_patterns = [
            [{"LOWER": {"IN": ["person", "people", "human", "individual", "visitor", "employee", "staff", "customer", "intruder", "stranger"]}}],
            [{"LOWER": {"IN": ["car", "vehicle", "truck", "van", "bus", "motorcycle", "bike", "bicycle"]}}],
            [{"LOWER": {"IN": ["package", "delivery", "box", "parcel", "mail", "shipment"]}}],
            [{"LOWER": {"IN": ["animal", "dog", "cat", "bird", "wildlife"]}}]
        ]
        self.matcher.add("OBJECT", object_patterns)
        
        # Action entities
        action_patterns = [
            [{"LOWER": {"IN": ["lights", "light", "floodlight", "spotlight"]}}, {"LOWER": {"IN": ["on", "off"]}, "OP": "?"}],
            [{"LOWER": {"IN": ["siren", "alarm", "horn"]}}, {"LOWER": {"IN": ["on", "off"]}, "OP": "?"}],
            [{"LOWER": {"IN": ["record", "recording", "save", "capture"]}}, {"LOWER": {"IN": ["video", "footage", "clip"]}, "OP": "?"}]
        ]
        self.matcher.add("ACTION", action_patterns)
    
    async def extract_intent(self, text: str) -> Intent:
        """Extract intent and entities from user text"""
        # Process text with spaCy
        doc = self.nlp(text.lower())
        
        # Find matches
        matches = self.matcher(doc)
        
        # Extract intent type
        intent_type = self._determine_intent_type(matches, doc)
        
        # Extract entities
        entities = self._extract_entities(doc, matches)
        
        # Calculate confidence
        confidence = self._calculate_confidence(intent_type, entities, matches)
        
        return Intent(
            type=intent_type,
            confidence=confidence,
            entities=entities,
            raw_text=text
        )
    
    def _determine_intent_type(self, matches: List[Tuple], doc) -> IntentType:
        """Determine the primary intent type from matches"""
        intent_counts = {}
        
        for match_id, start, end in matches:
            match_label = self.nlp.vocab.strings[match_id]
            if match_label in ["MONITOR", "DETECT", "ALERT", "SCHEDULE", "CONFIGURE"]:
                intent_counts[match_label] = intent_counts.get(match_label, 0) + 1
        
        if not intent_counts:
            # Fallback to keyword matching
            text = doc.text.lower()
            if any(word in text for word in ["monitor", "watch", "observe"]):
                return IntentType.MONITOR
            elif any(word in text for word in ["detect", "find", "identify"]):
                return IntentType.DETECT
            elif any(word in text for word in ["alert", "notify", "tell"]):
                return IntentType.ALERT
            elif any(word in text for word in ["schedule", "time", "when"]):
                return IntentType.SCHEDULE
            elif any(word in text for word in ["set", "configure", "enable"]):
                return IntentType.CONFIGURE
            else:
                return IntentType.UNKNOWN
        
        # Return the most common intent
        primary_intent = max(intent_counts, key=intent_counts.get)
        return IntentType(primary_intent.lower())
    
    def _extract_entities(self, doc, matches: List[Tuple]) -> Dict[str, Any]:
        """Extract entities from the document"""
        entities = {
            "locations": [],
            "times": [],
            "objects": [],
            "actions": [],
            "detection_types": []
        }
        
        # Extract from matches
        for match_id, start, end in matches:
            match_label = self.nlp.vocab.strings[match_id]
            span_text = doc[start:end].text
            
            if match_label == "LOCATION":
                entities["locations"].append(span_text)
            elif match_label == "TIME":
                entities["times"].append(span_text)
            elif match_label == "OBJECT":
                entities["objects"].append(span_text)
                # Map to detection type
                detection_type = self._map_to_detection_type(span_text)
                if detection_type:
                    entities["detection_types"].append(detection_type)
            elif match_label == "ACTION":
                entities["actions"].append(span_text)
        
        # Extract named entities
        for ent in doc.ents:
            if ent.label_ in ["GPE", "LOC", "FAC"]:
                entities["locations"].append(ent.text)
            elif ent.label_ in ["TIME", "DATE"]:
                entities["times"].append(ent.text)
        
        # Deduplicate
        for key in entities:
            entities[key] = list(set(entities[key]))
        
        return entities
    
    def _map_to_detection_type(self, object_text: str) -> Optional[str]:
        """Map object text to detection type"""
        object_lower = object_text.lower()
        
        if any(word in object_lower for word in ["person", "people", "human", "visitor", "employee", "intruder"]):
            return DetectionType.PERSON
        elif any(word in object_lower for word in ["car", "vehicle", "truck", "van"]):
            return DetectionType.VEHICLE
        elif any(word in object_lower for word in ["package", "delivery", "box", "parcel"]):
            return DetectionType.PACKAGE
        elif any(word in object_lower for word in ["animal", "dog", "cat"]):
            return DetectionType.ANIMAL
        elif "motion" in object_lower:
            return DetectionType.MOTION
        elif "loitering" in object_lower:
            return DetectionType.LOITERING
        elif "intrusion" in object_lower:
            return DetectionType.INTRUSION
        
        return None
    
    def _calculate_confidence(self, intent_type: IntentType, entities: Dict, matches: List) -> float:
        """Calculate confidence score for the extracted intent"""
        confidence = 0.5  # Base confidence
        
        # Boost for matched intent
        if intent_type != IntentType.UNKNOWN:
            confidence += 0.2
        
        # Boost for entities
        if entities["locations"]:
            confidence += 0.1
        if entities["objects"] or entities["detection_types"]:
            confidence += 0.1
        if entities["times"]:
            confidence += 0.05
        
        # Boost for number of matches
        if len(matches) > 0:
            confidence += min(0.05 * len(matches), 0.15)
        
        return min(confidence, 1.0)