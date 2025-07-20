#!/usr/bin/env python3
"""
Test script for the phone call app
"""
import os
import sys
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_twilio_config():
    """Test if Twilio is properly configured"""
    print("Testing Twilio configuration...")
    
    required_vars = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']
    missing_vars = []
    
    for var in required_vars:
        if not os.environ.get(var):
            missing_vars.append(var)
        else:
            print(f"✓ {var} is set")
    
    if missing_vars:
        print(f"\n❌ Missing environment variables: {', '.join(missing_vars)}")
        print("Please set these in your .env file")
        return False
    
    print("\n✓ All Twilio configuration variables are set")
    return True

def test_twilio_connection():
    """Test Twilio API connection"""
    try:
        from twilio.rest import Client
        
        print("\nTesting Twilio API connection...")
        client = Client(
            os.environ.get('TWILIO_ACCOUNT_SID'),
            os.environ.get('TWILIO_AUTH_TOKEN')
        )
        
        # Try to fetch account info
        account = client.api.accounts(os.environ.get('TWILIO_ACCOUNT_SID')).fetch()
        print(f"✓ Connected to Twilio account: {account.friendly_name}")
        
        # Check phone number
        phone_number = os.environ.get('TWILIO_PHONE_NUMBER')
        numbers = client.incoming_phone_numbers.list(phone_number=phone_number)
        
        if numbers:
            print(f"✓ Phone number {phone_number} is valid and active")
        else:
            print(f"❌ Phone number {phone_number} not found in your account")
            return False
            
        return True
        
    except Exception as e:
        print(f"❌ Twilio connection error: {str(e)}")
        return False

def test_flask_app():
    """Test if Flask app can start"""
    print("\nTesting Flask app...")
    try:
        from app import app
        print("✓ Flask app imported successfully")
        return True
    except Exception as e:
        print(f"❌ Flask app error: {str(e)}")
        return False

def main():
    print("Phone Call App Test Suite")
    print("=" * 50)
    
    tests = [
        test_twilio_config,
        test_twilio_connection,
        test_flask_app
    ]
    
    results = []
    for test in tests:
        results.append(test())
        print()
    
    if all(results):
        print("✅ All tests passed! Your app is ready to use.")
        print("\nNext steps:")
        print("1. Run 'python app.py' to start the app")
        print("2. Run 'ngrok http 5000' in another terminal")
        print("3. Update NGROK_URL in .env with the ngrok URL")
        print("4. Open http://localhost:5000 in your browser")
    else:
        print("❌ Some tests failed. Please fix the issues above.")
        sys.exit(1)

if __name__ == "__main__":
    main()