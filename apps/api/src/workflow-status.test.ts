import { expect, it } from "vitest";

import { workStatusFromIssueStatuses } from "./workflow.js";

it.each([
  [["OPEN", "RESOLVED"], "IN_PROGRESS"],
  [["OPEN", "REMEDIATION_SUBMITTED"], "IN_PROGRESS"],
  [["REMEDIATION_SUBMITTED", "RESOLVED"], "WAITING"],
  [["RESOLVED", "RESOLVED"], "WAITING"],
] as const)("derives Work status from Issue states %j", (statuses, expected) => {
  expect(workStatusFromIssueStatuses(statuses)).toBe(expected);
});
