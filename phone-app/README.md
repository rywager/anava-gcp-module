# Phone Call Trigger App

A Flask-based application that can make phone calls when triggered through various methods (web interface, webhooks, or automated scripts).

## Features

- 📞 **Web Interface**: Simple UI to trigger phone calls with custom messages
- 🔊 **Text-to-Speech**: Automated voice messages using Twilio's TTS
- 🪝 **Webhook Support**: Trigger calls from external services
- 📊 **Call History**: Track recent calls and their status
- 🤖 **Automation Examples**: Various trigger scripts for different use cases

## Prerequisites

1. **Twilio Account**: Sign up at [https://www.twilio.com](https://www.twilio.com)
2. **Python 3.7+**: Make sure Python is installed
3. **Twilio Phone Number**: Purchase a phone number from Twilio Console

## Setup

1. **Clone/Navigate to the phone-app directory:**
   ```bash
   cd phone-app
   ```

2. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

3. **Configure Twilio credentials:**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add your Twilio credentials:
   - `TWILIO_ACCOUNT_SID`: Your Account SID from Twilio Console
   - `TWILIO_AUTH_TOKEN`: Your Auth Token from Twilio Console
   - `TWILIO_PHONE_NUMBER`: Your Twilio phone number (format: +1234567890)
   - `NGROK_URL`: Your ngrok URL (for development) or production URL

4. **For local development, install ngrok:**
   ```bash
   # macOS
   brew install ngrok
   
   # Or download from https://ngrok.com
   ```

## Running the App

1. **Start the Flask app:**
   ```bash
   python app.py
   ```

2. **For local development, start ngrok in another terminal:**
   ```bash
   ngrok http 5000
   ```
   Copy the HTTPS URL and update `NGROK_URL` in your `.env` file.

3. **Access the web interface:**
   Open [http://localhost:5000](http://localhost:5000) in your browser.

## Usage

### Web Interface
1. Enter the phone number (with country code, e.g., +1234567890)
2. Type your message (or use the default)
3. Click "Trigger Phone Call"

### Webhook Triggers
Send a POST request to `/webhook-trigger`:
```bash
curl -X POST http://localhost:5000/webhook-trigger \
  -H "Content-Type: application/json" \
  -d '{
    "to_number": "+1234567890",
    "message": "Alert from webhook!",
    "trigger_type": "monitoring"
  }'
```

### Automated Triggers
Use the provided `trigger_examples.py`:
```bash
python trigger_examples.py
```

Options include:
1. Simple one-time trigger
2. Scheduled triggers (regular intervals)
3. Condition-based triggers
4. System monitoring triggers

## API Endpoints

- `GET /`: Web interface
- `POST /trigger-call`: Trigger a phone call
- `GET/POST /voice-response`: TwiML response for Twilio
- `POST /webhook-trigger`: External webhook endpoint
- `GET /call-status/<call_sid>`: Check call status

## Environment Variables

- `TWILIO_ACCOUNT_SID`: Twilio Account SID
- `TWILIO_AUTH_TOKEN`: Twilio Auth Token
- `TWILIO_PHONE_NUMBER`: Your Twilio phone number
- `NGROK_URL`: Public URL for Twilio callbacks

## Security Notes

- Never commit your `.env` file with real credentials
- Use environment variables in production
- Implement authentication for production use
- Add rate limiting to prevent abuse

## Troubleshooting

1. **"Twilio not configured" error**: Check your environment variables
2. **Call not connecting**: Verify your Twilio phone number is active
3. **No voice on call**: Ensure your ngrok URL is correctly set
4. **Webhook not working**: Check firewall/network settings

## Production Deployment

For production:
1. Use a proper web server (e.g., Gunicorn)
2. Set up HTTPS with a real domain
3. Add authentication middleware
4. Implement rate limiting
5. Use a process manager (e.g., systemd, supervisor)

Example Gunicorn command:
```bash
gunicorn -w 4 -b 0.0.0.0:8000 app:app
```