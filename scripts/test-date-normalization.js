// Test script for LLM-first date validation approach

// Generate current date dynamically (same as in the tool)
function getCurrentDate() {
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getCurrentDayInfo() {
  const today = new Date();
  const dayName = today.toLocaleDateString('en-US', { weekday: 'long' });
  const monthName = today.toLocaleDateString('en-US', { month: 'long' });
  return `Today is ${dayName}, ${monthName} ${today.getDate()}, ${today.getFullYear()}`;
}

// Validation function (same as in the schema)
function validateDate(date) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return false;
  }
  const parsedDate = new Date(date);
  return !isNaN(parsedDate.getTime()) && date === parsedDate.toISOString().split('T')[0];
}

console.log("=== LLM-First Date Processing Test ===");
console.log(getCurrentDayInfo());
console.log(`Current date: ${getCurrentDate()}`);
console.log("");

// Test cases that the LLM should handle (these would be converted by VAPI's LLM)
const naturalLanguageInputs = [
  "December twenty third",
  "tomorrow", 
  "next Friday",
  "Christmas",
  "Monday",
  "next week",
  "December 23rd"
];

// Expected LLM outputs that should pass validation
const expectedValidOutputs = [
  "2024-12-23",
  "2025-01-15", 
  "2024-12-22",
  "invalid-date-format",
  ""
];

console.log("NATURAL LANGUAGE INPUTS (LLM should convert these):");
naturalLanguageInputs.forEach(input => {
  console.log(`"${input}" → LLM will convert to YYYY-MM-DD format`);
});

console.log("\nVALIDATION TESTS (outputs from LLM):");
expectedValidOutputs.forEach(output => {
  const isValid = validateDate(output);
  const status = isValid ? "✅ VALID" : "❌ INVALID";
  console.log(`"${output}" → ${status}`);
});

console.log("\nLLM INSTRUCTION CONTEXT:");
console.log(`The LLM receives this context in the tool description:`);
console.log(`- ${getCurrentDayInfo()}`);
console.log(`- Current date: ${getCurrentDate()}`);
console.log(`- Detailed examples and instructions for date conversion`);
console.log(`- Clear guidance on handling ambiguous dates`);

console.log("\nBENEFITS OF LLM-FIRST APPROACH:");
console.log("🧠 Natural understanding of complex date expressions");
console.log("🌍 Cultural flexibility and language variations");
console.log("🔄 Self-improving over time without code changes");
console.log("🛡️ Can ask clarifying questions when ambiguous");
console.log("📱 Modern AI-first architecture");
console.log("🎯 Leverages VAPI's existing LLM capabilities"); 