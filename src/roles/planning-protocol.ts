/** Format placeholders only; the host policies and confirmed requirements supply the actual plan inputs. */
export function planningJsonExample(withPolicyId: boolean): string {
  const example = { tasks: [{ taskId: 'example-task', ...(withPolicyId ? { policyId: 'supplied-policy-id' } : {}),
    role: 'design', objective: 'Preserve the requested "quoted" label.', acceptanceIds: ['confirmed-acceptance-id'], dependsOn: [] }] };
  return `Format-only JSON example with placeholder values; choose actual roles, policy IDs and acceptance IDs only from the supplied host policies and confirmed requirements:\n\`\`\`json\n${JSON.stringify(example)}\n\`\`\``;
}
