# SMS Notification System

A robust SMS notification system that queues messages through Africa's Talking API with Redis + BullMQ for background processing, proper retry logic, and rate limiting.

## Features

- **Queue-based SMS processing** using BullMQ and Redis
- **Rate limiting** to prevent API abuse
- **Retry logic** with exponential backoff
- **Bulk SMS sending** support
- **Real-time job tracking** and status monitoring
- **Comprehensive logging** and metrics
- **RESTful API** for SMS operations
- **Health checks** and monitoring endpoints
- **Graceful shutdown** handling

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   API       │    │   Queue     │    │   Worker    │    │   Africa's  │
│   Server    │───▶│  (BullMQ)   │───▶│  Processor  │───▶│  Talking    │
│             │    │             │    │             │    │    API      │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │                   │
       │                   │                   │                   │
       ▼                   ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Rate      │    │    Redis    │    │   Rate      │    │   Delivery  │
│   Limiter    │    │   Storage   │    │   Limiter    │    │    Logs    │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

## Prerequisites

- Node.js (v16 or higher)
- Redis server
- Africa's Talking API account

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd notification-system-sms
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Update `.env` with your configuration:
```bash
# Africa's Talking API
AFRICASTALKING_USERNAME=your_username
AFRICASTALKING_API_KEY=your_api_key_here
SMS_SENDER_NAME=YourSenderName

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0
```

## Usage

### Starting the Application

```bash
npm start
```

The server will start on `http://localhost:3000` by default.

### API Endpoints

#### Send Single SMS
```bash
POST /api/v1/sms/send
Content-Type: application/json

{
  "to": "+254712345678",
  "message": "Your SMS message here",
  "identifier": "user123",
  "priority": 1,
  "metadata": {
    "campaign": "welcome",
    "userId": "12345"
  }
}
```

#### Send Bulk SMS
```bash
POST /api/v1/sms/bulk
Content-Type: application/json

{
  "messages": [
    {
      "to": "+254712345678",
      "message": "Message 1"
    },
    {
      "to": "+254798765432",
      "message": "Message 2"
    }
  ],
  "identifier": "bulk-campaign",
  "priority": 2
}
```

#### Get SMS Status
```bash
GET /api/v1/sms/status/{jobId}
```

#### Get Queue Statistics
```bash
GET /api/v1/queue/stats
```

#### Get Delivery Logs
```bash
GET /api/v1/sms/logs?limit=50&offset=0
```

#### Get Daily Statistics
```bash
GET /api/v1/sms/stats/daily?date=2024-01-15
```

#### Get Rate Limit Status
```bash
GET /api/v1/rate-limit/{identifier}
```

#### Reset Rate Limit
```bash
POST /api/v1/rate-limit/{identifier}/reset
```

#### Health Check
```bash
GET /api/v1/health
```

## Configuration

### Rate Limiting

- **Window**: 60 seconds (configurable via `RATE_LIMIT_WINDOW_MS`)
- **Max Requests**: 30 SMS per window (configurable via `RATE_LIMIT_MAX_REQUESTS`)
- **Block Duration**: 5 minutes (configurable via `RATE_LIMIT_BLOCK_DURATION_MS`)

### Retry Logic

- **Max Attempts**: 3 (configurable via `MAX_RETRY_ATTEMPTS`)
- **Backoff Type**: Exponential (configurable via `RETRY_BACKOFF_TYPE`)
- **Initial Delay**: 2000ms (configurable via `RETRY_DELAY_MS`)

### Queue Configuration

- **Concurrency**: 5 jobs processed simultaneously
- **Job Retention**: 100 completed jobs, 50 failed jobs
- **Stalled Detection**: 30 seconds

## Monitoring

### Queue Metrics

The system provides comprehensive metrics for:
- Job processing times
- Success/failure rates
- Queue depth (waiting, active, completed, failed jobs)
- Rate limiting statistics

### Health Monitoring

The health check endpoint (`/api/v1/health`) monitors:
- Redis connectivity
- Queue processor status
- Overall system health

## Error Handling

The system implements comprehensive error handling:

1. **Validation Errors**: Invalid phone numbers, empty messages
2. **Rate Limit Errors**: Temporary blocking when limits exceeded
3. **API Errors**: Africa's Talking API failures with retry logic
4. **System Errors**: Redis connectivity issues, queue failures

## Logging

All SMS delivery attempts are logged with:
- Timestamp
- Phone number (partial masking for privacy)
- Message preview
- Status (success/failed)
- API response details
- Error messages (if applicable)

## Security Considerations

- API keys stored in environment variables
- Rate limiting prevents abuse
- Input validation on all endpoints
- Phone number format validation
- CORS configuration for web applications

## Development

### Running Tests
```bash
npm test
```

### Development Mode
```bash
npm run dev
```

### Environment Variables
Refer to `.env.example` for all available configuration options.

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure Redis with persistence
3. Set up monitoring and alerting
4. Configure proper logging
5. Set up reverse proxy (nginx/Apache)
6. Enable SSL/TLS

## License

ISC License
# SMS-Notification-System-High-Volume-Queues
