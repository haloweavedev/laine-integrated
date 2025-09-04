#!/bin/bash

# Vapi Tool Deletion Script
# Usage: ./delete_all_tools.sh <your-vapi-token>

# Check if token is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <vapi-token>"
    echo "Example: $0 your-vapi-token-here"
    exit 1
fi

TOKEN="$1"
API_BASE="https://api.vapi.ai"

echo "🔧 Fetching all tools..."

# Get all tools and extract IDs
RESPONSE=$(curl -s -H "Authorization: Bearer $TOKEN" "$API_BASE/tool")

# Check if curl was successful
if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch tools from API"
    exit 1
fi

# Extract tool IDs from the JSON response
# This assumes the response has an array of tools with "id" field
TOOL_IDS=$(echo "$RESPONSE" | jq -r '.[].id' 2>/dev/null)

# Check if jq is available and response is valid
if [ $? -ne 0 ] || [ -z "$TOOL_IDS" ]; then
    echo "❌ Failed to parse tool IDs from response"
    echo "Response: $RESPONSE"
    echo ""
    echo "Note: Make sure 'jq' is installed for JSON parsing"
    echo "Install with: brew install jq (on macOS)"
    exit 1
fi

# Count tools
TOOL_COUNT=$(echo "$TOOL_IDS" | wc -l | tr -d ' ')
echo "📋 Found $TOOL_COUNT tool(s) to delete"

# Delete each tool
DELETED_COUNT=0
FAILED_COUNT=0

echo ""
echo "🗑️  Starting deletion process..."

for TOOL_ID in $TOOL_IDS; do
    echo "Deleting tool: $TOOL_ID"
    
    DELETE_RESPONSE=$(curl -s -w "%{http_code}" -X DELETE \
        -H "Authorization: Bearer $TOKEN" \
        "$API_BASE/tool/$TOOL_ID")
    
    # Extract HTTP status code (last 3 characters)
    HTTP_CODE="${DELETE_RESPONSE: -3}"
    
    if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "204" ]; then
        echo "✅ Successfully deleted tool: $TOOL_ID"
        ((DELETED_COUNT++))
    else
        echo "❌ Failed to delete tool: $TOOL_ID (HTTP $HTTP_CODE)"
        ((FAILED_COUNT++))
    fi
done

echo ""
echo "📊 Deletion Summary:"
echo "   ✅ Successfully deleted: $DELETED_COUNT tools"
echo "   ❌ Failed to delete: $FAILED_COUNT tools"
echo "   📋 Total processed: $TOOL_COUNT tools"

if [ $FAILED_COUNT -eq 0 ]; then
    echo ""
    echo "🎉 All tools deleted successfully!"
else
    echo ""
    echo "⚠️  Some deletions failed. Please check your API token and permissions."
fi
