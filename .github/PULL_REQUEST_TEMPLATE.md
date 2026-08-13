## Summary

<!-- What changed, and why? -->

## Plan reference

<!-- EG-xxx or the commit/section this implements. -->

## Testing

- [ ] `pnpm check` passes locally
- [ ] Added or updated tests for the behavior change
- [ ] No target-repository code executes from inventory or planning
- [ ] Package boundary rules still hold

## Risk

- [ ] Does not mutate a user repository unless this PR is specifically about apply
- [ ] Does not weaken install-script denial, path containment, or redaction
- [ ] Schema or operation changes include an ADR when they are public
