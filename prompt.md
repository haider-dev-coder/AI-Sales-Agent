Good work on Priority 1 and 2. Now continue from Priority 3.

## PRIORITY 3 — DASHBOARD REAL DATA

Open http://localhost:5173 in browser MCP. Take a screenshot of the Dashboard.

Then do exactly this:

1. Read the Dashboard component file fully — list every hardcoded value you find
2. Run these and check each response:
   curl http://127.0.0.1:8001/api/analytics/overview
   curl http://127.0.0.1:8001/api/analytics/timeline
   curl http://127.0.0.1:8001/api/analytics/leads-by-temp
   curl http://127.0.0.1:8001/api/analytics/services
   curl http://127.0.0.1:8001/api/analytics/recent-activity
   curl http://127.0.0.1:8001/api/leads

3. Fix Dashboard in this order:
   - KPI cards → /api/analytics/overview
   - Conversations list → /api/leads (real leads, no fake names)
   - Lead info panel → /api/leads/{id} when selected
   - Conversation Analytics chart → /api/analytics/timeline
   - Leads by Temperature → /api/analytics/leads-by-temp
   - Top Requested Services → /api/analytics/services
   - Recent Activity → /api/analytics/recent-activity
   - Refresh button → re-fetches all above
   - Date filter → passes ?days=30 param to all API calls

4. Empty state rule: if API returns empty/zero → show proper empty message. NEVER show fake data.

5. After fixing: open Network tab in browser MCP dev tools. Screenshot showing every dashboard section making a real API call. No hardcoded data allowed.

---

## PRIORITY 4 — LEAD COLLECTION END TO END

After Dashboard is confirmed working:

1. Open chat widget, have this conversation:
   - Say "hi"
   - Give your name, company, email, phone, service needed
   - Complete the conversation

2. Verify:
   curl http://127.0.0.1:8001/api/leads
   → Lead must appear with correct name, email, company, temperature score

3. Check Google Sheets sync:
   - Read backend/app/integrations/sheets.py
   - Run: curl -X POST http://127.0.0.1:8001/api/sheets/sync (or whatever the endpoint is)
   - Open the Google Sheet URL from .env — lead must appear there
   - If not working: fix the sheets integration, re-test

4. Check Mailjet:
   - A "New Lead" notification email must have been sent
   - Check backend logs for any email errors
   - If not sent: read backend/app/integrations/mailjet.py, fix trigger, re-test

---

## PRIORITY 5 — CAL.COM BOOKING

1. Run: curl http://127.0.0.1:8001/api/cal/availability
   - Must return real time slots
   - If error: read backend/app/integrations/calcom.py + .env CAL_API_KEY and CAL_EVENT_TYPE_ID
   - Fix and re-test

2. In chat widget say: "I want to book a meeting"
   - Agent must offer real available slots from Cal.com
   - Visitor selects a slot → booking confirmed in chat
   - Check Cal.com dashboard — booking must appear

3. After booking: Mailjet must send confirmation email to visitor and sales team

---

## PRIORITY 6 — MAILJET ALL TRIGGERS

Test each trigger separately:

curl -X POST http://127.0.0.1:8001/api/mailjet/send \
  -H "Content-Type: application/json" \
  -d '{"to":"your-email@test.com","subject":"Test","body":"Test"}'

Verify these 4 triggers all send emails:
- New lead captured
- Meeting booked  
- Hot lead identified
- Human handoff requested

Check backend logs after each. If any trigger silently fails → find where it is called, add proper error logging, fix and re-test.

---

## PRIORITY 7 — TYPESCRIPT ERRORS

Run: cd frontend && npx tsc --noEmit 2>&1

Fix every error in:
- ConversationPage.tsx
- LeadsPage.tsx
- ServicesPage.tsx
- WebsiteAnalytics.tsx

After fixing: npx tsc --noEmit must return 0 errors total.
## FINAL CHECKLIST — verify and report PASS/FAIL

[ ] Dashboard KPI cards show real API data
[ ] Dashboard conversations list shows real leads (no Acme Corp / TechStart)
[ ] Dashboard lead panel shows real data when lead selected
[ ] Dashboard charts connected to real API
[ ] Refresh button works
[ ] Lead from chat appears in /api/leads
[ ] Lead appears in Google Sheets
[ ] Mailjet new-lead email received
[ ] Cal.com availability returns real slots
[ ] Cal.com booking confirmed in chat + appears in Cal.com dashboard
[ ] Mailjet booking confirmation email received
[ ] All 4 Mailjet triggers working
[ ] npx tsc --noEmit → 0 errors