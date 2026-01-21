PROXY_TOKEN=TaAM3-uMnL1ghtuhdDlyxD9dlnpOP8Ap

curl -i http://localhost:3052/v1/models \
  -H "Authorization: Bearer ${PROXY_TOKEN:-}" \
  -H "Content-Type: application/json"

