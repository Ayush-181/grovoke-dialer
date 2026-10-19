# Refine Overview using Dashboard V14

The Overview's metric cards had little supporting context and ambiguous
previous-month comparisons when no baseline existed. The four existing cards
now have a consistent heading/icon row, larger tabular values, related secondary
figures and a clearly separated comparison footer. Connected includes its rate;
Bookings includes dial-to-booking rate; Dials shows pending dispositions; Talk
time shows the existing average per dial.

Missing denominators render a dash; missing baselines are explained rather than
presented as growth, and 0% changes are neutral. The monthly chart explains empty
months and keeps its monthly-by-weekday wording. Follow-up subtitles make clear
that these lists are current, independent of the selected reporting month.

All styling is scoped to Overview. Four-card order, chart/funnel arrangement,
funnel shapes/gaps, the bounded split appointments/callback panel, collapsed
annual summary, slim navigation and phone-card dialer are retained. No recent
calls panel or automatic callback suggestions were added. Existing call-duration
and booking metric calculations were not changed or claimed repaired.

Validation: TypeScript, scoped ESLint, isolated standalone export, 24 mocked model
tests and guarded browser checks across all eight screens at 1280/768/390 passed.
The browser also verifies zero-denominator displays, absence of growth arrows
without a baseline, empty-month explanation, phone-card calling/conferencing,
booking, explicit saves, sessions and navigation. No provider requests/browser
errors. A separate read-only code review found no actionable issues.

Previously recorded unrelated full-repository lint failures remain outside this
change; full lint was not rerun. All data/services are synthetic. No live records,
calls, emails/invitations, deployments or merges were performed.
