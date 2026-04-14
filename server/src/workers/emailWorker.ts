import { query } from '../db';
import { isEmailEnabled, sendEmail, verifySmtp } from '../lib/email';
import { renderEmail, type EmailEventType } from '../lib/emailTemplates';

const POLL_INTERVAL_MS = parseInt(process.env.EMAIL_POLL_INTERVAL_MS || '30000', 10);
const MAX_ATTEMPTS = parseInt(process.env.EMAIL_MAX_ATTEMPTS || '3', 10);
const BATCH_SIZE = parseInt(process.env.EMAIL_BATCH_SIZE || '10', 10);

interface EmailRow {
    id: string;
    to_email: string;
    subject: string;
    body_text: string;
    body_html: string | null;
    event_type: EmailEventType;
    context: Record<string, unknown> | null;
    attempts: number;
}

async function processBatch(): Promise<void> {
    let rows: EmailRow[];
    try {
        const result = await query<EmailRow>(
            `SELECT id, to_email, subject, body_text, body_html,
                    event_type, context, attempts
               FROM email_queue
              WHERE sent_at IS NULL
                AND failed_at IS NULL
                AND attempts < $1
              ORDER BY created_at ASC
              LIMIT $2`,
            [MAX_ATTEMPTS, BATCH_SIZE],
        );
        rows = result.rows;
    } catch (err) {
        // Table may not exist yet in dev/test; stay quiet instead of spamming.
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('email_queue') && msg.includes('does not exist')) {
            return;
        }
        console.error('[email] queue fetch failed:', msg);
        return;
    }

    if (rows.length === 0) return;

    for (const row of rows) {
        try {
            // Render the branded HTML template from the structured context.
            // Falls back to the plain-text body written by the trigger when
            // the context is missing (legacy rows) or when the template
            // dispatcher doesn't recognize the event type.
            const rendered = renderEmail(row.event_type, row.context);

            await sendEmail({
                to: row.to_email,
                subject: rendered?.subject ?? row.subject,
                text: rendered?.text ?? row.body_text,
                html: rendered?.html ?? row.body_html ?? undefined,
            });
            await query(
                `UPDATE email_queue SET sent_at = NOW() WHERE id = $1`,
                [row.id],
            );
            console.log(`[email] sent id=${row.id} to=${row.to_email} event=${row.event_type}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            const nextAttempts = row.attempts + 1;
            const permanentlyFailed = nextAttempts >= MAX_ATTEMPTS;
            await query(
                `UPDATE email_queue
                    SET attempts = $1,
                        last_error = $2,
                        failed_at = CASE WHEN $3 THEN NOW() ELSE NULL END
                  WHERE id = $4`,
                [nextAttempts, msg, permanentlyFailed, row.id],
            );
            console.warn(
                `[email] attempt ${nextAttempts}/${MAX_ATTEMPTS} failed id=${row.id}` +
                (permanentlyFailed ? ' (giving up)' : '') +
                `: ${msg}`,
            );
        }
    }
}

export function startEmailWorker(): void {
    if (!isEmailEnabled()) {
        console.info(
            '[email] SMTP_USER / SMTP_PASS not set — email worker disabled. ' +
            'Queued emails will accumulate in email_queue until configured.',
        );
        return;
    }

    // Verify SMTP at startup (non-fatal — the worker still runs and
    // individual sends will fail loudly with their own error message).
    verifySmtp().then((ok) => {
        if (ok) {
            console.info('[email] SMTP verified. Worker polling every', POLL_INTERVAL_MS, 'ms');
        } else {
            console.warn('[email] SMTP verify failed — sends may error until credentials are fixed.');
        }
    });

    // Process once immediately, then on interval.
    processBatch().catch((err) => console.error('[email] initial batch failed:', err));
    setInterval(() => {
        processBatch().catch((err) => console.error('[email] batch failed:', err));
    }, POLL_INTERVAL_MS);
}
