# Appointment Types Migration Data

## Practice Information
- **Practice Name:** Royal Oak Family Dental
- **Clerk User ID:** user_2yKTSzqIq9w0isdwpDZreVoAazr
- **NexHealth Subdomain:** xyz
- **NexHealth Location ID:** 318534
- **Total Types:** 30
- **Exported:** 2025-09-09T17:22:36.794Z

## NexHealth API Configuration

Base URL: `https://nexhealth.info`
Subdomain: `xyz`
Location ID: `318534`

### Sample curl command to create appointment type:
```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=xyz' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": 318534,
       "appointment_type": {
         "name": "APPOINTMENT_NAME",
         "minutes": DURATION_IN_MINUTES,
         "bookable_online": true,
         "parent_type": "Location",
         "parent_id": 318534
       }
     }'
```

## Complete Appointment Types Data

| Field | Description |
|-------|-------------|
| **name** | Display name of appointment type |
| **duration** | Length in minutes |
| **bookableOnline** | Can be booked online |
| **spokenName** | How AI refers to it in conversations |
| **check_immediate_next_available** | Urgent appointment flag |
| **keywords** | AI matching terms (comma-separated) |
| **webPatientStatus** | NEW/RETURNING/BOTH eligibility |
| **nexhealthAppointmentTypeId** | External system ID |
| **parentType** | NexHealth parent type |
| **parentId** | NexHealth parent ID |

### Appointment Types Table

| Name | Duration | Bookable | Spoken Name | Urgent | Keywords | Patient Status | NexHealth ID | Parent Type | Parent ID | Sync Error | Created | Updated |
|------|----------|----------|-------------|--------|----------|---------------|-------------|-------------|-----------|------------|---------|----------|
| All-on-X / Full Mouth Implants | 60min | Yes |  | No |  | BOTH | 1021941 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Broken Tooth or Lost Filling | 40min | No |  | No |  | BOTH | 1021934 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Concern/Pain/Emergency | 40min | Yes |  | No |  | BOTH | 1021933 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Cosmetic Consultation | 40min | Yes | Cosmetic consult | Yes | veneers, fix my smile, cosmetic, improve my teeth, makeover, straight white teeth, change how they look, too yellow, tooth shape, bonding, esthetic, Hollywood smile, brighten smile, fix chips, cosmetic dentistry, smile upgrade | BOTH | 1037808 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| Dental Implant Consultation | 40min | Yes |  | No |  | BOTH | 1021939 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Follow Up From Recent Visit / Post Op | 30min | Yes |  | No |  | BOTH | 1021946 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Full Mouth Reconstruction / All-on-X Consultation | 60min | Yes | Full mouth consult | Yes | all on x, all on four, full arch, denture replacement, teeth in a day, overdenture, implants for whole mouth, all on six, I need everything replaced, can't eat with dentures, replace all my teeth, full set, implant denture, snap-in teeth, anchor dentures | BOTH | 1037812 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| Implant Consultation | 40min | Yes | Implant consult | Yes | dental implant, tooth replacement, missing tooth, replace tooth, implant evaluation, implant appointment, bone graft, screw in tooth, fake tooth, get an implant, permanent tooth replacement, I want an implant, lost a tooth, post for tooth | BOTH | 1037807 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| Limited Exam with X-rays (Problem-Focused) | 40min | Yes | Focused exam with x-rays | Yes | toothache, pain, hurts, bothering me, broken tooth, cracked, chipped, infection, swelling, sore, abscess, emergency, sensitive, something wrong, tooth issue, jaw pain, gums bleeding, feels off, need to be seen, problem | BOTH | 1037805 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| New Patient Cleaning & Exam | 90min | Yes |  | No |  | BOTH | 1016885 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| New Patient Doctor Exam Only - No Cleaning | 60min | Yes |  | No |  | BOTH | 1021937 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| New Patient Exam & Cleaning (Adult, Age 13+) | 90min | Yes | New patient cleaning and checkup | Yes | new patient, first time, checkup, cleaning, exam and cleaning, never been, general cleaning, routine, annual, regular visit, new patient special, get established, first appointment, x‑rays, cleaning | BOTH | 1037798 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| New Patient Exam & Cleaning (Child, Age 4-12) | 70min | Yes | New patient child cleaning and checkup | Yes | my child, son, daughter, kid, pediatric cleaning, child checkup, child appointment, child dental, 8 years old, 4 years old, routine cleaning, children’s exam, elementary school, new patient child | BOTH | 1037799 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| New Patient Exam (Infant/Toddler, Age 0-3) | 30min | Yes | Happy Visit | Yes | baby, infant, toddler, lap exam, first dental visit, happy visit, under 3, 2 years old, 1 year old, my little one, small child, mom and baby, introduce | BOTH | 1037801 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| New Patient Visit - Age 12 & Under | 50min | Yes |  | No |  | BOTH | 1021930 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| New Patient Visit - Teen | 70min | Yes |  | No |  | BOTH | 1021929 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Orthodontic Consultation | 40min | Yes |  | No |  | BOTH | 1021943 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Other Concern or Question | 40min | Yes |  | No |  | BOTH | 1021947 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Perio Maintenance | 60min | No |  | No |  | BOTH | 1021936 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Post-Op or Treatment Follow-Up (Recent Visit) | 30min | Yes | Follow-up appointment | Yes | follow up, after my root canal, recheck, check healing, check crown, adjustment, recent visit, follow-up visit, check pain, bite feels off, after my extraction | BOTH | 1037806 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| Returning Patient - Cleaning (Age 12 & Under) | 40min | Yes |  | No |  | BOTH | 1021932 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Returning Patient - Cleaning (Age 13+) | 60min | Yes |  | No |  | BOTH | 1021931 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Returning Patient Exam & Cleaning (Adult, Age 13+) | 60min | Yes | Returning patient cleaning | Yes | existing patient, returning patient, recall, 6 month, returning, routine cleaning, follow‑up cleaning, regular cleaning, checkup again, been here before, coming back, follow up cleaning | BOTH | 1037803 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| Returning Patient Exam & Cleaning (Child, Age 4-12) | 50min | Yes | Returning child cleaning | Yes | my child again, returning child, child recall, kid follow-up, returning pediatric patient, routine checkup for child, child cleaning again, repeat cleaning, my kid’s next appointment | BOTH | 1037804 | Institution | 15324 | ✅ | 7/18/2025 | 8/6/2025 |
| Second Opinion Appointment | 40min | Yes |  | No |  | BOTH | 1021945 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Sleep Apnea / Snoring Evaluation | 40min | Yes |  | No |  | BOTH | 1021944 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Smile Consultation - Veneers, Invisalign, Whitening | 40min | Yes |  | No |  | BOTH | 1021938 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Swelling / Infection / Abscess | 40min | No |  | No |  | BOTH | 1021935 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| TMJ / Jaw Pain Consultation | 40min | Yes |  | No |  | BOTH | 1021942 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |
| Wisdom Teeth Consultation | 40min | Yes |  | No |  | BOTH | 1021940 | Institution | 15324 | ✅ | 8/6/2025 | 8/6/2025 |


## JSON Export (for programmatic migration)

```json
{
  "practice": {
    "clerkUserId": "user_2yKTSzqIq9w0isdwpDZreVoAazr",
    "name": "Royal Oak Family Dental",
    "nexhealthSubdomain": "xyz",
    "nexhealthLocationId": "318534",
    "exportedAt": "2025-09-09T17:22:36.971Z"
  },
  "appointmentTypes": [
    {
      "name": "All-on-X / Full Mouth Implants",
      "duration": 60,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021941",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.640Z",
      "updatedAt": "2025-08-06T11:45:41.640Z",
      "laineId": "cmdzwj8co000hk304l70ehye9"
    },
    {
      "name": "Broken Tooth or Lost Filling",
      "duration": 40,
      "bookableOnline": false,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021934",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.665Z",
      "updatedAt": "2025-08-06T11:45:41.665Z",
      "laineId": "cmdzwj8dd000jk3043bmtkozo"
    },
    {
      "name": "Concern/Pain/Emergency",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021933",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.683Z",
      "updatedAt": "2025-08-06T11:45:41.683Z",
      "laineId": "cmdzwj8dv000lk3046fd6gsps"
    },
    {
      "name": "Cosmetic Consultation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Cosmetic consult",
      "check_immediate_next_available": true,
      "keywords": "veneers, fix my smile, cosmetic, improve my teeth, makeover, straight white teeth, change how they look, too yellow, tooth shape, bonding, esthetic, Hollywood smile, brighten smile, fix chips, cosmetic dentistry, smile upgrade",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037808",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:10:43.425Z",
      "updatedAt": "2025-08-06T11:45:41.702Z",
      "laineId": "cmd90mvkw001wky0448gk04o4"
    },
    {
      "name": "Dental Implant Consultation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021939",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.723Z",
      "updatedAt": "2025-08-06T11:45:41.723Z",
      "laineId": "cmdzwj8ey000pk304jomw3bqs"
    },
    {
      "name": "Follow Up From Recent Visit / Post Op",
      "duration": 30,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021946",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.741Z",
      "updatedAt": "2025-08-06T11:45:41.741Z",
      "laineId": "cmdzwj8fh000rk304fxyvq83p"
    },
    {
      "name": "Full Mouth Reconstruction / All-on-X Consultation",
      "duration": 60,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Full mouth consult",
      "check_immediate_next_available": true,
      "keywords": "all on x, all on four, full arch, denture replacement, teeth in a day, overdenture, implants for whole mouth, all on six, I need everything replaced, can't eat with dentures, replace all my teeth, full set, implant denture, snap-in teeth, anchor dentures",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037812",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:24:06.558Z",
      "updatedAt": "2025-08-06T11:45:41.760Z",
      "laineId": "cmd9143a6002oky0426oratu8"
    },
    {
      "name": "Implant Consultation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Implant consult",
      "check_immediate_next_available": true,
      "keywords": "dental implant, tooth replacement, missing tooth, replace tooth, implant evaluation, implant appointment, bone graft, screw in tooth, fake tooth, get an implant, permanent tooth replacement, I want an implant, lost a tooth, post for tooth",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037807",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:09:49.534Z",
      "updatedAt": "2025-08-06T11:45:41.779Z",
      "laineId": "cmd90lpzx001uky04y5v4el8j"
    },
    {
      "name": "Limited Exam with X-rays (Problem-Focused)",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Focused exam with x-rays",
      "check_immediate_next_available": true,
      "keywords": "toothache, pain, hurts, bothering me, broken tooth, cracked, chipped, infection, swelling, sore, abscess, emergency, sensitive, something wrong, tooth issue, jaw pain, gums bleeding, feels off, need to be seen, problem",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037805",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:07:25.194Z",
      "updatedAt": "2025-08-06T11:45:41.805Z",
      "laineId": "cmd90immi001qky0455helsf8"
    },
    {
      "name": "New Patient Cleaning & Exam",
      "duration": 90,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1016885",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.832Z",
      "updatedAt": "2025-08-06T11:45:41.832Z",
      "laineId": "cmdzwj8i0000zk3046ml31172"
    },
    {
      "name": "New Patient Doctor Exam Only - No Cleaning",
      "duration": 60,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021937",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.852Z",
      "updatedAt": "2025-08-06T11:45:41.852Z",
      "laineId": "cmdzwj8ik0011k304vwwnbni4"
    },
    {
      "name": "New Patient Exam & Cleaning (Adult, Age 13+)",
      "duration": 90,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "New patient cleaning and checkup",
      "check_immediate_next_available": true,
      "keywords": "new patient, first time, checkup, cleaning, exam and cleaning, never been, general cleaning, routine, annual, regular visit, new patient special, get established, first appointment, x‑rays, cleaning",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037798",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:01:09.180Z",
      "updatedAt": "2025-08-06T11:45:41.870Z",
      "laineId": "cmd90akho001gky049r54nhna"
    },
    {
      "name": "New Patient Exam & Cleaning (Child, Age 4-12)",
      "duration": 70,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "New patient child cleaning and checkup",
      "check_immediate_next_available": true,
      "keywords": "my child, son, daughter, kid, pediatric cleaning, child checkup, child appointment, child dental, 8 years old, 4 years old, routine cleaning, children’s exam, elementary school, new patient child",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037799",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:03:00.601Z",
      "updatedAt": "2025-08-06T11:45:41.888Z",
      "laineId": "cmd90cygp001iky04kwo92tcf"
    },
    {
      "name": "New Patient Exam (Infant/Toddler, Age 0-3)",
      "duration": 30,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Happy Visit",
      "check_immediate_next_available": true,
      "keywords": "baby, infant, toddler, lap exam, first dental visit, happy visit, under 3, 2 years old, 1 year old, my little one, small child, mom and baby, introduce",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037801",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:04:02.496Z",
      "updatedAt": "2025-08-06T11:45:41.907Z",
      "laineId": "cmd90ea80001kky040ssau04w"
    },
    {
      "name": "New Patient Visit - Age 12 & Under",
      "duration": 50,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021930",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.926Z",
      "updatedAt": "2025-08-06T11:45:41.926Z",
      "laineId": "cmdzwj8kl0019k304fbrqkf07"
    },
    {
      "name": "New Patient Visit - Teen",
      "duration": 70,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021929",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.944Z",
      "updatedAt": "2025-08-06T11:45:41.944Z",
      "laineId": "cmdzwj8l3001bk304hnqo6c06"
    },
    {
      "name": "Orthodontic Consultation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021943",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.962Z",
      "updatedAt": "2025-08-06T11:45:41.962Z",
      "laineId": "cmdzwj8lm001dk304fif20d5v"
    },
    {
      "name": "Other Concern or Question",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021947",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.981Z",
      "updatedAt": "2025-08-06T11:45:41.981Z",
      "laineId": "cmdzwj8m5001fk304j90e2oun"
    },
    {
      "name": "Perio Maintenance",
      "duration": 60,
      "bookableOnline": false,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021936",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:41.999Z",
      "updatedAt": "2025-08-06T11:45:41.999Z",
      "laineId": "cmdzwj8mn001hk304evonfp01"
    },
    {
      "name": "Post-Op or Treatment Follow-Up (Recent Visit)",
      "duration": 30,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Follow-up appointment",
      "check_immediate_next_available": true,
      "keywords": "follow up, after my root canal, recheck, check healing, check crown, adjustment, recent visit, follow-up visit, check pain, bite feels off, after my extraction",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037806",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:09:03.954Z",
      "updatedAt": "2025-08-06T11:45:42.019Z",
      "laineId": "cmd90kqtt001sky04vjhbrb86"
    },
    {
      "name": "Returning Patient - Cleaning (Age 12 & Under)",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021932",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.040Z",
      "updatedAt": "2025-08-06T11:45:42.040Z",
      "laineId": "cmdzwj8nr001lk304kkozlmsn"
    },
    {
      "name": "Returning Patient - Cleaning (Age 13+)",
      "duration": 60,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021931",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.061Z",
      "updatedAt": "2025-08-06T11:45:42.061Z",
      "laineId": "cmdzwj8od001nk304lhte4yue"
    },
    {
      "name": "Returning Patient Exam & Cleaning (Adult, Age 13+)",
      "duration": 60,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Returning patient cleaning",
      "check_immediate_next_available": true,
      "keywords": "existing patient, returning patient, recall, 6 month, returning, routine cleaning, follow‑up cleaning, regular cleaning, checkup again, been here before, coming back, follow up cleaning",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037803",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:05:07.823Z",
      "updatedAt": "2025-08-06T11:45:42.079Z",
      "laineId": "cmd90fomn001mky04a6h5nwov"
    },
    {
      "name": "Returning Patient Exam & Cleaning (Child, Age 4-12)",
      "duration": 50,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": "Returning child cleaning",
      "check_immediate_next_available": true,
      "keywords": "my child again, returning child, child recall, kid follow-up, returning pediatric patient, routine checkup for child, child cleaning again, repeat cleaning, my kid’s next appointment",
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1037804",
      "lastSyncError": null,
      "createdAt": "2025-07-18T16:06:18.870Z",
      "updatedAt": "2025-08-06T11:45:42.098Z",
      "laineId": "cmd90h7g6001oky04zbh4hz0t"
    },
    {
      "name": "Second Opinion Appointment",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021945",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.118Z",
      "updatedAt": "2025-08-06T11:45:42.118Z",
      "laineId": "cmdzwj8py001tk304n3msfgat"
    },
    {
      "name": "Sleep Apnea / Snoring Evaluation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021944",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.137Z",
      "updatedAt": "2025-08-06T11:45:42.137Z",
      "laineId": "cmdzwj8qh001vk30489jpo70y"
    },
    {
      "name": "Smile Consultation - Veneers, Invisalign, Whitening",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021938",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.155Z",
      "updatedAt": "2025-08-06T11:45:42.155Z",
      "laineId": "cmdzwj8qz001xk304dqua4d1i"
    },
    {
      "name": "Swelling / Infection / Abscess",
      "duration": 40,
      "bookableOnline": false,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021935",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.174Z",
      "updatedAt": "2025-08-06T11:45:42.174Z",
      "laineId": "cmdzwj8ri001zk3048vnw7quu"
    },
    {
      "name": "TMJ / Jaw Pain Consultation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021942",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.196Z",
      "updatedAt": "2025-08-06T11:45:42.196Z",
      "laineId": "cmdzwj8s40021k304qpxdh3em"
    },
    {
      "name": "Wisdom Teeth Consultation",
      "duration": 40,
      "bookableOnline": true,
      "parentType": "Institution",
      "parentId": "15324",
      "spokenName": null,
      "check_immediate_next_available": false,
      "keywords": null,
      "webPatientStatus": "BOTH",
      "nexhealthAppointmentTypeId": "1021940",
      "lastSyncError": null,
      "createdAt": "2025-08-06T11:45:42.214Z",
      "updatedAt": "2025-08-06T11:45:42.214Z",
      "laineId": "cmdzwj8sm0023k3047rgk80s0"
    }
  ]
}
```

## Individual curl Commands

### 1. All-on-X / Full Mouth Implants

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "All-on-X / Full Mouth Implants",
         "minutes": 60,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 2. Broken Tooth or Lost Filling

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Broken Tooth or Lost Filling",
         "minutes": 40,
         "bookable_online": false,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 3. Concern/Pain/Emergency

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Concern/Pain/Emergency",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 4. Cosmetic Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Cosmetic Consultation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 5. Dental Implant Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Dental Implant Consultation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 6. Follow Up From Recent Visit / Post Op

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Follow Up From Recent Visit / Post Op",
         "minutes": 30,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 7. Full Mouth Reconstruction / All-on-X Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Full Mouth Reconstruction / All-on-X Consultation",
         "minutes": 60,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 8. Implant Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Implant Consultation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 9. Limited Exam with X-rays (Problem-Focused)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Limited Exam with X-rays (Problem-Focused)",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 10. New Patient Cleaning & Exam

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Cleaning & Exam",
         "minutes": 90,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 11. New Patient Doctor Exam Only - No Cleaning

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Doctor Exam Only - No Cleaning",
         "minutes": 60,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 12. New Patient Exam & Cleaning (Adult, Age 13+)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Exam & Cleaning (Adult, Age 13+)",
         "minutes": 90,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 13. New Patient Exam & Cleaning (Child, Age 4-12)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Exam & Cleaning (Child, Age 4-12)",
         "minutes": 70,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 14. New Patient Exam (Infant/Toddler, Age 0-3)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Exam (Infant/Toddler, Age 0-3)",
         "minutes": 30,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 15. New Patient Visit - Age 12 & Under

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Visit - Age 12 & Under",
         "minutes": 50,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 16. New Patient Visit - Teen

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "New Patient Visit - Teen",
         "minutes": 70,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 17. Orthodontic Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Orthodontic Consultation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 18. Other Concern or Question

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Other Concern or Question",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 19. Perio Maintenance

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Perio Maintenance",
         "minutes": 60,
         "bookable_online": false,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 20. Post-Op or Treatment Follow-Up (Recent Visit)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Post-Op or Treatment Follow-Up (Recent Visit)",
         "minutes": 30,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 21. Returning Patient - Cleaning (Age 12 & Under)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Returning Patient - Cleaning (Age 12 & Under)",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 22. Returning Patient - Cleaning (Age 13+)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Returning Patient - Cleaning (Age 13+)",
         "minutes": 60,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 23. Returning Patient Exam & Cleaning (Adult, Age 13+)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Returning Patient Exam & Cleaning (Adult, Age 13+)",
         "minutes": 60,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 24. Returning Patient Exam & Cleaning (Child, Age 4-12)

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Returning Patient Exam & Cleaning (Child, Age 4-12)",
         "minutes": 50,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 25. Second Opinion Appointment

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Second Opinion Appointment",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 26. Sleep Apnea / Snoring Evaluation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Sleep Apnea / Snoring Evaluation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 27. Smile Consultation - Veneers, Invisalign, Whitening

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Smile Consultation - Veneers, Invisalign, Whitening",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 28. Swelling / Infection / Abscess

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Swelling / Infection / Abscess",
         "minutes": 40,
         "bookable_online": false,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 29. TMJ / Jaw Pain Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "TMJ / Jaw Pain Consultation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

### 30. Wisdom Teeth Consultation

```bash
curl --request POST \
     --url 'https://nexhealth.info/appointment_types?subdomain=NEW_SUBDOMAIN' \
     --header 'accept: application/vnd.Nexhealth+json;version=2' \
     --header 'authorization: Bearer YOUR_TOKEN_HERE' \
     --header 'content-type: application/json' \
     --data '{
       "location_id": NEW_LOCATION_ID,
       "appointment_type": {
         "name": "Wisdom Teeth Consultation",
         "minutes": 40,
         "bookable_online": true,
         "parent_type": "Institution",
         "parent_id": NEW_LOCATION_ID
       }
     }'
```

