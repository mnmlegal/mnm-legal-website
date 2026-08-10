# MNM Academy setup

## Included in this first foundation

- `academy.html`: public Academy landing page and course catalogue.
- `academy-login.html`: student sign-up, login and password reset.
- `academy-dashboard.html`: enrolled-student area.
- `academy-admin.html`: separate administrator login entry point.
- `academy.js`: Supabase authentication and one-device playback-session client.
- `supabase/schema.sql`: database, access policies and one-device session functions.

## Before publishing student accounts

1. Create a Supabase project and enable email authentication.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Create the first administrator through Supabase Auth, then run the final `update` command in `schema.sql` with that user's UUID.
4. Put only the Supabase project URL and anon key in `academy-config.js`.
5. Deploy server-side functions for Razorpay order creation and webhook-signature verification. The Razorpay key secret must be stored only in server-side secrets.
6. Configure private video storage and an authenticated HLS delivery endpoint. The endpoint must validate an active enrolment and the one-device playback lease before issuing a short-lived manifest or segment token.

## Security rules

- Do not use the old `login.html` admin login for Academy administration.
- Do not put payment secrets, video-encryption keys, storage keys or a Supabase service-role key in any HTML or JavaScript file.
- Keep original videos and notes private. Serve only encrypted HLS playback through an enrolment-checked endpoint.
- Add a moving watermark in the secure player using the student's email, masked mobile number and timestamp.
- Start a heartbeat every 30-45 seconds while a video is playing. If `academy_playback_heartbeat` reports that the lease was replaced, immediately pause the player and remove the playback token.

## What is deliberately not live yet

Live Razorpay payment verification and private encrypted video delivery need account-specific secrets and hosting configuration. They are intentionally not simulated in the browser, because a client-side-only implementation would expose secrets and would not protect paid videos.
