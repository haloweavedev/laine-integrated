#!/bin/bash

echo "🧪 Testing Slot Check with Correct Parameters"
echo "============================================"
echo

echo "📤 Request Body (using Laine CUID instead of NexHealth ID):"
echo '{
  "appointmentTypeId": "cmbyy91g30001k00422hxigus",
  "requestedDate": "2025-12-29"
}'
echo

echo "🌐 Making request to live API..."
echo

# Note: This will fail with 401 Unauthorized because we don't have auth headers
# But it will show if the appointment type ID format is now accepted

curl -X POST "https://laine-integrated.vercel.app/api/practice-config/check-slots" \
  -H "Content-Type: application/json" \
  -d '{
    "appointmentTypeId": "cmbyy91g30001k00422hxigus",
    "requestedDate": "2025-12-29"
  }' \
  -w "\n\nHTTP Status: %{http_code}\n" \
  -s

echo
echo "📝 NOTE: 401 Unauthorized is expected (no auth header)"
echo "📝 If you see validation errors about appointmentTypeId, that would indicate a different issue"
echo
echo "✅ TO FIX: In the UI, make sure you select the appointment type from the dropdown"
echo "   (which should automatically use the Laine CUID 'cmbyy91g30001k00422hxigus')"
echo "   instead of manually entering the NexHealth ID '1016885'" 