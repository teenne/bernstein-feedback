import pool, { query } from '../db';
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
    // Use a short transaction with FOR UPDATE SKIP LOCKED to atomically claim
    // rows. A second concurrent worker (restart overlap, horizontal scale)
    // will skip the locked rows entirely, preventing duplicate email sends.
    // Rows are claimed by incrementing `attempts` inside the transaction so
    // that a worker crash after claiming still advances the retry counter and
    // the row is retried on the next poll rather than silently dropped.
    const client = await pool.connect();
    let rows: EmailRow[];

    try {
        await client.query('BEGIN');

        let result;
        try {
            result = await client.query<EmailRow>(
                `SELECT id, to_email, subject, body_text, body_html,
                        event_type, context, attempts
                   FROM email_queue
                  WHERE sent_at IS NULL
                    AND failed_at IS NULL
                    AND attempts < $1
                  ORDER BY created_at ASC
                  LIMIT $2
                 FOR UPDATE SKIP LOCKED`,
                [MAX_ATTEMPTS, BATCH_SIZE],
            );
        } catch (err) {
            await client.query('ROLLBACK');
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes('email_queue') && msg.includes('does not exist')) {
                return;
            }
            console.error('[email] queue fetch failed:', msg);
            return;
        }

        rows = result.rows;

        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return;
        }

        // Claim: increment attempts for every row inside the transaction.
        // The WHERE on the outer SELECT already filtered attempts < MAX_ATTEMPTS,
        // so this never pushes a row past the retry ceiling unexpectedly.
        const ids = rows.map(r => r.id);
        await client.query(
            `UPDATE email_queue SET attempts = attempts + 1 WHERE id = ANY($1::uuid[])`,
            [ids],
        );

        await client.query('COMMIT');
    } catch (err) {
        try { await client.query('ROLLBACK'); } catch { /* ignore rollback error */ }
        console.error('[email] claim transaction failed:', err instanceof Error ? err.message : String(err));
        return;
    } finally {
        client.release();
    }

    console.log(`[email] Found ${rows.length} pending emails in queue. Processing...`);

    for (const row of rows) {
        try {
            // Render the branded HTML template from the structured context.
            // Falls back to the plain-text body written by the trigger when
            // the context is missing (legacy rows) or when the template
            // dispatcher doesn't recognize the event type.
            const rendered = renderEmail(row.event_type, row.context);

            // row.id is a UUID stable across retries — using it as the
            // Message-ID lets mail servers (including Gmail) discard a
            // duplicate delivery when sent_at update fails and the row
            // is picked up again on the next poll.
            const smtpHost = process.env.SMTP_HOST || 'bernstein-feedback';
            await sendEmail({
                to: row.to_email,
                subject: rendered?.subject ?? row.subject,
                text: rendered?.text ?? row.body_text,
                html: rendered?.html ?? row.body_html ?? undefined,
                messageId: `${row.id}@${smtpHost}`,
            });
            await query(
                `UPDATE email_queue SET sent_at = NOW() WHERE id = $1`,
                [row.id],
            );
            console.log(`[email] sent id=${row.id} to=${row.to_email} event=${row.event_type}`);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // attempts was already incremented during claim; row.attempts holds
            // the pre-claim value so add 1 to get the current DB value.
            const claimedAttempts = row.attempts + 1;
            const permanentlyFailed = claimedAttempts >= MAX_ATTEMPTS;
            await query(
                `UPDATE email_queue
                    SET last_error = $1,
                        failed_at  = CASE WHEN $2 THEN NOW() ELSE NULL END
                  WHERE id = $3`,
                [msg, permanentlyFailed, row.id],
            );
            console.warn(
                `[email] attempt ${claimedAttempts}/${MAX_ATTEMPTS} failed id=${row.id}` +
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
