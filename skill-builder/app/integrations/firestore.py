"""
Firestore integration for storing conversations and skills
"""

from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import structlog
from google.cloud import firestore
from app.config import Settings

logger = structlog.get_logger()

class FirestoreClient:
    """Firestore client for data persistence"""
    
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.db = None
        self.settings = Settings()
        # In-memory storage for mock mode
        self._mock_conversations = {}
        self._mock_skills = {}
        self._mock_deployments = []
    
    async def initialize(self):
        """Initialize Firestore client"""
        try:
            # Try to initialize Firestore client
            self.db = firestore.Client(project=self.project_id)
            logger.info("Firestore client initialized", project_id=self.project_id)
        except Exception as e:
            # In development/testing without credentials, use mock mode
            if "DefaultCredentialsError" in str(type(e).__name__):
                logger.warning("Running in mock mode - no Firestore credentials found", error=str(e))
                self.db = None  # Will use in-memory storage
            else:
                logger.error("Failed to initialize Firestore", error=str(e))
                raise
    
    async def close(self):
        """Close Firestore client"""
        if self.db:
            self.db.close()
            logger.info("Firestore client closed")
    
    # Conversation Management
    async def store_conversation(self, session_id: str, conversation_data: Dict) -> None:
        """Store conversation session"""
        if self.db is None:
            # Mock mode
            conversation_data["updated_at"] = datetime.utcnow()
            self._mock_conversations[session_id] = conversation_data
            logger.info("Conversation stored (mock)", session_id=session_id)
            return
            
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_conversations).document(session_id)
            conversation_data["updated_at"] = datetime.utcnow()
            doc_ref.set(conversation_data)
            
            logger.info("Conversation stored", session_id=session_id)
        except Exception as e:
            logger.error("Failed to store conversation", session_id=session_id, error=str(e))
            raise
    
    async def get_conversation(self, session_id: str) -> Optional[Dict]:
        """Get conversation session"""
        if self.db is None:
            # Mock mode
            data = self._mock_conversations.get(session_id)
            if data:
                logger.info("Conversation retrieved (mock)", session_id=session_id)
                return data
            else:
                logger.info("Conversation not found (mock)", session_id=session_id)
                return None
                
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_conversations).document(session_id)
            doc = doc_ref.get()
            
            if doc.exists:
                data = doc.to_dict()
                logger.info("Conversation retrieved", session_id=session_id)
                return data
            else:
                logger.info("Conversation not found", session_id=session_id)
                return None
                
        except Exception as e:
            logger.error("Failed to get conversation", session_id=session_id, error=str(e))
            raise
    
    async def update_conversation(self, session_id: str, conversation_data: Dict) -> None:
        """Update conversation session"""
        if self.db is None:
            # Mock mode
            conversation_data["updated_at"] = datetime.utcnow()
            self._mock_conversations[session_id] = conversation_data
            logger.info("Conversation updated (mock)", session_id=session_id)
            return
            
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_conversations).document(session_id)
            conversation_data["updated_at"] = datetime.utcnow()
            doc_ref.update(conversation_data)
            
            logger.info("Conversation updated", session_id=session_id)
        except Exception as e:
            logger.error("Failed to update conversation", session_id=session_id, error=str(e))
            raise
    
    async def list_conversations(self, limit: int = 50) -> List[Dict]:
        """List recent conversations"""
        try:
            docs = (self.db.collection(self.settings.firestore_collection_conversations)
                   .order_by("updated_at", direction=firestore.Query.DESCENDING)
                   .limit(limit)
                   .stream())
            
            conversations = []
            for doc in docs:
                data = doc.to_dict()
                data["session_id"] = doc.id
                conversations.append(data)
            
            logger.info("Conversations listed", count=len(conversations))
            return conversations
            
        except Exception as e:
            logger.error("Failed to list conversations", error=str(e))
            raise
    
    # Skill Management
    async def store_skill(self, session_id: str, skill_config: Dict) -> None:
        """Store generated skill"""
        skill_id = skill_config.get("skill_id")
        if not skill_id:
            raise ValueError("Skill ID is required")
        
        skill_data = {
            **skill_config,
            "session_id": session_id,
            "created_at": datetime.utcnow(),
            "status": "created"
        }
        
        if self.db is None:
            # Mock mode
            self._mock_skills[skill_id] = skill_data
            logger.info("Skill stored (mock)", skill_id=skill_id, session_id=session_id)
            return
            
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_skills).document(skill_id)
            doc_ref.set(skill_data)
            
            logger.info("Skill stored", skill_id=skill_id, session_id=session_id)
        except Exception as e:
            logger.error("Failed to store skill", session_id=session_id, error=str(e))
            raise
    
    async def get_skill(self, skill_id: str) -> Optional[Dict]:
        """Get skill by ID"""
        if self.db is None:
            # Mock mode
            data = self._mock_skills.get(skill_id)
            if data:
                logger.info("Skill retrieved (mock)", skill_id=skill_id)
                return data
            else:
                logger.info("Skill not found (mock)", skill_id=skill_id)
                return None
                
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_skills).document(skill_id)
            doc = doc_ref.get()
            
            if doc.exists:
                data = doc.to_dict()
                logger.info("Skill retrieved", skill_id=skill_id)
                return data
            else:
                logger.info("Skill not found", skill_id=skill_id)
                return None
                
        except Exception as e:
            logger.error("Failed to get skill", skill_id=skill_id, error=str(e))
            raise
    
    async def list_skills(self, session_id: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """List skills, optionally filtered by session"""
        try:
            query = self.db.collection(self.settings.firestore_collection_skills)
            
            if session_id:
                query = query.where("session_id", "==", session_id)
            
            docs = (query.order_by("created_at", direction=firestore.Query.DESCENDING)
                   .limit(limit)
                   .stream())
            
            skills = []
            for doc in docs:
                data = doc.to_dict()
                data["skill_id"] = doc.id
                skills.append(data)
            
            logger.info("Skills listed", count=len(skills), session_id=session_id)
            return skills
            
        except Exception as e:
            logger.error("Failed to list skills", session_id=session_id, error=str(e))
            raise
    
    async def update_skill_status(self, skill_id: str, status: str, metadata: Optional[Dict] = None) -> None:
        """Update skill status"""
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_skills).document(skill_id)
            update_data = {
                "status": status,
                "updated_at": datetime.utcnow()
            }
            
            if metadata:
                update_data["metadata"] = firestore.firestore.ArrayUnion([metadata])
            
            doc_ref.update(update_data)
            
            logger.info("Skill status updated", skill_id=skill_id, status=status)
        except Exception as e:
            logger.error("Failed to update skill status", skill_id=skill_id, error=str(e))
            raise
    
    # Deployment Management
    async def store_deployment(self, skill_id: str, camera_ids: List[str], deployment_result: Dict) -> None:
        """Store deployment record"""
        deployment_data = {
            "skill_id": skill_id,
            "camera_ids": camera_ids,
            "deployment_result": deployment_result,
            "created_at": datetime.utcnow(),
            "status": deployment_result.get("status", "unknown")
        }
        
        if self.db is None:
            # Mock mode
            import uuid
            deployment_id = str(uuid.uuid4())
            deployment_data["deployment_id"] = deployment_id
            self._mock_deployments.append(deployment_data)
            logger.info("Deployment stored (mock)", deployment_id=deployment_id, skill_id=skill_id)
            return
            
        try:
            doc_ref = self.db.collection(self.settings.firestore_collection_deployments).document()
            doc_ref.set(deployment_data)
            
            deployment_id = doc_ref.id
            logger.info("Deployment stored", deployment_id=deployment_id, skill_id=skill_id)
            
        except Exception as e:
            logger.error("Failed to store deployment", skill_id=skill_id, error=str(e))
            raise
    
    async def get_deployments(self, skill_id: Optional[str] = None, limit: int = 50) -> List[Dict]:
        """Get deployment history"""
        try:
            query = self.db.collection(self.settings.firestore_collection_deployments)
            
            if skill_id:
                query = query.where("skill_id", "==", skill_id)
            
            docs = (query.order_by("created_at", direction=firestore.Query.DESCENDING)
                   .limit(limit)
                   .stream())
            
            deployments = []
            for doc in docs:
                data = doc.to_dict()
                data["deployment_id"] = doc.id
                deployments.append(data)
            
            logger.info("Deployments retrieved", count=len(deployments), skill_id=skill_id)
            return deployments
            
        except Exception as e:
            logger.error("Failed to get deployments", skill_id=skill_id, error=str(e))
            raise
    
    # Analytics and Search
    async def get_conversation_analytics(self, days: int = 30) -> Dict[str, Any]:
        """Get conversation analytics for the past N days"""
        try:
            start_date = datetime.utcnow().replace(
                hour=0, minute=0, second=0, microsecond=0
            ) - timedelta(days=days)
            
            # Get conversations in date range
            docs = (self.db.collection(self.settings.firestore_collection_conversations)
                   .where("created_at", ">=", start_date)
                   .stream())
            
            total_conversations = 0
            completed_skills = 0
            avg_turns = 0
            total_turns = 0
            
            for doc in docs:
                data = doc.to_dict()
                total_conversations += 1
                
                history = data.get("conversation_history", [])
                total_turns += len(history)
                
                if data.get("skill_context", {}).get("state") == "complete":
                    completed_skills += 1
            
            if total_conversations > 0:
                avg_turns = total_turns / total_conversations
            
            analytics = {
                "period_days": days,
                "total_conversations": total_conversations,
                "completed_skills": completed_skills,
                "completion_rate": completed_skills / total_conversations if total_conversations > 0 else 0,
                "average_turns_per_conversation": avg_turns,
                "generated_at": datetime.utcnow()
            }
            
            logger.info("Analytics generated", analytics=analytics)
            return analytics
            
        except Exception as e:
            logger.error("Failed to get analytics", error=str(e))
            raise