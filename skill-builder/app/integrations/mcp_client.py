"""
MCP Client for deploying skills to cameras via the MCP server
"""

from typing import Dict, List, Any, Optional
import json
import structlog
import aiohttp
from app.models.schemas import SkillConfig

logger = structlog.get_logger()

class MCPDeploymentResult:
    """Result of MCP deployment"""
    def __init__(self, deployment_id: str, deployed_cameras: List[str], failed_cameras: List[Dict] = None):
        self.deployment_id = deployment_id
        self.deployed_cameras = deployed_cameras
        self.failed_cameras = failed_cameras or []

class MCPClient:
    """Client for communicating with the MCP server"""
    
    def __init__(self, mcp_server_url: str):
        self.mcp_server_url = mcp_server_url.rstrip('/')
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create HTTP session"""
        if not self.session:
            self.session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=30)
            )
        return self.session
    
    async def close(self):
        """Close HTTP session"""
        if self.session:
            await self.session.close()
            self.session = None
    
    async def deploy_skill(self, skill_config: SkillConfig, camera_ids: List[str]) -> MCPDeploymentResult:
        """Deploy a skill to specified cameras via MCP server"""
        try:
            session = await self._get_session()
            
            # Prepare deployment payload
            payload = {
                "skill_config": skill_config.dict(),
                "camera_ids": camera_ids,
                "deployment_type": "skill_configuration",
                "activate_immediately": True
            }
            
            # Send to MCP server
            url = f"{self.mcp_server_url}/api/cameras/deploy-skill"
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    
                    deployment_result = MCPDeploymentResult(
                        deployment_id=result.get("deployment_id"),
                        deployed_cameras=result.get("deployed_cameras", []),
                        failed_cameras=result.get("failed_cameras", [])
                    )
                    
                    logger.info("Skill deployed via MCP", 
                               skill_id=skill_config.skill_id,
                               deployed_count=len(deployment_result.deployed_cameras),
                               failed_count=len(deployment_result.failed_cameras))
                    
                    return deployment_result
                else:
                    error_text = await response.text()
                    logger.error("MCP deployment failed", 
                               status=response.status, 
                               error=error_text)
                    raise Exception(f"MCP deployment failed: {error_text}")
                    
        except Exception as e:
            logger.error("Error deploying skill via MCP", 
                        skill_id=skill_config.skill_id, 
                        error=str(e))
            raise
    
    async def get_camera_list(self) -> List[Dict]:
        """Get list of available cameras from MCP server"""
        try:
            session = await self._get_session()
            url = f"{self.mcp_server_url}/api/cameras/list"
            
            async with session.get(url) as response:
                if response.status == 200:
                    cameras = await response.json()
                    logger.info("Retrieved camera list", count=len(cameras))
                    return cameras
                else:
                    error_text = await response.text()
                    logger.error("Failed to get camera list", 
                               status=response.status, 
                               error=error_text)
                    return []
                    
        except Exception as e:
            logger.error("Error getting camera list", error=str(e))
            return []
    
    async def get_camera_status(self, camera_id: str) -> Optional[Dict]:
        """Get status of a specific camera"""
        try:
            session = await self._get_session()
            url = f"{self.mcp_server_url}/api/cameras/{camera_id}/status"
            
            async with session.get(url) as response:
                if response.status == 200:
                    status = await response.json()
                    logger.info("Retrieved camera status", camera_id=camera_id)
                    return status
                else:
                    logger.warning("Camera status not available", 
                                 camera_id=camera_id, 
                                 status=response.status)
                    return None
                    
        except Exception as e:
            logger.error("Error getting camera status", 
                        camera_id=camera_id, 
                        error=str(e))
            return None
    
    async def get_deployment_status(self, deployment_id: str) -> Optional[Dict]:
        """Get status of a deployment"""
        try:
            session = await self._get_session()
            url = f"{self.mcp_server_url}/api/deployments/{deployment_id}/status"
            
            async with session.get(url) as response:
                if response.status == 200:
                    status = await response.json()
                    logger.info("Retrieved deployment status", deployment_id=deployment_id)
                    return status
                else:
                    logger.warning("Deployment status not available", 
                                 deployment_id=deployment_id, 
                                 status=response.status)
                    return None
                    
        except Exception as e:
            logger.error("Error getting deployment status", 
                        deployment_id=deployment_id, 
                        error=str(e))
            return None
    
    async def send_camera_command(self, camera_id: str, command: str, parameters: Dict = None) -> bool:
        """Send a command to a camera via MCP"""
        try:
            session = await self._get_session()
            
            payload = {
                "command": command,
                "parameters": parameters or {}
            }
            
            url = f"{self.mcp_server_url}/api/cameras/{camera_id}/command"
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    logger.info("Camera command sent", 
                               camera_id=camera_id, 
                               command=command)
                    return True
                else:
                    error_text = await response.text()
                    logger.error("Camera command failed", 
                               camera_id=camera_id, 
                               command=command,
                               error=error_text)
                    return False
                    
        except Exception as e:
            logger.error("Error sending camera command", 
                        camera_id=camera_id, 
                        command=command, 
                        error=str(e))
            return False
    
    async def query_camera(self, camera_id: str, question: str) -> Optional[str]:
        """Send a natural language query to a camera via MCP"""
        try:
            session = await self._get_session()
            
            payload = {
                "question": question,
                "include_context": True
            }
            
            url = f"{self.mcp_server_url}/api/cameras/{camera_id}/query"
            
            async with session.post(url, json=payload) as response:
                if response.status == 200:
                    result = await response.json()
                    answer = result.get("answer", "")
                    
                    logger.info("Camera query successful", 
                               camera_id=camera_id, 
                               question=question[:50])
                    return answer
                else:
                    error_text = await response.text()
                    logger.error("Camera query failed", 
                               camera_id=camera_id, 
                               error=error_text)
                    return None
                    
        except Exception as e:
            logger.error("Error querying camera", 
                        camera_id=camera_id, 
                        error=str(e))
            return None
    
    async def test_connection(self) -> bool:
        """Test connection to MCP server"""
        try:
            session = await self._get_session()
            url = f"{self.mcp_server_url}/health"
            
            async with session.get(url) as response:
                if response.status == 200:
                    logger.info("MCP server connection successful")
                    return True
                else:
                    logger.warning("MCP server not responding", status=response.status)
                    return False
                    
        except Exception as e:
            logger.error("MCP server connection failed", error=str(e))
            return False