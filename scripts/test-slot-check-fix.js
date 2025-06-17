const fetch = require('node-fetch');

async function testSlotCheck() {
  try {
    console.log('🧪 Testing Slot Check with Correct Parameters');
    console.log('============================================\n');

    const requestBody = {
      appointmentTypeId: "cmbyy91g30001k00422hxigus", // Laine CUID (not NexHealth ID)
      requestedDate: "2025-12-29",
      // Optional: filter by specific provider
      // providerIds: ["cmbywgi3d0007lb04l8pnvk6g"] // Amy Dominguez's Laine ID
    };

    console.log('📤 Request Body:');
    console.log(JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://laine-integrated.vercel.app/api/practice-config/check-slots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add your auth header here if testing from script
        // 'Authorization': 'Bearer your-token'
      },
      body: JSON.stringify(requestBody)
    });

    console.log(`\n📥 Response Status: ${response.status}`);

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ SUCCESS!');
      console.log('\n📊 Results:');
      console.log(`   - Total slots found: ${result.data.total_slots_found}`);
      console.log(`   - Has availability: ${result.data.has_availability}`);
      console.log(`   - Lunch break slots filtered: ${result.data.debug_info.lunch_break_slots_filtered}`);
      console.log(`   - Providers checked: ${result.data.debug_info.providers_checked}`);
      console.log(`   - Operatories checked: ${result.data.debug_info.operatories_checked}`);
      
      if (result.data.available_slots.length > 0) {
        console.log('\n🕐 Available Slots:');
        result.data.available_slots.slice(0, 5).forEach(slot => {
          console.log(`   - ${slot.display_range} (Provider: ${slot.provider_info.name})`);
        });
        if (result.data.available_slots.length > 5) {
          console.log(`   ... and ${result.data.available_slots.length - 5} more slots`);
        }
      }
    } else {
      console.log('❌ ERROR:');
      console.log(result);
    }

  } catch (error) {
    console.error('❌ Error during test:', error.message);
  }
}

testSlotCheck(); 