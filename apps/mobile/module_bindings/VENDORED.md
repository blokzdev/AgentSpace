# Vendored bindings (temporary, for the M0.2b probe)

These TypeScript bindings are generated SpacetimeDB client code, **vendored from
the example chat module** (`examples/chat-react-ts/spacetimedb`) so the
connectivity probe has a real module to talk to before AgentSpace has its own.

They will be **replaced** by bindings generated from `modules/spacetime` (the
AgentSpace module) in M0.3+. Do not hand-edit — regenerate with
`spacetime generate` once our module exists.
