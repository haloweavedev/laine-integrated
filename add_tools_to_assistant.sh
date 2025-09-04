#!/bin/bash

# Add Tools to VAPI Assistant Script
# Usage: ./add_tools_to_assistant.sh <vapi-token> <assistant-id> <app-base-url>

# Check if all required parameters are provided
if [ -z "$1" ] || [ -z "$2" ] || [ -z "$3" ]; then
    echo "Usage: $0 <vapi-token> <assistant-id> <app-base-url>"
    echo "Example: $0 your-token 6820f09a-806c-4df7-8b41-0010fa9cc8b0 https://yourdomain.com"
    exit 1
fi

TOKEN="$1"
ASSISTANT_ID="$2"
APP_BASE_URL="$3"
API_BASE="https://api.vapi.ai"
WEBHOOK_URL="${APP_BASE_URL}/api/vapi-webhook"

echo "🔧 Adding tools to VAPI Assistant: $ASSISTANT_ID"
echo "📡 Using webhook URL: $WEBHOOK_URL"
echo ""

# Array to store created tool IDs
TOOL_IDS=()

# Function to create a tool
create_tool() {
    local tool_name="$1"
    local tool_description="$2"
    local tool_parameters="$3"
    local timeout_seconds="$4"
    
    echo "Creating tool: $tool_name"
    
    # Build the tool JSON payload
    local server_config=""
    if [ -n "$timeout_seconds" ]; then
        server_config="\"server\": {\"url\": \"$WEBHOOK_URL\", \"timeoutSeconds\": $timeout_seconds},"
    else
        server_config="\"server\": {\"url\": \"$WEBHOOK_URL\"},"
    fi
    
    local tool_payload="{
        \"type\": \"function\",
        \"function\": {
            \"name\": \"$tool_name\",
            \"description\": \"$tool_description\",
            \"parameters\": $tool_parameters
        },
        $server_config
    }"
    
    # Remove the trailing comma from server_config
    tool_payload=$(echo "$tool_payload" | sed 's/},$/}/')
    
    # Create the tool
    local response=$(curl -s -w "HTTPSTATUS:%{http_code}" \
        -H "Authorization: Bearer $TOKEN" \
        -H "Content-Type: application/json" \
        -X POST \
        -d "$tool_payload" \
        "$API_BASE/tool")
    
    # Extract HTTP status code
    local http_code=$(echo "$response" | grep -o "HTTPSTATUS:[0-9]*" | sed 's/HTTPSTATUS://')
    local body=$(echo "$response" | sed 's/HTTPSTATUS:[0-9]*$//')
    
    if [ "$http_code" = "201" ] || [ "$http_code" = "200" ]; then
        # Extract tool ID from response
        local tool_id=$(echo "$body" | grep -o '"id":"[^"]*"' | sed 's/"id":"//g' | sed 's/"//g' | head -1)
        if [ -n "$tool_id" ]; then
            echo "✅ Successfully created tool: $tool_name (ID: $tool_id)"
            TOOL_IDS+=("$tool_id")
        else
            echo "❌ Failed to extract tool ID for: $tool_name"
            echo "Response: $body"
            return 1
        fi
    else
        echo "❌ Failed to create tool: $tool_name (HTTP $http_code)"
        echo "Response: $body"
        return 1
    fi
    
    return 0
}

# Create Tool 1: findAppointmentType
create_tool "findAppointmentType" \
    "Identifies the patient's need (e.g., 'toothache', 'cleaning') and determines the correct appointment type. **This is always the first tool to call in a conversation.**" \
    '{
        "type": "object",
        "properties": {
            "patientRequest": {
                "type": "string",
                "description": "The patient'\''s verbatim description of their reason for calling, their symptoms, or the type of appointment they are requesting. For example, '\''I have a toothache'\'', '\''I need a cleaning'\'', or '\''My crown fell off and I need it re-cemented'\''."
            }
        },
        "required": ["patientRequest"]
    }'

# Create Tool 2: identifyPatient  
create_tool "identifyPatient" \
    "Identifies an existing patient or creates a new patient record. Use this after collecting the patient's full name, date of birth, and other contact details." \
    '{
        "type": "object",
        "properties": {
            "firstName": {
                "type": "string",
                "description": "The patient'\''s first name."
            },
            "lastName": {
                "type": "string", 
                "description": "The patient'\''s last name."
            },
            "dateOfBirth": {
                "type": "string",
                "description": "The patient'\''s date of birth in YYYY-MM-DD format."
            },
            "phoneNumber": {
                "type": "string",
                "description": "The patient'\''s phone number (required for new patients)."
            },
            "email": {
                "type": "string",
                "description": "The patient'\''s email address (required for new patients)."
            }
        },
        "required": ["firstName", "lastName", "dateOfBirth", "phoneNumber", "email"]
    }' \
    30

# Create Tool 3: checkAvailableSlots
create_tool "checkAvailableSlots" \
    "Finds available appointment times. By default, proactively searches for the next available appointments. Call this after the appointment type is known. Only include parameters if the user has specifically expressed preferences." \
    '{
        "type": "object",
        "properties": {
            "preferredDaysOfWeek": {
                "type": "string",
                "description": "A JSON string array of the user'\''s preferred days of the week. Example: '\''[\"Monday\", \"Wednesday\"]'\''. This is collected from the user."
            },
            "timeBucket": {
                "type": "string",
                "description": "The user'\''s general time preference, which must be one of the following values: '\''Early'\'', '\''Morning'\'', '\''Midday'\'', '\''Afternoon'\'', '\''Evening'\'', '\''Late'\'', or '\''AllDay'\''. This is collected from the user."
            },
            "requestedDate": {
                "type": "string",
                "description": "The user'\''s specific requested date, like '\''tomorrow'\'', '\''next Wednesday'\'', or '\''July 10th'\''. Use this for specific date searches."
            }
        },
        "required": []
    }'

# Create Tool 4: selectAndBookSlot
create_tool "selectAndBookSlot" \
    "Selects a time slot and, with final user confirmation, books the appointment. This is the final step in the booking process. Call once with user's selection, then again with finalConfirmation=true after they confirm." \
    '{
        "type": "object",
        "properties": {
            "userSelection": {
                "type": "string",
                "description": "The user'\''s verbal selection of a time slot (e.g., '\''10 AM'\'', '\''the first one'\'', '\''8:30'\'')"
            },
            "finalConfirmation": {
                "type": "boolean",
                "description": "Set to true only after the user has verbally confirmed the exact time and date."
            }
        },
        "required": ["userSelection"]
    }'

# Create Tool 5: insuranceInfo
create_tool "insuranceInfo" \
    "Answers patient questions about dental insurance acceptance. Use for general questions like 'What insurance do you take?' or specific questions like 'Do you accept Cigna?'" \
    '{
        "type": "object",
        "properties": {
            "insuranceName": {
                "type": "string",
                "description": "The specific name of the insurance plan the user is asking about. Omit this for general questions."
            }
        },
        "required": []
    }'

echo ""
echo "📊 Tool Creation Summary:"
echo "   ✅ Successfully created: ${#TOOL_IDS[@]} tools"
echo "   Tool IDs: ${TOOL_IDS[*]}"

# Check if all tools were created successfully
if [ ${#TOOL_IDS[@]} -ne 5 ]; then
    echo "❌ Not all tools were created successfully. Aborting assistant update."
    exit 1
fi

echo ""
echo "🔗 Updating assistant with new tools..."

# Build the tools array for the assistant update
TOOLS_JSON_ARRAY="["
for i in "${!TOOL_IDS[@]}"; do
    if [ $i -gt 0 ]; then
        TOOLS_JSON_ARRAY="${TOOLS_JSON_ARRAY},"
    fi
    TOOLS_JSON_ARRAY="${TOOLS_JSON_ARRAY}{\"type\":\"function\",\"id\":\"${TOOL_IDS[$i]}\"}"
done
TOOLS_JSON_ARRAY="${TOOLS_JSON_ARRAY}]"

# Update the assistant with the new tools
ASSISTANT_UPDATE_PAYLOAD="{
    \"model\": {
        \"tools\": $TOOLS_JSON_ARRAY
    }
}"

echo "Updating assistant $ASSISTANT_ID with tools..."
UPDATE_RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -X PATCH \
    -d "$ASSISTANT_UPDATE_PAYLOAD" \
    "$API_BASE/assistant/$ASSISTANT_ID")

# Extract HTTP status code
UPDATE_HTTP_CODE=$(echo "$UPDATE_RESPONSE" | grep -o "HTTPSTATUS:[0-9]*" | sed 's/HTTPSTATUS://')
UPDATE_BODY=$(echo "$UPDATE_RESPONSE" | sed 's/HTTPSTATUS:[0-9]*$//')

if [ "$UPDATE_HTTP_CODE" = "200" ] || [ "$UPDATE_HTTP_CODE" = "204" ]; then
    echo "✅ Successfully updated assistant $ASSISTANT_ID with tools"
else
    echo "❌ Failed to update assistant $ASSISTANT_ID (HTTP $UPDATE_HTTP_CODE)"
    echo "Response: $UPDATE_BODY"
    exit 1
fi

echo ""
echo "🎉 All done! Assistant $ASSISTANT_ID now has all 5 tools configured."
echo ""
echo "Tools added:"
echo "  1. findAppointmentType - Identifies appointment needs"
echo "  2. identifyPatient - Handles patient lookup/creation"  
echo "  3. checkAvailableSlots - Finds available appointments"
echo "  4. selectAndBookSlot - Books selected appointments"
echo "  5. insuranceInfo - Answers insurance questions"
