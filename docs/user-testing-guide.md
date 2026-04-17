# Bernstein Feedback — User Testing Guide

A step-by-step guide to test the full feedback flow end-to-end: submitting feedback from a client app, verifying it in the admin panel, checking notifications, and closing the feedback loop.

---

## Prerequisites

| Item | URL / Detail |
|------|-------------|
| Admin Panel | https://feedback-admin.onrender.com |
| BAS Application | https://app.bastrustdesk.com |
| Supabase Dashboard | https://supabase.com/dashboard/project/xutstgzigcoarbktasxm |
| Your Account | Must be registered on the Admin Panel with access to the "BAS" project |

---

## Step 1: Login & Verify Access

1. Open the **Admin Panel**: https://feedback-admin.onrender.com
2. Log in with your registered email and password
3. After login, you should see the main dashboard with navigation tabs: **Feedback**, **Stats**, **Demo**, **Settings**

### Verify Project Assignment

4. Go to the **Admin Portal** tab (visible only to admin users)
5. Check that a project named **"BAS"** is listed
6. Confirm the project is assigned to your user account

> **If "BAS" project is not visible:**
> - Ask an admin to add you as a member of the BAS project
> - Or create the project: click **Create Project** → enter ID as `bas` and name as `BAS`

---

## Step 2: Submit Feedback from BAS Application

1. Open the **BAS App**: https://app.bastrustdesk.com
2. Look for the **Feedback button** — a floating icon at the **bottom-right corner** of the page
3. Click the feedback button — a dialog panel will open

### Fill in the Feedback

4. Select the tab: **Suggestion** (or Feedback/Bug Report depending on what you want to test)
5. Enter a title: `End-to-end testing for the BAS Project`
6. Optionally add a description with more details

### Test Screenshot Capture

7. Click the **Screenshot** button in the dialog
8. The dialog will briefly hide while it captures the current page
9. A preview of the screenshot will appear — you can **retake** or **remove** it
10. Confirm the screenshot looks correct

### Submit

11. Click **Submit**
12. You should see a **success toast** message: "Thanks for your feedback!"
13. The dialog will close automatically

---

## Step 3: Verify in Admin Panel

1. Go back to the **Admin Panel**: https://feedback-admin.onrender.com/feedback
2. In the **Project** dropdown filter, select **"BAS"**
3. Your submitted feedback should appear at the **top of the list** (sorted by newest)

### Verify the Details

4. Click on the feedback entry to open the **detail view**
5. Check the following are present:

| Field | Expected |
|-------|----------|
| **Title** | "End-to-end testing for the BAS Project" |
| **Type** | Suggestion / Feedback |
| **Project** | BAS |
| **Status** | Open |
| **Screenshot** | Attached (click to view/download) |
| **Page URL** | The URL of the BAS page you were on |
| **Browser Info** | Your browser, viewport size, user agent |
| **Console Errors** | Any errors captured (may be empty if no errors) |
| **Navigation History** | Breadcrumbs of clicks/navigation before submission |

---

## Step 4: Check Notifications

### In the Admin Panel

1. Look at the **bell icon** in the top navigation bar
2. It should show a **badge with the unread count** (at least 1 for the new feedback)
3. Click the bell to see the notification: "New feedback: End-to-end testing for the BAS Project"
4. Click the notification to navigate to the feedback detail

### In Supabase (Database Level)

5. Open the **Supabase Dashboard**: https://supabase.com/dashboard/project/xutstgzigcoarbktasxm
6. Go to **Table Editor** → select **notifications** table
7. Verify a new row exists with:
   - `type`: `new_feedback`
   - `title`: Contains "End-to-end testing for the BAS Project"
   - `project_id`: `bas`

### Email Notification (If SMTP is Configured)

8. Check the **email_queue** table in Supabase Table Editor
9. Verify an email entry was created for the feedback notification
10. Check your email inbox for a notification with subject like: "New Feedback: BAS Project"

> **Note:** Email notifications only work if SMTP is configured on the server (`SMTP_USER`, `SMTP_PASS` env vars). If not configured, the email worker logs a message but does not send.

---

## Step 5: Close the Feedback Loop

### Resolve the Ticket

1. In the **Admin Panel**, open the feedback entry you submitted
2. Change the **Status** dropdown from **Open** to **Resolved**
3. In the **Resolution Note** field, enter: `BAS feedback successfully processed.`
4. Click **Save**

### Verify Resolution Notification

5. The submitter should receive a notification:
   - **In the widget**: The feedback button badge updates with unread count
   - **In the admin panel**: A new notification appears for the submitter
   - **Via email** (if configured): Subject line: "Your feedback in BAS has been resolved"

### Verify in Supabase

6. Go to **Table Editor** → **notifications** table
7. A new row should exist with:
   - `type`: `resolved`
   - `title`: Contains "has been resolved"
   - `user_id`: The ID of the original submitter

8. Check the **feedback** table
9. The entry should now show:
   - `status`: `resolved`
   - `resolved_at`: Timestamp of when it was resolved
   - `resolution_note`: "BAS feedback successfully processed."

10. Check the **email_queue** table
11. A resolution email should be queued with:
    - `event_type`: `resolved`
    - `to_email`: The submitter's email
    - `subject`: Contains "has been resolved"

---

## Test Summary Checklist

Use this checklist to confirm all features are working:

| # | Test | Status |
|---|------|--------|
| 1 | Admin Panel loads and login works | |
| 2 | BAS project is visible in Admin Portal | |
| 3 | Feedback button appears in BAS app (bottom-right) | |
| 4 | Feedback dialog opens with tabs (Feedback/Suggestion/Bug) | |
| 5 | Screenshot capture works (dialog hides, captures, shows preview) | |
| 6 | Feedback submission succeeds (toast confirmation) | |
| 7 | Submitted feedback appears in Admin Panel list | |
| 8 | Feedback detail shows all captured context (URL, browser, breadcrumbs) | |
| 9 | Screenshot is viewable in the detail page | |
| 10 | Notification appears in admin panel (bell icon badge) | |
| 11 | Notification row created in Supabase notifications table | |
| 12 | Email queued in email_queue table (if SMTP configured) | |
| 13 | Status change to "Resolved" works in admin panel | |
| 14 | Resolution note saved correctly | |
| 15 | Resolution notification sent to submitter | |
| 16 | Resolution email queued in email_queue table | |
| 17 | Submitter sees resolved status in widget notifications | |

---

## Common Issues During Testing

| Issue | Cause | Fix |
|-------|-------|-----|
| Feedback button not visible in BAS app | Widget not installed or wrong projectId | Check `akk-feedback` is installed and `projectId` is set to `bas` |
| Submission fails silently | Server in in-memory mode | Check feedback-server logs for DB connection errors. Verify `DATABASE_SUP_URL` uses the Session Pooler URL |
| No notifications appearing | User ID not set on widget | Ensure `userId` is passed in FeedbackProvider config |
| Screenshot not working | html2canvas blocked by CORS | Check browser console for cross-origin errors |
| Email not received | SMTP not configured | Set `SMTP_USER` and `SMTP_PASS` in feedback-server env vars |
| Admin Portal tab not visible | User is not admin | First registered user is admin. Check `user_roles` table in Supabase |
| "Failed to connect to server" in admin | Wrong VITE_API_URL | Must point to the Render server URL. Redeploy admin after changing. |

---

## Testing Multiple Projects

To test feedback from different projects (e.g., Meraki):

1. Open **Meraki app**: check for feedback button
2. Submit feedback — it will be tagged with `projectId: "meraki"`
3. In the Admin Panel, filter by **"meraki"** in the project dropdown
4. Verify the feedback appears under the correct project

All projects share the same server and database. The `project_id` field separates them.
