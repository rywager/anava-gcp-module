swagger: '2.0'
info:
  title: '${solution_prefix} Device API'
  version: '1.0.0'
  description: 'API for device auth & GCP token vending.'
host: ${api_managed_service}
schemes: ['https']
produces: ['application/json']
securityDefinitions:
  api_key:
    type: 'apiKey'
    name: 'x-api-key'
    in: 'header'
security:
  - api_key: []
paths:
  /device-auth/initiate:
    post:
      summary: 'Fetches Firebase Custom Token.'
      operationId: 'fetchFirebaseCustomToken'
      consumes: ['application/json']
      parameters:
        - in: 'body'
          name: 'body'
          required: true
          schema:
            type: 'object'
            required: ['device_id']
            properties:
              device_id:
                type: 'string'
      responses:
        '200':
          description: 'Firebase Custom Token'
          schema:
            type: 'object'
            properties:
              firebase_custom_token:
                type: 'string'
        default:
          description: 'Error'
      x-google-backend:
        address: '${device_auth_url}'
  /gcp-token/vend:
    post:
      summary: 'Exchanges Firebase ID Token for GCP Token.'
      operationId: 'exchangeFirebaseIdTokenForGcpToken'
      consumes: ['application/json']
      parameters:
        - in: 'body'
          name: 'body'
          required: true
          schema:
            type: 'object'
            required: ['firebase_id_token']
            properties:
              firebase_id_token:
                type: 'string'
      responses:
        '200':
          description: 'GCP Access Token'
          schema:
            type: 'object'
            properties:
              gcp_access_token:
                type: 'string'
              expires_in:
                type: 'integer'
        default:
          description: 'Error'
      x-google-backend:
        address: '${tvm_url}'