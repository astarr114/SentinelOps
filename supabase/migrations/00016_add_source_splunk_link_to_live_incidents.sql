alter table live_incidents
  add column source text,
  add column splunk_results_link text;

comment on column live_incidents.source is
  'Origin of the incident: splunk-webhook | synthetic | pagerduty | manual';
comment on column live_incidents.splunk_results_link is
  'Deep-link back to the Splunk search results that triggered this incident';