-- Cada 5 minutos llama a la función "send-reminders" para avisar las citas próximas
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

select cron.schedule(
  'send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://kntfwnfxhhtyaviqtsqa.supabase.co/functions/v1/send-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-cron-secret', (select value from public.app_secrets where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
