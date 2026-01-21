ADMIN_TOKEN=TYLLINKNETSTRUCT 
curl -X POST http://localhost:3052/v1/tokens \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"id":"tyllink","name":"tyllink","allowedProviders":["openai","groq"],"preferredProvider":""}'
