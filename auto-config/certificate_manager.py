#!/usr/bin/env python3
"""
Certificate Management System for Anava Vision
Handles SSL/TLS certificates for secure connections
"""

import asyncio
import ssl
import socket
import logging
import json
import time
import os
from pathlib import Path
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from cryptography import x509
from cryptography.x509.oid import NameOID, ExtensionOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.backends import default_backend
import datetime
import aiofiles
import certifi
from urllib.parse import urlparse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class Certificate:
    """SSL Certificate information"""
    subject: str
    issuer: str
    serial_number: str
    not_before: datetime.datetime
    not_after: datetime.datetime
    fingerprint: str
    is_self_signed: bool
    is_valid: bool
    validation_errors: List[str]
    san_names: List[str]  # Subject Alternative Names
    key_usage: List[str]
    
    def to_dict(self):
        return {
            'subject': self.subject,
            'issuer': self.issuer,
            'serial_number': self.serial_number,
            'not_before': self.not_before.isoformat(),
            'not_after': self.not_after.isoformat(),
            'fingerprint': self.fingerprint,
            'is_self_signed': self.is_self_signed,
            'is_valid': self.is_valid,
            'validation_errors': self.validation_errors,
            'san_names': self.san_names,
            'key_usage': self.key_usage,
            'days_until_expiry': (self.not_after - datetime.datetime.utcnow()).days
        }


class CertificateManager:
    """Manages SSL/TLS certificates for Anava Vision"""
    
    def __init__(self, cert_dir: str = './certificates'):
        self.cert_dir = Path(cert_dir)
        self.cert_dir.mkdir(exist_ok=True)
        self.trusted_certs: Dict[str, Certificate] = {}
        self.ca_bundle_path = certifi.where()
        
    async def scan_camera_certificates(self, cameras: List[Dict]) -> Dict[str, Certificate]:
        """Scan all cameras for SSL certificates"""
        cert_info = {}
        
        for camera in cameras:
            camera_ip = camera['ip']
            logger.info(f"Scanning certificate for {camera_ip}")
            
            # Check HTTPS port
            cert = await self.get_server_certificate(camera_ip, 443)
            if cert:
                cert_info[camera_ip] = cert
                
                # Save certificate if self-signed
                if cert.is_self_signed:
                    await self.save_certificate(camera_ip, cert)
        
        return cert_info
    
    async def get_server_certificate(self, host: str, port: int = 443) -> Optional[Certificate]:
        """Get SSL certificate from server"""
        try:
            # Create SSL context
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            
            # Get certificate
            with socket.create_connection((host, port), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    der_cert = ssock.getpeercert_bin()
                    pem_cert = ssl.DER_cert_to_PEM_cert(der_cert)
                    
                    # Parse certificate
                    cert = x509.load_pem_x509_certificate(
                        pem_cert.encode(),
                        default_backend()
                    )
                    
                    return self._parse_certificate(cert, host)
                    
        except Exception as e:
            logger.error(f"Failed to get certificate from {host}:{port}: {e}")
            return None
    
    def _parse_certificate(self, cert: x509.Certificate, host: str) -> Certificate:
        """Parse X.509 certificate"""
        # Extract subject
        subject = cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
        
        # Extract issuer
        issuer = cert.issuer.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value
        
        # Check if self-signed
        is_self_signed = cert.subject == cert.issuer
        
        # Get fingerprint
        fingerprint = cert.fingerprint(hashes.SHA256()).hex()
        
        # Get SAN names
        san_names = []
        try:
            san_ext = cert.extensions.get_extension_for_oid(
                ExtensionOID.SUBJECT_ALTERNATIVE_NAME
            )
            san_names = [name.value for name in san_ext.value]
        except:
            pass
        
        # Get key usage
        key_usage = []
        try:
            ku_ext = cert.extensions.get_extension_for_oid(
                ExtensionOID.KEY_USAGE
            )
            ku = ku_ext.value
            if ku.digital_signature:
                key_usage.append('Digital Signature')
            if ku.key_encipherment:
                key_usage.append('Key Encipherment')
            if ku.key_agreement:
                key_usage.append('Key Agreement')
        except:
            pass
        
        # Validate certificate
        validation_errors = []
        is_valid = True
        
        # Check expiration
        now = datetime.datetime.utcnow()
        if now < cert.not_valid_before:
            validation_errors.append("Certificate not yet valid")
            is_valid = False
        if now > cert.not_valid_after:
            validation_errors.append("Certificate expired")
            is_valid = False
        
        # Check hostname
        if host not in san_names and host != subject:
            validation_errors.append(f"Hostname {host} not in certificate")
            is_valid = False
        
        return Certificate(
            subject=subject,
            issuer=issuer,
            serial_number=str(cert.serial_number),
            not_before=cert.not_valid_before,
            not_after=cert.not_valid_after,
            fingerprint=fingerprint,
            is_self_signed=is_self_signed,
            is_valid=is_valid,
            validation_errors=validation_errors,
            san_names=san_names,
            key_usage=key_usage
        )
    
    async def save_certificate(self, host: str, cert: Certificate):
        """Save certificate to disk"""
        cert_path = self.cert_dir / f"{host}.crt"
        
        try:
            # Get the actual certificate
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
            
            with socket.create_connection((host, 443), timeout=5) as sock:
                with context.wrap_socket(sock, server_hostname=host) as ssock:
                    der_cert = ssock.getpeercert_bin()
                    pem_cert = ssl.DER_cert_to_PEM_cert(der_cert)
                    
                    async with aiofiles.open(cert_path, 'w') as f:
                        await f.write(pem_cert)
                    
                    logger.info(f"Saved certificate for {host} to {cert_path}")
                    
        except Exception as e:
            logger.error(f"Failed to save certificate for {host}: {e}")
    
    async def generate_self_signed_certificate(self, hostname: str, 
                                             ip_addresses: List[str] = None) -> Tuple[str, str]:
        """Generate self-signed certificate for local use"""
        # Generate private key
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=2048,
            backend=default_backend()
        )
        
        # Certificate details
        subject = issuer = x509.Name([
            x509.NameAttribute(NameOID.COUNTRY_NAME, "US"),
            x509.NameAttribute(NameOID.STATE_OR_PROVINCE_NAME, "California"),
            x509.NameAttribute(NameOID.LOCALITY_NAME, "San Francisco"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Anava Vision"),
            x509.NameAttribute(NameOID.COMMON_NAME, hostname),
        ])
        
        # Create certificate
        builder = x509.CertificateBuilder()
        builder = builder.subject_name(subject)
        builder = builder.issuer_name(issuer)
        builder = builder.public_key(private_key.public_key())
        builder = builder.serial_number(x509.random_serial_number())
        builder = builder.not_valid_before(datetime.datetime.utcnow())
        builder = builder.not_valid_after(
            datetime.datetime.utcnow() + datetime.timedelta(days=365)
        )
        
        # Add extensions
        san_list = [x509.DNSName(hostname)]
        if ip_addresses:
            for ip in ip_addresses:
                san_list.append(x509.IPAddress(ipaddress.ip_address(ip)))
        
        builder = builder.add_extension(
            x509.SubjectAlternativeName(san_list),
            critical=False,
        )
        
        builder = builder.add_extension(
            x509.BasicConstraints(ca=False, path_length=None),
            critical=True,
        )
        
        builder = builder.add_extension(
            x509.KeyUsage(
                digital_signature=True,
                key_encipherment=True,
                content_commitment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        
        # Sign certificate
        certificate = builder.sign(private_key, hashes.SHA256(), default_backend())
        
        # Save certificate and key
        cert_path = self.cert_dir / f"{hostname}.crt"
        key_path = self.cert_dir / f"{hostname}.key"
        
        # Write certificate
        async with aiofiles.open(cert_path, 'wb') as f:
            await f.write(certificate.public_bytes(serialization.Encoding.PEM))
        
        # Write private key
        async with aiofiles.open(key_path, 'wb') as f:
            await f.write(private_key.private_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PrivateFormat.PKCS8,
                encryption_algorithm=serialization.NoEncryption()
            ))
        
        logger.info(f"Generated self-signed certificate for {hostname}")
        
        return str(cert_path), str(key_path)
    
    async def create_ca_bundle(self, include_self_signed: bool = True) -> str:
        """Create CA bundle including trusted certificates"""
        bundle_path = self.cert_dir / 'ca-bundle.crt'
        
        async with aiofiles.open(bundle_path, 'w') as bundle:
            # Start with system CA bundle
            async with aiofiles.open(self.ca_bundle_path, 'r') as system_ca:
                content = await system_ca.read()
                await bundle.write(content)
            
            # Add self-signed certificates if requested
            if include_self_signed:
                await bundle.write("\n# Anava Vision Self-Signed Certificates\n")
                
                for cert_file in self.cert_dir.glob("*.crt"):
                    if cert_file.name != 'ca-bundle.crt':
                        async with aiofiles.open(cert_file, 'r') as cert:
                            content = await cert.read()
                            await bundle.write(f"\n# {cert_file.name}\n")
                            await bundle.write(content)
        
        logger.info(f"Created CA bundle at {bundle_path}")
        return str(bundle_path)
    
    async def monitor_certificate_expiry(self, cameras: List[Dict], 
                                       warning_days: int = 30) -> List[Dict]:
        """Monitor certificates for expiration"""
        expiring_certs = []
        
        for camera in cameras:
            cert = await self.get_server_certificate(camera['ip'])
            if cert:
                days_until_expiry = (cert.not_after - datetime.datetime.utcnow()).days
                
                if days_until_expiry < warning_days:
                    expiring_certs.append({
                        'camera': camera['name'],
                        'ip': camera['ip'],
                        'days_until_expiry': days_until_expiry,
                        'expires': cert.not_after.isoformat(),
                        'subject': cert.subject
                    })
                    
                    logger.warning(
                        f"Certificate for {camera['name']} ({camera['ip']}) "
                        f"expires in {days_until_expiry} days"
                    )
        
        return expiring_certs
    
    def create_ssl_context(self, verify: bool = True, 
                          ca_bundle: str = None) -> ssl.SSLContext:
        """Create SSL context with proper settings"""
        if verify:
            context = ssl.create_default_context(cafile=ca_bundle)
        else:
            context = ssl.create_default_context()
            context.check_hostname = False
            context.verify_mode = ssl.CERT_NONE
        
        # Set secure ciphers
        context.set_ciphers(
            'ECDHE+AESGCM:ECDHE+CHACHA20:DHE+AESGCM:DHE+CHACHA20:!aNULL:!MD5:!DSS'
        )
        
        # Disable weak protocols
        context.options |= ssl.OP_NO_SSLv2
        context.options |= ssl.OP_NO_SSLv3
        context.options |= ssl.OP_NO_TLSv1
        context.options |= ssl.OP_NO_TLSv1_1
        
        return context
    
    async def save_certificate_report(self, cert_info: Dict[str, Certificate], 
                                    filename: str = 'certificate_report.json'):
        """Save certificate report"""
        report = {
            'timestamp': time.time(),
            'scan_date': datetime.datetime.utcnow().isoformat(),
            'certificates': {}
        }
        
        for host, cert in cert_info.items():
            report['certificates'][host] = cert.to_dict()
        
        # Summary statistics
        total_certs = len(cert_info)
        self_signed = sum(1 for cert in cert_info.values() if cert.is_self_signed)
        valid = sum(1 for cert in cert_info.values() if cert.is_valid)
        expiring_soon = sum(
            1 for cert in cert_info.values() 
            if (cert.not_after - datetime.datetime.utcnow()).days < 30
        )
        
        report['summary'] = {
            'total_certificates': total_certs,
            'self_signed': self_signed,
            'valid': valid,
            'expiring_soon': expiring_soon
        }
        
        async with aiofiles.open(filename, 'w') as f:
            await f.write(json.dumps(report, indent=2))
        
        logger.info(f"Saved certificate report to {filename}")


async def main():
    """Main certificate management function"""
    import sys
    
    # Load discovered cameras
    try:
        with open('discovered_cameras.json', 'r') as f:
            camera_data = json.load(f)
            cameras = camera_data['cameras']
    except:
        cameras = [{'ip': '192.168.1.100', 'name': 'Test Camera'}]
    
    manager = CertificateManager()
    
    # Scan certificates
    logger.info("Scanning camera certificates...")
    cert_info = await manager.scan_camera_certificates(cameras)
    
    # Generate report
    await manager.save_certificate_report(cert_info)
    
    # Create CA bundle
    ca_bundle = await manager.create_ca_bundle()
    logger.info(f"CA bundle created: {ca_bundle}")
    
    # Check for expiring certificates
    expiring = await manager.monitor_certificate_expiry(cameras)
    if expiring:
        logger.warning(f"{len(expiring)} certificates expiring soon")
    
    # Generate self-signed certificate for local server
    if len(sys.argv) > 1 and sys.argv[1] == '--generate':
        hostname = sys.argv[2] if len(sys.argv) > 2 else 'localhost'
        cert_path, key_path = await manager.generate_self_signed_certificate(
            hostname,
            ['127.0.0.1', '::1']
        )
        logger.info(f"Generated certificate: {cert_path}")
        logger.info(f"Generated key: {key_path}")


if __name__ == '__main__':
    import ipaddress
    asyncio.run(main())