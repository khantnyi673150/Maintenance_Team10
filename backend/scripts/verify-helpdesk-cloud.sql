-- Run as postgres in the Supabase SQL Editor. Never prints request headers.
select enabled, endpoint, last_requested_at, last_request_id
from maintenance_private.helpdesk_cloud_delivery;

select jobname, schedule, active from cron.job
where jobname = 'maintenance-helpdesk-delivery';

select state, count(*) as events from public.helpdesk_outbox group by state;

select d.start_time, d.end_time, d.status, d.return_message
from cron.job_run_details d join cron.job j using (jobid)
where j.jobname = 'maintenance-helpdesk-delivery'
order by d.start_time desc limit 5;

-- A successful cron run only means SQL ran. Verify the HTTP result separately.
select r.id, r.status_code, r.timed_out, r.created,
  case when r.status_code = 200 then r.content::jsonb else null end as delivery_result
from net._http_response r
join maintenance_private.helpdesk_cloud_delivery c on c.last_request_id = r.id;
