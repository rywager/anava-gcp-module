from flask import Flask, render_template, request, jsonify
from twilio.rest import Client
from twilio.twiml.voice_response import VoiceResponse
import os
from datetime import datetime
import logging

app = Flask(__name__)
logging.basicConfig(level=logging.INFO)

# Twilio configuration - set these as environment variables
TWILIO_ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
TWILIO_AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
TWILIO_PHONE_NUMBER = os.environ.get('TWILIO_PHONE_NUMBER')
NGROK_URL = os.environ.get('NGROK_URL', 'http://localhost:5000')

# Initialize Twilio client
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
else:
    twilio_client = None
    logging.warning("Twilio credentials not set. Phone calls will not work.")

@app.route('/')
def index():
    """Main page with trigger button"""
    return render_template('index.html')

@app.route('/trigger-call', methods=['POST'])
def trigger_call():
    """Trigger a phone call"""
    try:
        data = request.json
        to_number = data.get('to_number')
        message = data.get('message', 'Hello! This is an automated call from your trigger app.')
        
        if not to_number:
            return jsonify({'error': 'Phone number is required'}), 400
        
        if not twilio_client:
            return jsonify({'error': 'Twilio not configured'}), 500
        
        # Make the call
        call = twilio_client.calls.create(
            to=to_number,
            from_=TWILIO_PHONE_NUMBER,
            url=f'{NGROK_URL}/voice-response?message={message}',
            method='GET'
        )
        
        logging.info(f"Call initiated to {to_number} with SID: {call.sid}")
        
        return jsonify({
            'success': True,
            'call_sid': call.sid,
            'timestamp': datetime.now().isoformat()
        })
        
    except Exception as e:
        logging.error(f"Error making call: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/voice-response', methods=['GET', 'POST'])
def voice_response():
    """Generate TwiML voice response for the call"""
    message = request.args.get('message', 'Hello! This is an automated call.')
    
    response = VoiceResponse()
    response.say(message, voice='alice')
    response.pause(length=2)
    response.say('Thank you for listening. Goodbye!', voice='alice')
    
    return str(response), 200, {'Content-Type': 'text/xml'}

@app.route('/webhook-trigger', methods=['POST'])
def webhook_trigger():
    """Webhook endpoint for external triggers"""
    try:
        data = request.json
        to_number = data.get('to_number')
        message = data.get('message', 'Webhook triggered call')
        trigger_type = data.get('trigger_type', 'unknown')
        
        if not to_number:
            return jsonify({'error': 'Phone number is required'}), 400
        
        # Log the trigger
        logging.info(f"Webhook trigger received: {trigger_type}")
        
        # Make the call
        if twilio_client:
            call = twilio_client.calls.create(
                to=to_number,
                from_=TWILIO_PHONE_NUMBER,
                url=f'{NGROK_URL}/voice-response?message={message}',
                method='GET'
            )
            
            return jsonify({
                'success': True,
                'call_sid': call.sid,
                'trigger_type': trigger_type,
                'timestamp': datetime.now().isoformat()
            })
        else:
            return jsonify({'error': 'Twilio not configured'}), 500
            
    except Exception as e:
        logging.error(f"Webhook error: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/call-status/<call_sid>')
def call_status(call_sid):
    """Check the status of a call"""
    try:
        if not twilio_client:
            return jsonify({'error': 'Twilio not configured'}), 500
            
        call = twilio_client.calls(call_sid).fetch()
        
        return jsonify({
            'call_sid': call.sid,
            'status': call.status,
            'duration': call.duration,
            'to': call.to,
            'from': call.from_,
            'start_time': call.start_time.isoformat() if call.start_time else None,
            'end_time': call.end_time.isoformat() if call.end_time else None
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)